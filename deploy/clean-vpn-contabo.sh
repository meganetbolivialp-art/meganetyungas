#!/usr/bin/env bash
# ============================================================================
#  MEGANET ISP - Limpiador de VPN para Contabo VPS
# ----------------------------------------------------------------------------
#  Borra la VPN vieja para reinstalar desde cero.
#  NO toca: /opt/meganet/supabase, base de datos, frontend, backups ni Nginx.
#
#  USO:
#    sudo bash clean-vpn-contabo.sh
#    sudo bash clean-vpn-contabo.sh --yes
# ============================================================================

set -euo pipefail

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; N='\033[0m'
log()  { echo -e "${G}[✓]${N} $*"; }
warn() { echo -e "${Y}[!]${N} $*"; }
err()  { echo -e "${R}[✗]${N} $*" >&2; exit 1; }

[[ ${EUID:-$(id -u)} -eq 0 ]] || err "Ejecuta como root: sudo bash clean-vpn-contabo.sh"

AUTO_YES=0
[[ "${1:-}" == "--yes" || "${1:-}" == "-y" ]] && AUTO_YES=1

clear
cat <<'BANNER'
============================================================
  MEGANET ISP — Limpieza VPN Contabo
  Limpia SoftEther / WireGuard / L2TP para reinstalar limpio
============================================================
BANNER
echo

warn "IMPORTANTE: Esto solo limpia VPN. No borra el sistema Meganet ni la base de datos."
echo "Se respaldarán configuraciones viejas antes de borrar."
echo

if [[ $AUTO_YES -ne 1 ]]; then
  read -rp "¿Continuar con la limpieza de VPN? Escribe SI: " CONFIRM
  [[ "$CONFIRM" == "SI" ]] || err "Cancelado."
fi

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/root/vpn-clean-backup-$STAMP"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

backup_path() {
  local path="$1"
  if [[ -e "$path" ]]; then
    local target="$BACKUP_DIR${path}"
    mkdir -p "$(dirname "$target")"
    cp -a "$path" "$target"
    log "Backup: $path"
  fi
}

stop_disable_service() {
  local svc="$1"
  if systemctl list-unit-files "$svc" &>/dev/null || systemctl status "$svc" &>/dev/null; then
    systemctl stop "$svc" 2>/dev/null || true
    systemctl disable "$svc" 2>/dev/null || true
    log "Servicio detenido/deshabilitado: $svc"
  fi
}

warn "1/6 — Respaldando configuraciones VPN existentes"
for path in \
  /usr/local/vpnserver \
  /etc/systemd/system/vpnserver.service \
  /etc/systemd/system/softether-vpnserver.service \
  /etc/wireguard \
  /etc/xl2tpd \
  /etc/ipsec.conf \
  /etc/ipsec.secrets \
  /etc/strongswan.conf \
  /etc/ppp/chap-secrets \
  /etc/ppp/options.xl2tpd \
  /etc/ppp/ip-up.d/meganet-vpn \
  /etc/ppp/ip-down.d/meganet-vpn; do
  backup_path "$path"
done

warn "2/6 — Deteniendo servicios VPN viejos"
for svc in \
  vpnserver.service \
  softether-vpnserver.service \
  wg-quick@wg0.service \
  wg-quick@wg-mikrosystem.service \
  strongswan.service \
  strongswan-starter.service \
  ipsec.service \
  xl2tpd.service; do
  stop_disable_service "$svc"
done

pkill -f '/usr/local/vpnserver/vpnserver' 2>/dev/null || true
pkill -f 'vpnserver execsvc' 2>/dev/null || true
pkill -f 'xl2tpd' 2>/dev/null || true
pkill -f 'charon' 2>/dev/null || true

warn "3/6 — Borrando archivos de VPN viejos"
rm -rf /usr/local/vpnserver
rm -rf /etc/wireguard
rm -rf /etc/xl2tpd
rm -f /etc/systemd/system/vpnserver.service
rm -f /etc/systemd/system/softether-vpnserver.service
rm -f /etc/ipsec.conf /etc/ipsec.secrets /etc/strongswan.conf
rm -f /etc/ppp/options.xl2tpd /etc/ppp/ip-up.d/meganet-vpn /etc/ppp/ip-down.d/meganet-vpn
systemctl daemon-reload

warn "4/6 — Quitando paquetes de VPN antiguos si existen"
export DEBIAN_FRONTEND=noninteractive
if command -v apt-get &>/dev/null; then
  apt-get remove -y -qq wireguard wireguard-tools xl2tpd strongswan strongswan-starter 2>/dev/null || true
  apt-get autoremove -y -qq 2>/dev/null || true
fi

warn "5/6 — Limpiando interfaces virtuales activas"
ip link delete wg0 2>/dev/null || true
ip link delete wg-mikrosystem 2>/dev/null || true
ip link delete ppp0 2>/dev/null || true

warn "6/6 — Verificando puertos VPN"
echo
ss -tulpn | grep -E ':(443|5555|500|4500|1701|51820)\b' || true
echo

log "Limpieza VPN completada."
echo -e "${B}Backup:${N} $BACKUP_DIR"
echo
echo "Ahora puedes reinstalar SSTP limpio. Recomendado: usar red VPN 10.10.0.0/24"
echo "y dejar el router MERCEDES con IP VPN 10.10.0.2."