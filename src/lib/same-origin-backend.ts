// When the panel is opened through another address (VPN, port forward), the
// browser cannot reach the LAN backend address baked into the build. Redirect
// those requests to the address the user is actually using (nginx proxies it).
const PRIVATE_HOST = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|localhost$)/;

export function rewriteBackendUrl(url: string, configured: string, origin: string): string {
  if (!configured || !url.startsWith(configured)) return url;
  let cfg: URL;
  try { cfg = new URL(configured); } catch { return url; }
  const here = new URL(origin);
  if (!PRIVATE_HOST.test(cfg.hostname) || cfg.host === here.host) return url;
  return here.origin + url.slice(configured.replace(/\/+$/, "").length);
}

export function installSameOriginBackend() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __mgFetchPatched?: boolean };
  if (w.__mgFetchPatched) return;
  w.__mgFetchPatched = true;
  const configured = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const next = rewriteBackendUrl(raw, configured, window.location.origin);
    if (next === raw) return original(input, init);
    if (input instanceof Request) return original(new Request(next, input), init);
    return original(next, init);
  };
}

installSameOriginBackend();
