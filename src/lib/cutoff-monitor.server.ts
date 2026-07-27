// Server-only helper: detect suspended clients that still appear active on Mikrotik.
// Called by both the manual "Detect now" button and the pg_cron hook.

import { createClient } from "@supabase/supabase-js";

const LEAK_MIN_BYTES = 1_000_000; // >1MB in the sample window = suspicious

export async function runLeakDetection() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing Supabase env");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: suspended, error } = await admin
    .from("services")
    .select("id, client_id, pppoe_user, ip_address, router_id, routers(*)")
    .eq("status", "suspended");
  if (error) throw new Error(error.message);

  const { mikrotik } = await import("./mikrotik.server");

  // Group services by router so we hit each router once
  const byRouter = new Map<string, { router: any; svcs: any[] }>();
  for (const s of (suspended ?? []) as any[]) {
    if (!s.routers) continue;
    const g = byRouter.get(s.router_id) ?? { router: s.routers, svcs: [] };
    g.svcs.push(s);
    byRouter.set(s.router_id, g);
  }

  let checked = 0;
  let leaksFound = 0;
  const inserts: any[] = [];

  for (const [, group] of byRouter) {
    const active = await mikrotik.listActive(group.router).catch(() => ({ active: [] as any[] }));
    const activeByUser = new Map<string, any>();
    for (const a of (active as any).active ?? []) {
      if (a?.name) activeByUser.set(String(a.name).toLowerCase(), a);
    }
    for (const s of group.svcs) {
      checked++;
      const user = (s.pppoe_user ?? "").toLowerCase();
      if (!user) continue;
      const hit = activeByUser.get(user);
      if (!hit) continue;
      // Anyone suspended still holding a PPPoE session = potential leak
      leaksFound++;
      inserts.push({
        service_id: s.id,
        client_id: s.client_id,
        traffic_bytes: Number(hit["bytes-in"] ?? 0) + Number(hit["bytes-out"] ?? 0),
        connections: 1,
        sample: { pppoe_user: user, address: hit.address, uptime: hit.uptime },
      });
    }
  }

  if (inserts.length) {
    // Avoid spamming duplicates: only insert if no unresolved leak exists in last 30 min
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from("cutoff_leaks")
      .select("service_id")
      .eq("resolved", false)
      .gte("detected_at", cutoff);
    const seen = new Set((existing ?? []).map((r: any) => r.service_id));
    const fresh = inserts.filter((r) => !seen.has(r.service_id));
    if (fresh.length) await admin.from("cutoff_leaks").insert(fresh);
  }

  return { ok: true, checked, leaks_found: leaksFound, threshold_bytes: LEAK_MIN_BYTES };
}
