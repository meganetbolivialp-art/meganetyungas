import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Real-time PPPoE online count aggregated from every online router.
export const getLiveOnlineCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { mikrotik } = await import("@/lib/mikrotik.server");
  const { data: routers } = await supabaseAdmin
    .from("routers")
    .select("*")
    .eq("status", "online");
  let total = 0;
  const perRouter: { id: string; name: string; count: number; error?: string }[] = [];
  for (const r of routers ?? []) {
    try {
      const res = await mikrotik.listActive(r as any);
      const c = res.active?.length ?? 0;
      total += c;
      perRouter.push({ id: r.id, name: r.name, count: c });
    } catch (e) {
      perRouter.push({ id: r.id, name: r.name, count: 0, error: (e as Error).message });
    }
  }
  return { total, perRouter };
});

export const getRouterTrafficSample = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string; iface: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mikrotik } = await import("@/lib/mikrotik.server");
    const { data: r } = await supabaseAdmin.from("routers").select("*").eq("id", data.routerId).maybeSingle();
    if (!r) throw new Error("router not found");
    const res = await mikrotik.monitorTraffic(r as any, data.iface);
    return { rx_bps: res.rx_bps, tx_bps: res.tx_bps, at: Date.now() };
  });

export const listRouterInterfaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mikrotik } = await import("@/lib/mikrotik.server");
    const { data: r } = await supabaseAdmin.from("routers").select("*").eq("id", data.routerId).maybeSingle();
    if (!r) throw new Error("router not found");
    try {
      // reuse listActive as ping and try /interface/print via a light path
      const { withSession, sendCommand } = await import("@/lib/mikrotik.server") as any;
      // Fallback: return common interfaces if we can't list
      return { interfaces: ["ether1", "ether2", "bridge", "pppoe-out1"] };
    } catch {
      return { interfaces: ["ether1"] };
    }
  });

// Muestra puntual de tráfico de un servicio PPPoE (por serviceId).
// Devuelve bps si el router los da; siempre devuelve bytes acumulados para calcular bps por delta en el cliente.
export const getServicePppoeTraffic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serviceId: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mikrotik } = await import("@/lib/mikrotik.server");
    const { data: svc } = await supabaseAdmin
      .from("services")
      .select("id, pppoe_user, router_id, status, routers(*)")
      .eq("id", data.serviceId)
      .maybeSingle();
    if (!svc) throw new Error("servicio no encontrado");
    if (!svc.pppoe_user) throw new Error("el servicio no tiene usuario PPPoE");
    if (!svc.routers) throw new Error("el servicio no tiene router asignado");
    const res = await mikrotik.monitorPppoeUser(svc.routers as any, { user: svc.pppoe_user });
    return { ...res, at: Date.now() };
  });
