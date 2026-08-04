// Real Mikrotik RouterOS API client over TCP (node:net) with graceful
// fallback to simulation. Same interface as before — the UI does not change.
//
// Protocol reference: https://help.mikrotik.com/docs/display/ROS/API
// Supports post-6.43 plain login. For older RouterOS use the challenge flow
// (not implemented here — mark those routers as `simulated`).

import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";

export type MtRouter = {
  id: string;
  name: string;
  ip_address: string;
  api_port: number;
  api_user: string | null;
  api_password: string | null;
  simulated: boolean;
  morosos_profile?: string | null;
  walled_garden_ip?: string | null;
};


// ---------- low-level word encoding ----------

function encodeLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x4000) {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(len | 0x8000, 0);
    return b;
  }
  if (len < 0x200000) {
    const b = Buffer.alloc(3);
    b[0] = ((len >> 16) & 0xff) | 0xc0;
    b[1] = (len >> 8) & 0xff;
    b[2] = len & 0xff;
    return b;
  }
  if (len < 0x10000000) {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(len | 0xe0000000, 0);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = 0xf0;
  b.writeUInt32BE(len, 1);
  return b;
}

function encodeWord(w: string): Buffer {
  const body = Buffer.from(w, "utf8");
  return Buffer.concat([encodeLength(body.length), body]);
}

function encodeSentence(words: string[]): Buffer {
  const parts = words.map(encodeWord);
  parts.push(Buffer.from([0])); // terminating zero
  return Buffer.concat(parts);
}

// Streaming decoder — pull sentences from a growing buffer.
class SentenceReader {
  private buf: Buffer = Buffer.alloc(0);
  private current: string[] = [];

  push(chunk: Buffer) {
    this.buf = Buffer.concat([this.buf, chunk]);
  }

  private readLength(): number | null {
    if (this.buf.length < 1) return null;
    const b0 = this.buf[0];
    let len = 0;
    let head = 0;
    if ((b0 & 0x80) === 0) { len = b0; head = 1; }
    else if ((b0 & 0xc0) === 0x80) { if (this.buf.length < 2) return null; len = ((b0 & 0x3f) << 8) | this.buf[1]; head = 2; }
    else if ((b0 & 0xe0) === 0xc0) { if (this.buf.length < 3) return null; len = ((b0 & 0x1f) << 16) | (this.buf[1] << 8) | this.buf[2]; head = 3; }
    else if ((b0 & 0xf0) === 0xe0) { if (this.buf.length < 4) return null; len = ((b0 & 0x0f) << 24) | (this.buf[1] << 16) | (this.buf[2] << 8) | this.buf[3]; head = 4; }
    else if (b0 === 0xf0) { if (this.buf.length < 5) return null; len = this.buf.readUInt32BE(1); head = 5; }
    else throw new Error("Invalid RouterOS length byte");
    if (this.buf.length < head + len) return null;
    this._pendingHead = head;
    this._pendingLen = len;
    return len;
  }
  private _pendingHead = 0;
  private _pendingLen = 0;

  nextSentence(): string[] | null {
    while (true) {
      const len = this.readLength();
      if (len === null) return null;
      const word = this.buf.slice(this._pendingHead, this._pendingHead + len).toString("utf8");
      this.buf = this.buf.slice(this._pendingHead + len);
      if (len === 0) {
        const s = this.current;
        this.current = [];
        return s;
      }
      this.current.push(word);
    }
  }
}

// ---------- RouterOS command runner ----------

type Sentence = { reply: string; attrs: Record<string, string>; tag?: string };

function parseSentence(words: string[]): Sentence {
  const reply = words[0] ?? "";
  const attrs: Record<string, string> = {};
  let tag: string | undefined;
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (w.startsWith("=")) {
      const eq = w.indexOf("=", 1);
      if (eq > 0) attrs[w.slice(1, eq)] = w.slice(eq + 1);
    } else if (w.startsWith(".tag=")) tag = w.slice(5);
  }
  return { reply, attrs, tag };
}

function isLoopbackHost(host: string) {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

async function connect(router: MtRouter, timeoutMs = 35000): Promise<net.Socket> {
  const agentHost = process.env.MIKROTIK_AGENT_HOST;
  const agentPort = process.env.MIKROTIK_AGENT_PORT ? Number(process.env.MIKROTIK_AGENT_PORT) : 8777;
  const agentToken = process.env.MIKROTIK_AGENT_TOKEN;
  const useAgent = Boolean(agentHost && agentToken);

  const targetHost = useAgent ? agentHost as string : router.ip_address;
  const targetPort = useAgent ? agentPort : (router.api_port || 8728);

  // The bridge carries RouterOS credentials across the public internet, so it
  // must be encrypted. TLS is on by default for any non-loopback agent host and
  // can only be disabled explicitly (MIKROTIK_AGENT_TLS=0) for local setups.
  const tlsSetting = (process.env.MIKROTIK_AGENT_TLS || "").trim().toLowerCase();
  const useTls = useAgent && (
    tlsSetting === "1" || tlsSetting === "true"
      ? true
      : tlsSetting === "0" || tlsSetting === "false"
        ? false
        : !isLoopbackHost(targetHost)
  );
  const pinnedFingerprint = (process.env.MIKROTIK_AGENT_TLS_FINGERPRINT || "")
    .replace(/[^a-fA-F0-9]/g, "")
    .toLowerCase();


  return new Promise((resolve, reject) => {
    let settled = false;
    const targetUnreachable = /(cannot connect to the specified address|proxy request failed|ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|connect timeout)/i;
    const describeConnectionError = (error: Error) => {
      const code = (error as NodeJS.ErrnoException).code;
      const base = `${code ? `${code}: ` : ""}${error.message}`;
      if (!useAgent) return `${base} (router ${router.ip_address}:${router.api_port || 8728})`;
      // El puente respondió, pero no pudo abrir el router: el problema está en el
      // túnel VPN o en la API del MikroTik, no en el agente del VPS.
      if (targetUnreachable.test(base)) {
        return `El router ${router.name} (${router.ip_address}:${router.api_port || 8728}) no responde a través de la VPN. Verificá que el túnel OVPN esté levantado en el router y que /ip service api esté habilitado para 10.8.0.0/24.`;
      }
      return `${base} (agente ${targetHost}:${targetPort} → router ${router.ip_address}:${router.api_port || 8728}). Revisá que meganet-agent esté activo y escuchando en PORT=${targetPort}.`;
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      reject(new Error(describeConnectionError(error)));
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve(socket);
    };
    const connectTls = (): tls.TLSSocket => {
      const baseOptions: tls.ConnectionOptions = {
        host: targetHost,
        port: targetPort,
        servername: /^[\d.]+$/.test(targetHost) ? undefined : targetHost,
      };
      // Self-signed agent certificates are accepted only when the panel pins
      // their SHA-256 fingerprint (verified manually after the handshake), which
      // keeps the channel authenticated without a public CA. Some serverless
      // runtimes do not implement `rejectUnauthorized`, so it is only used when
      // supported and the pinned-fingerprint check remains the real gate.
      if (!pinnedFingerprint) return tls.connect(baseOptions);
      try {
        return tls.connect({ ...baseOptions, rejectUnauthorized: false });
      } catch {
        return tls.connect(baseOptions);
      }
    };
    const socket: net.Socket = useTls
      ? connectTls()
      : net.createConnection({ host: targetHost, port: targetPort });

    socket.setKeepAlive(true, 5000);
    socket.setNoDelay(true);
    const t = setTimeout(() => {
      socket.destroy();
      fail(new Error("connect timeout"));
    }, timeoutMs);

    socket.once("error", fail);

    if (!useAgent) {
      socket.once("connect", succeed);
      return;
    }

    // TCP proxy handshake. The agent runs inside the VPN VPS and opens the
    // private 10.x/192.168.x address on behalf of the panel.
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const line = buf.slice(0, nl).trim();
      const rest = Buffer.from(buf.slice(nl + 1), "utf8");
      socket.off("data", onData);
      if (line !== "OK") {
        socket.destroy();
        fail(new Error(`agent handshake failed: ${line || "no response"}`));
        return;
      }
      // Re-emit any bytes received after the "OK\n" line so the RouterOS reader sees them.
      if (rest.length > 0) process.nextTick(() => socket.emit("data", rest));
      console.log(`[mikrotik:agent] handshake OK for ${router.name} (${router.ip_address})`);
      succeed();
    };

    const startHandshake = () => {
      if (useTls && pinnedFingerprint) {
        const cert = (socket as tls.TLSSocket).getPeerCertificate();
        const raw = cert && (cert as { raw?: Buffer }).raw;
        const actual = raw
          ? crypto.createHash("sha256").update(raw).digest("hex")
          : "";
        if (actual !== pinnedFingerprint) {
          socket.destroy();
          fail(new Error("agent TLS fingerprint mismatch"));
          return;
        }
      }
      socket.on("data", onData);
      socket.write(`AUTH ${agentToken} ${router.ip_address} ${router.api_port || 8728}\n`);
    };

    socket.once(useTls ? "secureConnect" : "connect", startHandshake);

  });
}

async function sendCommand(socket: net.Socket, words: string[], overallTimeoutMs = 15000): Promise<Sentence[]> {
  return new Promise((resolve, reject) => {
    const reader = new SentenceReader();
    const collected: Sentence[] = [];
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("command timeout")); }, overallTimeoutMs);

    const onData = (chunk: Buffer) => {
      reader.push(chunk);
      let s;
      while ((s = reader.nextSentence()) !== null) {
        const parsed = parseSentence(s);
        collected.push(parsed);
        if (parsed.reply === "!done" || parsed.reply === "!fatal") {
          clearTimeout(timer);
          socket.off("data", onData);
          resolve(collected);
          return;
        }
      }
    };
    socket.on("data", onData);
    socket.once("error", (e) => { clearTimeout(timer); reject(e); });
    socket.write(encodeSentence(words));
  });
}

async function login(socket: net.Socket, user: string, password: string): Promise<void> {
  const res = await sendCommand(socket, ["/login", `=name=${user}`, `=password=${password}`]);
  const trap = res.find((s) => s.reply === "!trap");
  if (trap) throw new Error(`login failed: ${trap.attrs.message || "unknown"}`);
}

async function withSessionOnce<T>(router: MtRouter, fn: (socket: net.Socket) => Promise<T>): Promise<T> {
  const socket = await connect(router);
  try {
    if (!router.api_user) throw new Error("router.api_user missing");
    await login(socket, router.api_user, router.api_password || "");
    return await fn(socket);
  } finally {
    try { socket.end(encodeSentence(["/quit"])); } catch { /* ignore */ }
    socket.destroy();
  }
}

// Serialización por router: una única sesión API activa a la vez por router.
// Evita que auto-ping + estado de clientes + acción manual saturen la API MikroTik
// (que por defecto encola muy pocas conexiones concurrentes y termina en timeout).
const routerLocks = new Map<string, Promise<unknown>>();

async function withRouterLock<T>(routerId: string, fn: () => Promise<T>): Promise<T> {
  const prev = routerLocks.get(routerId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  routerLocks.set(routerId, prev.then(() => next));
  try {
    await prev.catch(() => {});
    return await fn();
  } finally {
    release();
    if (routerLocks.get(routerId) === prev.then(() => next)) routerLocks.delete(routerId);
  }
}

// Circuit breaker por router: tras 3 fallos consecutivos, entra en "cooldown" corto
// donde las llamadas fallan rápido sin martillar la API (evita el storm de retries visto
// cuando el tunnel OVPN parpadea). Al vencer el cooldown se permite una sonda ("half-open"):
// si funciona, el circuito se cierra; si falla, se vuelve a abrir con backoff.
type Breaker = { fails: number; openUntil: number; opens: number; probing?: boolean };
const routerBreakers = new Map<string, Breaker>();
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 10_000;
const BREAKER_MAX_COOLDOWN_MS = 60_000;
// Credenciales inválidas: cooldown largo. Evita repetir /login con la misma contraseña
// equivocada (llena el log del MikroTik con "login failure" y dispara sus bloqueos).
const AUTH_COOLDOWN_MS = 10 * 60_000;
const AUTH_FAIL_RE = /(login failed|cannot log in|invalid user name or password|not allowed)/i;

function breakerFor(id: string): Breaker {
  let b = routerBreakers.get(id);
  if (!b) { b = { fails: 0, openUntil: 0, opens: 0 }; routerBreakers.set(id, b); }
  return b;
}

function openError(router: MtRouter, br: Breaker): Error {
  const secs = Math.max(1, Math.ceil((br.openUntil - Date.now()) / 1000));
  const authPaused = br.openUntil - Date.now() > BREAKER_MAX_COOLDOWN_MS;
  return new Error(
    authPaused
      ? `Router ${router.name}: conexión pausada por credenciales API rechazadas. Corregí usuario/contraseña y reintentá.`
      : `Router ${router.name} no responde ahora mismo (reintento automático en ${secs}s). Verificá el túnel VPN o la API del router.`,
  );
}

/** Permite que una acción manual del usuario reintente ya mismo (cierra el cooldown corto). */
export function resetRouterBreaker(routerId: string) {
  const br = routerBreakers.get(routerId);
  if (!br) return;
  // No se limpian pausas por credenciales inválidas (cooldown largo).
  if (br.openUntil - Date.now() > BREAKER_MAX_COOLDOWN_MS) return;
  br.fails = 0; br.openUntil = 0; br.opens = 0; br.probing = false;
}

// Reintenta hasta 3 veces ante fallos transitorios de red / timeout / socket cerrado.
// No reintenta si el error es de login o de trap semántico (ej: "user not found").
async function withSession<T>(router: MtRouter, fn: (socket: net.Socket) => Promise<T>): Promise<T> {
  const transient = /(timeout|ECONNRESET|EPIPE|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|read ECONN|socket hang up)/i;
  const br = breakerFor(router.id);
  if (br.openUntil > Date.now()) throw openError(router, br);
  return withRouterLock(router.id, async () => {
    // Doble check dentro del lock por si otro caller ya abrió el circuito.
    if (br.openUntil > Date.now()) throw openError(router, br);
    // Tras un cooldown vencido, la primera llamada es una sonda: un solo intento.
    const halfOpen = br.fails >= BREAKER_THRESHOLD;
    const maxAttempts = halfOpen ? 1 : 3;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const out = await withSessionOnce(router, fn);
        br.fails = 0;
        br.openUntil = 0;
        br.opens = 0;
        return out;
      } catch (e) {
        lastErr = e;
        const msg = (e as Error).message || "";
        if (!transient.test(msg) || attempt === maxAttempts) break;
        console.warn(`[mikrotik] ${router.name} intento ${attempt} falló (${msg}), reintentando…`);
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
    br.fails += 1;
    if (AUTH_FAIL_RE.test((lastErr as Error)?.message || "")) {
      br.openUntil = Date.now() + AUTH_COOLDOWN_MS;
      console.warn(`[mikrotik] ${router.name}: credenciales API rechazadas — pausa ${AUTH_COOLDOWN_MS / 60000} min para no llenar el log del router`);
      throw new Error(`Credenciales API inválidas para ${router.name}. Corregí usuario/contraseña del router antes de reintentar.`);
    }
    if (br.fails >= BREAKER_THRESHOLD) {
      br.opens += 1;
      const wait = Math.min(BREAKER_COOLDOWN_MS * br.opens, BREAKER_MAX_COOLDOWN_MS);
      br.openUntil = Date.now() + wait;
      console.warn(`[mikrotik] ${router.name} circuit-breaker ABIERTO ${wait / 1000}s tras ${br.fails} fallos`);
    }
    throw lastErr;
  });
}

// Cache de estado del ping por router — evita parpadeo de UI y dedupe concurrente.
type PingResult = { ok: true; latency_ms: number; cached?: true; stale?: true };
type PingCacheEntry = { ok: boolean; latency_ms: number; at: number; inflight?: Promise<PingResult> };
const pingCache = new Map<string, PingCacheEntry>();




// ---------- simulation fallback ----------

async function simulate<T>(label: string, payload: unknown, result: T): Promise<T> {
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 180));
  console.log(`[mikrotik:sim] ${label}`, JSON.stringify(payload));
  return result;
}

async function real<T>(router: MtRouter, label: string, run: () => Promise<T>, simFallback: () => Promise<T>): Promise<T> {
  if (router.simulated) return simFallback();
  try {
    const out = await run();
    console.log(`[mikrotik:real] ${label} ok`, router.name);
    return out;
  } catch (e) {
    console.error(`[mikrotik:real] ${label} failed on ${router.name}:`, (e as Error).message);
    throw new Error(`Mikrotik ${router.name}: ${(e as Error).message}`);
  }
}

async function removeRulesByComment(socket: net.Socket, basePath: string, comment: string) {
  const existing = await sendCommand(socket, [`${basePath}/print`, `?comment=${comment}`, "=.proplist=.id"]);
  const ids = existing
    .filter((r) => r.reply === "!re")
    .map((r) => r.attrs[".id"])
    .filter((id): id is string => Boolean(id));
  for (const id of ids) {
    const res = await sendCommand(socket, [`${basePath}/remove`, `=.id=${id}`]);
    const trap = res.find((r) => r.reply === "!trap");
    if (trap) throw new Error(trap.attrs.message || `remove ${comment} failed`);
  }
}

async function removeRulesByCommentMatch(socket: net.Socket, basePath: string, matches: (comment: string) => boolean) {
  const existing = await sendCommand(socket, [`${basePath}/print`, "=.proplist=.id,comment"]);
  const ids = existing
    .filter((r) => r.reply === "!re" && matches(r.attrs.comment || ""))
    .map((r) => r.attrs[".id"])
    .filter((id): id is string => Boolean(id));
  for (const id of ids) {
    const res = await sendCommand(socket, [`${basePath}/remove`, `=.id=${id}`]);
    const trap = res.find((r) => r.reply === "!trap");
    if (trap) throw new Error(trap.attrs.message || "remove legacy cutoff rule failed");
  }
}

async function firstRuleId(socket: net.Socket, basePath: string, filters: string[]) {
  const res = await sendCommand(socket, [`${basePath}/print`, ...filters, "=.proplist=.id"]);
  return res.find((r) => r.reply === "!re")?.attrs[".id"] || null;
}

async function addRule(socket: net.Socket, words: string[], label: string) {
  const res = await sendCommand(socket, words);
  const trap = res.find((r) => r.reply === "!trap");
  if (trap) throw new Error(trap.attrs.message || `${label} failed`);
}

// ---------- public API (same shape as before) ----------

export const mikrotik = {
  async createPPPoE(router: MtRouter, args: { user: string; password: string; profile: string; remoteIp?: string | null }) {
    return real(
      router,
      "ppp/secret/upsert",
      async () => withSession(router, async (s) => {
        const found = await sendCommand(s, ["/ppp/secret/print", `?name=${args.user}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        const words = id
          ? ["/ppp/secret/set", `=.id=${id}`, `=password=${args.password}`, "=service=pppoe", `=profile=${args.profile}`]
          : ["/ppp/secret/add", `=name=${args.user}`, `=password=${args.password}`, "=service=pppoe", `=profile=${args.profile}`];
        if (args.remoteIp) words.push(`=remote-address=${args.remoteIp}`);
        const res = await sendCommand(s, words);
        const trap = res.find((r) => r.reply === "!trap");
        if (trap) throw new Error(trap.attrs.message || (id ? "update failed" : "add failed"));
        if (id) {
          const active = await sendCommand(s, ["/ppp/active/print", `?name=${args.user}`, "=.proplist=.id"]);
          const activeId = active.find((r) => r.reply === "!re")?.attrs[".id"];
          if (activeId) await sendCommand(s, ["/ppp/active/remove", `=.id=${activeId}`]);
        }
        const done = res.find((r) => r.reply === "!done");
        return { ok: true as const, id: id || done?.attrs.ret || null, updated: !!id };
      }),
      () => simulate("ppp/secret/upsert", { router: router.name, ...args }, { ok: true as const, id: `*${Math.floor(Math.random() * 9999)}`, updated: false }),
    );
  },

  async disablePPPoE(router: MtRouter, args: { user: string }) {
    return real(
      router,
      "ppp/secret/disable",
      async () => withSession(router, async (s) => {
        const found = await sendCommand(s, ["/ppp/secret/print", `?name=${args.user}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        if (!id) throw new Error(`user ${args.user} not found`);
        const res = await sendCommand(s, ["/ppp/secret/disable", `=.id=${id}`]);
        const trap = res.find((r) => r.reply === "!trap");
        if (trap) throw new Error(trap.attrs.message || "disable failed");
        // best effort — kick active session
        const active = await sendCommand(s, ["/ppp/active/print", `?name=${args.user}`, "=.proplist=.id"]);
        const aid = active.find((r) => r.reply === "!re")?.attrs[".id"];
        if (aid) await sendCommand(s, ["/ppp/active/remove", `=.id=${aid}`]);
        return { ok: true as const };
      }),
      () => simulate("ppp/secret/disable", { router: router.name, ...args }, { ok: true as const }),
    );
  },

  async enablePPPoE(router: MtRouter, args: { user: string }) {
    return real(
      router,
      "ppp/secret/enable",
      async () => withSession(router, async (s) => {
        const found = await sendCommand(s, ["/ppp/secret/print", `?name=${args.user}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        if (!id) throw new Error(`user ${args.user} not found`);
        const res = await sendCommand(s, ["/ppp/secret/enable", `=.id=${id}`]);
        const trap = res.find((r) => r.reply === "!trap");
        if (trap) throw new Error(trap.attrs.message || "enable failed");
        return { ok: true as const };
      }),
      () => simulate("ppp/secret/enable", { router: router.name, ...args }, { ok: true as const }),
    );
  },

  async removePPPoE(router: MtRouter, args: { user: string }) {
    return real(
      router,
      "ppp/secret/remove",
      async () => withSession(router, async (s) => {
        const found = await sendCommand(s, ["/ppp/secret/print", `?name=${args.user}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        if (!id) return { ok: true as const };
        const res = await sendCommand(s, ["/ppp/secret/remove", `=.id=${id}`]);
        const trap = res.find((r) => r.reply === "!trap");
        if (trap) throw new Error(trap.attrs.message || "remove failed");
        return { ok: true as const };
      }),
      () => simulate("ppp/secret/remove", { router: router.name, ...args }, { ok: true as const }),
    );
  },

  async listActive(router: MtRouter) {
    return real(
      router,
      "ppp/active/print",
      async () => withSession(router, async (s) => {
        const res = await sendCommand(s, ["/ppp/active/print"]);
        const active = res
          .filter((r) => r.reply === "!re")
          .map((r) => ({
            name: r.attrs.name,
            address: r.attrs.address,
            uptime: r.attrs.uptime,
            caller_id: r.attrs["caller-id"] || null,
            bytes_in: Number(r.attrs["bytes-in"] ?? 0),
            bytes_out: Number(r.attrs["bytes-out"] ?? 0),
          }));
        return { ok: true as const, active };
      }),
      () => simulate("ppp/active/print", { router: router.name }, {
        ok: true as const,
        active: Array.from({ length: 3 + Math.floor(Math.random() * 8) }).map((_, i) => ({
          name: `usr${100 + i}`,
          address: `10.0.0.${10 + i}`,
          uptime: `${Math.floor(Math.random() * 48)}h${Math.floor(Math.random() * 60)}m`,
          caller_id: `AA:BB:CC:DD:EE:${(10 + i).toString(16).padStart(2, "0")}`,
          bytes_in: Math.floor(Math.random() * 1e9),
          bytes_out: Math.floor(Math.random() * 1e9),
        })),
      }),
    );
  },


  async listSecrets(router: MtRouter) {
    return real(
      router,
      "ppp/secret/print",
      async () => withSession(router, async (s) => {
        const res = await sendCommand(s, ["/ppp/secret/print"]);
        const secrets = res
          .filter((r) => r.reply === "!re")
          .map((r) => ({
            name: r.attrs.name,
            password: r.attrs.password || null,
            profile: r.attrs.profile,
            service: r.attrs.service,
            remote_address: r.attrs["remote-address"] || null,
            disabled: r.attrs.disabled === "true",
            comment: r.attrs.comment || null,
          }));
        return { ok: true as const, secrets };
      }),
      () => simulate("ppp/secret/print", { router: router.name }, {
        ok: true as const,
        secrets: Array.from({ length: 6 }).map((_, i) => ({
          name: `sim_user${i + 1}`,
          password: `sim_pass${i + 1}`,
          profile: i % 2 === 0 ? "10M" : "20M",
          service: "pppoe",
          remote_address: `10.20.0.${20 + i}`,
          disabled: false,
          comment: null,
        })),
      }),
    );
  },

  async listProfiles(router: MtRouter) {
    return real(
      router,
      "ppp/profile/print",
      async () => withSession(router, async (s) => {
        const res = await sendCommand(s, ["/ppp/profile/print"]);
        const profiles = res
          .filter((r) => r.reply === "!re")
          .map((r) => ({
            name: r.attrs.name as string,
            rate_limit: (r.attrs["rate-limit"] as string) || null,
            local_address: (r.attrs["local-address"] as string) || null,
            remote_address: (r.attrs["remote-address"] as string) || null,
            only_one: (r.attrs["only-one"] as string) || null,
          }));
        return { ok: true as const, profiles };
      }),
      () => simulate("ppp/profile/print", { router: router.name }, {
        ok: true as const,
        profiles: [
          { name: "30_MEGAS", rate_limit: "30M/30M", local_address: "10.10.10.1", remote_address: null, only_one: "yes" },
          { name: "60_MEGAS", rate_limit: "60M/60M", local_address: "10.10.10.1", remote_address: null, only_one: "yes" },
          { name: "100_MEGAS", rate_limit: "80M/100M", local_address: "10.10.11.1", remote_address: null, only_one: "yes" },
        ],
      }),
    );
  },

  async listImportPreview(router: MtRouter) {
    return real(
      router,
      "ppp/import-preview",
      async () => withSession(router, async (s) => {
        const secretRes = await sendCommand(s, ["/ppp/secret/print"]);
        const secrets = secretRes
          .filter((r) => r.reply === "!re")
          .map((r) => ({
            name: r.attrs.name,
            password: r.attrs.password || null,
            profile: r.attrs.profile,
            service: r.attrs.service,
            remote_address: r.attrs["remote-address"] || null,
            disabled: r.attrs.disabled === "true",
            comment: r.attrs.comment || null,
          }));

        const profileRes = await sendCommand(s, ["/ppp/profile/print"]);
        const profiles = profileRes
          .filter((r) => r.reply === "!re")
          .map((r) => ({
            name: r.attrs.name as string,
            rate_limit: (r.attrs["rate-limit"] as string) || null,
            local_address: (r.attrs["local-address"] as string) || null,
            remote_address: (r.attrs["remote-address"] as string) || null,
            only_one: (r.attrs["only-one"] as string) || null,
          }));

        return { ok: true as const, secrets, profiles };
      }),
      () => simulate("ppp/import-preview", { router: router.name }, {
        ok: true as const,
        secrets: Array.from({ length: 6 }).map((_, i) => ({
          name: `sim_user${i + 1}`,
          password: `sim_pass${i + 1}`,
          profile: i % 2 === 0 ? "10M" : "20M",
          service: "pppoe",
          remote_address: `10.20.0.${20 + i}`,
          disabled: false,
          comment: null,
        })),
        profiles: [
          { name: "30_MEGAS", rate_limit: "30M/30M", local_address: "10.10.10.1", remote_address: null, only_one: "yes" },
          { name: "60_MEGAS", rate_limit: "60M/60M", local_address: "10.10.10.1", remote_address: null, only_one: "yes" },
          { name: "100_MEGAS", rate_limit: "80M/100M", local_address: "10.10.11.1", remote_address: null, only_one: "yes" },
        ],
      }),
    );
  },




  async ping(router: MtRouter) {
    // Cache de ping: mantiene "último estado bueno" 45s.
    // Deduplica llamadas concurrentes (varias vistas piden ping a la vez).
    const cache = pingCache.get(router.id);
    const now = Date.now();
    if (cache?.inflight) return cache.inflight;
    if (cache && cache.ok && (now - cache.at) < 45_000) {
      return { ok: true as const, latency_ms: cache.latency_ms, cached: true as const };
    }
    const p = real(
      router,
      "ping",
      async () => withSession(router, async (s) => {
        const t0 = Date.now();
        await sendCommand(s, ["/system/identity/print"]);
        return { ok: true as const, latency_ms: Date.now() - t0 };
      }),
      () => simulate("ping", { host: router.ip_address }, { ok: true as const, latency_ms: Math.floor(5 + Math.random() * 30) }),
    ).then((r) => {
      pingCache.set(router.id, { ok: true, latency_ms: r.latency_ms, at: Date.now() });
      return r;
    }).catch((e) => {
      // Si teníamos un OK reciente (<90s), toleramos el fallo y devolvemos cached.
      const prev = pingCache.get(router.id);
      if (prev?.ok && (Date.now() - prev.at) < 90_000) {
        return { ok: true as const, latency_ms: prev.latency_ms, stale: true as const };
      }
      pingCache.set(router.id, { ok: false, latency_ms: 0, at: Date.now() });
      throw e;
    }).finally(() => {
      const c = pingCache.get(router.id);
      if (c) c.inflight = undefined;
    });
    pingCache.set(router.id, { ...(cache ?? { ok: false, latency_ms: 0, at: 0 }), inflight: p });
    return p;
  },


  // -------- PPP Profile (rate-limit) --------
  async upsertPppProfile(router: MtRouter, args: { name: string; rateDown: number; rateUp: number; burst?: boolean; walledGardenIp?: string | null }) {
    return real(
      router,
      "ppp/profile/upsert",
      async () => withSession(router, async (s) => {
        // Política: NO sobreescribir rate-limit en MikroTik. El router manda.
        // Si el perfil ya existe → no tocar nada (respetar velocidades del router).
        // Si no existe → crearlo SIN rate-limit (el admin lo configura en MikroTik).
        const found = await sendCommand(s, ["/ppp/profile/print", `?name=${args.name}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        if (id) return { ok: true as const, updated: false };
        const res = await sendCommand(s, ["/ppp/profile/add", `=name=${args.name}`, "=local-address=10.10.0.1"]);
        const trap = res.find((r) => r.reply === "!trap");
        if (trap) throw new Error(trap.attrs.message || "profile add failed");
        return { ok: true as const, updated: false };
      }),
      () => simulate("ppp/profile/upsert", { router: router.name, ...args }, { ok: true as const, updated: false }),
    );
  },

  // Cambia el perfil de un secret PPPoE (usado para mover a "sistema_cortados" y volver)
  async setPppoeProfile(router: MtRouter, args: { user: string; profile: string }) {
    return real(
      router,
      "ppp/secret/set-profile",
      async () => withSession(router, async (s) => {
        const found = await sendCommand(s, ["/ppp/secret/print", `?name=${args.user}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        if (!id) throw new Error(`user ${args.user} not found`);
        const res = await sendCommand(s, ["/ppp/secret/set", `=.id=${id}`, `=profile=${args.profile}`]);
        const trap = res.find((r) => r.reply === "!trap");
        if (trap) throw new Error(trap.attrs.message || "set profile failed");
        // kick sesión activa para forzar reconexión con el nuevo perfil
        const act = await sendCommand(s, ["/ppp/active/print", `?name=${args.user}`, "=.proplist=.id"]);
        const aid = act.find((r) => r.reply === "!re")?.attrs[".id"];
        if (aid) await sendCommand(s, ["/ppp/active/remove", `=.id=${aid}`]);
        return { ok: true as const };
      }),
      () => simulate("ppp/secret/set-profile", { router: router.name, ...args }, { ok: true as const }),
    );
  },

  // Walled garden: crea perfil "sistema_cortados" con rate mínimo + redirect a página de aviso via NAT
  async ensureMorososProfile(router: MtRouter, args: { name: string; noticeIp?: string | null }) {
    return real(
      router,
      "morosos/ensure",
      async () => withSession(router, async (s) => {
        // perfil PPP con rate mínimo
        const found = await sendCommand(s, ["/ppp/profile/print", `?name=${args.name}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        const words = id
          ? ["/ppp/profile/set", `=.id=${id}`, "=rate-limit=64k/64k"]
          : ["/ppp/profile/add", `=name=${args.name}`, "=rate-limit=64k/64k", "=local-address=10.10.99.1"];
        const r1 = await sendCommand(s, words);
        const t1 = r1.find((r) => r.reply === "!trap");
        if (t1) throw new Error(t1.attrs.message || "profile morosos failed");

        // NAT dst-nat 80/443 → walled garden (idempotente por comment)
        if (args.noticeIp) {
          const comment = `morosos-redirect-${args.name}`;
          const existing = await sendCommand(s, ["/ip/firewall/nat/print", `?comment=${comment}`, "=.proplist=.id"]);
          if (!existing.find((r) => r.reply === "!re")) {
            for (const port of ["80", "443"]) {
              await sendCommand(s, [
                "/ip/firewall/nat/add",
                "=chain=dstnat",
                "=protocol=tcp",
                `=dst-port=${port}`,
                "=action=dst-nat",
                `=to-addresses=${args.noticeIp}`,
                "=to-ports=80",
                `=comment=${comment}`,
              ]);
            }
          }
        }
        return { ok: true as const };
      }),
      () => simulate("morosos/ensure", { router: router.name, ...args }, { ok: true as const }),
    );
  },

  // -------- Simple Queue --------
  async upsertQueue(router: MtRouter, args: { name: string; target: string; rateDown: number; rateUp: number; disabled?: boolean }) {
    return real(
      router,
      "queue/simple/upsert",
      async () => withSession(router, async (s) => {
        const found = await sendCommand(s, ["/queue/simple/print", `?name=${args.name}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        const maxLimit = `${args.rateUp}M/${args.rateDown}M`;
        const words = id
          ? ["/queue/simple/set", `=.id=${id}`, `=target=${args.target}`, `=max-limit=${maxLimit}`, `=disabled=${args.disabled ? "yes" : "no"}`]
          : ["/queue/simple/add", `=name=${args.name}`, `=target=${args.target}`, `=max-limit=${maxLimit}`, `=disabled=${args.disabled ? "yes" : "no"}`];
        const res = await sendCommand(s, words);
        const trap = res.find((r) => r.reply === "!trap");
        if (trap) throw new Error(trap.attrs.message || "queue upsert failed");
        return { ok: true as const, updated: !!id };
      }),
      () => simulate("queue/simple/upsert", { router: router.name, ...args }, { ok: true as const, updated: false }),
    );
  },

  async setQueueDisabled(router: MtRouter, args: { name: string; disabled: boolean }) {
    return real(
      router,
      "queue/simple/toggle",
      async () => withSession(router, async (s) => {
        const found = await sendCommand(s, ["/queue/simple/print", `?name=${args.name}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        if (!id) throw new Error(`queue ${args.name} not found`);
        const res = await sendCommand(s, ["/queue/simple/set", `=.id=${id}`, `=disabled=${args.disabled ? "yes" : "no"}`]);
        const trap = res.find((r) => r.reply === "!trap");
        if (trap) throw new Error(trap.attrs.message || "queue toggle failed");
        return { ok: true as const };
      }),
      () => simulate("queue/simple/toggle", { router: router.name, ...args }, { ok: true as const }),
    );
  },

  async removeQueue(router: MtRouter, args: { name: string }) {
    return real(
      router,
      "queue/simple/remove",
      async () => withSession(router, async (s) => {
        const found = await sendCommand(s, ["/queue/simple/print", `?name=${args.name}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        if (!id) return { ok: true as const };
        await sendCommand(s, ["/queue/simple/remove", `=.id=${id}`]);
        return { ok: true as const };
      }),
      () => simulate("queue/simple/remove", { router: router.name, ...args }, { ok: true as const }),
    );
  },

  // -------- Hotspot --------
  async upsertHotspotProfile(router: MtRouter, args: { name: string; rateDown: number; rateUp: number }) {
    return real(
      router,
      "hotspot/user/profile/upsert",
      async () => withSession(router, async (s) => {
        // Política: no sobreescribir rate-limit. Si ya existe, no tocar.
        const found = await sendCommand(s, ["/ip/hotspot/user/profile/print", `?name=${args.name}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        if (id) return { ok: true as const, updated: false };
        const res = await sendCommand(s, ["/ip/hotspot/user/profile/add", `=name=${args.name}`]);
        const trap = res.find((r) => r.reply === "!trap");
        if (trap) throw new Error(trap.attrs.message || "hotspot profile failed");
        return { ok: true as const, updated: false };
      }),
      () => simulate("hotspot/user/profile/upsert", { router: router.name, ...args }, { ok: true as const, updated: false }),
    );
  },

  async createHotspotUser(router: MtRouter, args: { user: string; password: string; profile: string }) {
    return real(
      router,
      "hotspot/user/add",
      async () => withSession(router, async (s) => {
        const res = await sendCommand(s, ["/ip/hotspot/user/add", `=name=${args.user}`, `=password=${args.password}`, `=profile=${args.profile}`]);
        const trap = res.find((r) => r.reply === "!trap");
        if (trap) throw new Error(trap.attrs.message || "hotspot add failed");
        return { ok: true as const };
      }),
      () => simulate("hotspot/user/add", { router: router.name, ...args }, { ok: true as const }),
    );
  },

  async setHotspotUserDisabled(router: MtRouter, args: { user: string; disabled: boolean }) {
    return real(
      router,
      "hotspot/user/toggle",
      async () => withSession(router, async (s) => {
        const found = await sendCommand(s, ["/ip/hotspot/user/print", `?name=${args.user}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        if (!id) throw new Error(`hotspot user ${args.user} not found`);
        await sendCommand(s, ["/ip/hotspot/user/set", `=.id=${id}`, `=disabled=${args.disabled ? "yes" : "no"}`]);
        // kick sesión activa
        const act = await sendCommand(s, ["/ip/hotspot/active/print", `?user=${args.user}`, "=.proplist=.id"]);
        const aid = act.find((r) => r.reply === "!re")?.attrs[".id"];
        if (aid) await sendCommand(s, ["/ip/hotspot/active/remove", `=.id=${aid}`]);
        return { ok: true as const };
      }),
      () => simulate("hotspot/user/toggle", { router: router.name, ...args }, { ok: true as const }),
    );
  },

  async removeHotspotUser(router: MtRouter, args: { user: string }) {
    return real(
      router,
      "hotspot/user/remove",
      async () => withSession(router, async (s) => {
        const found = await sendCommand(s, ["/ip/hotspot/user/print", `?name=${args.user}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        if (!id) return { ok: true as const };
        await sendCommand(s, ["/ip/hotspot/user/remove", `=.id=${id}`]);
        return { ok: true as const };
      }),
      () => simulate("hotspot/user/remove", { router: router.name, ...args }, { ok: true as const }),
    );
  },

  // -------- Address-list based cutoff (estilo Mikrowisp minimalista) --------
  // Esquema simplificado: 3 filter + 2 NAT. Igual que Mikrowisp.
  //  NAT dstnat  : redirige HTTP:80 de morosos al portal de aviso
  //  NAT srcnat  : masquerade hacia el portal (necesario si vive detrás de VPN)
  //  Filter fwd  : permite DNS UDP:53 (para que Android/iPhone resuelvan)
  //  Filter fwd  : permite tráfico al portal de aviso
  //  Filter fwd  : dropea todo lo demás
  // Sin HTTPS reject, sin input rules, sin DNS NAT redirect: menos reglas =
  // menos cosas que se rompen tras un reboot y comportamiento idéntico a
  // Mikrowisp/MikroSystem.
  async ensureCutoffRules(router: MtRouter, args: { listName?: string; noticeIp?: string | null }) {
    const list = args.listName || "sistema_cortados";
    return real(
      router,
      "cutoff/ensure-rules",
      async () => withSession(router, async (s) => {
        if (!args.noticeIp) return { ok: true as const, skipped: true };
        const natComment = `mw-cutoff-${list}`;
        const srcNatComment = `mw-cutoff-srcnat-${list}`;
        const fwComment = `mw-cutoff-drop-${list}`;
        const acceptComment = `mw-cutoff-portal-${list}`;
        const dnsUdpComment = `mw-cutoff-dns-udp-${list}`;

        // Limpieza: quitar todo lo administrado por versiones anteriores
        // (HTTPS reject, DNS TCP, DNS NAT redirect, input rules) para dejar
        // solo el esquema minimalista.
        const isManagedCutoffComment = (comment: string) => (
          comment === "MikroSystem: bloqueo morosos" ||
          comment.startsWith("MikroSystem: redirige") ||
          comment.startsWith("morosos-redirect-") ||
          comment.startsWith(`mw-cutoff-`) && comment.endsWith(`-${list}`) ||
          comment === natComment ||
          comment === srcNatComment ||
          comment === fwComment ||
          comment === acceptComment ||
          comment === dnsUdpComment
        );
        await removeRulesByCommentMatch(s, "/ip/firewall/nat", isManagedCutoffComment);
        await removeRulesByCommentMatch(s, "/ip/firewall/filter", isManagedCutoffComment);

        // ---- NAT: redirect HTTP:80 al portal ----
        const firstDstNatId = await firstRuleId(s, "/ip/firewall/nat", ["?chain=dstnat"]);
        const natWords = [
          "/ip/firewall/nat/add",
          "=chain=dstnat",
          "=protocol=tcp",
          `=src-address-list=${list}`,
          "=dst-port=80",
          "=dst-address-type=!local",
          "=action=dst-nat",
          `=to-addresses=${args.noticeIp}`,
          "=to-ports=80",
          "=disabled=no",
          `=comment=${natComment}`,
        ];
        if (firstDstNatId) natWords.push(`=place-before=${firstDstNatId}`);
        await addRule(s, natWords, "cutoff nat redirect");

        // ---- NAT: masquerade hacia el portal (necesario si portal está tras VPN) ----
        const firstSrcNatId = await firstRuleId(s, "/ip/firewall/nat", ["?chain=srcnat"]);
        const srcNatWords = [
          "/ip/firewall/nat/add",
          "=chain=srcnat",
          "=protocol=tcp",
          `=src-address-list=${list}`,
          `=dst-address=${args.noticeIp}`,
          "=dst-port=80",
          "=action=masquerade",
          "=disabled=no",
          `=comment=${srcNatComment}`,
        ];
        if (firstSrcNatId) srcNatWords.push(`=place-before=${firstSrcNatId}`);
        await addRule(s, srcNatWords, "cutoff portal masquerade");

        // ---- Filter forward: 3 reglas (DNS accept, portal accept, drop) ----
        const listDrops = await sendCommand(s, [
          "/ip/firewall/filter/print",
          `?src-address-list=${list}`,
          "?chain=forward",
          "?action=drop",
          "=.proplist=.id",
        ]);
        const firstDropId = listDrops.find((r) => r.reply === "!re")?.attrs[".id"] || null;
        const firstForwardId = await firstRuleId(s, "/ip/firewall/filter", ["?chain=forward"]);
        const placeBeforeId = firstDropId || firstForwardId;
        const addBeforeDrop = (words: string[]) => {
          if (placeBeforeId) words.push(`=place-before=${placeBeforeId}`);
          return words;
        };

        // 1) Permitir DNS UDP:53 (para que el celular detecte el portal cautivo)
        await addRule(s, addBeforeDrop([
          "/ip/firewall/filter/add",
          "=chain=forward",
          `=src-address-list=${list}`,
          "=protocol=udp",
          "=dst-port=53",
          "=action=accept",
          "=disabled=no",
          `=comment=${dnsUdpComment}`,
        ]), "cutoff dns udp accept");

        // 2) Permitir tráfico al portal de aviso
        await addRule(s, addBeforeDrop([
          "/ip/firewall/filter/add",
          "=chain=forward",
          `=src-address-list=${list}`,
          `=dst-address=${args.noticeIp}`,
          "=protocol=tcp",
          "=dst-port=80",
          "=action=accept",
          "=disabled=no",
          `=comment=${acceptComment}`,
        ]), "cutoff portal accept");

        // 3) Drop de todo lo demás para morosos
        if (!firstDropId) {
          await addRule(s, [
            "/ip/firewall/filter/add",
            "=chain=forward",
            `=src-address-list=${list}`,
            "=action=drop",
            "=disabled=no",
            `=comment=${fwComment}`,
          ], "cutoff drop");
        }
        return { ok: true as const };
      }),
      () => simulate("cutoff/ensure-rules", { router: router.name, ...args }, { ok: true as const }),
    );
  },



  async addToCutoffList(router: MtRouter, args: { ip: string; listName?: string; comment?: string }) {
    const list = args.listName || "sistema_cortados";
    return real(
      router,
      "cutoff/add-ip",
      async () => withSession(router, async (s) => {
        const found = await sendCommand(s, ["/ip/firewall/address-list/print", `?list=${list}`, `?address=${args.ip}`, "=.proplist=.id"]);
        if (found.find((r) => r.reply === "!re")) return { ok: true as const, already: true };
        const words = ["/ip/firewall/address-list/add", `=list=${list}`, `=address=${args.ip}`];
        if (args.comment) words.push(`=comment=${args.comment}`);
        const res = await sendCommand(s, words);
        const trap = res.find((r) => r.reply === "!trap");
        if (trap) throw new Error(trap.attrs.message || "address-list add failed");
        return { ok: true as const, already: false };
      }),
      () => simulate("cutoff/add-ip", { router: router.name, ...args }, { ok: true as const, already: false }),
    );
  },

  async removeFromCutoffList(router: MtRouter, args: { ip: string; listName?: string }) {
    const list = args.listName || "sistema_cortados";
    return real(
      router,
      "cutoff/remove-ip",
      async () => withSession(router, async (s) => {
        const found = await sendCommand(s, ["/ip/firewall/address-list/print", `?list=${list}`, `?address=${args.ip}`, "=.proplist=.id"]);
        const id = found.find((r) => r.reply === "!re")?.attrs[".id"];
        if (!id) return { ok: true as const, missing: true };
        await sendCommand(s, ["/ip/firewall/address-list/remove", `=.id=${id}`]);
        return { ok: true as const };
      }),
      () => simulate("cutoff/remove-ip", { router: router.name, ...args }, { ok: true as const }),
    );
  },

  async getUserLive(router: MtRouter, args: { user: string }) {
    return real(
      router,
      "ppp/user/live",
      async () => withSession(router, async (s) => {
        const sec = await sendCommand(s, ["/ppp/secret/print", `?name=${args.user}`]);
        const secret = sec.find((r) => r.reply === "!re")?.attrs || null;
        const act = await sendCommand(s, ["/ppp/active/print", `?name=${args.user}`]);
        const active = act.find((r) => r.reply === "!re")?.attrs || null;
        return { ok: true as const, secret, active };
      }),
      () => simulate("ppp/user/live", { router: router.name, ...args }, {
        ok: true as const,
        secret: { name: args.user, password: "sim_password", profile: "default", service: "pppoe", disabled: "false", "remote-address": "10.0.0." + Math.floor(Math.random()*250), "last-logged-out": new Date(Date.now() - 3600e3).toISOString() },
        active: Math.random() > 0.3 ? { name: args.user, address: "10.0.0." + Math.floor(Math.random()*250), uptime: `${Math.floor(Math.random()*48)}h${Math.floor(Math.random()*60)}m`, "caller-id": "AA:BB:CC:" + Math.floor(Math.random()*99) + ":" + Math.floor(Math.random()*99) + ":" + Math.floor(Math.random()*99), service: "pppoe" } : null,
      }),
    );
  },

  // -------- Live health + traffic --------
  async getResource(router: MtRouter) {
    return real(
      router,
      "system/resource/print",
      async () => withSession(router, async (s) => {
        const res = await sendCommand(s, ["/system/resource/print"]);
        const a = res.find((r) => r.reply === "!re")?.attrs || {};
        return {
          ok: true as const,
          cpu_load: parseInt(a["cpu-load"] || "0", 10),
          uptime: a.uptime || "-",
          version: a.version || "-",
          board: a["board-name"] || "-",
          free_memory: parseInt(a["free-memory"] || "0", 10),
          total_memory: parseInt(a["total-memory"] || "1", 10),
          free_hdd: parseInt(a["free-hdd-space"] || "0", 10),
          total_hdd: parseInt(a["total-hdd-space"] || "1", 10),
        };
      }),
      () => simulate("system/resource/print", { router: router.name }, {
        ok: true as const,
        cpu_load: Math.floor(5 + Math.random() * 40),
        uptime: `${Math.floor(Math.random() * 30)}d${Math.floor(Math.random() * 24)}h`,
        version: "6.49.10", board: "CCR1009-7G-1C", 
        free_memory: 800_000_000, total_memory: 2_000_000_000,
        free_hdd: 100_000_000, total_hdd: 128_000_000,
      }),
    );
  },

  async getInterfaces(router: MtRouter) {
    return real(
      router,
      "interface/print",
      async () => withSession(router, async (s) => {
        const res = await sendCommand(s, ["/interface/print", "=.proplist=name,type,running,disabled,rx-byte,tx-byte,mac-address"]);
        return {
          ok: true as const,
          interfaces: res.filter((r) => r.reply === "!re").map((r) => ({
            name: r.attrs.name,
            type: r.attrs.type,
            running: r.attrs.running === "true",
            disabled: r.attrs.disabled === "true",
            rx_byte: parseInt(r.attrs["rx-byte"] || "0", 10),
            tx_byte: parseInt(r.attrs["tx-byte"] || "0", 10),
            mac: r.attrs["mac-address"] || null,
          })),
        };
      }),
      () => simulate("interface/print", { router: router.name }, {
        ok: true as const,
        interfaces: ["ether1-wan", "ether2-lan", "bridge-local", "pppoe-out1"].map((n, i) => ({
          name: n, type: n.startsWith("bridge") ? "bridge" : n.startsWith("pppoe") ? "pppoe-out" : "ether",
          running: true, disabled: false,
          rx_byte: Math.floor(Math.random() * 1e10),
          tx_byte: Math.floor(Math.random() * 1e10),
          mac: `AA:BB:CC:DD:EE:${(i + 10).toString(16).padStart(2, "0")}`,
        })),
      }),
    );
  },

  async monitorTraffic(router: MtRouter, iface: string) {
    return real(
      router,
      "interface/monitor-traffic",
      async () => withSession(router, async (s) => {
        const res = await sendCommand(s, ["/interface/monitor-traffic", `=interface=${iface}`, "=once="]);
        const a = res.find((r) => r.reply === "!re")?.attrs || {};
        return {
          ok: true as const,
          rx_bps: parseInt(a["rx-bits-per-second"] || "0", 10),
          tx_bps: parseInt(a["tx-bits-per-second"] || "0", 10),
        };
      }),
      () => simulate("interface/monitor-traffic", { router: router.name, iface }, {
        ok: true as const,
        rx_bps: Math.floor(1e6 + Math.random() * 5e7),
        tx_bps: Math.floor(5e5 + Math.random() * 2e7),
      }),
    );
  },

  // Tráfico en vivo de un usuario PPPoE.
  // Estrategia: buscar la sesión activa (interface = "<pppoe-service>-<user>" o "<user>").
  // Si existe interface, usar /interface/monitor-traffic (bps reales).
  // Fallback: leer bytes-in/bytes-out del /ppp/active y devolverlos (el cliente calcula bps por delta).
  async monitorPppoeUser(router: MtRouter, args: { user: string }) {
    return real(
      router,
      "ppp/user/monitor",
      async () => withSession(router, async (s) => {
        const act = await sendCommand(s, ["/ppp/active/print", `?name=${args.user}`]);
        const a = act.find((r) => r.reply === "!re")?.attrs;
        if (!a) return { ok: true as const, online: false, rx_bps: 0, tx_bps: 0, bytes_in: 0, bytes_out: 0 };
        // Probar interfaces candidatas
        const candidates = [
          `<pppoe-${args.user}>`,
          `<${args.user}>`,
          `pppoe-${args.user}`,
          args.user,
        ];
        for (const iface of candidates) {
          try {
            const mt = await sendCommand(s, ["/interface/monitor-traffic", `=interface=${iface}`, "=once="]);
            const t = mt.find((r) => r.reply === "!re")?.attrs;
            if (t && (t["rx-bits-per-second"] || t["tx-bits-per-second"])) {
              return {
                ok: true as const,
                online: true,
                iface,
                address: a.address || null,
                uptime: a.uptime || null,
                rx_bps: parseInt(t["rx-bits-per-second"] || "0", 10),
                tx_bps: parseInt(t["tx-bits-per-second"] || "0", 10),
                bytes_in: parseInt(a["bytes-in"] || "0", 10),
                bytes_out: parseInt(a["bytes-out"] || "0", 10),
              };
            }
          } catch { /* siguiente candidato */ }
        }
        // Fallback sin bps directos
        return {
          ok: true as const,
          online: true,
          iface: null,
          address: a.address || null,
          uptime: a.uptime || null,
          rx_bps: 0,
          tx_bps: 0,
          bytes_in: parseInt(a["bytes-in"] || "0", 10),
          bytes_out: parseInt(a["bytes-out"] || "0", 10),
        };
      }),
      () => simulate("ppp/user/monitor", { router: router.name, ...args }, {
        ok: true as const,
        online: true,
        iface: `<pppoe-${args.user}>`,
        address: "10.0.0." + Math.floor(Math.random() * 250),
        uptime: `${Math.floor(Math.random() * 48)}h${Math.floor(Math.random() * 60)}m`,
        rx_bps: Math.floor(1e6 + Math.random() * 4e7),
        tx_bps: Math.floor(3e5 + Math.random() * 8e6),
        bytes_in: Math.floor(Math.random() * 1e10),
        bytes_out: Math.floor(Math.random() * 1e10),
      }),
    );
  },

  // Desconecta una sesión PPPoE activa por nombre de usuario (kick)
  async kickPPPoESession(router: MtRouter, args: { user: string }) {
    return real(
      router,
      "ppp/active/remove",
      async () => withSession(router, async (s) => {
        const act = await sendCommand(s, ["/ppp/active/print", `?name=${args.user}`, "=.proplist=.id"]);
        const aid = act.find((r) => r.reply === "!re")?.attrs[".id"];
        if (!aid) return { ok: true as const, missing: true };
        const res = await sendCommand(s, ["/ppp/active/remove", `=.id=${aid}`]);
        const trap = res.find((r) => r.reply === "!trap");
        if (trap) throw new Error(trap.attrs.message || "kick failed");
        return { ok: true as const };
      }),
      () => simulate("ppp/active/remove", { router: router.name, ...args }, { ok: true as const }),
    );
  },

  // -------- IP Pools --------
  async listIpPools(router: MtRouter) {
    return real(
      router,
      "ip/pool/print",
      async () => withSession(router, async (s) => {
        const res = await sendCommand(s, ["/ip/pool/print"]);
        const pools = res
          .filter((r) => r.reply === "!re")
          .map((r) => ({
            name: r.attrs.name as string,
            ranges: (r.attrs.ranges as string) || "",
            next_pool: (r.attrs["next-pool"] as string) || null,
          }));
        return { ok: true as const, pools };
      }),
      () => simulate("ip/pool/print", { router: router.name }, {
        ok: true as const,
        pools: [
          { name: "pool-clientes", ranges: "10.10.10.10-10.10.10.254", next_pool: null },
          { name: "pool-hotspot", ranges: "192.168.50.10-192.168.50.254", next_pool: null },
        ],
      }),
    );
  },

  // Devuelve todas las IPs actualmente en uso por PPP secrets (remote-address) + activos + /ip/pool/used
  async listUsedIps(router: MtRouter) {
    return real(
      router,
      "ip/pool/used",
      async () => withSession(router, async (s) => {
        const used = new Set<string>();
        try {
          const r = await sendCommand(s, ["/ip/pool/used/print"]);
          for (const x of r.filter((y) => y.reply === "!re")) {
            if (x.attrs.address) used.add(x.attrs.address);
          }
        } catch { /* older ROS */ }
        try {
          const secs = await sendCommand(s, ["/ppp/secret/print", "=.proplist=remote-address"]);
          for (const x of secs.filter((y) => y.reply === "!re")) {
            const a = x.attrs["remote-address"];
            if (a && /^\d+\.\d+\.\d+\.\d+$/.test(a)) used.add(a);
          }
        } catch { /* ignore */ }
        try {
          const act = await sendCommand(s, ["/ppp/active/print", "=.proplist=address"]);
          for (const x of act.filter((y) => y.reply === "!re")) {
            const a = x.attrs.address;
            if (a && /^\d+\.\d+\.\d+\.\d+$/.test(a)) used.add(a);
          }
        } catch { /* ignore */ }
        return { ok: true as const, ips: Array.from(used) };
      }),
      () => simulate("ip/pool/used", { router: router.name }, { ok: true as const, ips: [] as string[] }),
    );
  },

  // -------- Configuración básica y segura --------
  // SOLO agrega lo mínimo indispensable, con comentario "meganet-panel" para poder
  // deshacer. NO modifica reglas existentes, NO agrega drops, NO toca NAT/DNS/rutas.
  // Todo idempotente: si algo ya existe, se salta.
  async basicSafeSetup(router: MtRouter, args: {
    setIdentity?: boolean;
    enableApi?: boolean;
    allowApiFromVpn?: boolean;
    enableNtp?: boolean;
    dryRun?: boolean;
  }) {
    const steps: Array<{ label: string; command: string; status: "planned" | "ok" | "skipped" | "error"; detail?: string }> = [];
    const plan = (label: string, command: string) => steps.push({ label, command, status: "planned" });

    if (args.setIdentity) plan("Identidad del router", `/system identity set name="${router.name}"`);
    if (args.enableApi) plan("Habilitar servicio API (8728)", `/ip service set api disabled=no port=8728`);
    if (args.allowApiFromVpn) plan(
      "Firewall: permitir API desde OVPN",
      `/ip firewall filter add chain=input protocol=tcp dst-port=8728 in-interface=ovpn-panel action=accept comment="meganet-panel-api" place-before=0`,
    );
    if (args.enableNtp) plan("NTP client (Cloudflare)", `/system ntp client set enabled=yes primary-ntp=162.159.200.1 secondary-ntp=162.159.200.123`);

    if (args.dryRun) return { ok: true as const, dryRun: true as const, steps };

    return real(
      router,
      "basic-safe-setup",
      async () => withSession(router, async (s) => {
        const run = async (idx: number, cmd: string[]) => {
          const res = await sendCommand(s, cmd);
          const trap = res.find((r) => r.reply === "!trap");
          if (trap) { steps[idx].status = "error"; steps[idx].detail = trap.attrs.message || "trap"; throw new Error(trap.attrs.message || "command failed"); }
          steps[idx].status = "ok";
        };

        let i = 0;
        if (args.setIdentity) {
          await run(i, ["/system/identity/set", `=name=${router.name}`]);
          i++;
        }
        if (args.enableApi) {
          const found = await sendCommand(s, ["/ip/service/print", `?name=api`, "=.proplist=.id,disabled,port"]);
          const cur = found.find((r) => r.reply === "!re");
          if (cur && cur.attrs.disabled === "false" && cur.attrs.port === "8728") {
            steps[i].status = "skipped"; steps[i].detail = "ya habilitado";
          } else {
            await run(i, ["/ip/service/set", `=numbers=api`, `=disabled=no`, `=port=8728`]);
          }
          i++;
        }
        if (args.allowApiFromVpn) {
          const existing = await sendCommand(s, ["/ip/firewall/filter/print", `?comment=meganet-panel-api`, "=.proplist=.id"]);
          if (existing.find((r) => r.reply === "!re")) {
            steps[i].status = "skipped"; steps[i].detail = "regla ya existe";
          } else {
            await run(i, [
              "/ip/firewall/filter/add",
              "=chain=input",
              "=protocol=tcp",
              "=dst-port=8728",
              "=in-interface=ovpn-panel",
              "=action=accept",
              "=comment=meganet-panel-api",
              "=place-before=0",
            ]);
          }
          i++;
        }
        if (args.enableNtp) {
          await run(i, ["/system/ntp/client/set", "=enabled=yes", "=primary-ntp=162.159.200.1", "=secondary-ntp=162.159.200.123"]);
          i++;
        }

        return { ok: true as const, dryRun: false as const, steps };
      }),
      () => simulate("basic-safe-setup", { router: router.name, args }, {
        ok: true as const,
        dryRun: false as const,
        steps: steps.map(x => ({ ...x, status: "ok" as const })),
      }),
    );
  },

  // Deshace: elimina reglas con comentario "meganet-panel-*"
  async basicSafeUndo(router: MtRouter) {
    return real(
      router,
      "basic-safe-undo",
      async () => withSession(router, async (s) => {
        let removed = 0;
        const check = await sendCommand(s, ["/ip/firewall/filter/print", `?comment=meganet-panel-api`, "=.proplist=.id"]);
        for (const r of check.filter((r) => r.reply === "!re")) {
          const id = r.attrs[".id"];
          if (id) { await sendCommand(s, ["/ip/firewall/filter/remove", `=.id=${id}`]); removed++; }
        }
        return { ok: true as const, removed };
      }),
      () => simulate("basic-safe-undo", { router: router.name }, { ok: true as const, removed: 0 }),
    );
  },
};




