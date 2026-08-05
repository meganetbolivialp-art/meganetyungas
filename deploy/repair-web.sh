#!/usr/bin/env bash
# Updated Meganet Web Repair Script (Fixing package.json and .env missing issues)
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
    if ! command -v bun &>/dev/null; then
        warn "Standard Bun install failed, trying via npm..."
        npm install -g bun >/dev/null 2>&1 || err "Could not install Bun. Please install it manually."
    fi
fi

# 2. Find frontend directory (look for package.json)
if [[ -f "package.json" ]]; then
    BASE_DIR="$(pwd)"
elif [[ -f "../package.json" ]]; then
    BASE_DIR="$(cd .. && pwd)"
elif [[ -d "/opt/meganet-deploy" ]]; then
    BASE_DIR="/opt/meganet-deploy"
elif [[ -d "/opt/meganet" ]]; then
    BASE_DIR="/opt/meganet"
else
    err "Source code (package.json) not found. Please run this script inside the project folder."
fi

cd "$BASE_DIR"
log "Using project directory: $BASE_DIR"

# 3. Create necessary files if missing
if [[ ! -f ".env.production" ]]; then
    log "Creating empty .env.production..."
    touch .env.production
fi

# 4. Build
log "Installing dependencies and building..."
BUN_BIN=$(command -v bun)
$BUN_BIN install && NITRO_PRESET=node-server $BUN_BIN run build || err "Build failed"

# 5. Configuring service
log "Configuring service..."
cat > /etc/systemd/system/meganet-web.service <<UNIT
[Unit]
Description=Meganet Web Panel
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=$BASE_DIR
EnvironmentFile=$BASE_DIR/.env.production
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=NITRO_HOST=127.0.0.1
Environment=NITRO_PORT=3000
ExecStart=$(command -v node) $BASE_DIR/.output/server/index.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable meganet-web
systemctl restart meganet-web
log "Success! The panel should be online at http://144.91.78.4"
