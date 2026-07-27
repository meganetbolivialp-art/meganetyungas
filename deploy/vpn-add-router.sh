#!/usr/bin/env bash
# ============================================================================
#  MEGANET - Agregar router al hub SoftEther
#  Uso:   sudo bash vpn-add-router.sh <nombre> [ip-fija]
#  Ej:    sudo bash vpn-add-router.sh mercedes 10.10.0.11
# ============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*" >&2; }

[[ $EUID -eq 0 ]] || { err "Ejecutar como root"; exit 1; }

NAME="${1:-}"
FIXED_IP="${2:-}"

if [[ -z "${NAME}" ]]; then
  err "Uso: $0 <nombre> [ip-fija-opcional]"
  echo "Ej:  $0 mercedes 10.10.0.11"
  exit 1
fi

if [[ ! -f /opt/vpnserver/.admin_pass ]]; then
  err "No se encuentra /opt/vpnserver/.admin_pass — ¿corriste install-vpn-contabo.sh?"
  exit 1
fi

ADMIN_PASS="$(cat /opt/vpnserver/.admin_pass)"
HUB_NAME="MEGANET"
HUBCMD="/opt/vpnserver/vpncmd /server localhost:5555 /hub:${HUB_NAME} /password:${ADMIN_PASS} /cmd"

gen_pass() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16; }
USER_PASS="$(gen_pass)"

log "Creando usuario '${NAME}' en hub ${HUB_NAME}..."
# Borrar si ya existe (idempotente)
$HUBCMD UserDelete "${NAME}" >/dev/null 2>&1 || true
$HUBCMD UserCreate "${NAME}" /GROUP:none /REALNAME:"${NAME}" /NOTE:"Router MikroTik" >/dev/null
$HUBCMD UserPasswordSet "${NAME}" /password:"${USER_PASS}" >/dev/null

# IP fija vía SecurePolicy (si se pasó)
if [[ -n "${FIXED_IP}" ]]; then
  log "Reservando IP fija ${FIXED_IP} para ${NAME}..."
  $HUBCMD UserPolicySet "${NAME}" /NAME:FixedIP /VALUE:"${FIXED_IP}" >/dev/null 2>&1 || \
    echo "   (aviso: policy IP fija se aplicará al primer login)"
fi

VPS_IP="$(hostname -I | awk '{print $1}')"

echo
echo "============================================================"
echo " Router agregado a la VPN"
echo "============================================================"
echo " Nombre / Usuario:  ${NAME}"
echo " Password:          ${USER_PASS}"
echo " Servidor:          ${VPS_IP}"
echo " Puerto:            443"
echo " Hub:               ${HUB_NAME}"
[[ -n "${FIXED_IP}" ]] && echo " IP asignada:       ${FIXED_IP}"
echo "============================================================"
echo
echo " Configuración WinBox / RouterOS 6 (SSTP Client):"
echo "   Connect To: ${VPS_IP}"
echo "   Port:       443"
echo "   User:       ${NAME}"
echo "   Password:   ${USER_PASS}"
echo "   Profile:    default-encryption"
echo "   ✓ Verify Server Address From Certificate: OFF"
echo "   ✓ Add Default Route:                       OFF"
echo
[[ -n "${FIXED_IP}" ]] && cat <<EOF
 Después de que conecte, en el router:
   /ip address add address=${FIXED_IP}/24 interface=vpn-panel
   /ping 10.10.0.1

 Y en el panel Meganet, editar router → IP = ${FIXED_IP}
EOF
echo "============================================================"
