#!/usr/bin/env bash
# Instala un perfil OpenVPN/Pritunl como cliente permanente en Ubuntu/Debian.
# La VM de Proxmox no se convierte en servidor VPN.
set -euo pipefail

PROFILE="${1:-}"
SERVICE_NAME="meganet"
TARGET_DIR="/etc/openvpn/client"
TARGET_FILE="$TARGET_DIR/$SERVICE_NAME.conf"

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta como root: sudo bash $0 /ruta/perfil-pritunl.ovpn" >&2
  exit 1
fi
if [[ -z "$PROFILE" || ! -f "$PROFILE" ]]; then
  echo "Uso: sudo bash $0 /ruta/perfil-pritunl.ovpn" >&2
  exit 1
fi
if ! grep -qE '^client([[:space:]]|$)' "$PROFILE" || ! grep -qE '^remote[[:space:]]+' "$PROFILE"; then
  echo "El archivo no parece un perfil cliente OpenVPN válido." >&2
  exit 1
fi

echo "==> Instalando OpenVPN en la VM de Proxmox..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq openvpn iproute2 >/dev/null

install -d -m 700 "$TARGET_DIR"
install -m 600 "$PROFILE" "$TARGET_FILE"

echo "==> Activando el cliente OpenVPN al iniciar..."
systemctl enable "openvpn-client@$SERVICE_NAME.service" >/dev/null
systemctl restart "openvpn-client@$SERVICE_NAME.service"

sleep 4
if ! systemctl is-active --quiet "openvpn-client@$SERVICE_NAME.service"; then
  echo "El cliente no pudo iniciar. Revisa: journalctl -u openvpn-client@$SERVICE_NAME -n 60 --no-pager" >&2
  exit 1
fi

echo ""
echo "OpenVPN conectado como servicio openvpn-client@$SERVICE_NAME."
echo "Interfaces VPN detectadas:"
ip -4 address show | grep -A 3 -E '^[0-9]+: (tun|tap)' || true
echo ""
echo "Próximos pasos:"
echo "1. Anota la IP VPN de esta VM."
echo "2. Verifica conectividad con cada MikroTik: ping IP_VPN_DEL_ROUTER"
echo "3. En el panel, registra cada router con su IP VPN y puerto API 8728."
echo "4. Diagnóstico: journalctl -u openvpn-client@$SERVICE_NAME -f"
