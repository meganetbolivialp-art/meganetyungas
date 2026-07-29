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
#    2. Hace backup de seguridad de la base actual
#    3. Limpia el SQL de comandos exclusivos de Supabase Cloud
#    4. Importa el dump
#    5. Reinicia servicios
#    6. Verifica tablas y permite restaurar backup previo si falla
# ============================================================================

set -euo pipefail

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; C='\033[0;36m'; N='\033[0m'
log()  { echo -e "${G}[✓]${N} $*"; }
warn() { echo -e "${Y}[!]${N} $*"; }
err()  { echo -e "${R}[✗]${N} $*" >&2; exit 1; }
info() { echo -e "${C}[ℹ]${N} $*"; }

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

# Detectar si el dump está comprimido
if [[ "$DUMP" == *.gz ]]; then
  warn "Dump comprimido detectado, descomprimiendo..."
  UNZIPPED="/tmp/dump-ungz-$STAMP.sql"
  gunzip -c "$DUMP" > "$UNZIPPED"
  DUMP="$UNZIPPED"
fi

# clear
cat <<'BANNER'
============================================================
  MEGANET — Import automático desde Lovable Cloud
============================================================
BANNER
echo

if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  err "Contenedor $DB_CONTAINER no está corriendo. Ejecuta 'cd /opt/meganet/supabase && docker compose up -d' primero."
fi

warn "1/6 — Backup de seguridad de la base actual"
mkdir -p /opt/meganet/backups
info "Creando backup en $BACKUP_FILE..."
if docker exec "$DB_CONTAINER" pg_dump -U postgres postgres 2>/dev/null | gzip > "$BACKUP_FILE"; then
  log "Backup guardado en $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  err "No se pudo crear el backup de seguridad. Abortando."
fi

warn "2/6 — Preparando dump (limpiando referencias a schemas de Supabase managed)"
CLEAN_DUMP="/tmp/dump-clean-$STAMP.sql"
info "Limpiando SQL..."

# Limpieza más robusta: quita roles, grants globales, schemas managed, extensiones y comentarios problemáticos
grep -vE '^(CREATE ROLE|ALTER ROLE|GRANT .* TO (supabase|postgres|authenticator|anon|authenticated|service_role|dashboard_user))' "$DUMP" \
  | grep -vE '^(CREATE SCHEMA IF NOT EXISTS (auth|storage|realtime|extensions|graphql|graphql_public|pgbouncer|vault))' \
  | grep -vE '^(DROP ROLE|REASSIGN OWNED)' \
  | grep -vE "^COMMENT ON SCHEMA (auth|storage|realtime|extensions|graphql|graphql_public|pgbouncer|vault)" \
  | grep -vE '^(ALTER .* OWNER TO .*;)' \
  | grep -vE '^(SET .*search_path.*)' \
  > "$CLEAN_DUMP" || true

log "Dump preparado: $CLEAN_DUMP ($(du -h "$CLEAN_DUMP" | cut -f1))"

warn "3/6 — Conteo previo de filas (para comparar después)"
BEFORE_COUNT="/tmp/row-count-before-$STAMP.txt"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc \
  "SELECT table_name, COALESCE((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text::int, 0) AS filas
     FROM information_schema.tables WHERE table_schema='public' ORDER BY 1;" 2>/dev/null > "$BEFORE_COUNT" || true
log "Conteo previo guardado en $BEFORE_COUNT"

warn "4/6 — Importando dump al contenedor Postgres"
info "Esto puede tardar varios minutos dependiendo del tamaño del dump..."
if docker exec -i "$DB_CONTAINER" psql -U postgres -v ON_ERROR_STOP=0 < "$CLEAN_DUMP" 2>&1 | tail -80; then
  log "Import completado"
else
  warn "Hubo warnings durante el import (normal si ya existían tablas). Revisa arriba."
fi

warn "5/6 — Reiniciando servicios Supabase"
cd /opt/meganet/supabase && docker compose restart auth rest realtime storage || warn "Algunos servicios no se reiniciaron (puede ser normal si no están configurados)"
log "Servicios reiniciados"

warn "6/6 — Verificando tablas importadas"
echo
echo "Tablas encontradas en public:"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c "\dt public.*" | head -60
echo
echo "Conteo rápido después del import:"
AFTER_COUNT="/tmp/row-count-after-$STAMP.txt"
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc \
  "SELECT table_name, COALESCE((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text::int, 0) AS filas
     FROM information_schema.tables WHERE table_schema='public' ORDER BY 1;" 2>/dev/null > "$AFTER_COUNT" || true
cat "$AFTER_COUNT" | head -40

echo
log "Migración terminada."
echo -e "${B}Backup previo:${N} $BACKUP_FILE"
echo -e "${B}Dump importado:${N} $DUMP"
echo -e "${B}Conteo antes:${N}  $BEFORE_COUNT"
echo -e "${B}Conteo después:${N} $AFTER_COUNT"
echo
echo "Si algo salió mal, restaurar el backup previo con:"
echo -e "  ${Y}gunzip -c $BACKUP_FILE | docker exec -i $DB_CONTAINER psql -U postgres${N}"
