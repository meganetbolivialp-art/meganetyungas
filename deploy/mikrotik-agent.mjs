import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import { timingSafeEqual, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import http from 'node:http';
import url from 'node:url';

// MikroTik agent de Meganet ISP
// Combina dos servicios:
//   1) TCP bridge en MIKROTIK_AGENT_PORT (default 8777) para que el panel remoto
//      se conecte a la API RouterOS de los routers a través del túnel VPN.
//   2) HTTP provision en PROVISION_PORT (default 3940) para generar credenciales
//      L2TP/IPsec de cada router automáticamente (estilo MikroWISP).

const TOKEN = process.env.MIKROTIK_AGENT_TOKEN || process.env.MEGANET_AGENT_TOKEN || '';
const BRIDGE_PORT = Number(process.env.MIKROTIK_AGENT_PORT || process.env.PORT || 8777);
const BRIDGE_HOST = process.env.MIKROTIK_AGENT_BIND_HOST || process.env.AGENT_BIND_HOST || '0.0.0.0';
const PROVISION_PORT = Number(process.env.PROVISION_PORT || 3940);
const PROVISION_HOST = process.env.PROVISION_BIND_HOST || '0.0.0.0';
const TLS_CERT = process.env.MIKROTIK_AGENT_TLS_CERT || process.env.AGENT_TLS_CERT || '';
const TLS_KEY = process.env.MIKROTIK_AGENT_TLS_KEY || process.env.AGENT_TLS_KEY || '';
const ADD_ROUTER_SCRIPT = process.env.ADD_ROUTER_SCRIPT || '/opt/meganet/l2tp-add-router.sh';
const L2TP_NETWORK = process.env.L2TP_NETWORK || '10.8.0.0/24';
const L2TP_SERVER_IP = process.env.L2TP_SERVER_IP || '10.8.0.1';
const IPSEC_SECRET = process.env.IPSEC_SECRET || process.env.L2TP_IPSEC_SECRET || '';

const MAX_HANDSHAKE = 1024;
const PRIVATE_HOST = /^(10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3})$/;

if (TOKEN.length < 32) {
  console.error('MIKROTIK_AGENT_TOKEN/MEGANET_AGENT_TOKEN must be at least 32 characters');
  process.exit(1);
}
if (BRIDGE_HOST !== '127.0.0.1' && BRIDGE_HOST !== '::1' && !(TLS_CERT && TLS_KEY)) {
  console.error('Refusing to bind bridge publicly without MIKROTIK_AGENT_TLS_CERT/KEY');
  process.exit(1);
}

function tokenMatches(value) {
  const a = Buffer.from(value);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sha256Fingerprint(cert) {
  return createHash('sha256').update(cert.raw).digest('hex').toLowerCase();
}

// ---------- TCP bridge (RouterOS API) ----------

const onClient = (client) => {
  client.setTimeout(35000, () => client.destroy());
  let pending = Buffer.alloc(0);
  const reject = (message) => { client.end(`ERR ${message}\n`); };
  const handshake = (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    if (pending.length > MAX_HANDSHAKE) return reject('handshake too large');
    const newline = pending.indexOf(10);
    if (newline < 0) return;
    client.off('data', handshake);
    const line = pending.subarray(0, newline).toString('utf8').trim();
    const remainder = pending.subarray(newline + 1);
    const match = /^AUTH\s+(\S+)\s+(\S+)\s+(\d+)$/.exec(line);
    if (!match || !tokenMatches(match[1])) return reject('unauthorized');
    const targetHost = match[2];
    const targetPort = Number(match[3]);
    if (!PRIVATE_HOST.test(targetHost)) return reject('target denied');
    const upstream = net.createConnection({ host: targetHost, port: targetPort });
    upstream.setTimeout(35000, () => upstream.destroy());
    upstream.once('connect', () => {
      client.write('OK\n');
      console.log(`[bridge] ${targetHost}:${targetPort} OK`);
      if (remainder.length) upstream.write(remainder);
      client.pipe(upstream).pipe(client);
    });
    upstream.once('error', (e) => reject(`router unavailable: ${e.message}`));
    client.once('error', () => upstream.destroy());
    client.once('close', () => upstream.destroy());
    upstream.once('close', () => client.destroy());
  };
  client.on('data', handshake);
};

const bridgeServer = (TLS_CERT && TLS_KEY)
  ? tls.createServer({ cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY), minVersion: 'TLSv1.2' }, onClient)
  : net.createServer(onClient);

bridgeServer.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
  console.log(`[bridge] listening on ${BRIDGE_HOST}:${BRIDGE_PORT} tls=${Boolean(TLS_CERT && TLS_KEY)}`);
});

// ---------- HTTP provision (L2TP/IPsec) ----------

function ipToLong(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0;
}
function longToIp(l) {
  return [(l >>> 24) & 255, (l >>> 16) & 255, (l >>> 8) & 255, l & 255].join('.');
}
function cidrRange(cidr) {
  const [ip, bits] = cidr.split('/');
  const mask = parseInt(bits, 10);
  const long = ipToLong(ip);
  const hostBits = 32 - mask;
  const start = (long >>> hostBits) << hostBits;
  const end = start + (1 << hostBits) - 1;
  return { start, end };
}

function getPublicIp() {
  try {
    const { execSync } = require('node:child_process');
    return execSync('curl -4 -s ifconfig.me || hostname -I | awk "{print \$1}"', { encoding: 'utf8', timeout: 5000 }).trim().split(/\s+/)[0];
  } catch {
    return '';
  }
}

function nextFreeIp(requestedIp) {
  if (requestedIp) return requestedIp;
  const { start, end } = cidrRange(L2TP_NETWORK);
  const serverLong = ipToLong(L2TP_SERVER_IP);
  const used = new Set();
  try {
    const secrets = fs.readFileSync('/etc/ppp/chap-secrets', 'utf8');
    for (const line of secrets.split('\n')) {
      const parts = line.trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 4) {
        const ip = parts[3];
        if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) used.add(ipToLong(ip));
      }
    }
  } catch {}
  for (let i = start + 12; i < end; i++) {
    if (i === serverLong) continue;
    if (!used.has(i)) return longToIp(i);
  }
  return null;
}

function provisionL2tp(name, requestedIp, callback) {
  const assignedIp = nextFreeIp(requestedIp);
  if (!assignedIp) return callback(new Error('Sin IPs libres en la VPN L2TP'), null);

  const child = spawn('bash', [ADD_ROUTER_SCRIPT, name, assignedIp], { stdio: 'pipe' });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    if (code !== 0) {
      console.error('[provision] l2tp-add-router.sh failed:', stderr, stdout);
      return callback(new Error(`add-router script exit ${code}: ${stderr || stdout}`.slice(0, 400)), null);
    }
    // Extraer password del stdout
    const passMatch = stdout.match(/Password:\s*(\S+)/);
    const password = passMatch ? passMatch[1] : '***';
    callback(null, {
      type: 'l2tp',
      l2tpUser: `ms_${name}`,
      l2tpPassword: password,
      ip: assignedIp,
      ipsecSecret: IPSEC_SECRET || 'meganet-l2tp',
      endpoint: getPublicIp() || process.env.L2TP_ENDPOINT || '',
    });
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function authHeader(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : '';
}

const provisionServer = http.createServer((req, res) => {
  const parsed = url.parse(req.url || '', true);
  if (parsed.pathname !== '/provision') {
    return sendJson(res, 404, { error: 'not found' });
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method not allowed' });
  }
  if (!tokenMatches(authHeader(req))) {
    console.warn('[provision] 401 — token inválido');
    return sendJson(res, 401, { error: 'unauthorized' });
  }
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(body); } catch (e) {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    const name = String(payload.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 15) || 'router';
    const requestedIp = String(payload.ip || '').trim();
    provisionL2tp(name, /^\d+\.\d+\.\d+\.\d+$/.test(requestedIp) ? requestedIp : '', (err, result) => {
      if (err) return sendJson(res, 500, { error: err.message });
      console.log(`[provision] ${name} → ${result.ip}`);
      sendJson(res, 200, result);
    });
  });
});

provisionServer.listen(PROVISION_PORT, PROVISION_HOST, () => {
  console.log(`[provision] listening on ${PROVISION_HOST}:${PROVISION_PORT} (L2TP/IPsec)`);
});

// TLS fingerprint del puente (para fijar en el panel)
if (TLS_CERT && fs.existsSync(TLS_CERT)) {
  const cert = fs.readFileSync(TLS_CERT);
  const fp = createHash('sha256').update(cert).digest('hex').toLowerCase();
  console.log(`[bridge] TLS fingerprint: ${fp}`);
}
