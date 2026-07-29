#!/usr/bin/env bash
# ============================================================================
#  MEGANET ISP — Instalador TOTAL en 1 comando (como MikroWISP)
# ----------------------------------------------------------------------------
#  Hace TODO de una vez en un VPS limpio:
#    1. Clona el repo desde GitHub
#    2. Instala Docker + Supabase self-hosted + Nginx + SSL
#    3. Levanta el frontend + agent
#    4. (Opcional) Importa un dump SQL completo (Export data de Lovable)
#    5. Deja el sistema listo en https://TU_DOMINIO
#
#  USO EN VPS LIMPIO (Ubuntu 22.04/24.04 o Debian 12):
#
#    # Sin dump (instalación fresca):
#    curl -fsSL https://raw.githubusercontent.com/meganetbolivialp-art/control-shine-hub/main/deploy/install-full.sh | sudo bash
#
#    # Con dump SQL (migración completa desde Lovable):
#    wget https://.../meganet-dump.sql
#    sudo bash <(curl -fsSL https://raw.githubusercontent.com/meganetbolivialp-art/control-shine-hub/main/deploy/install-full.sh) meganet-dump.sql
#
#  Variables opcionales (export antes de correr para modo desatendido):
#    DOMAIN, EMAIL, ADMIN_USER, ADMIN_PASS, GIT_REPO, GIT_BRANCH, DUMP_SQL
# ============================================================================

set -euo pipefail

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; C='\033[0;36m'; N='\033[0m'
log()  { echo -e "${G}[✓]${N} $*"; }
warn() { echo -e "${Y}[!]${N} $*"; }
err()  { echo -e "${R}[✗]${N} $*" >&2; exit 1; }
info() { echo -e "${C}[ℹ]${N} $*"; }

[[ $EUID -eq 0 ]] || err "Ejecuta como root: sudo bash $0"

clear
cat <<'BANNER'
 ███╗   ███╗███████╗ ██████╗  █████╗ ███╗   ██╗███████╗████████╗
 ████╗ ████║██╔════╝██╔════╝ ██╔══██╗████╗  ██║██╔════╝╚══██╔══╝
 ██╔████╔██║█████╗  ██║  ███╗███████║██╔██╗ ██║█████╗     ██║
 ██║╚██╔╝██║██╔══╝  ██║   ██║██╔══██║██║╚██╗██║██╔══╝     ██║
 ██║ ╚═╝ ██║███████╗╚██████╔╝██║  ██║██║ ╚████║███████╗   ██║
 ╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝
        INSTALADOR TOTAL — 1 comando, todo listo
BANNER
echo

# ---------- Argumentos ----------
DUMP_SQL="${DUMP_SQL:-${1:-}}"
GIT_REPO="${GIT_REPO:-https://github.com/meganetbolivialp-art/control-shine-hub.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
INSTALL_DIR="/opt/meganet"

# ---------- Datos (interactivo o env) ----------
ask() { local var="$1" prompt="$2" def="${3:-}"
  local cur="${!var:-}"
  if [[ -n "$cur" ]]; then eval "$var=\"$cur\""; return; fi
  if [[ ! -t 0 ]]; then eval "$var=\"$def\""; return; fi
  if [[ -n "$def" ]]; then read -rp "$(echo -e ${B}?${N} $prompt [$def]: )" val
  else read -rp "$(echo -e ${B}?${N} $prompt: )" val; fi
  eval "$var=\"${val:-$def}\""
}

warn "PASO 1/6 — Configuración"
ask DOMAIN     "Dominio apuntado al VPS (vacío = usar IP)" ""
ask EMAIL      "Email para Let's Encrypt SSL" "admin@meganet.bo"
ask ADMIN_USER "Email del admin inicial" "admin@meganet.bo"
ask ADMIN_PASS "Password admin" "MeganetAdmin2026!"

if [[ -z "$DUMP_SQL" && -t 0 ]]; then
  ask DUMP_SQL "Ruta a dump SQL de Lovable (vacío = instalación fresca)" ""
fi

if [[ -n "$DUMP_SQL" && ! -f "$DUMP_SQL" ]]; then
  err "No encontré el dump: $DUMP_SQL"
fi

# VPN opcional (SoftEther SSTP :443 para alcanzar MikroTiks detrás de NAT)
INSTALL_VPN="${INSTALL_VPN:-}"
if [[ -z "$INSTALL_VPN" && -t 0 ]]; then
  ask INSTALL_VPN "¿Instalar también la VPN SoftEther (SSTP :443)? [y/N]" "n"
fi
case "${INSTALL_VPN,,}" in y|yes|s|si|sí|1|true) INSTALL_VPN=1 ;; *) INSTALL_VPN=0 ;; esac

# ---------- 2. Dependencias base ----------
warn "PASO 2/6 — Instalando dependencias del sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release ufw jq >/dev/null
log "Dependencias base OK"

# ---------- 3. Clonar repo ----------
warn "PASO 3/6 — Clonando repo desde GitHub"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Repo ya existe, actualizando..."
  git -C "$INSTALL_DIR" fetch --all
  git -C "$INSTALL_DIR" reset --hard "origin/$GIT_BRANCH"
else
  rm -rf "$INSTALL_DIR"
  git clone --branch "$GIT_BRANCH" --depth 1 "$GIT_REPO" "$INSTALL_DIR"
fi
log "Código en $INSTALL_DIR"

# ---------- 4. Instalador base (Docker + Supabase + Nginx + SSL) ----------
warn "PASO 4/6 — Ejecutando instalador base"
export DOMAIN EMAIL ADMIN_USER ADMIN_PASS GIT_REPO GIT_BRANCH
export MEGANET_UNATTENDED=1
bash "$INSTALL_DIR/deploy/install-meganet.sh"
log "Base instalada"

# ---------- 5. Import dump SQL (opcional) ----------
if [[ -n "$DUMP_SQL" ]]; then
  warn "PASO 5/6 — Importando dump SQL"
  cp "$DUMP_SQL" "$INSTALL_DIR/dump-import.sql"
  bash "$INSTALL_DIR/deploy/migrate-from-lovable.sh" "$INSTALL_DIR/dump-import.sql"
  log "Datos importados desde dump"
else
  info "PASO 5/6 — Sin dump, instalación fresca (skip import)"
fi

# ---------- 6. Verificación final ----------
warn "PASO 6/6 — Verificación"
sleep 3
FRONT_URL="${DOMAIN:+https://$DOMAIN}"; FRONT_URL="${FRONT_URL:-http://$(hostname -I | awk '{print $1}')}"
if curl -fsS -o /dev/null -w '%{http_code}' "$FRONT_URL" | grep -qE '200|301|302'; then
  log "Frontend responde: $FRONT_URL"
else
  warn "Frontend aún no responde (puede tardar 1-2 min). Revisa: docker ps"
fi

cat <<EOF

${G}================================================================${N}
${G}  ✓ INSTALACIÓN COMPLETA${N}
${G}================================================================${N}

  🌐 Panel:     $FRONT_URL
  👤 Admin:     $ADMIN_USER
  🔑 Password:  $ADMIN_PASS

  📂 Código:    $INSTALL_DIR
  🗄  Backup:   /opt/meganet/backups/
  📜 Logs:      docker logs -f meganet-frontend

  Actualizar en el futuro:
    cd $INSTALL_DIR && git pull && docker compose up -d --build

  Importar otro dump más tarde:
    bash $INSTALL_DIR/deploy/migrate-from-lovable.sh /ruta/al/dump.sql

${G}================================================================${N}
EOF
