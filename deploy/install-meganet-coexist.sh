#!/usr/bin/env bash
# ============================================================================
#  MEGANET ISP - Instalador para VPS con SoftEther VPN ya instalado
#  Coexiste con: SSTP en 443, Nginx portal /suspendido, túnel 192.168.30.x
# ----------------------------------------------------------------------------
#  USO:
#    sudo bash install-meganet-coexist.sh
# ============================================================================

set -euo pipefail
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; N='\033[0m'
log()  { echo -e "${G}[✓]${N} $*"; }
warn() { echo -e "${Y}[!]${N} $*"; }
err()  { echo -e "${R}[✗]${N} $*" >&2; exit 1; }
ask()  { local var="$1" prompt="$2" def="${3:-}"
  if [[ -n "$def" ]]; then read -rp "$(echo -e ${B}?${N} $prompt [$def]: )" val
  else read -rp "$(echo -e ${B}?${N} $prompt: )" val; fi
  eval "$var=\"${val:-$def}\""
}
[[ $EUID -eq 0 ]] || err "Ejecuta como root"

clear
cat <<'BANNER'
 MEGANET ISP — Instalador para VPS con VPN existente
 Coexiste con SoftEther SSTP + portal de suspendidos
BANNER
echo

# ============================================================================
#  PRE-CHEQUEOS: NO ROMPER LO EXISTENTE
# ============================================================================
warn "Verificando servicios existentes..."

VPN_OK=0; NGINX_OK=0
systemctl is-active --quiet softether-vpnserver 2>/dev/null || \
systemctl is-active --quiet vpnserver 2>/dev/null && VPN_OK=1
[[ -f /etc/nginx/sites-enabled/suspendido ]] || [[ -f /etc/nginx/sites-enabled/default ]] && NGINX_OK=1

if ss -tlnp 2>/dev/null | grep -q ':443 '; then
  log "Puerto 443 en uso (SoftEther SSTP) — se respetará"
  SSTP_RUNNING=1
else
  SSTP_RUNNING=0
  warn "Puerto 443 libre — SoftEther puede no estar activo"
fi

if ss -tlnp 2>/dev/null | grep -q ':80 '; then
  log "Puerto 80 en uso (Nginx portal) — se respetará"
  NGINX_RUNNING=1
else
  NGINX_RUNNING=0
fi

# ============================================================================
#  1. DATOS
# ============================================================================
warn "PASO 1/7 — Configuración"
VPS_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
log "IP del VPS: $VPS_IP"

echo ""
echo "El sistema Meganet usará estos puertos NUEVOS (no chocan con VPN):"
echo "  • 8080  → Supabase API (Kong)"
echo "  • 3000  → Frontend Meganet"
echo "  • 3001  → Studio (admin DB)"
echo "  • 8777  → Agente MikroTik"
echo "  • 5432  → PostgreSQL (solo local)"
echo ""
echo "Nginx existente añadirá server_name adicional para el panel."
echo ""

ask DOMAIN     "Dominio para el PANEL (ej: panel.tudominio.com) o vacío para IP:puerto" ""
ask EMAIL      "Email SSL Let's Encrypt (si hay dominio)" "admin@meganet.bo"
ask ADMIN_USER "Email admin inicial" "admin@meganet.bo"
ask ADMIN_PASS "Contraseña admin" "MeganetAdmin2026!"
ask GIT_REPO   "URL Git del frontend (opcional)" ""

if [[ -z "$DOMAIN" ]]; then
  DOMAIN="$VPS_IP"
  SITE_URL="http://$VPS_IP:3000"
  API_URL="http://$VPS_IP:8080"
  USE_IP=1
else
  SITE_URL="https://$DOMAIN"
  API_URL="https://$DOMAIN"
  USE_IP=0
fi

INSTALL_DIR="/opt/meganet"
mkdir -p "$INSTALL_DIR"/{supabase,frontend,agent,backups}
cd "$INSTALL_DIR"

# ============================================================================
#  2. DEPENDENCIAS (sin tocar SoftEther/Nginx)
# ============================================================================
warn "PASO 2/7 — Dependencias (sin tocar VPN)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl wget git jq openssl ca-certificates gnupg apache2-utils postgresql-client >/dev/null

# Docker (si no está)
if ! command -v docker &>/dev/null; then
  log "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh >/dev/null
  systemctl enable --now docker
fi

# Node.js 20
if ! node -v 2>/dev/null | grep -q v20; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi

# NO tocamos ufw si SoftEther ya está corriendo — solo abrimos puertos nuevos
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  log "UFW activo — abriendo solo puertos nuevos"
  ufw allow 3000/tcp comment 'meganet-frontend' >/dev/null
  ufw allow 8080/tcp comment 'meganet-supabase' >/dev/null
  # 8777 solo local desde el VPN → NO exponer público
  ufw allow from 192.168.30.0/24 to any port 8777 comment 'mikrotik-agent-vpn' >/dev/null
fi

# ============================================================================
#  3. SECRETOS
# ============================================================================
warn "PASO 3/7 — Generando secretos"
gen() { openssl rand -hex "${1:-32}"; }
POSTGRES_PASSWORD=$(gen 24)
JWT_SECRET=$(gen 32)
DASHBOARD_PASSWORD=$(gen 12)
AGENT_TOKEN=$(gen 24)

gen_jwt() {
  local role="$1"
  local h=$(echo -n '{"alg":"HS256","typ":"JWT"}' | openssl base64 -A | tr -d '=' | tr '/+' '_-')
  local p=$(echo -n "{\"role\":\"$role\",\"iss\":\"supabase\",\"iat\":$(date +%s),\"exp\":$(($(date +%s)+157788000))}" | openssl base64 -A | tr -d '=' | tr '/+' '_-')
  local s=$(echo -n "$h.$p" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | openssl base64 -A | tr -d '=' | tr '/+' '_-')
  echo "$h.$p.$s"
}
ANON_KEY=$(gen_jwt anon)
SERVICE_ROLE_KEY=$(gen_jwt service_role)

# ============================================================================
#  4. SUPABASE (Kong en 8080, no en 443)
# ============================================================================
warn "PASO 4/7 — Desplegando Supabase self-hosted"

cat > supabase/.env <<EOF
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=$DASHBOARD_PASSWORD
SITE_URL=$SITE_URL
API_EXTERNAL_URL=$API_URL
SUPABASE_PUBLIC_URL=$API_URL
ADDITIONAL_REDIRECT_URLS=$SITE_URL/*,$SITE_URL/auth/callback
DISABLE_SIGNUP=false
ENABLE_EMAIL_AUTOCONFIRM=true
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
    ports: ["127.0.0.1:5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
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
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"
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

  realtime:
    image: supabase/realtime:v2.30.34
    restart: unless-stopped
    depends_on: { db: { condition: service_healthy } }
    environment:
      DB_HOST: db
      DB_USER: supabase_admin
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_NAME: postgres
      DB_ENC_KEY: supabaserealtime
      API_JWT_SECRET: ${JWT_SECRET}
      SECRET_KEY_BASE: UpNVntn3cDxHJpq99YMc1T1AQgQpc8kfYTuRgBiYa15BLrx8etQoXz3gZv1/u2oq
      ERL_AFLAGS: -proto_dist inet_tcp
      RLIMIT_NOFILE: "10000"

  storage:
    image: supabase/storage-api:v1.11.13
    restart: unless-stopped
    depends_on: { db: { condition: service_healthy } }
    volumes: [ "storage-data:/var/lib/storage" ]
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
      SUPABASE_URL: http://kong:8000
      SUPABASE_PUBLIC_URL: ${SUPABASE_PUBLIC_URL}
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_KEY: ${SERVICE_ROLE_KEY}
      AUTH_JWT_SECRET: ${JWT_SECRET}

  meta:
    image: supabase/postgres-meta:v0.84.2
    restart: unless-stopped
    depends_on: { db: { condition: service_healthy } }
    environment:
      PG_META_PORT: 8080
      PG_META_DB_HOST: db
      PG_META_DB_USER: supabase_admin
      PG_META_DB_PASSWORD: ${POSTGRES_PASSWORD}

  kong:
    image: kong:2.8.1
    restart: unless-stopped
    ports: ["8080:8000/tcp"]     # <-- Puerto 8080 en vez de 8000 para no chocar
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /var/lib/kong/kong.yml
      KONG_DNS_ORDER: LAST,A,CNAME
      KONG_PLUGINS: request-transformer,cors,key-auth,acl,basic-auth
    volumes: [ "./kong.yml:/var/lib/kong/kong.yml:ro" ]

volumes:
  db-data:
  storage-data:
YAML

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
KONG
sed -i "s|ANON_KEY_PLACEHOLDER|$ANON_KEY|g; s|SERVICE_ROLE_KEY_PLACEHOLDER|$SERVICE_ROLE_KEY|g" supabase/kong.yml

mkdir -p supabase/init
cat > supabase/init/00-roles.sql <<SQL
DO \$\$ BEGIN CREATE ROLE anon NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
DO \$\$ BEGIN CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '$POSTGRES_PASSWORD'; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;
GRANT anon, authenticated, service_role TO authenticator;
SQL

log "Levantando Supabase..."
cd supabase && docker compose --env-file .env up -d && cd ..
echo -n "Esperando Postgres"
for i in {1..60}; do
  docker exec meganet-supabase-db-1 pg_isready -U postgres &>/dev/null && break
  echo -n "."; sleep 2
done
echo ""

# ============================================================================
#  5. IMPORTAR DATOS + CREAR ADMIN
# ============================================================================
warn "PASO 5/7 — Datos iniciales"
if [[ -f "$INSTALL_DIR/backups/meganet-dump.sql" ]]; then
  log "Restaurando dump..."
  docker exec -i meganet-supabase-db-1 psql -U postgres < "$INSTALL_DIR/backups/meganet-dump.sql"
fi

sleep 5
log "Creando admin $ADMIN_USER..."
curl -s -X POST "http://localhost:8080/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\",\"email_confirm\":true}" >/dev/null || true

# ============================================================================
#  6. FRONTEND
# ============================================================================
warn "PASO 6/7 — Frontend"
if [[ -n "$GIT_REPO" ]]; then
  [[ -d frontend-src ]] && (cd frontend-src && git pull) || git clone "$GIT_REPO" frontend-src
  cd frontend-src
  cat > .env.production <<EOF
VITE_SUPABASE_URL=$API_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_PROJECT_ID=meganet
SUPABASE_URL=http://localhost:8080
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
MIKROTIK_AGENT_HOST=127.0.0.1
MIKROTIK_AGENT_PORT=8777
MIKROTIK_AGENT_TOKEN=$AGENT_TOKEN
EOF
  command -v bun &>/dev/null || npm i -g bun >/dev/null 2>&1
  bun install && bun run build
  npm i -g pm2 >/dev/null 2>&1 || true
  pm2 delete meganet-web 2>/dev/null || true
  PORT=3000 pm2 start "bun run start" --name meganet-web --cwd "$(pwd)"
  pm2 save
  pm2 startup systemd -u root --hp /root | tail -1 | bash || true
  cd ..
else
  warn "Sin repo Git — sube tu build a $INSTALL_DIR/frontend/"
fi

# ============================================================================
#  7. NGINX ADICIONAL (sin tocar el de suspendidos) + AGENTE + BACKUPS
# ============================================================================
warn "PASO 7/7 — Nginx (server adicional) + agente MikroTik"

# Añadir server block SIN tocar el de /suspendido existente
cat > /etc/nginx/sites-available/meganet-panel <<NGINX
# Panel Meganet — server ADICIONAL, no rompe el portal de suspendidos
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 50M;

    location ~ ^/(auth|rest|realtime|storage)/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600;
    }

    location /studio/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host \$host;
        auth_basic "Meganet DB Admin";
        auth_basic_user_file /etc/nginx/.studio_htpasswd;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

htpasswd -bc /etc/nginx/.studio_htpasswd admin "$DASHBOARD_PASSWORD" 2>/dev/null

ln -sf /etc/nginx/sites-available/meganet-panel /etc/nginx/sites-enabled/meganet-panel
nginx -t && systemctl reload nginx && log "Nginx recargado (portal suspendidos intacto)"

# SSL si hay dominio
if [[ $USE_IP -eq 0 ]]; then
  command -v certbot &>/dev/null || apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  log "SSL para $DOMAIN..."
  certbot --nginx --non-interactive --agree-tos --email "$EMAIL" -d "$DOMAIN" --redirect || \
    warn "SSL falló — verifica que el DNS apunte al VPS"
fi

# Agente MikroTik
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
}).listen(PORT, '0.0.0.0', ()=>console.log('mikrotik-agent on',PORT));
AGENT
cat > agent/package.json <<'PKG'
{"name":"mikrotik-agent","type":"module","dependencies":{"node-routeros":"^1.6.8"}}
PKG
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

# Backups diarios
cat > /etc/cron.daily/meganet-backup <<'CRON'
#!/bin/bash
DATE=$(date +%F)
docker exec meganet-supabase-db-1 pg_dumpall -U postgres | gzip > /opt/meganet/backups/db-$DATE.sql.gz
find /opt/meganet/backups -name "db-*.sql.gz" -mtime +14 -delete
CRON
chmod +x /etc/cron.daily/meganet-backup

# ============================================================================
#  RESUMEN
# ============================================================================
CREDS="$INSTALL_DIR/CREDENCIALES.txt"
cat > "$CREDS" <<END
==============================================================
   MEGANET ISP — Credenciales (guarda seguro, luego borra)
==============================================================
Panel:              $SITE_URL
Studio DB:          $SITE_URL/studio/  (user: admin / $DASHBOARD_PASSWORD)
Admin sistema:      $ADMIN_USER / $ADMIN_PASS

--- Claves Supabase ---
SUPABASE_URL:              $API_URL
SUPABASE_ANON_KEY:         $ANON_KEY
SUPABASE_SERVICE_ROLE_KEY: $SERVICE_ROLE_KEY
JWT_SECRET:                $JWT_SECRET
POSTGRES_PASSWORD:         $POSTGRES_PASSWORD

--- Agente MikroTik (local, ya está en el frontend .env) ---
MIKROTIK_AGENT_HOST:  127.0.0.1
MIKROTIK_AGENT_PORT:  8777
MIKROTIK_AGENT_TOKEN: $AGENT_TOKEN

--- VPN/Portal existentes (NO se tocaron) ---
SoftEther SSTP:      puerto 443 (intacto)
Portal suspendidos:  puerto 80 sites-enabled anteriores (intactos)
Túnel MikroTik:      192.168.30.x (intacto)

--- Comandos ---
Logs:      cd $INSTALL_DIR/supabase && docker compose logs -f
Reinicio:  cd $INSTALL_DIR/supabase && docker compose restart
Backup:    /etc/cron.daily/meganet-backup
Agente:    systemctl status mikrotik-agent
END
chmod 600 "$CREDS"

clear
echo -e "${G}"
cat <<'DONE'
 ╔══════════════════════════════════════════════════════════════╗
 ║           ✓  MEGANET INSTALADO SIN ROMPER LA VPN  ✓          ║
 ╚══════════════════════════════════════════════════════════════╝
DONE
echo -e "${N}"
echo -e "  Panel:      ${B}$SITE_URL${N}"
echo -e "  Studio DB:  ${B}$SITE_URL/studio/${N}"
echo -e "  Login:      ${B}$ADMIN_USER${N} / ${B}$ADMIN_PASS${N}"
echo ""
echo -e "  ${G}VPN SSTP intacta en :443${N}"
echo -e "  ${G}Portal /suspendido intacto${N}"
echo ""
echo -e "  Credenciales: ${Y}$CREDS${N}"
echo ""
[[ ! -f "$INSTALL_DIR/backups/meganet-dump.sql" ]] && echo -e "  ${Y}→ Sube el dump de Lovable a $INSTALL_DIR/backups/meganet-dump.sql${N}\n"
