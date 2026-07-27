export function parseRouterProfileRate(rate: string | null): { up: number; down: number } {
  if (!rate) return { up: 0, down: 0 };
  const first = rate.trim().split(/\s+/)[0];
  const [u, d] = first.split("/");
  const toM = (s: string) => {
    if (!s) return 0;
    const m = s.match(/^(\d+(?:\.\d+)?)([kKmMgG]?)/);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === "k") return Math.max(1, Math.round(n / 1024));
    if (unit === "g") return Math.round(n * 1024);
    return Math.round(n);
  };
  return { up: toM(u), down: toM(d || u) };
}