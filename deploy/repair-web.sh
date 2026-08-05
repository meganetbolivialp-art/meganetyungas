#!/usr/bin/env bash
# Script de reparo para Meganet Web (Caminhos Corrigidos)
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
log() { echo -e "${G}[✓]${N} $*"; }
warn() { echo -e "${Y}[!]${N} $*"; }
err() { echo -e "${R}[✗]${N} $*"; exit 1; }

# Tentar encontrar onde o código frontend está
if [[ -d "/opt/meganet-deploy/frontend-src" ]]; then
    FRONTEND_DIR="/opt/meganet-deploy"
elif [[ -d "/opt/meganet/frontend-src" ]]; then
    FRONTEND_DIR="/opt/meganet"
else
    # Se não existir, vamos criar em /opt/meganet e clonar se necessário
    mkdir -p /opt/meganet
    FRONTEND_DIR="/opt/meganet"
fi

cd "$FRONTEND_DIR" || err "Não foi possível acessar $FRONTEND_DIR"

log "Usando diretório: $FRONTEND_DIR"

# Se a pasta frontend-src não existir dentro do diretório, precisamos clonar ou renomear
if [[ ! -d "frontend-src" ]]; then
    warn "Pasta frontend-src não encontrada em $FRONTEND_DIR. Verificando repositório Git..."
    # Se estivermos no diretório do git clonado
    if [[ -d ".git" ]]; then
        log "Diretório atual é um repo git. Criando link simbólico..."
        ln -s . frontend-src
    else
        err "Código fonte não encontrado. Certifique-se de que o comando 'git clone' funcionou."
    fi
fi

cd frontend-src || err "Erro ao acessar frontend-src"

log "Instalando dependências..."
bun install || err "Erro no bun install"

log "Compilando frontend..."
NITRO_PRESET=node-server bun run build || err "Erro no build"

log "Configurando serviço systemd..."
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
ExecStart=/usr/bin/node $(pwd)/.output/server/index.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable meganet-web
systemctl restart meganet-web

log "Serviço Meganet Web reiniciado com sucesso!"
systemctl status meganet-web --no-pager
