import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CutoffPolicy = {
  id: string;
  name: string;
  description: string | null;
  grace_days: number;
  cut_hour: number;
  cut_day: number | null;
  invoice_day: number | null;
  due_day: number | null;
  router_ids?: string[];
  cut_mode: "ip" | "speed" | "pppoe";
  speed_reduced_kbps: number | null;
  prior_notice_hours: number;
  notify_sms: boolean;
  notify_email: boolean;
  notify_whatsapp: boolean;
  reconnect_fee: number;
  late_fee: number;
  auto_suspend: boolean;
  is_default: boolean;
  is_active: boolean;
};

export const listCutoffPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cutoff_policies")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    const { data: routers } = await context.supabase.from("routers").select("id, cutoff_policy_id");
    return ((data ?? []) as CutoffPolicy[]).map((p) => ({
      ...p,
      router_ids: (routers ?? []).filter((r: any) => r.cutoff_policy_id === p.id).map((r: any) => r.id as string),
    }));
  });

export const upsertCutoffPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<CutoffPolicy> & { name: string }) => d)
  .handler(async ({ data, context }) => {
    const { router_ids: routerIds, ...rest } = data;
    const row: any = { ...rest };
    for (const [k, l] of [["cut_day", "corte"], ["invoice_day", "factura"], ["due_day", "pago"]] as const) {
      if (row[k] != null && (row[k] < 1 || row[k] > 28)) throw new Error(`El día de ${l} debe estar entre 1 y 28`);
    }
    if (row.is_default) {
      await context.supabase.from("cutoff_policies").update({ is_default: false }).neq("id", row.id ?? "00000000-0000-0000-0000-000000000000");
    }
    let id: string;
    if (row.id) {
      const { error } = await context.supabase.from("cutoff_policies").update(row).eq("id", row.id);
      if (error) throw new Error(error.message);
      id = row.id;
    } else {
      delete row.id;
      const { data: ins, error } = await context.supabase.from("cutoff_policies").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      id = ins.id;
    }
    if (routerIds) {
      // Nodos asignados: sus clientes usan esta plantilla salvo que tengan una propia.
      const { error: e1 } = await context.supabase.from("routers").update({ cutoff_policy_id: null }).eq("cutoff_policy_id", id);
      if (e1) throw new Error(e1.message);
      if (routerIds.length) {
        const { error: e2 } = await context.supabase.from("routers").update({ cutoff_policy_id: id }).in("id", routerIds);
        if (e2) throw new Error(e2.message);
      }
    }
    return { ok: true, id };
  });

export const listPolicyRouters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("routers").select("id, name, cutoff_policy_id").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string; cutoff_policy_id: string | null }[];
  });

export const deleteCutoffPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cutoff_policies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const applyCutoffPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { policyId: string; clientIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { data: pol, error: pe } = await context.supabase
      .from("cutoff_policies").select("grace_days, due_day").eq("id", data.policyId).single();
    if (pe || !pol) throw new Error("Plantilla no encontrada");
    const { error } = await context.supabase
      .from("clients")
      .update({ cutoff_policy_id: data.policyId, grace_days_override: pol.grace_days, ...(pol.due_day ? { billing_day: pol.due_day } : {}) })
      .in("id", data.clientIds);
    if (error) throw new Error(error.message);
    for (const cid of data.clientIds) {
      await context.supabase.from("client_actions").insert({
        client_id: cid,
        action: "config",
        detail: `Plantilla de corte aplicada`,
        performed_by: context.userId,
      });
    }
    return { ok: true, count: data.clientIds.length };
  });
