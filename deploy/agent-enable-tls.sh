#!/usr/bin/env bash
# Activa TLS en el agente MikroTik ya instalado y lo publica de forma segura.
# Uso:  sudo bash agent-enable-tls.sh <IP_PUBLICA_DEL_VPS>
set -euo pipefail

VPS_IP="${1:-}"
[[ -z "$VPS_IP" ]] && { echo "Uso: sudo bash agent-enable-tls.sh <IP_PUBLICA>"; exit 1; }

AGENT_DIR="${AGENT_DIR:-/opt/meganet/agent}"
CERT_DIR=/etc/meganet-agent
mkdir -p "$CERT_DIR"

if [[ ! -f "$CERT_DIR/agent.crt" ]]; then
  echo "==> Generando certificado TLS auto-firmado para $VPS_IP"
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout "$CERT_DIR/agent.key" -out "$CERT_DIR/agent.crt" \
    -subj "/CN=$VPS_IP" -addext "subjectAltName=IP:$VPS_IP" >/dev/null 2>&1
  chmod 600 "$CERT_DIR/agent.key"
fi

FP=$(openssl x509 -in "$CERT_DIR/agent.crt" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':' | tr 'A-Z' 'a-z')

echo "==> Reconfigurando el servicio mikrotik-agent (TLS, escucha pública)"
TOKEN=$(systemctl show mikrotik-agent -p Environment --value | tr ' ' '\n' | grep '^MIKROTIK_AGENT_TOKEN=' | cut -d= -f2- || true)
if [[ ${#TOKEN} -lt 32 ]]; then
  TOKEN=$(openssl rand -hex 24)
  echo "    Token nuevo generado (guardalo): $TOKEN"
fi

cat > /etc/systemd/system/mikrotik-agent.service <<UNIT
[Unit]
Description=Meganet MikroTik Agent
After=network.target
[Service]
Environment=MIKROTIK_AGENT_TOKEN=$TOKEN
Environment=PORT=8777
Environment=AGENT_BIND_HOST=0.0.0.0
Environment=AGENT_TLS_CERT=$CERT_DIR/agent.crt
Environment=AGENT_TLS_KEY=$CERT_DIR/agent.key
WorkingDirectory=$AGENT_DIR
ExecStart=/usr/bin/node mikrotik-agent.mjs
Restart=always
[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl restart mikrotik-agent
sleep 1
systemctl --no-pager --lines=5 status mikrotik-agent || true

echo "==> Abriendo el puerto 8777 (TLS)"
if command -v ufw >/dev/null 2>&1; then ufw allow 8777/tcp || true; fi

cat <<INFO

==============================================================
 Configurá estos valores en el panel (Secrets):

   MIKROTIK_AGENT_HOST            = $VPS_IP
   MIKROTIK_AGENT_PORT            = 8777
   MIKROTIK_AGENT_TOKEN           = $TOKEN
   MIKROTIK_AGENT_TLS             = 1
   MIKROTIK_AGENT_TLS_FINGERPRINT = $FP
==============================================================
INFO
