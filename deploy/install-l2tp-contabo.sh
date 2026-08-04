#!/bin/bash
# ============================================================
#  Meganet - Servidor L2TP/IPsec para MikroTik (RouterOS 6 y 7)
#  Instalador limpio para Contabo VPS (Ubuntu 20/22/24)
#  Estilo MikroWisp: 1 server, N routers, IPs fijas por CHAP-secret
#  Protocolo: IKEv1/IPsec PSK + L2TP + PPP/CHAP
# ============================================================
set -e

# ---- Config editable ----
VPN_NET="10.8.0.0"
VPN_CIDR="10.8.0.0/24"
VPN_SERVER_IP="10.8.0.1"
VPN_DNS="8.8.8.8,8.8.4.4"
IPSEC_SECRET="meganet-l2tp"
OUT_DIR="/etc/meganet-l2tp"
CRED_FILE="/root/meganet-l2tp-info.txt"
# -------------------------

if [[ $EUID -ne 0 ]]; then echo "Ejecutar como root"; exit 1; fi

# Leer secret del entorno si existe (sino usa default)
if [[ -n "$L2TP_IPSEC_SECRET" ]]; then IPSEC_SECRET="$L2TP_IPSEC_SECRET"; fi

# Generar secret aleatorio si sigue siendo el default y no es env
if [[ "$IPSEC_SECRET" == "meganet-l2tp" && -n "$(command -v openssl)" ]]; then
  IPSEC_SECRET="$(openssl rand -hex 12)"
fi

echo "==> [1/7] Limpiando instalación previa (si existe)..."
apt-get remove -y strongswan xl2tpd ppp openvpn 2>/dev/null || true
systemctl stop openvpn-server@server 2>/dev/null || true
systemctl disable openvpn-server@server 2>/dev/null || true
rm -rf /etc/openvpn/server /etc/openvpn/easy-rsa /etc/openvpn/clients

echo "==> [2/7] Instalando paquetes..."
apt-get update -y >/dev/null
apt-get install -y -qq strongswan xl2tpd ppp iptables-persistent ufw curl >/dev/null

echo "==> [3/7] Configurando IPsec (strongSwan)..."
cat > /etc/ipsec.conf <<EOF
config setup
    charondebug="ike 1, knl 1, cfg 0"
    uniqueids=yes

conn L2TP-PSK
    type=transport
    auto=add
    keyexchange=ikev1
    authby=secret
    left=%defaultroute
    leftprotoport=17/1701
    right=%any
    rightprotoport=17/%any
    ike=aes256-sha256-modp2048,3des-sha1-modp1024,aes128-sha1-modp1024!
    esp=aes256-sha256,3des-sha1,aes128-sha1!
EOF

cat > /etc/ipsec.secrets <<EOF
: PSK "$IPSEC_SECRET"
EOF
chmod 600 /etc/ipsec.secrets

echo "==> [4/7] Configurando xl2tpd..."
mkdir -p "$OUT_DIR" /etc/ppp

cat > /etc/xl2tpd/xl2tpd.conf <<EOF
[global]
port = 1701
access control = no
ipsec saref = no

[lns default]
ip range = 10.8.0.20-10.8.0.250
local ip = $VPN_SERVER_IP
require chap = yes
refuse pap = yes
require authentication = yes
name = l2tpd
pppoptfile = /etc/ppp/options.xl2tpd
length bit = yes
EOF

cat > /etc/ppp/options.xl2tpd <<EOF
require-mschap-v2
require-chap
ms-dns $VPN_DNS
nodefaultroute
noipdefault
mtu 1410
mru 1410
proxyarp
lcp-echo-interval 20
lcp-echo-failure 3
nobsdcomp
noccp
novj
novjccomp
nopcomp
noaccomp
EOF

# chap-secrets inicial vacío
[[ -f /etc/ppp/chap-secrets ]] || echo "# Meganet L2TP clients" > /etc/ppp/chap-secrets
chmod 600 /etc/ppp/chap-secrets

echo "==> [5/7] Habilitando forwarding + NAT..."
sed -i 's|^#\?net.ipv4.ip_forward.*|net.ipv4.ip_forward=1|' /etc/sysctl.conf
sysctl -p >/dev/null

WAN_IF=$(ip route get 8.8.8.8 | awk '{print $5; exit}')
iptables -t nat -C POSTROUTING -s $VPN_CIDR -o $WAN_IF -j MASQUERADE 2>/dev/null || \
  iptables -t nat -A POSTROUTING -s $VPN_CIDR -o $WAN_IF -j MASQUERADE
iptables -C FORWARD -s $VPN_CIDR -j ACCEPT 2>/dev/null || iptables -A FORWARD -s $VPN_CIDR -j ACCEPT
iptables -C FORWARD -d $VPN_CIDR -j ACCEPT 2>/dev/null || iptables -A FORWARD -d $VPN_CIDR -j ACCEPT

# Persistir iptables
iptables-save > /etc/iptables/rules.v4 2>/dev/null || iptables-save > /etc/iptables.rules

echo "==> [6/7] Firewall (UFW)..."
ufw allow 500/udp >/dev/null || true
ufw allow 4500/udp >/dev/null || true
ufw allow 1701/udp >/dev/null || true
ufw allow 22/tcp >/dev/null || true
ufw allow 80/tcp >/dev/null || true
ufw allow 443/tcp >/dev/null || true
ufw allow 8777/tcp >/dev/null || true   # agent bridge
ufw allow 3940/tcp >/dev/null || true   # agent provision
ufw --force enable >/dev/null || true

echo "==> [7/7] Iniciando servicios..."
systemctl restart strongswan || systemctl restart strongswan-starter
systemctl enable strongswan || systemctl enable strongswan-starter
systemctl restart xl2tpd
systemctl enable xl2tpd
systemctl restart ipsec || systemctl restart strongswan-starter

sleep 2
systemctl --no-pager status xl2tpd | head -n 8 || true
systemctl --no-pager status strongswan | head -n 8 || true

PUBLIC_IP=$(curl -4 -s ifconfig.me || hostname -I | awk '{print $1}')

# Guardar variables para el agente
mkdir -p /opt/meganet
cat > /opt/meganet/.env.l2tp <<EOF
L2TP_NETWORK=$VPN_CIDR
L2TP_SERVER_IP=$VPN_SERVER_IP
L2TP_IPSEC_SECRET=$IPSEC_SECRET
L2TP_ENDPOINT=$PUBLIC_IP
EOF
chmod 600 /opt/meganet/.env.l2tp

cat > "$CRED_FILE" <<EOF
================ MEGANET L2TP/IPsec — INSTALADO ================
VPS Public IP : $PUBLIC_IP
Puertos       : 500/udp (IKE), 4500/udp (NAT-T), 1701/udp (L2TP)
Red VPN       : $VPN_CIDR
Server IP VPN : $VPN_SERVER_IP
IPsec PSK     : $IPSEC_SECRET
Perfil PPP    : /etc/ppp/options.xl2tpd
Clientes en   : /etc/ppp/chap-secrets

Agregar router:
  sudo bash /opt/meganet-deploy/deploy/l2tp-add-router.sh <nombre> <ip-fija>
Ejemplo:
  sudo bash /opt/meganet-deploy/deploy/l2tp-add-router.sh mercedes 10.8.0.11

Variables agente (añadir a /etc/systemd/system/mikrotik-agent.service):
  L2TP_NETWORK=$VPN_CIDR
  L2TP_SERVER_IP=$VPN_SERVER_IP
  L2TP_IPSEC_SECRET=$IPSEC_SECRET
  L2TP_ENDPOINT=$PUBLIC_IP
=============================================================
EOF

echo ""
cat "$CRED_FILE"
echo ""
echo "OK. Detalles en $CRED_FILE"
