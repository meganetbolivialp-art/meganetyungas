#!/usr/bin/env bash
# Instalador guiado de OpenVPN/Pritunl para una VM Ubuntu/Debian en Proxmox.
# Uso: sudo bash install-proxmox-openvpn-client.sh [ruta/al/perfil.ovpn]
set -Eeuo pipefail

SERVICE_NAME="meganet"
TARGET_DIR="/etc/openvpn/client"
TARGET_FILE="$TARGET_DIR/$SERVICE_NAME.conf"
PROFILE="${1:-}"

on_error() {
  local exit_code=$?
  echo ""
  echo "ERROR: la instalación se detuvo en la línea $1." >&2
  if command -v journalctl >/dev/null 2>&1; then
    echo "Últimos mensajes del servicio:" >&2
    journalctl -u "openvpn-client@$SERVICE_NAME" -n 25 --no-pager >&2 || true
  fi
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

if [[ $EUID -ne 0 ]]; then
  echo "Debes ejecutarlo como root:" >&2
  echo "  sudo bash $0" >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Este instalador necesita una VM Ubuntu o Debian." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "Este instalador necesita una VM con systemd." >&2
  exit 1
fi

# Si no se indica una ruta, busca perfiles subidos a /root, /tmp o /home.
if [[ -z "$PROFILE" ]]; then
  mapfile -t PROFILES < <(find /root /tmp /home -maxdepth 3 -type f -iname '*.ovpn' -print 2>/dev/null | sort)

  if [[ ${#PROFILES[@]} -eq 0 ]]; then
    echo "No encontré ningún archivo .ovpn." >&2
    echo "Sube el perfil de Pritunl a /root y vuelve a ejecutar:" >&2
    echo "  sudo bash $0" >&2
    echo "También puedes indicar la ruta: sudo bash $0 /root/MI-PERFIL.ovpn" >&2
    exit 1
  fi

  if [[ ${#PROFILES[@]} -eq 1 ]]; then
    PROFILE="${PROFILES[0]}"
    echo "Perfil encontrado: $PROFILE"
  else
    echo "Encontré estos perfiles OpenVPN:"
    for i in "${!PROFILES[@]}"; do
      printf '  %s) %s\n' "$((i + 1))" "${PROFILES[$i]}"
    done
    read -r -p "Escribe el número del perfil de ESTA VM: " SELECTION
    if [[ ! "$SELECTION" =~ ^[0-9]+$ ]] || (( SELECTION < 1 || SELECTION > ${#PROFILES[@]} )); then
      echo "Selección inválida." >&2
      exit 1
    fi
    PROFILE="${PROFILES[$((SELECTION - 1))]}"
  fi
fi

if [[ ! -f "$PROFILE" ]]; then
  echo "No existe el archivo: $PROFILE" >&2
  exit 1
fi

if ! grep -qE '^client([[:space:]]|$)' "$PROFILE" || ! grep -qE '^remote[[:space:]]+' "$PROFILE"; then
  echo "El archivo no parece un perfil cliente OpenVPN válido." >&2
  echo "Descarga desde Pritunl el perfil .ovpn correspondiente a esta VM." >&2
  exit 1
fi

echo ""
echo "=== Instalando OpenVPN ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq openvpn iproute2 iputils-ping >/dev/null

echo "=== Instalando el perfil de Pritunl ==="
install -d -m 700 "$TARGET_DIR"
install -m 600 "$PROFILE" "$TARGET_FILE"
# Elimina retornos de carro si el archivo fue editado en Windows.
sed -i 's/\r$//' "$TARGET_FILE"

echo "=== Activando la conexión automática ==="
systemctl enable "openvpn-client@$SERVICE_NAME.service" >/dev/null
systemctl restart "openvpn-client@$SERVICE_NAME.service"

# OpenVPN puede tardar unos segundos en negociar el túnel.
for _ in {1..15}; do
  if systemctl is-active --quiet "openvpn-client@$SERVICE_NAME.service"; then
    break
  fi
  sleep 1
done

if ! systemctl is-active --quiet "openvpn-client@$SERVICE_NAME.service"; then
  echo "El servicio no pudo iniciar." >&2
  journalctl -u "openvpn-client@$SERVICE_NAME" -n 40 --no-pager >&2 || true
  exit 1
fi

VPN_IP="$(ip -4 -o address show scope global | awk '$2 ~ /^(tun|tap)/ {print $4}' | head -n 1 || true)"

echo ""
echo "============================================================"
echo " OPENVPN INSTALADO Y SERVICIO ACTIVO"
echo "============================================================"
if [[ -n "$VPN_IP" ]]; then
  echo "IP VPN de esta VM: $VPN_IP"
else
  echo "El servicio está activo, pero todavía no detecto una IP tun/tap."
  echo "Espera unos segundos y ejecuta: ip -4 address show"
fi

echo ""
echo "Interfaces VPN detectadas:"
ip -4 -brief address show | awk '$1 ~ /^(tun|tap)/' || true

echo ""
echo "SIGUIENTE PASO EN EL PANEL MEGANET:"
echo "1. Cada MikroTik debe conectarse con su propio perfil de Pritunl."
echo "2. En Routers/NAS > Nuevo, escribe la IP VPN del MikroTik."
echo "3. Usa puerto 8728 y desactiva Modo simulado."
echo "4. Guarda y pulsa Probar conexión."
echo ""
echo "COMANDOS ÚTILES:"
echo "  systemctl status openvpn-client@meganet --no-pager"
echo "  journalctl -u openvpn-client@meganet -n 50 --no-pager"
echo "  ping -c 4 IP_VPN_DEL_MIKROTIK"
echo "============================================================"
