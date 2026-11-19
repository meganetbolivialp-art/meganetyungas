export type RouterState = { id: string; name: string; status: string };
export type RouterChange = { id: string; name: string; kind: "down" | "up" };

/** Compara dos lecturas y devuelve los routers que se cayeron o volvieron. La primera lectura no avisa. */
export function diffRouterStatus(prev: RouterState[] | null, next: RouterState[]): RouterChange[] {
  if (!prev) return [];
  const before = new Map(prev.map((r) => [r.id, r.status]));
  const out: RouterChange[] = [];
  for (const r of next) {
    const old = before.get(r.id);
    if (old === undefined || old === r.status) continue;
    if (r.status === "offline" && old !== "offline") out.push({ id: r.id, name: r.name, kind: "down" });
    else if (old === "offline" && r.status === "online") out.push({ id: r.id, name: r.name, kind: "up" });
  }
  return out;
}
