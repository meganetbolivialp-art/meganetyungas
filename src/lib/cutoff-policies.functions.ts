import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CutoffPolicy = {
  id: string;
  name: string;
  description: string | null;
  grace_days: number;
  cut_hour: number;
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
    return (data ?? []) as CutoffPolicy[];
  });

export const upsertCutoffPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<CutoffPolicy> & { name: string }) => d)
  .handler(async ({ data, context }) => {
    const row: any = { ...data };
    if (row.is_default) {
      await context.supabase.from("cutoff_policies").update({ is_default: false }).neq("id", row.id ?? "00000000-0000-0000-0000-000000000000");
    }
    if (row.id) {
      const { error } = await context.supabase.from("cutoff_policies").update(row).eq("id", row.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: row.id };
    } else {
      delete row.id;
      const { data: ins, error } = await context.supabase.from("cutoff_policies").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      return { ok: true, id: ins.id };
    }
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
      .from("cutoff_policies").select("grace_days").eq("id", data.policyId).single();
    if (pe || !pol) throw new Error("Plantilla no encontrada");
    const { error } = await context.supabase
      .from("clients")
      .update({ cutoff_policy_id: data.policyId, grace_days_override: pol.grace_days })
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
