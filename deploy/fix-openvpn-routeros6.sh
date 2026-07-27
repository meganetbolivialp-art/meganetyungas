#!/bin/bash
# ============================================================
#  Meganet - Fix OpenVPN para MikroTik RouterOS 6/7
#  Convierte el server a modo compatible: RSA + AES-CBC/SHA1
#  sin tls-crypt/tls-auth. Requiere volver a generar routers.
# ============================================================
set -e

VPN_NET="10.8.0.0"
VPN_MASK="255.255.255.0"
VPN_CIDR="10.8.0.0/24"
VPN_PORT="1194"
VPN_PROTO="tcp"
EASYRSA_DIR="/etc/openvpn/easy-rsa"

if [[ $EUID -ne 0 ]]; then echo "Ejecutar como root"; exit 1; fi

echo "==> Aplicando OpenVPN compatible con MikroTik RouterOS 6/7..."
systemctl stop openvpn-server@server 2>/dev/null || true

rm -rf /etc/openvpn/server /etc/openvpn/easy-rsa /etc/openvpn/clients /etc/openvpn/ccd
apt-get update -y >/dev/null
apt-get install -y openvpn easy-rsa ufw >/dev/null

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

mkdir -p /etc/openvpn/server /etc/openvpn/clients /etc/openvpn/ccd /var/log/openvpn
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
verb 4
explicit-exit-notify 0
EOF

sed -i 's|^#\?net.ipv4.ip_forward.*|net.ipv4.ip_forward=1|' /etc/sysctl.conf
sysctl -p >/dev/null
WAN_IF=$(ip route get 8.8.8.8 | awk '{print $5; exit}')
iptables -t nat -C POSTROUTING -s $VPN_CIDR -o $WAN_IF -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s $VPN_CIDR -o $WAN_IF -j MASQUERADE
iptables -C FORWARD -s $VPN_CIDR -j ACCEPT 2>/dev/null || iptables -A FORWARD -s $VPN_CIDR -j ACCEPT
iptables -C FORWARD -d $VPN_CIDR -j ACCEPT 2>/dev/null || iptables -A FORWARD -d $VPN_CIDR -j ACCEPT

ufw allow $VPN_PORT/$VPN_PROTO >/dev/null || true
systemctl enable openvpn-server@server >/dev/null 2>&1
systemctl restart openvpn-server@server
sleep 2

echo ""
echo "================ OPENVPN ROUTEROS LISTO ================"
echo "Server    : $(curl -4 -s ifconfig.me || hostname -I | awk '{print $1}'):$VPN_PORT/$VPN_PROTO"
echo "Red VPN   : $VPN_CIDR"
echo "Modo      : RouterOS 6/7 compatible, sin tls-crypt"
echo "Siguiente : sudo bash /opt/meganet-deploy/deploy/openvpn-add-router.sh mercedes 10.8.0.11"
echo "========================================================"
systemctl --no-pager status openvpn-server@server | head -n 10 || true