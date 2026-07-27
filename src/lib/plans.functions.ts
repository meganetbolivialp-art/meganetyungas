import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { planId: string }) => {
    if (!data || typeof data.planId !== "string" || data.planId.trim().length === 0) {
      throw new Error("Plan inválido");
    }
    return { planId: data.planId };
  })
  .handler(async ({ data, context }) => {
    const [adminCheck, planPermission, serviceDeletePermission] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_permission", { _user_id: context.userId, _module: "ajustes", _action: "plans" }),
      context.supabase.rpc("has_permission", { _user_id: context.userId, _module: "servicios", _action: "delete" }),
    ]);

    if (adminCheck.error) throw new Error(adminCheck.error.message);
    if (planPermission.error) throw new Error(planPermission.error.message);
    if (serviceDeletePermission.error) throw new Error(serviceDeletePermission.error.message);

    const allowed = Boolean(adminCheck.data || planPermission.data || serviceDeletePermission.data);
    if (!allowed) throw new Error("No tenés permiso para eliminar planes");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("id,name")
      .eq("id", data.planId)
      .maybeSingle();
    if (planError) throw new Error(planError.message);
    if (!plan) throw new Error("Plan no encontrado");

    const [services, subscriptions, leads] = await Promise.all([
      supabaseAdmin.from("services").select("id", { count: "exact", head: true }).eq("plan_id", data.planId),
      supabaseAdmin.from("subscriptions").select("id", { count: "exact", head: true }).eq("plan_id", data.planId),
      supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).eq("interested_plan_id", data.planId),
    ]);

    if (services.error) throw new Error(services.error.message);
    if (subscriptions.error) throw new Error(subscriptions.error.message);
    if (leads.error) throw new Error(leads.error.message);

    const serviceCount = services.count ?? 0;
    const subscriptionCount = subscriptions.count ?? 0;
    const leadCount = leads.count ?? 0;

    if (serviceCount > 0 || subscriptionCount > 0) {
      const parts = [];
      if (serviceCount > 0) parts.push(`${serviceCount} servicio(s)`);
      if (subscriptionCount > 0) parts.push(`${subscriptionCount} suscripción(es)`);
      throw new Error(`No se puede eliminar: el plan tiene ${parts.join(" y ")} asignado(s). Primero cambiá esos clientes a otro plan.`);
    }

    if (leadCount > 0) {
      const { error: clearError } = await supabaseAdmin
        .from("leads")
        .update({ interested_plan_id: null })
        .eq("interested_plan_id", data.planId);
      if (clearError) throw new Error(clearError.message);
    }

    const { error: deleteError } = await supabaseAdmin.from("plans").delete().eq("id", data.planId);
    if (deleteError) throw new Error(deleteError.message);

    return { ok: true, name: plan.name, clearedLeads: leadCount };
  });