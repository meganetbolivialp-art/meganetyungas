import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Reincidence report ----------
export const getReincidenceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("cutoff_reincidence_report", {
      p_from: data.from ?? undefined,
      p_to: data.to ?? undefined,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      client_id: string;
      full_name: string;
      phone: string | null;
      cuts: number;
      reactivations: number;
      last_cut_at: string | null;
      classification: string;
    }>;
  });

// ---------- Daily series ----------
export const getDailySeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("cutoff_daily_series", {
      p_from: data.from ?? undefined,
      p_to: data.to ?? undefined,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ day: string; cuts: number; reactivations: number }>;
  });

// ---------- Recovery stats ----------
export const getRecoveryStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("cutoff_recovery_stats", {
      p_from: data.from ?? undefined,
      p_to: data.to ?? undefined,
    });
    if (error) throw new Error(error.message);
    return r as {
      total_cuts: number;
      total_recovered: number;
      avg_recovery_hours: number;
      still_cut: number;
      recovered_amount: number;
      pending_debt: number;
    };
  });

// ---------- Client cutoff history (single client) ----------
export const getClientCutoffHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: summary } = await context.supabase
      .from("client_cutoff_history")
      .select("*")
      .eq("client_id", data.clientId)
      .maybeSingle();

    const { data: events } = await context.supabase
      .from("client_actions")
      .select("id, action, detail, created_at, performed_by")
      .eq("client_id", data.clientId)
      .in("action", ["suspend", "reactivate", "promise"])
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      summary: summary as null | {
        client_id: string;
        full_name: string;
        total_cuts: number;
        total_reactivations: number;
        last_cut_at: string | null;
        last_reactivation_at: string | null;
        classification: string;
      },
      events: (events ?? []) as Array<{
        id: string;
        action: string;
        detail: string | null;
        created_at: string;
        performed_by: string | null;
      }>,
    };
  });

// ---------- Leaks ----------
export const listLeaks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { resolved?: boolean }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("cutoff_leaks")
      .select("id, service_id, client_id, detected_at, traffic_bytes, connections, sample, resolved, resolved_at, clients(full_name, phone), services(ip_address, pppoe_user, routers(name))")
      .order("detected_at", { ascending: false })
      .limit(100);
    if (typeof data.resolved === "boolean") q = q.eq("resolved", data.resolved);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const resolveLeak = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cutoff_leaks")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const detectLeaksNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { runLeakDetection } = await import("./cutoff-monitor.server");
    return runLeakDetection();
  });
