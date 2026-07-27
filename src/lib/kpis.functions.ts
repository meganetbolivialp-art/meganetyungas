import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getRealKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const y = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [payMonth, payPrev, invPend, invOver, activeNow, activePrev, susp, series] = await Promise.all([
      sb.from("payments").select("amount").gte("paid_at", monthStart.toISOString()),
      sb.from("payments").select("amount").gte("paid_at", prevMonthStart.toISOString()).lte("paid_at", prevMonthEnd.toISOString()),
      sb.from("invoices").select("amount").eq("status", "pending"),
      sb.from("invoices").select("amount").eq("status", "overdue"),
      sb.from("services").select("id", { count: "exact", head: true }).eq("status", "active"),
      sb.from("services").select("id", { count: "exact", head: true }).eq("status", "active").lte("created_at", prevMonthEnd.toISOString()),
      sb.from("services").select("id", { count: "exact", head: true }).eq("status", "suspended"),
      sb.from("payments").select("amount, paid_at").gte("paid_at", y.toISOString()),
    ]);

    const sum = (rows: any[] | null | undefined) => (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const ingMes = sum(payMonth.data);
    const ingPrev = sum(payPrev.data);
    const deudaPend = sum(invPend.data);
    const deudaVenc = sum(invOver.data);
    const activos = activeNow.count ?? 0;
    const activosPrev = activePrev.count ?? 0;
    const suspendidos = susp.count ?? 0;
    const total = activos + suspendidos;
    const morosidadPct = total > 0 ? Math.round((suspendidos / total) * 100) : 0;
    const arpu = activos > 0 ? ingMes / activos : 0;
    const churn = activosPrev > 0 ? Math.max(0, activosPrev - activos) / activosPrev : 0;
    const growth = ingPrev > 0 ? ((ingMes - ingPrev) / ingPrev) * 100 : 0;

    // Serie mensual 12m
    const monthly: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthly[d.toISOString().slice(0, 7)] = 0;
    }
    (series.data ?? []).forEach((p: any) => {
      const k = new Date(p.paid_at).toISOString().slice(0, 7);
      if (k in monthly) monthly[k] += Number(p.amount);
    });

    return {
      ingMes, ingPrev, growth,
      deudaPend, deudaVenc,
      activos, suspendidos, morosidadPct,
      arpu, churn: Math.round(churn * 1000) / 10,
      monthly: Object.entries(monthly).map(([month, amount]) => ({ month, amount })),
    };
  });
