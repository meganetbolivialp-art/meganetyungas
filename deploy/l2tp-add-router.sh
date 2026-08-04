#!/bin/bash
# ============================================================
#  Meganet - Agrega un router MikroTik al servidor L2TP/IPsec
#  Uso: sudo bash l2tp-add-router.sh <nombre> <ip-fija>
#  Ej : sudo bash l2tp-add-router.sh mercedes 10.8.0.11
# ============================================================
set -e

NAME="${1:-}"
FIXED_IP="${2:-}"

if [[ $EUID -ne 0 ]]; then echo "Ejecutar como root"; exit 1; fi
if [[ -z "$NAME" || -z "$FIXED_IP" ]]; then
  echo "Uso: $0 <nombre-router> <ip-fija-vpn>"
  echo "Ej : $0 mercedes 10.8.0.11"
  exit 1
fi

if [[ ! -f /etc/ppp/options.xl2tpd ]]; then
  echo "L2TP no está instalado. Ejecutá install-l2tp-contabo.sh primero."
  exit 1
fi

# Normalizar nombre
SLUG="$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9' | cut -c1-15)"
USER="ms_${SLUG}"

# Generar password seguro
PASS="$(openssl rand -hex 12)"

# Backup de chap-secrets
cp /etc/ppp/chap-secrets /etc/ppp/chap-secrets.bak.$(date +%s) 2>/dev/null || true

# Eliminar entrada previa del mismo usuario (idempotente)
if grep -q "^${USER}[[:space:]]" /etc/ppp/chap-secrets; then
  sed -i "/^${USER}[[:space:]]/d" /etc/ppp/chap-secrets
fi

# Agregar entrada con IP fija
printf "%-18s %-8s %-32s %-s\n" "$USER" "l2tpd" "$PASS" "$FIXED_IP" >> /etc/ppp/chap-secrets
chmod 600 /etc/ppp/chap-secrets

# Recargar xl2tpd
systemctl restart xl2tpd

VPS_IP="$(curl -4 -s ifconfig.me || hostname -I | awk '{print $1}')"

echo ""
echo "================ ROUTER $NAME LISTO ================"
echo "Usuario L2TP    : $USER"
echo "Password L2TP   : $PASS"
echo "IP VPN fija     : $FIXED_IP"
echo "Servidor IPsec  : $VPS_IP"
echo "IPsec PSK       : ${L2TP_IPSEC_SECRET:-$(grep -oP ': PSK "\K[^"]+' /etc/ipsec.secrets || echo '***')}"
echo ""
echo "Configuración WinBox / RouterOS 6 (L2TP Client):"
echo "   /interface l2tp-client add name=vpn-panel connect-to=$VPS_IP user=$USER password=$PASS \\"
echo "     profile=default-encryption use-ipsec=yes ipsec-secret=PSK add-default-route=no disabled=no"
echo ""
echo "Si 'default-encryption' no existe, crearlo:"
echo "   /ppp profile add name=default-encryption local-address=10.8.0.1 remote-address=10.8.0.0/24"
echo ""
echo "===================================================="
