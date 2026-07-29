#!/usr/bin/env bash
# ============================================================================
#  MEGANET — Migración automática desde Lovable Cloud al VPS
# ----------------------------------------------------------------------------
#  Automatiza la importación del dump SQL exportado desde Lovable Cloud.
#
#  USO (desde tu PC):
#    bash deploy/migrate-from-lovable.sh <dump.sql> <root@IP_VPS>
#
#  USO (ya en el VPS):
#    bash deploy/migrate-from-lovable.sh <dump.sql>
#
#  Qué hace:
#    1. Sube el dump al VPS (si se ejecuta desde local)
#    2. Hace backup de la base actual (por si algo sale mal)
#    3. Importa el dump
#    4. Reinicia servicios
#    5. Verifica que las tablas estén ok
# ============================================================================

set -euo pipefail

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; N='\033[0m'
log()  { echo -e "${G}[✓]${N} $*"; }
warn() { echo -e "${Y}[!]${N} $*"; }
err()  { echo -e "${R}[✗]${N} $*" >&2; exit 1; }

DUMP="${1:-}"
TARGET="${2:-}"

[[ -n "$DUMP" ]] || err "Uso: $0 <dump.sql> [root@IP_VPS]"

# ---------- Modo LOCAL: subir al VPS y re-ejecutarse ----------
if [[ -n "$TARGET" ]]; then
  [[ -f "$DUMP" ]] || err "No encuentro el dump: $DUMP"
  log "Subiendo dump al VPS ($TARGET)..."
  REMOTE_DIR="/opt/meganet/backups"
  REMOTE_DUMP="$REMOTE_DIR/lovable-import-$(date +%Y%m%d-%H%M%S).sql"

  ssh "$TARGET" "mkdir -p $REMOTE_DIR"
  scp "$DUMP" "$TARGET:$REMOTE_DUMP"
  log "Dump subido a $REMOTE_DUMP"

  log "Copiando script al VPS y ejecutando..."
  scp "$0" "$TARGET:/tmp/migrate-from-lovable.sh"
  ssh "$TARGET" "bash /tmp/migrate-from-lovable.sh $REMOTE_DUMP"
  exit 0
fi

# ---------- Modo VPS: importar el dump ----------
[[ ${EUID:-$(id -u)} -eq 0 ]] || err "Ejecuta como root en el VPS: sudo bash $0 <dump>"
[[ -f "$DUMP" ]] || err "No encuentro el dump: $DUMP"

DB_CONTAINER="meganet-supabase-db-1"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="/opt/meganet/backups/pre-import-$STAMP.sql.gz"

clear
cat <<'BANNER'
============================================================
  MEGANET — Import automático desde Lovable Cloud
============================================================
BANNER
echo

if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  err "Contenedor $DB_CONTAINER no está corriendo. Ejecuta 'cd /opt/meganet/supabase && docker compose up -d' primero."
fi

warn "1/5 — Backup de seguridad de la base actual"
mkdir -p /opt/meganet/backups
docker exec "$DB_CONTAINER" pg_dump -U postgres postgres | gzip > "$BACKUP_FILE"
log "Backup guardado en $BACKUP_FILE"

warn "2/5 — Preparando dump (limpiando referencias a schemas de Supabase managed)"
CLEAN_DUMP="/tmp/dump-clean-$STAMP.sql"
# Quita comandos que solo funcionan en Supabase Cloud (roles, extensiones system, etc.)
grep -vE '^(CREATE ROLE|ALTER ROLE|GRANT .* TO (supabase|postgres|authenticator|anon|authenticated|service_role|dashboard_user))' "$DUMP" \
  | grep -vE '^(CREATE SCHEMA IF NOT EXISTS (auth|storage|realtime|extensions|graphql|graphql_public|pgbouncer|vault))' \
  > "$CLEAN_DUMP" || true
log "Dump preparado: $CLEAN_DUMP ($(du -h "$CLEAN_DUMP" | cut -f1))"

warn "3/5 — Importando dump al contenedor Postgres"
if docker exec -i "$DB_CONTAINER" psql -U postgres -v ON_ERROR_STOP=0 < "$CLEAN_DUMP" 2>&1 | tail -40; then
  log "Import completado"
else
  warn "Hubo warnings durante el import (normal si ya existían tablas). Revisa arriba."
fi

warn "4/5 — Reiniciando servicios Supabase"
cd /opt/meganet/supabase && docker compose restart auth rest realtime storage
log "Servicios reiniciados"

warn "5/5 — Verificando tablas importadas"
echo
echo "Tablas encontradas en public:"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c "\dt public.*" | head -40
echo
echo "Conteo rápido:"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc \
  "SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text::int AS filas
     FROM information_schema.tables WHERE table_schema='public' ORDER BY 1;" 2>/dev/null | head -20 || true

echo
log "Migración terminada."
echo -e "${B}Backup previo:${N} $BACKUP_FILE"
echo -e "${B}Dump importado:${N} $DUMP"
echo
echo "Si algo salió mal, restaurar el backup previo con:"
echo "  gunzip -c $BACKUP_FILE | docker exec -i $DB_CONTAINER psql -U postgres"
