#!/usr/bin/env bash
# ============================================================================
#  MEGANET - Actualizador en caliente (no borra datos)
#  Uso:   sudo bash meganet-actualizacion.run
#  Qué hace:
#    1. Copia de seguridad de la base de datos antes de tocar nada
#    2. Sustituye el código por el nuevo (conserva .env.production)
#    3. Compila el panel y aplica SOLO las migraciones que falten
#    4. Corrige permisos: deja de dar administrador a los operadores
#    5. Reinicia el panel y el agente MikroTik
# ============================================================================
set -Eeuo pipefail

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; N='\033[0m'
log()  { printf "${G}[OK]${N} %s\n" "$*"; }
warn() { printf "${Y}[!]${N} %s\n" "$*"; }
err()  { printf "${R}[X]${N} %s\n" "$*" >&2; exit 1; }

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="${MEGANET_DIR:-/opt/meganet}"
DEPLOY_DIR="${MEGANET_DEPLOY_DIR:-/opt/meganet-deploy}"
DB_C="meganet-supabase-db-1"

[[ $EUID -eq 0 ]] || err "Ejecuta como root: sudo bash $0"

# ---------------------------------------------------------------- 0. Verificar
[[ -f "$SOURCE_DIR/package.json" ]] || err "Paquete incompleto: falta package.json"
[[ -d "$SOURCE_DIR/supabase/migrations" ]] || err "Paquete incompleto: faltan migraciones"
[[ -d "$INSTALL_DIR" ]] || err "No existe $INSTALL_DIR. Aquí no hay nada que actualizar: usa el instalador completo."
[[ -f "$INSTALL_DIR/supabase/docker-compose.yml" ]] || err "No hay base de datos en $INSTALL_DIR. Usa el instalador completo."

FRONT_REAL="$(readlink -f "$INSTALL_DIR/frontend-src" 2>/dev/null || echo "$INSTALL_DIR/frontend-src")"
log "Instalación detectada: $INSTALL_DIR (código en $FRONT_REAL)"

# ---------------------------------------------------------------- 1. Respaldo
mkdir -p "$INSTALL_DIR/backups"
STAMP="$(date +%F-%H%M)"
BACKUP="$INSTALL_DIR/backups/antes-actualizar-$STAMP.sql.gz"
DUMP_TMP="$(mktemp /tmp/meganet-dump.XXXXXX)"
echo -n "Respaldando la base de datos"
BACKUP_OK=0
if docker ps --format '{{.Names}}' | grep -q "^${DB_C}$"; then
  for DBU in postgres supabase_admin; do
    if docker exec "$DB_C" pg_dumpall -U "$DBU" > "$DUMP_TMP" 2>/dev/null \
       && grep -q "PostgreSQL database dump complete" "$DUMP_TMP"; then
      gzip -c "$DUMP_TMP" > "$BACKUP"
      BACKUP_OK=1
      break
    fi
  done
fi
rm -f "$DUMP_TMP"
echo ""
if [[ "$BACKUP_OK" == "1" ]]; then
  log "Respaldo guardado en $BACKUP ($(numfmt --to=iec "$(stat -c %s "$BACKUP")" 2>/dev/null || echo '?'))"
else
  rm -f "$BACKUP"
  warn "No se pudo respaldar la base de datos; la actualización continúa igual."
fi

# ---------------------------------------------------------------- 2. Migrations
# Anotar qué migraciones ya estaban aplicadas (las que existen hoy en el servidor)
APPLIED_LIST="$SOURCE_DIR/.meganet-applied.txt"
: > "$APPLIED_LIST"
for d in "$DEPLOY_DIR" "$FRONT_REAL"; do
  [[ -d "$d/supabase/migrations" ]] || continue
  find "$d/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' >> "$APPLIED_LIST"
done
sort -u "$APPLIED_LIST" -o "$APPLIED_LIST"

# ---------------------------------------------------------------- 3. Código nuevo
ENV_TMP=""
if [[ -f "$DEPLOY_DIR/.env.production" ]]; then
  ENV_TMP="$(mktemp /tmp/meganet-env.XXXXXX)"
  cp "$DEPLOY_DIR/.env.production" "$ENV_TMP"
fi

log "Copiando el código nuevo"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude '.env.production' --exclude 'node_modules' --exclude '.output' \
    --exclude '.git' --exclude 'supabase/.env' \
    "$SOURCE_DIR/" "$DEPLOY_DIR/"
else
  cp -a "$SOURCE_DIR/." "$DEPLOY_DIR/"
fi
[[ -n "$ENV_TMP" ]] && cp "$ENV_TMP" "$DEPLOY_DIR/.env.production" && rm -f "$ENV_TMP"
chmod 600 "$DEPLOY_DIR/.env.production" 2>/dev/null || true
log "Código actualizado en $DEPLOY_DIR"

# ---------------------------------------------------------------- 4. Dependencias
export PATH="$HOME/.bun/bin:$PATH"
command -v bun >/dev/null 2>&1 || { curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 || npm i -g bun >/dev/null 2>&1; export PATH="$HOME/.bun/bin:$PATH"; }
cd "$DEPLOY_DIR"
log "Instalando dependencias..."
bun install >/dev/null 2>&1 || bun install || err "No se pudieron instalar las dependencias"

log "Compilando el panel (tarda 1-3 min)..."
NITRO_PRESET=node-server bun run build >/dev/null 2>&1 || NITRO_PRESET=node-server bun run build || err "Falló la compilación del panel"
[[ -f "$DEPLOY_DIR/.output/server/index.mjs" ]] || err "No se generó el panel (.output/server/index.mjs)"
log "Panel compilado"

# ---------------------------------------------------------------- 5. Migraciones
POSTGRES_PASSWORD="$(grep -m1 '^POSTGRES_PASSWORD=' "$INSTALL_DIR/supabase/.env" 2>/dev/null | cut -d= -f2- || true)"
[[ -n "$POSTGRES_PASSWORD" ]] || warn "No se encontró la clave de la base de datos; no se aplicarán migraciones."

dbq() { docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" -e PGOPTIONS="-c search_path=public,extensions" \
  "$DB_C" psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }

if [[ -n "$POSTGRES_PASSWORD" ]] && docker ps --format '{{.Names}}' | grep -q "^${DB_C}$"; then
  dbq -q -c "CREATE TABLE IF NOT EXISTS public.meganet_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())" >/dev/null
  dbq -q -c "ALTER TABLE public.meganet_migrations ENABLE ROW LEVEL SECURITY" >/dev/null 2>&1 || true
  dbq -q -c "REVOKE ALL ON public.meganet_migrations FROM anon, authenticated" >/dev/null 2>&1 || true
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    dbq -q -c "INSERT INTO public.meganet_migrations (name) VALUES ('$name') ON CONFLICT DO NOTHING" >/dev/null 2>&1 || true
  done < "$APPLIED_LIST"

  NEW_COUNT=0
  while IFS= read -r mig; do
    name="$(basename "$mig")"
    if dbq -tAc "SELECT 1 FROM public.meganet_migrations WHERE name = '$name'" 2>/dev/null | grep -q 1; then
      continue
    fi
    echo "  -> aplicando $name"
    docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" -e PGOPTIONS="-c search_path=public,extensions" \
      "$DB_C" psql -h 127.0.0.1 -U supabase_admin -d postgres -q -v ON_ERROR_STOP=0 < "$mig" >/dev/null 2>/tmp/meganet-upd.err || true
    grep "ERROR" /tmp/meganet-upd.err 2>/dev/null | grep -v "already exists" | grep -v "duplicate key" | sed 's/^/     aviso: /' || true
    dbq -q -c "INSERT INTO public.meganet_migrations (name) VALUES ('$name') ON CONFLICT DO NOTHING" >/dev/null 2>&1 || true
    NEW_COUNT=$((NEW_COUNT + 1))
  done < <(
    find "$DEPLOY_DIR/supabase/migrations" -maxdepth 1 -type f -name '*.sql' | sort
    if [[ -d "$DEPLOY_DIR/drizzle/migrations" ]]; then
      find "$DEPLOY_DIR/drizzle/migrations" -maxdepth 1 -type f -name '*.sql' | sort
    fi
  )
  log "Migraciones aplicadas: $NEW_COUNT nueva(s)"

  # --- 5b. Corregir permisos: nadie más es administrador por defecto ---
  #     El primer usuario de la instalación nunca se baja de administrador.
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" -e PGOPTIONS="-c search_path=public,extensions" \
    "$DB_C" psql -h 127.0.0.1 -U supabase_admin -d postgres -q -v ON_ERROR_STOP=0 <<'SQL' 2>/tmp/meganet-perm.err
DELETE FROM public.user_roles ur
 WHERE ur.role = 'admin'
   AND ur.user_id NOT IN (SELECT id FROM auth.users ORDER BY created_at LIMIT 1)
   AND EXISTS (SELECT 1 FROM public.employees e
                WHERE e.user_id = ur.user_id AND e.operator_type <> 'admin');
INSERT INTO public.user_roles (user_id, role)
SELECT e.user_id,
  CASE e.operator_type
    WHEN 'technician' THEN 'tecnico'::app_role
    WHEN 'cashier'    THEN 'cajero'::app_role
    WHEN 'seller'     THEN 'vendedor'::app_role
    ELSE 'user'::app_role
  END
FROM public.employees e
WHERE e.user_id IS NOT NULL AND e.operator_type <> 'admin'
ON CONFLICT (user_id, role) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
ORDER BY created_at LIMIT 1
ON CONFLICT DO NOTHING;
SQL
  grep "ERROR" /tmp/meganet-perm.err 2>/dev/null | grep -v "already exists" | grep -v "duplicate key" | sed 's/^/     aviso: /' || true
  log "Permisos corregidos: solo el administrador lo sigue siendo"
else
  warn "Sin acceso a la base de datos: se omite aplicar migraciones."
fi

# ---------------------------------------------------------------- 6. Agente
if [[ -f "$DEPLOY_DIR/deploy/mikrotik-agent.mjs" ]]; then
  mkdir -p "$INSTALL_DIR/agent"
  cp "$DEPLOY_DIR/deploy/mikrotik-agent.mjs" "$INSTALL_DIR/agent/mikrotik-agent.mjs"
  log "Agente MikroTik actualizado"
fi

# ------------------------------------------------------- 7. Cortes automáticos
bash "$DEPLOY_DIR/deploy/install-cutoff-schedule.sh" "$DEPLOY_DIR/.env.production"
log "Cortes y reactivaciones programados cada 5 minutos"

# ---------------------------------------------------------------- 8. Reiniciar

# ---- Pantalla de corte: los clientes redirigidos por MikroTik ven el aviso ----
NGINX_SITE=/etc/nginx/sites-available/meganet
if [[ -f "$NGINX_SITE" ]] && ! grep -q "meganet-corte" "$NGINX_SITE"; then
  cp "$NGINX_SITE" "$NGINX_SITE.bak-corte"
  # Si el Host no es una IP ni el dominio del panel, es un cliente cortado navegando: mostrar aviso.
  sed -i '0,/client_max_body_size 50M;/s%%client_max_body_size 50M;\n    # meganet-corte\n    set $mg_aviso 1;\n    if ($host ~* "^([0-9.]+|localhost)$") { set $mg_aviso 0; }\n    if ($host = $server_name) { set $mg_aviso 0; }\n    if ($uri ~ "^/(suspendido|assets|_build|_serverFn|_server|favicon)") { set $mg_aviso 0; }\n    if ($mg_aviso) { return 302 http://$server_addr/suspendido; }%' "$NGINX_SITE"
  if nginx -t 2>/dev/null; then systemctl reload nginx; log "Pantalla de corte activada en el servidor web"
  else cp "$NGINX_SITE.bak-corte" "$NGINX_SITE"; warn "No se pudo activar la pantalla de corte en nginx (se restauró)"; fi
fi

systemctl daemon-reload
systemctl restart mikrotik-agent 2>/dev/null || warn "mikrotik-agent no está activo"
systemctl restart meganet-web 2>/dev/null || err "meganet-web no se pudo reiniciar"

WEB_OK=0
for _ in {1..45}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3000/ >/dev/null 2>&1; then WEB_OK=1; break; fi
  sleep 2
done
[[ "$WEB_OK" == "1" ]] || { journalctl -u meganet-web -n 30 --no-pager >&2 || true; err "El panel no responde después de reiniciar"; }
log "Panel en línea"

# ---------------------------------------------------------------- 9. Resumen
IP="${SERVER_IP:-$(hostname -I | awk '{print $1}')}"
echo ""
echo "============================================================"
echo " ACTUALIZACIÓN COMPLETADA"
echo "============================================================"
echo "Panel:      http://$IP"
echo "Respaldo:   ${BACKUP:-no se creó}"
echo "Si algo sale mal, restaura con:"
echo "  zcat ${BACKUP:-archivo.sql.gz} | docker exec -i $DB_C psql -U postgres"
echo "============================================================"
