#!/bin/bash
# ============================================================
#  Meganet - OpenVPN Server para MikroTik (RouterOS 6 y 7)
#  Instalador limpio para Contabo VPS (Ubuntu 20/22/24)
#  Estilo MikroWisp: 1 server, N routers, IPs fijas por router
#  RouterOS 6 compatible: RSA + AES-256-CBC/SHA1, sin tls-crypt/tls-auth
# ============================================================
set -e

# ---- Config editable ----
VPN_NET="10.8.0.0"
VPN_MASK="255.255.255.0"
VPN_CIDR="10.8.0.0/24"
VPN_SERVER_IP="10.8.0.1"
VPN_PORT="1194"
VPN_PROTO="tcp"        # tcp = compatible con RouterOS 6
EASYRSA_DIR="/etc/openvpn/easy-rsa"
OUT_DIR="/etc/openvpn/clients"
CRED_FILE="/root/meganet-openvpn-info.txt"
# -------------------------

if [[ $EUID -ne 0 ]]; then echo "Ejecutar como root"; exit 1; fi

echo "==> [1/7] Limpiando instalación previa (si existe)..."
systemctl stop openvpn-server@server 2>/dev/null || true
systemctl disable openvpn-server@server 2>/dev/null || true
rm -rf /etc/openvpn/server /etc/openvpn/easy-rsa /etc/openvpn/clients
apt-get remove -y openvpn easy-rsa >/dev/null 2>&1 || true

echo "==> [2/7] Instalando paquetes..."
apt-get update -y >/dev/null
apt-get install -y openvpn easy-rsa ufw >/dev/null

echo "==> [3/7] Inicializando PKI con Easy-RSA..."
mkdir -p "$EASYRSA_DIR"
ln -sf /usr/share/easy-rsa/* "$EASYRSA_DIR/"
cd "$EASYRSA_DIR"

cat > vars <<EOF
set_var EASYRSA_ALGO       "rsa"
set_var EASYRSA_KEY_SIZE   2048
set_var EASYRSA_DIGEST     "sha256"
set_var EASYRSA_REQ_CN     "MeganetCA"
set_var EASYRSA_BATCH      "1"
EOF

./easyrsa init-pki >/dev/null
./easyrsa build-ca nopass >/dev/null 2>&1
./easyrsa gen-req server nopass >/dev/null 2>&1
./easyrsa sign-req server server >/dev/null 2>&1 <<< "yes"

echo "==> [4/7] Configurando server..."
mkdir -p /etc/openvpn/server "$OUT_DIR" /etc/openvpn/ccd
cp pki/ca.crt pki/issued/server.crt pki/private/server.key /etc/openvpn/server/

cat > /etc/openvpn/server/server.conf <<EOF
port $VPN_PORT
proto $VPN_PROTO
dev tun
ca /etc/openvpn/server/ca.crt
cert /etc/openvpn/server/server.crt
key /etc/openvpn/server/server.key
dh none
topology subnet
server $VPN_NET $VPN_MASK
ifconfig-pool-persist /var/log/openvpn/ipp.txt
client-config-dir /etc/openvpn/ccd
client-to-client
keepalive 10 60
persist-key
persist-tun
cipher AES-256-CBC
data-ciphers AES-256-CBC
data-ciphers-fallback AES-256-CBC
auth SHA1
user nobody
group nogroup
status /var/log/openvpn/status.log
log-append /var/log/openvpn/server.log
verb 3
explicit-exit-notify 0
EOF

mkdir -p /var/log/openvpn

echo "==> [5/7] Habilitando forwarding + NAT..."
sed -i 's|^#\?net.ipv4.ip_forward.*|net.ipv4.ip_forward=1|' /etc/sysctl.conf
sysctl -p >/dev/null

WAN_IF=$(ip route get 8.8.8.8 | awk '{print $5; exit}')
iptables -t nat -C POSTROUTING -s $VPN_CIDR -o $WAN_IF -j MASQUERADE 2>/dev/null || \
  iptables -t nat -A POSTROUTING -s $VPN_CIDR -o $WAN_IF -j MASQUERADE
iptables -C FORWARD -s $VPN_CIDR -j ACCEPT 2>/dev/null || iptables -A FORWARD -s $VPN_CIDR -j ACCEPT
iptables -C FORWARD -d $VPN_CIDR -j ACCEPT 2>/dev/null || iptables -A FORWARD -d $VPN_CIDR -j ACCEPT

if ! grep -q "MEGANET_OPENVPN_NAT_START" /etc/ufw/before.rules; then
  cp /etc/ufw/before.rules /etc/ufw/before.rules.bak.$(date +%s)
  cat >/tmp/meganet-ufw-nat.rules <<EOF_NAT
# MEGANET_OPENVPN_NAT_START
*nat
:POSTROUTING ACCEPT [0:0]
-A POSTROUTING -s $VPN_CIDR -o $WAN_IF -j MASQUERADE
COMMIT
# MEGANET_OPENVPN_NAT_END

EOF_NAT
  cat /tmp/meganet-ufw-nat.rules /etc/ufw/before.rules > /tmp/before.rules
  cp /tmp/before.rules /etc/ufw/before.rules
fi

echo "==> [6/7] Firewall (UFW)..."
ufw allow $VPN_PORT/$VPN_PROTO >/dev/null || true

echo "==> [7/7] Iniciando servicio..."
systemctl enable openvpn-server@server >/dev/null 2>&1
systemctl restart openvpn-server@server
sleep 2
systemctl --no-pager status openvpn-server@server | head -n 10 || true

PUBLIC_IP=$(curl -4 -s ifconfig.me || hostname -I | awk '{print $1}')

cat > "$CRED_FILE" <<EOF
================ MEGANET OpenVPN — INSTALADO ================
VPS Public IP : $PUBLIC_IP
Puerto        : $VPN_PORT/$VPN_PROTO
Red VPN       : $VPN_CIDR
Server IP VPN : $VPN_SERVER_IP
CA            : /etc/openvpn/server/ca.crt
Easy-RSA      : $EASYRSA_DIR
Clientes en   : $OUT_DIR
CCD (IPs fijas): /etc/openvpn/ccd

Agregar router:
  sudo bash /opt/meganet-deploy/deploy/openvpn-add-router.sh <nombre> <ip-fija>
Ejemplo:
  sudo bash /opt/meganet-deploy/deploy/openvpn-add-router.sh mercedes 10.8.0.11
=============================================================
EOF

echo ""
cat "$CRED_FILE"
echo ""
echo "OK. Detalles en $CRED_FILE"
