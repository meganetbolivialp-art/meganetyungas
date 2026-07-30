#!/usr/bin/env bash
# Activa TLS en el agente MikroTik ya instalado y lo publica de forma segura.
# Uso:  sudo bash agent-enable-tls.sh <IP_PUBLICA_DEL_VPS>
set -euo pipefail

VPS_IP="${1:-}"
[[ -z "$VPS_IP" ]] && { echo "Uso: sudo bash agent-enable-tls.sh <IP_PUBLICA>"; exit 1; }

AGENT_DIR="${AGENT_DIR:-/opt/meganet/agent}"
CERT_DIR=/etc/meganet-agent
mkdir -p "$CERT_DIR" "$AGENT_DIR"

# El agente puede no estar instalado todavía (systemd falla con status=200/CHDIR).
# Lo escribimos siempre para garantizar que corre la versión con TLS.
cat > "$AGENT_DIR/package.json" <<'PKG'
{"name":"mikrotik-agent","type":"module","private":true}
PKG
cat > "$AGENT_DIR/mikrotik-agent.mjs" <<'AGENT'
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
const TOKEN = process.env.MIKROTIK_AGENT_TOKEN || '';
const PORT = Number(process.env.PORT || 8777);
const HOST = process.env.AGENT_BIND_HOST || '127.0.0.1';
const TLS_CERT = process.env.AGENT_TLS_CERT || '';
const TLS_KEY = process.env.AGENT_TLS_KEY || '';
const PRIVATE_HOST = /^(10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3})$/;
if (TOKEN.length < 32) { console.error('MIKROTIK_AGENT_TOKEN must be at least 32 characters'); process.exit(1); }
if (HOST !== '127.0.0.1' && HOST !== '::1' && !(TLS_CERT && TLS_KEY)) {
  console.error('Refusing to bind publicly without AGENT_TLS_CERT/AGENT_TLS_KEY');
  process.exit(1);
}
function tokenMatches(value) {
  const a = Buffer.from(value), b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}
const onClient = (client) => {
  client.setTimeout(20000, () => client.destroy());
  let pending = Buffer.alloc(0);
  const reject = (message) => client.end(`ERR ${message}\n`);
  const handshake = (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    if (pending.length > 1024) return reject('handshake too large');
    const newline = pending.indexOf(10); if (newline < 0) return;
    client.off('data', handshake);
    const match = /^AUTH\s+(\S+)\s+(\S+)\s+(\d+)$/.exec(pending.subarray(0, newline).toString('utf8').trim());
    if (!match || !tokenMatches(match[1])) return reject('unauthorized');
    const targetHost = match[2], targetPort = Number(match[3]);
    if (!PRIVATE_HOST.test(targetHost) || targetPort !== 8728) return reject('target denied');
    const upstream = net.createConnection({ host: targetHost, port: targetPort });
    upstream.setTimeout(20000, () => upstream.destroy());
    upstream.once('connect', () => {
      client.write('OK\n');
      const rest = pending.subarray(newline + 1); if (rest.length) upstream.write(rest);
      client.pipe(upstream).pipe(client);
    });
    upstream.once('error', () => reject('router unavailable'));
    client.once('error', () => upstream.destroy());
    client.once('close', () => upstream.destroy());
  };
  client.on('data', handshake);
};
const server = (TLS_CERT && TLS_KEY)
  ? tls.createServer({ cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY), minVersion: 'TLSv1.2' }, onClient)
  : net.createServer(onClient);
server.listen(PORT, HOST, () => console.log(`mikrotik-agent on ${HOST}:${PORT} tls=${Boolean(TLS_CERT && TLS_KEY)}`));
AGENT


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
systemctl enable mikrotik-agent >/dev/null 2>&1 || true
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
