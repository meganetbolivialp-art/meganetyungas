import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { AdminLayout } from "@/components/admin-layout";
import {
  getFinanceKpis, getFinanceDaily, getFinanceTopClients,
  getRecentPayments, getFinanceOperators,
} from "@/lib/finance.functions";
import {
  DollarSign, TrendingUp, AlertTriangle, Wallet,
  ArrowUpRight, ArrowDownRight, Receipt, Users, Filter, RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/finanzas")({
  head: () => ({ meta: [{ title: "Finanzas — MikroSystem" }, { name: "robots", content: "noindex" }] }),
  component: FinanzasPage,
});

const bs = (n: number | string | null | undefined) =>
  `Bs ${Number(n ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo", transfer: "Transferencia", qr: "QR", card: "Tarjeta", other: "Otro",
};
const METHOD_COLOR: Record<string, string> = {
  cash: "#10b981", transfer: "#3b82f6", qr: "#8b5cf6", card: "#f59e0b", other: "#64748b",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

function FinanzasPage() {
  const [from, setFrom] = useState(iso(monthStart));
  const [to, setTo] = useState(iso(today));
  const [operator, setOperator] = useState<string>("");

  const filters = useMemo(() => ({ from, to, operator: operator || null }), [from, to, operator]);

  const kpisFn = useServerFn(getFinanceKpis);
  const dailyFn = useServerFn(getFinanceDaily);
  const topFn = useServerFn(getFinanceTopClients);
  const recentFn = useServerFn(getRecentPayments);
  const opsFn = useServerFn(getFinanceOperators);

  const { data: kpis } = useQuery({ queryKey: ["finance-kpis", filters], queryFn: () => kpisFn({ data: filters }), refetchInterval: 30000 });
  const { data: daily = [] } = useQuery({ queryKey: ["finance-daily", filters], queryFn: () => dailyFn({ data: filters }) });
  const { data: top = [] } = useQuery({ queryKey: ["finance-top", filters], queryFn: () => topFn({ data: filters }) });
  const { data: recent = [] } = useQuery({ queryKey: ["finance-recent", filters], queryFn: () => recentFn({ data: filters }), refetchInterval: 15000 });
  const { data: operators = [] } = useQuery({ queryKey: ["finance-ops"], queryFn: () => opsFn() });

  const rangeTotal = Number(kpis?.range_total ?? 0);
  const rangeCount = Number(kpis?.range_count ?? 0);
  const rangeNet = Number(kpis?.range_net ?? 0);
  const rangeExp = Number(kpis?.range_expenses ?? 0);
  const monthTotal = Number(kpis?.month_total ?? 0);
  const prevTotal = Number(kpis?.prev_month_total ?? 0);
  const growth = prevTotal > 0 ? ((monthTotal - prevTotal) / prevTotal) * 100 : monthTotal > 0 ? 100 : 0;
  const collectRate = (() => {
    const invoiced = monthTotal + Number(kpis?.pending_debt ?? 0);
    return invoiced > 0 ? (monthTotal / invoiced) * 100 : 0;
  })();

  const rangeByMethod: Record<string, number> = kpis?.range_by_method ?? {};
  const totalByMethod = Object.values(rangeByMethod).reduce((a: number, b: any) => a + Number(b), 0);
  const maxDaily = Math.max(1, ...daily.map((d: any) => Number(d.income)));

  const setPreset = (kind: "today" | "week" | "month" | "prev_month" | "90d") => {
    const now = new Date();
    if (kind === "today") { setFrom(iso(now)); setTo(iso(now)); }
    else if (kind === "week") { const s = new Date(now); s.setDate(now.getDate() - now.getDay()); setFrom(iso(s)); setTo(iso(now)); }
    else if (kind === "month") { setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1))); setTo(iso(now)); }
    else if (kind === "prev_month") {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      setFrom(iso(s)); setTo(iso(e));
    } else if (kind === "90d") { setFrom(iso(new Date(Date.now() - 90 * 86400_000))); setTo(iso(now)); }
  };

  const reset = () => { setFrom(iso(monthStart)); setTo(iso(today)); setOperator(""); };

  const exportCsv = () => {
    const rows = [["Fecha","Cliente","Método","Referencia","Monto","Operador"]];
    (recent as any[]).forEach(p => rows.push([
      new Date(p.paid_at).toLocaleString("es-BO"),
      p.clients?.full_name ?? "",
      METHOD_LABEL[p.method] ?? p.method,
      p.reference ?? "",
      Number(p.amount).toFixed(2),
      p.profiles?.full_name ?? p.profiles?.email ?? "",
    ]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `finanzas_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="mb-4 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Finanzas</h2>
          <p className="text-sm text-muted-foreground">Recaudación real, egresos y flujo de caja</p>
        </div>
        <button onClick={exportCsv} className="px-3 py-2 rounded-md border text-xs hover:bg-muted">Exportar CSV</button>
      </div>

      {/* Filtros */}
      <div className="bg-card border rounded-lg p-3 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Filter className="w-3.5 h-3.5" /> Filtros
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="px-2 py-1.5 rounded border bg-background text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="px-2 py-1.5 rounded border bg-background text-sm outline-none focus:border-primary" />
        </div>
        <div className="min-w-[180px]">
          <label className="block text-[11px] text-muted-foreground mb-1">Operador</label>
          <select value={operator} onChange={e => setOperator(e.target.value)}
            className="w-full px-2 py-1.5 rounded border bg-background text-sm outline-none focus:border-primary">
            <option value="">Todos los operadores</option>
            {(operators as any[]).map(o => (
              <option key={o.user_id} value={o.user_id}>{o.full_name} ({o.total_payments})</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 flex-wrap">
          {[
            ["today","Hoy"],["week","Semana"],["month","Mes"],["prev_month","Mes anterior"],["90d","90 días"],
          ].map(([k,l]) => (
            <button key={k} onClick={() => setPreset(k as any)}
              className="px-2.5 py-1.5 rounded border text-xs hover:bg-muted">{l}</button>
          ))}
        </div>
        <button onClick={reset} className="px-2.5 py-1.5 rounded border text-xs hover:bg-muted flex items-center gap-1 ml-auto">
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>

      {/* KPI cards principales - RANGO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KpiCard label="Recaudado (rango)" value={bs(rangeTotal)} sub={`${rangeCount} pagos • ${from} → ${to}`} icon={DollarSign} tone="indigo" />
        <KpiCard label="Egresos (rango)" value={bs(rangeExp)} sub="Salidas de caja" icon={ArrowDownRight} tone="red" />
        <KpiCard label="NETO (rango)" value={bs(rangeNet)} sub={rangeNet >= 0 ? "Superávit" : "Déficit"} icon={Receipt} tone={rangeNet >= 0 ? "emerald" : "red"} />
        <KpiCard label="Ticket promedio" value={bs(rangeCount > 0 ? rangeTotal / rangeCount : 0)} sub={`${rangeCount} transacciones`} icon={Users} tone="cyan" />
      </div>

      {/* KPI secundarios */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Hoy" value={bs(kpis?.today_total)} sub={`${kpis?.today_count ?? 0} pagos`} icon={Wallet} tone="emerald" />
        <KpiCard label="Semana" value={bs(kpis?.week_total)} sub="Últimos 7 días" icon={TrendingUp} tone="cyan" />
        <KpiCard
          label="Mes actual"
          value={bs(monthTotal)}
          sub={<span className={growth >= 0 ? "text-white" : "text-white"}>
            {growth >= 0 ? <ArrowUpRight className="inline w-3 h-3" /> : <ArrowDownRight className="inline w-3 h-3" />}
            {growth.toFixed(1)}% vs anterior
          </span>}
          icon={DollarSign} tone="indigo"
        />
        <KpiCard label="Cartera pendiente" value={bs(kpis?.pending_debt)} sub={`Vencida ${bs(kpis?.overdue_debt)} • Cobro ${collectRate.toFixed(0)}%`} icon={AlertTriangle} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-card border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold">Ingresos vs Egresos — {from} → {to}</div>
              <div className="text-xs text-muted-foreground">Serie diaria{operator && " (operador filtrado)"}</div>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Ingresos</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Egresos</span>
            </div>
          </div>
          <div className="flex items-end gap-1 h-48">
            {daily.map((d: any) => {
              const h = (Number(d.income) / maxDaily) * 100;
              const he = (Number(d.expense) / maxDaily) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col justify-end gap-0.5 group relative">
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-10">
                    {d.day.slice(5)}: {bs(d.income)}
                  </div>
                  <div style={{ height: `${he}%` }} className="bg-red-400 rounded-t-sm min-h-[1px]" />
                  <div style={{ height: `${h}%` }} className="bg-emerald-500 rounded-t-sm min-h-[1px] hover:bg-emerald-400" />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
            <span>{daily[0]?.day?.slice(5) ?? ""}</span>
            <span>{daily[Math.floor(daily.length / 2)]?.day?.slice(5) ?? ""}</span>
            <span>{daily[daily.length - 1]?.day?.slice(5) ?? ""}</span>
          </div>
        </div>

        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm font-semibold mb-3">Cobros por método (rango)</div>
          {totalByMethod === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center">Sin pagos en el rango</div>
          ) : (
            <>
              <div className="flex h-3 rounded-full overflow-hidden mb-4">
                {Object.entries(rangeByMethod).map(([m, v]) => (
                  <div key={m} style={{ width: `${(Number(v) / totalByMethod) * 100}%`, background: METHOD_COLOR[m] ?? "#64748b" }} />
                ))}
              </div>
              <div className="space-y-2">
                {Object.entries(rangeByMethod).sort((a, b) => Number(b[1]) - Number(a[1])).map(([m, v]) => (
                  <div key={m} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: METHOD_COLOR[m] ?? "#64748b" }} />
                      {METHOD_LABEL[m] ?? m}
                    </span>
                    <span className="font-semibold">{bs(v)}<span className="text-muted-foreground ml-1">({((Number(v) / totalByMethod) * 100).toFixed(0)}%)</span></span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="text-sm font-semibold">Top clientes (rango)</div>
            <span className="text-xs text-muted-foreground">Por monto</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr><th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-right">Pagos</th><th className="px-3 py-2 text-right">Total</th></tr>
            </thead>
            <tbody>
              {top.length === 0 ? <tr><td colSpan={3} className="text-center py-6 text-muted-foreground text-xs">Sin datos</td></tr>
                : (top as any[]).map(c => (
                <tr key={c.client_id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 truncate max-w-[180px]">{c.full_name}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{c.payments}</td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-600">{bs(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="text-sm font-semibold">Pagos del rango</div>
            <span className="text-xs text-emerald-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> LIVE</span>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground sticky top-0">
                <tr><th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-left">Método</th><th className="px-3 py-2 text-left">Operador</th><th className="px-3 py-2 text-right">Monto</th></tr>
              </thead>
              <tbody>
                {recent.length === 0 ? <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">Sin pagos</td></tr>
                  : (recent as any[]).map(p => (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(p.paid_at).toLocaleString("es-BO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-3 py-2 truncate max-w-[140px]">{p.clients?.full_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: METHOD_COLOR[p.method] ?? "#64748b" }}>
                        {METHOD_LABEL[p.method] ?? p.method}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[120px]">{p.profiles?.full_name ?? p.profiles?.email ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-600">{bs(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function KpiCard({ label, value, sub, icon: Icon, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: any; tone: string }) {
  const tones: Record<string, string> = {
    emerald: "from-emerald-500 to-emerald-600",
    cyan: "from-cyan-500 to-cyan-600",
    indigo: "from-indigo-500 to-indigo-600",
    amber: "from-amber-500 to-amber-600",
    red: "from-red-500 to-red-600",
  };
  return (
    <div className={`relative overflow-hidden rounded-lg p-4 text-white bg-gradient-to-br ${tones[tone]} shadow-sm`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">{label}</div>
          <div className="text-2xl font-bold mt-1 leading-tight truncate">{value}</div>
          {sub && <div className="text-xs opacity-90 mt-1">{sub}</div>}
        </div>
        <Icon className="w-8 h-8 opacity-40" />
      </div>
    </div>
  );
}
