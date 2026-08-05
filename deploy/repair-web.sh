#!/usr/bin/env bash
# Updated Meganet Web Repair Script (Robust Bun detection)
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
log() { echo -e "${G}[✓]${N} $*"; }
warn() { echo -e "${Y}[!]${N} $*"; }
err() { echo -e "${R}[✗]${N} $*"; exit 1; }

# 1. Ensure Bun is installed
if ! command -v bun &>/dev/null; then
    log "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    # If standard install fails or is not in path for sudo, try npm
    if ! command -v bun &>/dev/null; then
        warn "Standard Bun install failed, trying via npm..."
        npm install -g bun >/dev/null 2>&1 || err "Could not install Bun. Please install it manually."
    fi
fi

# 2. Find frontend directory
if [[ -d "/opt/meganet-deploy" ]]; then
    BASE_DIR="/opt/meganet-deploy"
elif [[ -d "/opt/meganet" ]]; then
    BASE_DIR="/opt/meganet"
else
    err "Source code not found in /opt/meganet or /opt/meganet-deploy"
fi

cd "$BASE_DIR"
log "Using base directory: $BASE_DIR"

if [[ ! -d "frontend-src" ]]; then
    ln -s . frontend-src
fi

cd frontend-src
log "Installing dependencies and building..."
# Use absolute path for bun if possible
BUN_BIN=$(command -v bun)
$BUN_BIN install && NITRO_PRESET=node-server $BUN_BIN run build || err "Build failed"

log "Configuring service..."
cat > /etc/systemd/system/meganet-web.service <<UNIT
[Unit]
Description=Meganet Web Panel
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=$(pwd)
EnvironmentFile=$(pwd)/.env.production
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=NITRO_HOST=127.0.0.1
Environment=NITRO_PORT=3000
ExecStart=$(command -v node) $(pwd)/.output/server/index.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable meganet-web
systemctl restart meganet-web
log "Success! The panel should be online at http://144.91.78.4"
