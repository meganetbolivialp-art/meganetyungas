#!/usr/bin/env bash
# ============================================================================
#  MEGANET ISP - Actualizador rápido del VPS (frontend + agente)
# ----------------------------------------------------------------------------
#  USO:
#    sudo bash /opt/meganet/frontend-src/deploy/update-vps.sh
#  o
#    cd /opt/meganet/frontend-src && sudo bash deploy/update-vps.sh
# ============================================================================

set -euo pipefail

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; N='\033[0m'
log()  { echo -e "${G}[✓]${N} $*"; }
warn() { echo -e "${Y}[!]${N} $*"; }
err()  { echo -e "${R}[✗]${N} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || err "Ejecuta como root: sudo bash deploy/update-vps.sh"

INSTALL_DIR="${MEGANET_DIR:-/opt/meganet}"
FRONT_DIR="$INSTALL_DIR/frontend-src"
AGENT_DIR="$INSTALL_DIR/agent"

# --- Autodetección: el panel puede estar en otra ruta ---------------------
if [[ ! -d "$FRONT_DIR" ]]; then
  warn "No existe $FRONT_DIR. Buscando la instalación en el sistema..."
  FOUND=""
  for cand in /opt/meganet/frontend-src /opt/meganet /opt/mikrosystem /root/control-shine-hub /root/meganet /var/www/meganet; do
    [[ -f "$cand/package.json" ]] && { FOUND="$cand"; break; }
  done
  if [[ -z "$FOUND" ]]; then
    FOUND=$(find /opt /root /var/www /srv -maxdepth 4 -name package.json -not -path '*/node_modules/*' 2>/dev/null | head -n1 | xargs -r dirname)
  fi
  if [[ -n "$FOUND" ]]; then
    FRONT_DIR="$FOUND"
    INSTALL_DIR="$(dirname "$FOUND")"
    AGENT_DIR="$INSTALL_DIR/agent"
    log "Instalación detectada en $FRONT_DIR"
  else
    echo ""
    err "No hay ninguna instalación de MIKROSYSTEM en este servidor.
     Este VPS todavía no tiene el panel instalado (es probable que estés en el VPS de la VPN).
     Para instalarlo por primera vez ejecutá:
       bash <(curl -fsSL https://raw.githubusercontent.com/meganetbolivialp-art/control-shine-hub/main/deploy/install-full.sh)
     O, si el panel vive en otro servidor, conectate a ese servidor y corré este script allí."
  fi
fi

mkdir -p "$AGENT_DIR"
cd "$FRONT_DIR"

clear
log "Actualizando MIKROSYSTEM desde el repositorio Git..."

# ============================================================================
# 1. Actualizar código fuente
# ============================================================================
if [[ -d "$FRONT_DIR/.git" ]]; then
  log "Pull del repositorio..."
  git fetch origin
  git reset --hard "@{upstream}" || git pull --ff-only
else
  warn "No es un repositorio git. Si quieres actualizar manualmente sube los archivos a $FRONT_DIR y re-ejecuta."
fi

# ============================================================================
# 2. Dependencias
# ============================================================================
log "Instalando dependencias..."
command -v bun &>/dev/null || npm i -g bun >/dev/null 2>&1
bun install

# ============================================================================
# 3. Build de frontend (Node self-host)
# ============================================================================
log "Compilando frontend..."
NITRO_PRESET=node-server bun run build

# ============================================================================
# 4. Actualizar agente MikroTik si el archivo existe en el repo
# ============================================================================
if [[ -f "$FRONT_DIR/deploy/mikrotik-agent.mjs" ]]; then
  log "Actualizando agente MikroTik..."
  cp "$FRONT_DIR/deploy/mikrotik-agent.mjs" "$AGENT_DIR/mikrotik-agent.mjs"
  systemctl restart mikrotik-agent || warn "No se pudo reiniciar mikrotik-agent"
fi

# ============================================================================
# 5. Reiniciar servicios
# ============================================================================
log "Reiniciando servicios web..."
systemctl daemon-reload
systemctl restart meganet-web
systemctl status meganet-web --no-pager

# ============================================================================
# 6. (Opcional) Recargar Supabase si se detecta cambio de migraciones
# ============================================================================
if [[ -d "$FRONT_DIR/supabase/migrations" ]] && [[ -d "$INSTALL_DIR/supabase" ]]; then
  warn "Si subiste nuevas migraciones SQL, aplícalas manualmente con:"
  warn "  cd $INSTALL_DIR/supabase && docker compose restart"
  warn "  Luego: docker exec -i meganet-supabase-db-1 psql -U postgres < tu-migracion.sql"
fi

# ============================================================================
# 7. Resumen
# ============================================================================
VPS_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
log "Actualización completa."
echo ""
echo -e "  Panel:   ${B}http://$VPS_IP${N}"
echo -e "  Logs:    ${B}journalctl -u meganet-web -f${N}"
echo -e "  Agent:   ${B}systemctl status mikrotik-agent${N}"
echo ""
