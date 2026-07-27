#!/bin/bash
# ============================================================
#  Meganet - Agrega un router MikroTik al OpenVPN server
#  Uso: sudo bash openvpn-add-router.sh <nombre> <ip-fija>
#  Ej : sudo bash openvpn-add-router.sh mercedes 10.8.0.11
# ============================================================
set -e

NAME="${1:-}"
FIXED_IP="${2:-}"
EASYRSA_DIR="/etc/openvpn/easy-rsa"
OUT_DIR="/etc/openvpn/clients"
CCD_DIR="/etc/openvpn/ccd"
VPN_NETMASK="255.255.255.0"

if [[ $EUID -ne 0 ]]; then echo "Ejecutar como root"; exit 1; fi
if [[ -z "$NAME" || -z "$FIXED_IP" ]]; then
  echo "Uso: $0 <nombre-router> <ip-fija-vpn>"
  echo "Ej : $0 mercedes 10.8.0.11"
  exit 1
fi

if [[ ! -d "$EASYRSA_DIR/pki" ]]; then
  echo "OpenVPN no está instalado. Ejecutá install-openvpn-contabo.sh primero."
  exit 1
fi

mkdir -p "$OUT_DIR" "$CCD_DIR"
cd "$EASYRSA_DIR"

echo "==> Generando certificado para: $NAME"
if [[ -f "pki/issued/$NAME.crt" ]]; then
  echo "   (ya existía, se reusa)"
else
  ./easyrsa gen-req "$NAME" nopass >/dev/null 2>&1
  ./easyrsa sign-req client "$NAME" >/dev/null 2>&1 <<< "yes"
fi

echo "==> Reservando IP fija $FIXED_IP para $NAME"
cat > "$CCD_DIR/$NAME" <<EOF
ifconfig-push $FIXED_IP $VPN_NETMASK
EOF

PUBLIC_IP=$(curl -4 -s ifconfig.me || hostname -I | awk '{print $1}')
PORT=$(grep -E '^port ' /etc/openvpn/server/server.conf | awk '{print $2}')
PROTO=$(grep -E '^proto ' /etc/openvpn/server/server.conf | awk '{print $2}')

CA=$(cat pki/ca.crt)
CERT=$(awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/' pki/issued/$NAME.crt)
KEY=$(cat pki/private/$NAME.key)
TA=$(cat pki/ta.key)

OVPN_FILE="$OUT_DIR/$NAME.ovpn"
cat > "$OVPN_FILE" <<EOF
client
dev tun
proto $PROTO
remote $PUBLIC_IP $PORT
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-CBC
auth SHA1
verb 3
<ca>
$CA
</ca>
<cert>
$CERT
</cert>
<key>
$KEY
</key>
EOF

# Archivos individuales para subir a MikroTik (RouterOS 6/7)
CERT_DIR="$OUT_DIR/$NAME-mikrotik"
mkdir -p "$CERT_DIR"
cp pki/ca.crt "$CERT_DIR/ca.crt"
cp pki/issued/$NAME.crt "$CERT_DIR/$NAME.crt"
cp pki/private/$NAME.key "$CERT_DIR/$NAME.key"

RSC_FILE="$CERT_DIR/$NAME-setup.rsc"
cat > "$RSC_FILE" <<EOF
# ============================================================
# OpenVPN Client - Meganet
# Router: $NAME  |  IP VPN fija: $FIXED_IP
# ============================================================
# 1) Subir a Files: ca.crt, $NAME.crt, $NAME.key
# 2) Pegar este script en New Terminal (o import)

/certificate remove [find name~"^($NAME|ca-meganet)"] 
:delay 1
/certificate import file-name=ca.crt passphrase=""
/certificate import file-name=$NAME.crt passphrase=""
/certificate import file-name=$NAME.key passphrase=""
:delay 1
/certificate set [find name="ca.crt_0"] name="ca-meganet"
/certificate set [find name="$NAME.crt_0"] name="$NAME-meganet"

/interface ovpn-client remove [find name="vpn-panel"]
/interface ovpn-client add \\
    name=vpn-panel \\
    connect-to=$PUBLIC_IP \\
    port=$PORT \\
    protocol=$PROTO \\
    mode=ip \\
    user=$NAME \\
    certificate=$NAME-meganet \\
    auth=sha1 \\
    cipher=aes256 \\
    add-default-route=no \\
    disabled=no

:delay 3
/interface ovpn-client print where name="vpn-panel"
EOF

echo ""
echo "================ ROUTER $NAME LISTO ================"
echo "IP VPN fija    : $FIXED_IP"
echo "Archivo .ovpn  : $OVPN_FILE"
echo "Para MikroTik  : $CERT_DIR/"
echo "  - ca.crt"
echo "  - $NAME.crt"
echo "  - $NAME.key"
echo "  - $NAME-setup.rsc  <-- pegar en New Terminal"
echo ""
echo "Recargando server para aplicar CCD..."
systemctl reload openvpn-server@server 2>/dev/null || systemctl restart openvpn-server@server
echo "OK."
