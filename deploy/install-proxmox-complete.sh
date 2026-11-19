#!/usr/bin/env bash
# Instalador completo de Meganet + OpenVPN para una VM limpia en Proxmox.
# El paquete .run incluye el código; no necesita GitHub ni tokens.
set -Eeuo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="/opt/meganet-deploy"
INSTALL_DIR="/opt/meganet"
PROFILE="${1:-}"
DUMP_SQL="${2:-}"

log() { printf '\n\033[0;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33mATENCIÓN: %s\033[0m\n' "$*"; }
fail() { printf '\n\033[0;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

on_error() {
  local exit_code=$?
  echo "" >&2
  echo "La instalación se detuvo en la línea $1." >&2
  echo "Revisa el mensaje anterior. Tus archivos existentes no serán borrados por este instalador." >&2
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

verify_package() {
  [[ -f "$SOURCE_DIR/package.json" ]] || fail "El paquete está incompleto: falta package.json."
  [[ -f "$SOURCE_DIR/deploy/install-meganet.sh" ]] || fail "El paquete está incompleto: falta install-meganet.sh."
  [[ -d "$SOURCE_DIR/supabase/migrations" ]] || fail "El paquete está incompleto: faltan las migraciones."
}

if [[ "${1:-}" == "--check" ]]; then
  verify_package
  echo "Estructura del paquete verificada correctamente. No se instaló ni modificó nada."
  exit 0
fi

[[ $EUID -eq 0 ]] || fail "Ejecuta como root: sudo bash $0 [perfil.ovpn] [copia.sql]"
command -v apt-get >/dev/null 2>&1 || fail "Usa una VM Ubuntu 22.04/24.04 o Debian 12."
command -v systemctl >/dev/null 2>&1 || fail "La VM necesita systemd."
verify_package

if [[ -f "$INSTALL_DIR/supabase/docker-compose.yml" ]]; then
  if [[ -f "$INSTALL_DIR/CREDENCIALES.txt" && "${MEGANET_REINSTALL:-0}" != "1" ]]; then
    fail "Meganet ya está instalado y funcionando en $INSTALL_DIR. Para reinstalar desde cero ejecuta con MEGANET_REINSTALL=1."
  fi
  log "Limpiando un intento de instalación anterior que quedó incompleto"
  (cd "$INSTALL_DIR/supabase" && docker compose down -v --remove-orphans) >/dev/null 2>&1 || true
  systemctl stop meganet-web mikrotik-agent >/dev/null 2>&1 || true
  rm -rf "$INSTALL_DIR"
fi

MEMORY_KB="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
DISK_KB="$(df -Pk / | awk 'NR==2 {print $4}')"
if (( MEMORY_KB < 3800000 )); then
  warn "Se recomiendan al menos 4 GB de RAM; la compilación podría fallar con menos memoria."
fi
if (( DISK_KB < 15000000 )); then
  fail "Necesitas al menos 15 GB libres en el disco de la VM."
fi

log "Copiando Meganet a $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
cp -a "$SOURCE_DIR/." "$DEPLOY_DIR/"

# Una copia SQL es opcional. Sin ella se crean todas las tablas desde cero.
if [[ -z "$DUMP_SQL" && -f /root/meganet-dump.sql ]]; then
  DUMP_SQL="/root/meganet-dump.sql"
fi
if [[ -n "$DUMP_SQL" ]]; then
  [[ -f "$DUMP_SQL" ]] || fail "No existe la copia de datos: $DUMP_SQL"
  mkdir -p "$INSTALL_DIR/backups"
  cp "$DUMP_SQL" "$INSTALL_DIR/backups/meganet-dump.sql"
  log "Se restaurará la copia de datos incluida"
else
  log "No hay copia anterior: se creará una base de datos nueva"
fi

# Valores no interactivos; se pueden personalizar con variables de entorno.
export MEGANET_UNATTENDED=1
export DOMAIN="${DOMAIN:-}"
export EMAIL="${EMAIL:-admin@meganet.bo}"
export ADMIN_USER="${ADMIN_USER:-admin@meganet.bo}"
export ADMIN_PASS="${ADMIN_PASS:-Mega$(date +%s%N | sha256sum | head -c 18)!}"
export GIT_REPO=""

# El sistema es independiente de la VPN: primero se instala todo el panel.
log "Instalando panel, base de datos, Nginx y agente MikroTik"
bash "$DEPLOY_DIR/deploy/install-meganet.sh"

# OpenVPN es opcional y se configura solamente cuando se indica un perfil.
VPN_OK=0
if [[ -n "$PROFILE" ]]; then
  log "Sistema instalado; conectando esta VM al servidor Pritunl"
  if bash "$DEPLOY_DIR/deploy/install-proxmox-openvpn-client.sh" "$PROFILE"; then
    VPN_OK=1
  else
    warn "El sistema está instalado, pero la VPN no pudo conectarse. Podrás reintentarlo después."
  fi
else
  log "Sistema instalado sin VPN; OpenVPN queda como paso posterior"
fi

log "Verificando los servicios instalados"
systemctl is-active --quiet docker || fail "Docker no está activo."
systemctl is-active --quiet nginx || fail "Nginx no está activo."
systemctl is-active --quiet mikrotik-agent || fail "El agente MikroTik no está activo."
if [[ "$VPN_OK" == "1" ]]; then
  systemctl is-active --quiet openvpn-client@meganet || fail "OpenVPN no está activo."
fi

WEB_OK=0
for _ in {1..45}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/ >/dev/null 2>&1; then
    WEB_OK=1
    break
  fi
  sleep 2
done
if [[ "$WEB_OK" != "1" ]]; then
  journalctl -u meganet-web -n 50 --no-pager >&2 || true
  fail "El panel web todavía no responde en el puerto interno 3000."
fi
systemctl is-active --quiet meganet-web || fail "El servicio meganet-web no está activo."
nginx -t >/dev/null

PUBLIC_IP="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
VPN_IP="$(ip -4 -o address show scope global | awk '$2 ~ /^(tun|tap)/ {print $4}' | head -n 1 || true)"

echo ""
echo "============================================================"
echo " MEGANET INSTALADO CORRECTAMENTE"
echo "============================================================"
if [[ -n "$DOMAIN" ]]; then
  echo "Panel:             https://$DOMAIN"
else
  echo "Panel:             http://$PUBLIC_IP"
fi
if [[ "$VPN_OK" == "1" ]]; then
  echo "IP VPN de esta VM: ${VPN_IP:-revisar con ip -4 address show}"
else
  echo "VPN:               PENDIENTE; el sistema ya está instalado"
  echo "Conectar después:"
  echo "  sudo bash $DEPLOY_DIR/deploy/install-proxmox-openvpn-client.sh /home/mega/NOMBRE.ovpn"
fi
echo "Credenciales:      $INSTALL_DIR/CREDENCIALES.txt"
echo ""
echo "Para ver el usuario y la contraseña del administrador:"
echo "  cat $INSTALL_DIR/CREDENCIALES.txt"
echo ""
echo "Cuando la VPN esté conectada, registra cada MikroTik con su IP VPN,"
echo "puerto 8728 y Modo simulado desactivado."
echo "============================================================"
