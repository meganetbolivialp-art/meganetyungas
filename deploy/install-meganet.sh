#!/usr/bin/env bash
# ============================================================================
#  MEGANET ISP - Instalador Todo-en-Uno para Contabo VPS
#  Instala: Docker + Supabase self-hosted + Nginx + SSL + Frontend + Agent
# ----------------------------------------------------------------------------
#  USO:
#    sudo bash install-meganet.sh
#
#  REQUISITOS:
#    - Ubuntu 22.04 / 24.04 o Debian 12 limpio
#    - Acceso root (sudo)
#    - Dominio apuntando al VPS (opcional, si no, usa IP)
# ============================================================================

set -euo pipefail

# ---------- Colores ----------
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; N='\033[0m'
log()  { echo -e "${G}[✓]${N} $*"; }
warn() { echo -e "${Y}[!]${N} $*"; }
err()  { echo -e "${R}[✗]${N} $*" >&2; exit 1; }
ask()  { local var="$1"; local prompt="$2"; local def="${3:-}"
  local current="${!var:-}"
  if [[ -n "$current" ]]; then
    eval "$var=\"$current\""
    return
  fi
  if [[ "${MEGANET_UNATTENDED:-0}" == "1" || ! -t 0 ]]; then
    eval "$var=\"$def\""
    return
  fi
  if [[ -n "$def" ]]; then read -rp "$(echo -e ${B}?${N} $prompt [$def]: )" val
  else read -rp "$(echo -e ${B}?${N} $prompt: )" val; fi
  eval "$var=\"${val:-$def}\""
}

[[ $EUID -eq 0 ]] || err "Ejecuta como root: sudo bash install-meganet.sh"

clear
cat <<'BANNER'
 ███╗   ███╗███████╗ ██████╗  █████╗ ███╗   ██╗███████╗████████╗
 ████╗ ████║██╔════╝██╔════╝ ██╔══██╗████╗  ██║██╔════╝╚══██╔══╝
 ██╔████╔██║█████╗  ██║  ███╗███████║██╔██╗ ██║█████╗     ██║
 ██║╚██╔╝██║██╔══╝  ██║   ██║██╔══██║██║╚██╗██║██╔══╝     ██║
 ██║ ╚═╝ ██║███████╗╚██████╔╝██║  ██║██║ ╚████║███████╗   ██║
 ╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝   ╚═╝
        Sistema ISP — Instalador Contabo (Supabase self-hosted)
BANNER
echo

# ============================================================================
#  1. RECOGER DATOS
# ============================================================================
warn "PASO 1/8 — Configuración"
ask DOMAIN     "Dominio (ej: admin.tudominio.com) o dejar vacío para usar IP" ""
ask EMAIL      "Email para certificado SSL (Let's Encrypt)" "admin@meganet.bo"
ask ADMIN_USER "Email del admin inicial" "admin@meganet.bo"
ask ADMIN_PASS "Contraseña admin (mín 8 chars)" "MeganetAdmin2026!"
ask GIT_REPO   "URL del repo Git del frontend (déjalo vacío para skip)" ""

# En Proxmox/LAN usar la IP local de la VM (ej. 192.168.100.10), no la pública
VPS_IP="${SERVER_IP:-$(hostname -I | awk '{print $1}')}"
[[ -z "$VPS_IP" ]] && VPS_IP=$(curl -s -4 ifconfig.me)
[[ -z "$DOMAIN" ]] && DOMAIN="$VPS_IP" && USE_IP=1 || USE_IP=0

INSTALL_DIR="/opt/meganet"
mkdir -p "$INSTALL_DIR"/{supabase,frontend,nginx,agent,backups}
cd "$INSTALL_DIR"

log "IP VPS: $VPS_IP  |  Dominio: $DOMAIN"

# ============================================================================
#  2. DEPENDENCIAS DEL SISTEMA
# ============================================================================
warn "PASO 2/8 — Instalando dependencias del sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl wget git ufw jq openssl ca-certificates gnupg lsb-release nginx certbot python3-certbot-nginx postgresql-client >/dev/null

# Docker
if ! command -v docker &>/dev/null; then
  log "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh >/dev/null
  systemctl enable --now docker
fi
docker compose version &>/dev/null || apt-get install -y -qq docker-compose-plugin >/dev/null

# Node.js (para el agente MikroTik)
# Node 22+ obligatorio: el panel usa WebSocket nativo (Node 20 da "WebSocket nativo no encontrado")
if ! command -v node &>/dev/null || (( $(node -p 'process.versions.node.split(".")[0]') < 22 )); then
  log "Instalando Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi

# Firewall
log "Configurando firewall..."
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
# OpenVPN/Pritunl es cliente saliente: no necesita puertos VPN entrantes.
# NO abrir 5432, 8000, 3000, 3001, 8777 ni 3940 al público.
# Todo lo interno pasa por Nginx (80/443) o por loopback.
ufw --force enable >/dev/null

# ============================================================================
#  3. SECRETOS
# ============================================================================
warn "PASO 3/8 — Generando secretos"
gen() { openssl rand -hex "${1:-32}"; }

POSTGRES_PASSWORD=$(gen 24)
JWT_SECRET=$(gen 32)
ANON_KEY=""
SERVICE_ROLE_KEY=""
DASHBOARD_PASSWORD=$(gen 16)
AGENT_TOKEN=$(gen 24)
SITE_URL="https://$DOMAIN"; [[ $USE_IP -eq 1 ]] && SITE_URL="http://$DOMAIN"
[[ "$SITE_URL" =~ ^https?://[^/]+ ]] || err "No se pudo detectar la IP del servidor. Ejecuta con SERVER_IP=192.168.x.x"

# Generar JWTs
gen_jwt() {
  local role="$1"
  local header='{"alg":"HS256","typ":"JWT"}'
  local payload="{\"role\":\"$role\",\"iss\":\"supabase\",\"iat\":$(date +%s),\"exp\":$(($(date +%s)+157788000))}"
  local h=$(echo -n "$header"  | openssl base64 -A | tr -d '=' | tr '/+' '_-')
  local p=$(echo -n "$payload" | openssl base64 -A | tr -d '=' | tr '/+' '_-')
  local s=$(echo -n "$h.$p" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | openssl base64 -A | tr -d '=' | tr '/+' '_-')
  echo "$h.$p.$s"
}
ANON_KEY=$(gen_jwt anon)
SERVICE_ROLE_KEY=$(gen_jwt service_role)

# ============================================================================
#  4. SUPABASE SELF-HOSTED
# ============================================================================
warn "PASO 4/8 — Desplegando Supabase (Postgres + Auth + API + Storage + Studio)"

cat > supabase/.env <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD
SITE_URL=$SITE_URL
API_EXTERNAL_URL=$SITE_URL
SUPABASE_PUBLIC_URL=$SITE_URL
ADDITIONAL_REDIRECT_URLS=$SITE_URL/*,$SITE_URL/auth/callback
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
ENABLE_ANONYMOUS_USERS=false
STUDIO_DEFAULT_ORGANIZATION=Meganet
STUDIO_DEFAULT_PROJECT=ISP
EOF
chmod 600 supabase/.env

cat > supabase/docker-compose.yml <<'YAML'
name: meganet-supabase
services:
  db:
    image: supabase/postgres:15.6.1.146
    restart: unless-stopped
    volumes:
      - db-data:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: postgres
      JWT_SECRET: ${JWT_SECRET}
    ports: ["127.0.0.1:5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 20

  auth:
    image: supabase/gotrue:v2.158.1
    restart: unless-stopped
    depends_on: { db: { condition: service_healthy } }
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@db:5432/postgres
      API_EXTERNAL_URL: ${API_EXTERNAL_URL}
      GOTRUE_API_EXTERNAL_URL: ${API_EXTERNAL_URL}
      GOTRUE_SITE_URL: ${SITE_URL}
      GOTRUE_URI_ALLOW_LIST: ${ADDITIONAL_REDIRECT_URLS}
      GOTRUE_DISABLE_SIGNUP: ${DISABLE_SIGNUP}
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_JWT_EXP: 3600
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_EXTERNAL_EMAIL_ENABLED: ${ENABLE_EMAIL_SIGNUP}
      GOTRUE_MAILER_AUTOCONFIRM: ${ENABLE_EMAIL_AUTOCONFIRM}

  rest:
    image: postgrest/postgrest:v12.2.0
    restart: unless-stopped
    depends_on: { db: { condition: service_healthy } }
    environment:
      PGRST_DB_URI: postgres://authenticator:${POSTGRES_PASSWORD}@db:5432/postgres
      PGRST_DB_SCHEMAS: public,storage
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: "false"

  realtime:
    image: supabase/realtime:v2.30.34
    restart: unless-stopped
    depends_on: { db: { condition: service_healthy } }
    environment:
      DB_HOST: db
      DB_PORT: 5432
      DB_USER: supabase_admin
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_NAME: postgres
      DB_ENC_KEY: supabaserealtime
      API_JWT_SECRET: ${JWT_SECRET}
      SECRET_KEY_BASE: UpNVntn3cDxHJpq99YMc1T1AQgQpc8kfYTuRgBiYa15BLrx8etQoXz3gZv1/u2oq
      ERL_AFLAGS: -proto_dist inet_tcp
      DNS_NODES: "''"
      RLIMIT_NOFILE: "10000"
      APP_NAME: realtime
      SEED_SELF_HOST: "true"
      RUN_JANITOR: "true"

  storage:
    image: supabase/storage-api:v1.11.13
    restart: unless-stopped
    depends_on: { db: { condition: service_healthy }, rest: { condition: service_started } }
    volumes:
      - storage-data:/var/lib/storage
    environment:
      ANON_KEY: ${ANON_KEY}
      SERVICE_KEY: ${SERVICE_ROLE_KEY}
      POSTGREST_URL: http://rest:3000
      PGRST_JWT_SECRET: ${JWT_SECRET}
      DATABASE_URL: postgres://supabase_storage_admin:${POSTGRES_PASSWORD}@db:5432/postgres
      FILE_SIZE_LIMIT: "52428800"
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      TENANT_ID: stub
      REGION: stub
      GLOBAL_S3_BUCKET: stub

  studio:
    image: supabase/studio:20241014-c083b3b
    restart: unless-stopped
    depends_on: { db: { condition: service_healthy } }
    ports: ["127.0.0.1:3001:3000"]
    environment:
      STUDIO_PG_META_URL: http://meta:8080
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      DEFAULT_ORGANIZATION_NAME: ${STUDIO_DEFAULT_ORGANIZATION}
      DEFAULT_PROJECT_NAME: ${STUDIO_DEFAULT_PROJECT}
      SUPABASE_URL: http://kong:8000
      SUPABASE_PUBLIC_URL: ${SUPABASE_PUBLIC_URL}
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_KEY: ${SERVICE_ROLE_KEY}
      AUTH_JWT_SECRET: ${JWT_SECRET}
      DASHBOARD_USERNAME: ${DASHBOARD_USERNAME}
      DASHBOARD_PASSWORD: ${DASHBOARD_PASSWORD}

  meta:
    image: supabase/postgres-meta:v0.84.2
    restart: unless-stopped
    depends_on: { db: { condition: service_healthy } }
    environment:
      PG_META_PORT: 8080
      PG_META_DB_HOST: db
      PG_META_DB_PORT: 5432
      PG_META_DB_NAME: postgres
      PG_META_DB_USER: supabase_admin
      PG_META_DB_PASSWORD: ${POSTGRES_PASSWORD}

  kong:
    image: kong:2.8.1
    restart: unless-stopped
    ports: ["127.0.0.1:8000:8000/tcp", "127.0.0.1:8443:8443/tcp"]
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /var/lib/kong/kong.yml
      KONG_DNS_ORDER: LAST,A,CNAME
      KONG_PLUGINS: request-transformer,cors,key-auth,acl,basic-auth
    volumes:
      - ./kong.yml:/var/lib/kong/kong.yml:ro

volumes:
  db-data:
  storage-data:
YAML

# Kong gateway config
cat > supabase/kong.yml <<'KONG'
_format_version: '2.1'
_transform: true
consumers:
  - username: anon
    keyauth_credentials: [{key: ANON_KEY_PLACEHOLDER}]
  - username: service_role
    keyauth_credentials: [{key: SERVICE_ROLE_KEY_PLACEHOLDER}]
acls:
  - {consumer: anon, group: anon}
  - {consumer: service_role, group: admin}
services:
  - name: auth-v1
    url: http://auth:9999/
    routes: [{name: auth-v1-all, strip_path: true, paths: [/auth/v1/]}]
    plugins: [{name: cors}]
  - name: rest-v1
    url: http://rest:3000/
    routes: [{name: rest-v1-all, strip_path: true, paths: [/rest/v1/]}]
    plugins:
      - {name: cors}
      - {name: key-auth, config: {hide_credentials: true}}
      - {name: acl, config: {hide_groups_header: true, allow: [admin, anon]}}
  - name: realtime-v1
    url: http://realtime:4000/socket/
    routes: [{name: realtime-v1-all, strip_path: true, paths: [/realtime/v1/]}]
    plugins:
      - {name: cors}
      - {name: key-auth, config: {hide_credentials: false}}
      - {name: acl, config: {hide_groups_header: true, allow: [admin, anon]}}
  - name: storage-v1
    url: http://storage:5000/
    routes: [{name: storage-v1-all, strip_path: true, paths: [/storage/v1/]}]
    plugins: [{name: cors}]
  - name: meta
    url: http://meta:8080/
    routes: [{name: meta-all, strip_path: true, paths: [/pg/]}]
    plugins:
      - {name: key-auth, config: {hide_credentials: false}}
      - {name: acl, config: {hide_groups_header: true, allow: [admin]}}
KONG
# Escribir URLs directamente (sin depender de la interpolación de docker compose)
sed -i "s|\${API_EXTERNAL_URL}|$SITE_URL|g; s|\${SITE_URL}|$SITE_URL|g; s|\${SUPABASE_PUBLIC_URL}|$SITE_URL|g; s|\${ADDITIONAL_REDIRECT_URLS}|$SITE_URL/*,$SITE_URL/auth/callback|g" supabase/docker-compose.yml
grep -q "^      API_EXTERNAL_URL: http" supabase/docker-compose.yml || err "Configuración de Auth incompleta (API_EXTERNAL_URL)"
sed -i "s|ANON_KEY_PLACEHOLDER|$ANON_KEY|g; s|SERVICE_ROLE_KEY_PLACEHOLDER|$SERVICE_ROLE_KEY|g" supabase/kong.yml

# Roles/contraseñas de servicios: se aplican DESPUÉS de que la imagen termine
# su propia inicialización (montar scripts dentro de initdb la rompía).
mkdir -p supabase/init
cat > supabase/init/meganet-roles.sql <<SQL
DO \$\$ BEGIN CREATE ROLE anon NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE authenticator LOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
GRANT anon, authenticated, service_role TO authenticator;
DO \$\$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['authenticator','supabase_auth_admin','supabase_storage_admin','pgbouncer','supabase_functions_admin','postgres'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', r, '$POSTGRES_PASSWORD');
    END IF;
  END LOOP;
END \$\$;
SQL
chmod 600 supabase/init/meganet-roles.sql

DB_C=meganet-supabase-db-1
dbq() { docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" -e PGOPTIONS="-c search_path=public,extensions" "$DB_C" psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }

log "Iniciando base de datos (primera vez tarda 1-2 min)..."
cd supabase
docker compose --env-file .env up -d db
cd ..

echo -n "Esperando Postgres"
DB_READY=0
for i in {1..120}; do
  if dbq -tAc "SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin'" 2>/dev/null | grep -q 1; then
    DB_READY=1; break
  fi
  echo -n "."; sleep 3
done
echo ""
if [[ "$DB_READY" != 1 ]]; then
  docker logs --tail 60 "$DB_C" 2>&1 || true
  err "La base de datos no arrancó. Arriba está el detalle."
fi
sleep 3
log "Configurando accesos internos de la base de datos..."
dbq -q < supabase/init/meganet-roles.sql >/dev/null || err "No se pudieron configurar los roles de la base de datos"

log "Levantando el resto de servicios (Auth, API, Storage, Studio)..."
cd supabase
docker compose --env-file .env up -d
cd ..

echo -n "Esperando servicio de usuarios (Auth)"
AUTH_SCHEMA=0
for i in {1..100}; do
  if dbq -tAc "SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='email_confirmed_at'" 2>/dev/null | grep -q 1; then
    AUTH_SCHEMA=1; break
  fi
  # Si Auth quedó en reinicio por un fallo previo, reintentarlo
  if (( i % 20 == 0 )); then (cd supabase && docker compose --env-file .env up -d --force-recreate auth >/dev/null 2>&1) || true; fi
  echo -n "."; sleep 3
done
echo ""
if [[ "$AUTH_SCHEMA" != 1 ]]; then
  docker logs --tail 40 meganet-supabase-auth-1 2>&1 || true
  err "El servicio Auth no creó sus tablas. Arriba está el detalle."
fi
sleep 5

# ============================================================================
#  5. IMPORTAR ESQUEMA DE LOVABLE CLOUD
# ============================================================================
warn "PASO 5/8 — Importando esquema Meganet"

if [[ -f "$INSTALL_DIR/backups/meganet-dump.sql" ]]; then
  log "Restaurando dump previo..."
  dbq < "$INSTALL_DIR/backups/meganet-dump.sql"
elif [[ -d "/opt/meganet-deploy/supabase/migrations" ]]; then
  log "Instalación nueva: creando tablas y funciones desde las migraciones..."
  while IFS= read -r migration; do
    echo "  -> $(basename "$migration")"
    if ! dbq -q --single-transaction < "$migration" >/dev/null 2>/tmp/meganet-mig.err; then
      # Migración repetida (objetos ya creados): aplicar sentencia por sentencia
      # sin detenerse, para crear solo lo que falte.
      docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" -e PGOPTIONS="-c search_path=public,extensions" "$DB_C" \
        psql -h 127.0.0.1 -U supabase_admin -d postgres -q -v ON_ERROR_STOP=0 < "$migration" >/dev/null 2>/tmp/meganet-mig.err || true
      grep "ERROR" /tmp/meganet-mig.err | grep -v "already exists" | grep -v "duplicate key" | sed 's/^/     aviso: /' || true
    fi
  done < <(
    find /opt/meganet-deploy/supabase/migrations -maxdepth 1 -type f -name '*.sql' | sort
    if [[ -d /opt/meganet-deploy/drizzle/migrations ]]; then
      find /opt/meganet-deploy/drizzle/migrations -maxdepth 1 -type f -name '*.sql' | sort
    fi
  )
  # Las migraciones históricas incluyen admin@admin.com/admin; no dejar ese acceso conocido.
  dbq -c "DELETE FROM auth.users WHERE email = 'admin@admin.com';"
  for t in profiles user_roles clients plans payments routers; do
    dbq -tAc "SELECT to_regclass('public.$t')" | grep -q "$t" || err "Falta la tabla $t después de las migraciones"
  done
  log "Base de datos inicial creada"
else
  err "No hay dump ni migraciones en /opt/meganet-deploy/supabase/migrations"
fi

# Crear admin inicial
log "Creando usuario admin..."
AUTH_READY=0
for _ in {1..45}; do
  if curl -fsS --max-time 3 "http://localhost:8000/auth/v1/health" >/dev/null 2>&1; then
    AUTH_READY=1
    break
  fi
  sleep 2
done
[[ "$AUTH_READY" == "1" ]] || err "El servicio de autenticación no respondió a tiempo"
curl -fsS --max-time 20 -X POST "http://localhost:8000/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\",\"email_confirm\":true}" >/dev/null \
  || err "No se pudo crear el usuario administrador"
# Asignar permiso de administrador (sin esto la cuenta no puede entrar al panel).
dbq -c "insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = '$ADMIN_USER' on conflict do nothing;" >/dev/null \
  || err "No se pudo asignar el rol de administrador"

# ============================================================================
#  6. FRONTEND
# ============================================================================
warn "PASO 6/8 — Desplegando frontend"

# El paquete autocontenido ya incluye el código en /opt/meganet-deploy.
if [[ -z "$GIT_REPO" && -f "/opt/meganet-deploy/package.json" && ! -e "$INSTALL_DIR/frontend-src" ]]; then
  ln -s /opt/meganet-deploy "$INSTALL_DIR/frontend-src"
fi

if [[ -n "$GIT_REPO" || -f "$INSTALL_DIR/frontend-src/package.json" ]]; then
  if [[ -n "$GIT_REPO" ]]; then
    log "Clonando repositorio: $GIT_REPO"
    git clone "$GIT_REPO" frontend-src 2>/dev/null || (cd frontend-src && git pull)
  else
    log "Usando el código incluido en $INSTALL_DIR/frontend-src"
  fi
  cd frontend-src

  mkdir -p /opt/meganet-deploy /opt/meganet
  if [[ "$(readlink -f "$PWD")" != "/opt/meganet-deploy" ]]; then
    cp -r deploy /opt/meganet-deploy/ 2>/dev/null || true
  fi
  ln -sf /opt/meganet-deploy/deploy/openvpn-add-router.sh /opt/meganet/openvpn-add-router.sh 2>/dev/null || true
  ln -sf /opt/meganet-deploy/deploy/l2tp-add-router.sh /opt/meganet/l2tp-add-router.sh 2>/dev/null || true

  log "Generando archivo .env.production..."
  cat > .env.production <<EOF
VITE_SUPABASE_URL=$SITE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=meganet
SUPABASE_URL=http://localhost:8000
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
MIKROTIK_AGENT_HOST=127.0.0.1
MIKROTIK_AGENT_PORT=8777
MIKROTIK_AGENT_TOKEN=$AGENT_TOKEN
MIKROTIK_AGENT_TLS=1
EOF
  chmod 600 .env.production

  log "Instalando dependencias con Bun..."
  command -v bun &>/dev/null || npm i -g bun >/dev/null 2>&1
  bun install || err "Error al instalar dependencias de Node"

  log "Compilando frontend (NITRO_PRESET=node-server)..."
  NITRO_PRESET=node-server bun run build || err "Error en la compilación del frontend"

  log "Creando servicio meganet-web.service..."
  cat > /etc/systemd/system/meganet-web.service <<UNIT
[Unit]
Description=Meganet Web Panel
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$(pwd)
EnvironmentFile=$(pwd)/.env.production
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=NITRO_HOST=127.0.0.1
Environment=NITRO_PORT=3000
ExecStart=/usr/bin/node $(pwd)/.output/server/index.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable meganet-web
  systemctl restart meganet-web
  cd ..
else
  err "No se encontró el código fuente en $INSTALL_DIR/frontend-src"
fi

# ============================================================================
#  7. NGINX + SSL
# ============================================================================
warn "PASO 7/8 — Configurando Nginx"

cat > /etc/nginx/sites-available/meganet <<NGINX
# Supabase API (Kong gateway) + Frontend
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 50M;

    # Supabase Auth/REST/Storage/Realtime
    location ~ ^/(auth|rest|realtime|storage|pg)/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600;
    }

    # Studio (dashboard admin de la DB)
    location /studio/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host \$host;
        auth_basic "Meganet DB Admin";
        auth_basic_user_file /etc/nginx/.studio_htpasswd;
    }

    # Portal de suspendidos
    location /suspendido {
        proxy_pass http://127.0.0.1:3000/suspendido;
        proxy_set_header Host \$host;
    }

    # Frontend (todo lo demás)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

# Auth para Studio
htpasswd_pw=$(openssl passwd -apr1 "$DASHBOARD_PASSWORD")
echo "admin:$htpasswd_pw" > /etc/nginx/.studio_htpasswd

ln -sf /etc/nginx/sites-available/meganet /etc/nginx/sites-enabled/meganet
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# SSL si hay dominio real
if [[ $USE_IP -eq 0 ]]; then
  log "Obteniendo SSL Let's Encrypt para $DOMAIN..."
  certbot --nginx --non-interactive --agree-tos --email "$EMAIL" -d "$DOMAIN" --redirect || warn "SSL falló, revisa DNS"
fi

# ============================================================================
#  8. AGENTE MIKROTIK + CRON DE BACKUPS
# ============================================================================
warn "PASO 8/8 — Agente MikroTik + tareas programadas"

if [[ -f "$INSTALL_DIR/frontend-src/deploy/mikrotik-agent.mjs" ]]; then
  cp "$INSTALL_DIR/frontend-src/deploy/mikrotik-agent.mjs" agent/mikrotik-agent.mjs
elif [[ -f "/opt/meganet-deploy/deploy/mikrotik-agent.mjs" ]]; then
  cp /opt/meganet-deploy/deploy/mikrotik-agent.mjs agent/mikrotik-agent.mjs
else
  err "No se encontró deploy/mikrotik-agent.mjs"
fi
cat > agent/package.json <<'PKG'
{"name":"mikrotik-agent","type":"module","private":true}
PKG

# Certificado TLS del agente (auto-firmado + fingerprint para fijar en el panel)
mkdir -p /etc/meganet-agent
if [[ ! -f /etc/meganet-agent/agent.crt ]]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout /etc/meganet-agent/agent.key -out /etc/meganet-agent/agent.crt \
    -subj "/CN=$VPS_IP" -addext "subjectAltName=IP:$VPS_IP" >/dev/null 2>&1
  chmod 600 /etc/meganet-agent/agent.key
fi
AGENT_TLS_FP=$(openssl x509 -in /etc/meganet-agent/agent.crt -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':' | tr 'A-Z' 'a-z')
# El agente usa TLS: el panel debe hablarle cifrado y con la huella fijada
for ENVF in /opt/meganet/frontend*/.env.production /opt/meganet/frontend/*/.env.production; do
  [[ -f "$ENVF" ]] || continue
  sed -i '/^MIKROTIK_AGENT_TLS/d' "$ENVF"
  printf 'MIKROTIK_AGENT_TLS=1\nMIKROTIK_AGENT_TLS_FINGERPRINT=%s\n' "$AGENT_TLS_FP" >> "$ENVF"
done
systemctl restart meganet-web 2>/dev/null || true

cat > /etc/systemd/system/mikrotik-agent.service <<UNIT
[Unit]
Description=Meganet MikroTik Agent
After=network.target
[Service]
Environment=MIKROTIK_AGENT_TOKEN=$AGENT_TOKEN
Environment=MIKROTIK_AGENT_PORT=8777
Environment=MIKROTIK_AGENT_BIND_HOST=127.0.0.1
Environment=MIKROTIK_AGENT_TLS_CERT=/etc/meganet-agent/agent.crt
Environment=MIKROTIK_AGENT_TLS_KEY=/etc/meganet-agent/agent.key
Environment=PROVISION_PORT=3940
Environment=PROVISION_BIND_HOST=127.0.0.1
Environment=OPENVPN_ADD_ROUTER_SCRIPT=/opt/meganet/openvpn-add-router.sh
Environment=L2TP_ADD_ROUTER_SCRIPT=/opt/meganet/l2tp-add-router.sh
Environment=OPENVPN_CLIENT_DIR=/etc/openvpn/clients
Environment=L2TP_NETWORK=10.8.0.0/24
Environment=L2TP_SERVER_IP=10.8.0.1
EnvironmentFile=-/opt/meganet/.env.l2tp
WorkingDirectory=$INSTALL_DIR/agent
ExecStart=/usr/bin/node mikrotik-agent.mjs
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now mikrotik-agent


# Backup diario
cat > /etc/cron.daily/meganet-backup <<'CRON'
#!/bin/bash
DATE=$(date +%F)
mkdir -p /opt/meganet/backups
docker exec meganet-supabase-db-1 pg_dumpall -U postgres | gzip > /opt/meganet/backups/db-$DATE.sql.gz
find /opt/meganet/backups -name "db-*.sql.gz" -mtime +14 -delete
CRON
chmod +x /etc/cron.daily/meganet-backup

# Cortes por deuda y reactivaciones pendientes cada cinco minutos
bash "$INSTALL_DIR/frontend-src/deploy/install-cutoff-schedule.sh" "$INSTALL_DIR/frontend-src/.env.production"
systemctl restart meganet-web

# ============================================================================
#  RESUMEN
# ============================================================================
CREDS_FILE="$INSTALL_DIR/CREDENCIALES.txt"
cat > "$CREDS_FILE" <<END
==============================================================
   MEGANET ISP — Credenciales de instalación
   Guarda este archivo en lugar seguro y bórralo del servidor
==============================================================

URL principal:       $SITE_URL
Studio (DB admin):   $SITE_URL/studio/
Studio user/pass:    admin / $DASHBOARD_PASSWORD

Admin sistema:       $ADMIN_USER
Contraseña admin:    $ADMIN_PASS

------ Claves Supabase (para el frontend) ------
SUPABASE_URL:              $SITE_URL
SUPABASE_ANON_KEY:         $ANON_KEY
SUPABASE_SERVICE_ROLE_KEY: $SERVICE_ROLE_KEY
JWT_SECRET:                $JWT_SECRET
POSTGRES_PASSWORD:         $POSTGRES_PASSWORD

------ Agente MikroTik ------
MIKROTIK_AGENT_HOST:  $VPS_IP
MIKROTIK_AGENT_PORT:  8777
MIKROTIK_AGENT_TOKEN: $AGENT_TOKEN
MIKROTIK_AGENT_TLS:   1
MIKROTIK_AGENT_TLS_FINGERPRINT: $AGENT_TLS_FP
PROVISION_PORT:       3940

------ VPN OpenVPN ------
  Cliente Proxmox con Pritunl existente:
  sudo bash /opt/meganet-deploy/deploy/install-proxmox-openvpn-client.sh /root/perfil-pritunl.ovpn
  Servidor OpenVPN propio (opcional):
  sudo bash /opt/meganet-deploy/deploy/install-openvpn-contabo.sh
  sudo bash /opt/meganet-deploy/deploy/openvpn-add-router.sh <nombre> <ip-fija>
  Puerto agente /provision: 3940

------ Comandos útiles ------
  Ver logs Supabase:   cd $INSTALL_DIR/supabase && docker compose logs -f
  Reiniciar todo:      cd $INSTALL_DIR/supabase && docker compose restart
  Backup manual:       /etc/cron.daily/meganet-backup
  Restaurar dump:      docker exec -i meganet-supabase-db-1 psql -U postgres < archivo.sql
  Estado agente:       systemctl status mikrotik-agent
  Logs agente:         journalctl -u mikrotik-agent -f
END
chmod 600 "$CREDS_FILE"

clear
echo -e "${G}"
cat <<'DONE'
 ╔══════════════════════════════════════════════════════════════╗
 ║              ✓  INSTALACIÓN COMPLETADA  ✓                    ║
 ╚══════════════════════════════════════════════════════════════╝
DONE
echo -e "${N}"
echo -e "  Panel:     ${B}$SITE_URL${N}"
echo -e "  Studio DB: ${B}$SITE_URL/studio/${N}"
echo -e "  Login:     ${B}$ADMIN_USER${N} / ${B}$ADMIN_PASS${N}"
echo ""
echo -e "  ${Y}Credenciales completas:${N} $CREDS_FILE"
echo ""
[[ ! -f "$INSTALL_DIR/backups/meganet-dump.sql" ]] && {
  echo -e "  ${Y}⚠ FALTA IMPORTAR DATOS:${N}"
  echo -e "     1. Exporta desde Lovable Cloud → Advanced → Export data"
  echo -e "     2. Sube el archivo a: $INSTALL_DIR/backups/meganet-dump.sql"
  echo -e "     3. Ejecuta: docker exec -i meganet-supabase-db-1 psql -U postgres < $INSTALL_DIR/backups/meganet-dump.sql"
  echo ""
}
echo -e "  ${G}Sistema listo. ¡Éxito!${N}"
echo ""
