import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

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
    const { data: routers, error: routerError } = await context.supabase.from("routers").select("id, cutoff_policy_id");
    if (routerError) throw new Error(routerError.message);
    return ((data ?? []) as CutoffPolicy[]).map((p) => ({
      ...p,
      router_ids: (routers ?? []).filter((r: any) => r.cutoff_policy_id === p.id).map((r: any) => r.id as string),
    }));
  });

export const upsertCutoffPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<CutoffPolicy> & { name: string }) => d)
  .handler(async ({ data, context }) => {
    const { router_ids: routerIds, ...policy } = data;
    const { data: result, error } = await context.supabase.rpc("save_cutoff_policy_with_nodes", {
      p_policy: policy as Json,
      ...(routerIds ? { p_router_ids: routerIds } : {}),
    });
    if (error) throw new Error(error.message);
    if (!result || typeof result !== "object" || Array.isArray(result)
      || typeof result.id !== "string" || typeof result.updated_clients !== "number") {
      throw new Error("No se pudo confirmar la actualización de clientes");
    }
    return { ok: true, id: result.id, updatedClients: result.updated_clients };
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
