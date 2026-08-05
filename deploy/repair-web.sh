#!/usr/bin/env bash
# Script de reparación para Meganet Web
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
log() { echo -e "${G}[✓]${N} $*"; }
warn() { echo -e "${Y}[!]${N} $*"; }
err() { echo -e "${R}[✗]${N} $*"; exit 1; }

INSTALL_DIR="/opt/meganet"
cd "$INSTALL_DIR/frontend-src" || err "No se encontró el directorio /opt/meganet/frontend-src"

log "Reinstalando dependencias..."
bun install || err "Error en bun install"

log "Compilando frontend..."
NITRO_PRESET=node-server bun run build || err "Error en la compilación"

log "Configurando servicio systemd..."
cat > /etc/systemd/system/meganet-web.service <<UNIT
[Unit]
Description=Meganet Web Panel
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR/frontend-src
EnvironmentFile=$INSTALL_DIR/frontend-src/.env.production
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=NITRO_HOST=127.0.0.1
Environment=NITRO_PORT=3000
ExecStart=/usr/bin/node $INSTALL_DIR/frontend-src/.output/server/index.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable meganet-web
systemctl restart meganet-web

log "Verificando servicio..."
systemctl status meganet-web --no-pager

log "--- DIAGNÓSTICO DOCKER ---"
docker ps --format "table {{.Names}}\t{{.Status}}"
warn "Si ves contenedores en 'Restarting', ejecuta: docker logs meganet-supabase-auth-1"
