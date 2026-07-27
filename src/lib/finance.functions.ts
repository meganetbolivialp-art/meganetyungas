import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Filters = { from?: string; to?: string; operator?: string | null };

const norm = (f?: Filters) => ({
  p_from: f?.from ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10),
  p_to: f?.to ?? new Date().toISOString().slice(0, 10),
  p_operator: f?.operator || null,
});

export const getFinanceKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Filters | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("finance_kpis" as any, norm(data));
    if (error) throw new Error(error.message);
    return r as any;
  });

export const getFinanceDaily = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Filters | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("finance_daily_series" as any, norm(data));
    if (error) throw new Error(error.message);
    return (rows ?? []) as { day: string; income: number; expense: number; tx_count: number }[];
  });

export const getFinanceTopClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Filters | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("finance_top_clients" as any, { p_limit: 10, ...norm(data) });
    if (error) throw new Error(error.message);
    return (r ?? []) as { client_id: string; full_name: string; total: number; payments: number; last_paid: string }[];
  });

export const getRecentPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Filters | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const f = norm(data);
    let q = context.supabase
      .from("payments")
      .select("id, amount, method, reference, paid_at, created_by, clients(full_name, document)")
      .gte("paid_at", `${f.p_from}T00:00:00`)
      .lte("paid_at", `${f.p_to}T23:59:59`)
      .order("paid_at", { ascending: false })
      .limit(50);
    if (f.p_operator) q = q.eq("created_by", f.p_operator);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.created_by).filter(Boolean)));
    let profilesMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids as string[]);
      for (const p of profs ?? []) profilesMap[(p as any).id] = { full_name: (p as any).full_name, email: (p as any).email };
    }
    return (rows ?? []).map((r: any) => ({ ...r, profiles: r.created_by ? profilesMap[r.created_by] ?? null : null }));
  });

export const getFinanceOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("finance_operators" as any);
    if (error) throw new Error(error.message);
    return (data ?? []) as { user_id: string; full_name: string; email: string; total_payments: number }[];
  });
