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

VPS_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
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
if ! command -v node &>/dev/null; then
  log "Instalando Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
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
ufw allow 8000/tcp >/dev/null   # Supabase Kong
ufw allow 3000/tcp >/dev/null   # Frontend
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
SITE_URL="https://$DOMAIN"; [[ $USE_IP -eq 1 ]] && SITE_URL="http://$DOMAIN"

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
      - ./init:/docker-entrypoint-initdb.d
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: postgres
      JWT_SECRET: ${JWT_SECRET}
    ports: ["5432:5432"]
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
    ports: ["3001:3000"]
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
    ports: ["8000:8000/tcp", "8443:8443/tcp"]
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
sed -i "s|ANON_KEY_PLACEHOLDER|$ANON_KEY|g; s|SERVICE_ROLE_KEY_PLACEHOLDER|$SERVICE_ROLE_KEY|g" supabase/kong.yml

# Roles iniciales Postgres
mkdir -p supabase/init
cat > supabase/init/00-roles.sql <<SQL
DO \$\$ BEGIN
  CREATE ROLE anon NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN
  CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '$POSTGRES_PASSWORD';
EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
GRANT anon, authenticated, service_role TO authenticator;
SQL

log "Levantando Supabase (esto tarda 2-3 min)..."
cd supabase
docker compose --env-file .env up -d
cd ..

echo -n "Esperando Postgres"
for i in {1..60}; do
  docker exec meganet-supabase-db-1 pg_isready -U postgres &>/dev/null && break
  echo -n "."; sleep 2
done
echo ""

# ============================================================================
#  5. IMPORTAR ESQUEMA DE LOVABLE CLOUD
# ============================================================================
warn "PASO 5/8 — Importando esquema Meganet"

if [[ -f "$INSTALL_DIR/backups/meganet-dump.sql" ]]; then
  log "Restaurando dump previo..."
  docker exec -i meganet-supabase-db-1 psql -U postgres < "$INSTALL_DIR/backups/meganet-dump.sql"
else
  warn "No hay dump previo. Sube tu dump a $INSTALL_DIR/backups/meganet-dump.sql y ejecuta:"
  warn "  docker exec -i meganet-supabase-db-1 psql -U postgres < $INSTALL_DIR/backups/meganet-dump.sql"
  warn "Puedes obtenerlo desde Lovable: Cloud → Advanced settings → Export data"
fi

# Crear admin inicial
log "Creando usuario admin..."
sleep 5
curl -s -X POST "http://localhost:8000/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\",\"email_confirm\":true}" >/dev/null || true

# ============================================================================
#  6. FRONTEND
# ============================================================================
warn "PASO 6/8 — Desplegando frontend"

if [[ -n "$GIT_REPO" ]]; then
  git clone "$GIT_REPO" frontend-src 2>/dev/null || (cd frontend-src && git pull)
  cd frontend-src

  cat > .env.production <<EOF
VITE_SUPABASE_URL=$SITE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=meganet
SUPABASE_URL=http://localhost:8000
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
EOF

  command -v bun &>/dev/null || npm i -g bun >/dev/null 2>&1
  bun install
  # CRITICAL: build for Node self-host, not Cloudflare Workers (default preset)
  NITRO_PRESET=node-server bun run build

  # systemd service (bind loopback only; Nginx expone al público)
  cat > /etc/systemd/system/meganet-web.service <<UNIT
[Unit]
Description=Meganet Web Panel
After=network.target

[Service]
Type=simple
WorkingDirectory=$(pwd)
EnvironmentFile=-$(pwd)/.env.production
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=NITRO_HOST=127.0.0.1
Environment=NITRO_PORT=3000
ExecStart=/usr/bin/node $(pwd)/.output/server/index.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now meganet-web
  systemctl restart meganet-web
  cd ..
else
  warn "Repo no proporcionado. Sube el build a $INSTALL_DIR/frontend/dist"
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

cat > agent/mikrotik-agent.mjs <<'AGENT'
import http from 'node:http';
import { RouterOSAPI } from 'node-routeros';
const TOKEN = process.env.MIKROTIK_AGENT_TOKEN;
const PORT = process.env.PORT || 8777;
http.createServer(async (req, res) => {
  if (req.headers['x-token'] !== TOKEN) { res.writeHead(401); return res.end('unauthorized'); }
  let body=''; req.on('data',c=>body+=c); req.on('end',async()=>{
    try{
      const {host,user,pass,port,cmd,params} = JSON.parse(body||'{}');
      const api = new RouterOSAPI({host,user,password:pass,port:port||8728,timeout:15});
      await api.connect();
      const out = await api.write(cmd, params||[]);
      await api.close();
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true,data:out}));
    }catch(e){ res.writeHead(500); res.end(JSON.stringify({ok:false,error:String(e)})); }
  });
}).listen(PORT, ()=>console.log('mikrotik-agent on',PORT));
AGENT

cat > agent/package.json <<'PKG'
{"name":"mikrotik-agent","type":"module","dependencies":{"node-routeros":"^1.6.8"}}
PKG

AGENT_TOKEN=$(gen 24)
cd agent && npm install --silent && cd ..

cat > /etc/systemd/system/mikrotik-agent.service <<UNIT
[Unit]
Description=Meganet MikroTik Agent
After=network.target
[Service]
Environment=MIKROTIK_AGENT_TOKEN=$AGENT_TOKEN
Environment=PORT=8777
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

------ Comandos útiles ------
  Ver logs Supabase:   cd $INSTALL_DIR/supabase && docker compose logs -f
  Reiniciar todo:      cd $INSTALL_DIR/supabase && docker compose restart
  Backup manual:       /etc/cron.daily/meganet-backup
  Restaurar dump:      docker exec -i meganet-supabase-db-1 psql -U postgres < archivo.sql
  Estado agente:       systemctl status mikrotik-agent
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
