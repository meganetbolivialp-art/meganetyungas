import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin-layout";
import { getRealKpis } from "@/lib/kpis.functions";
import { TrendingUp, TrendingDown, Users, DollarSign, AlertTriangle, Activity } from "lucide-react";

export const Route = createFileRoute("/dashboard/kpis")({
  head: () => ({ meta: [{ title: "KPIs — MegaNet Admin" }, { name: "robots", content: "noindex" }] }),
  component: KpisPage,
});

function Card({ title, value, sub, tone = "primary", Icon }: { title: string; value: string; sub?: string; tone?: string; Icon: any }) {
  const colors: Record<string, string> = {
    primary: "#16a394", info: "#2e9cd6", warn: "#f59e0b", danger: "#ef4444", violet: "#8b5cf6",
  };
  const bg = colors[tone] ?? colors.primary;
  return (
    <div className="rounded-md border bg-card p-5 relative overflow-hidden">
      <Icon className="absolute -right-4 -bottom-4 w-28 h-28 opacity-[0.06]" strokeWidth={1.5} />
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{title}</div>
      <div className="text-3xl font-bold mt-2" style={{ color: bg }}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-2">{sub}</div>}
    </div>
  );
}

function KpisPage() {
  const fetchKpis = useServerFn(getRealKpis);
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetchKpis().then(setD).catch(console.error); }, []);

  if (!d) return <AdminLayout><div className="p-6 text-muted-foreground">Cargando KPIs...</div></AdminLayout>;

  const maxM = Math.max(1, ...d.monthly.map((m: any) => m.amount));
  const bs = (n: number) => `Bs ${Number(n).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <AdminLayout>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Indicadores del negocio</h1>
        <p className="text-sm text-muted-foreground">Métricas reales del mes en curso.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <Card title="Ingresos del mes" value={bs(d.ingMes)}
          sub={`${d.growth >= 0 ? "▲" : "▼"} ${Math.abs(d.growth).toFixed(1)}% vs mes anterior (${bs(d.ingPrev)})`}
          tone={d.growth >= 0 ? "primary" : "danger"} Icon={DollarSign} />
        <Card title="ARPU" value={bs(d.arpu)} sub={`Ingreso promedio por cliente activo (${d.activos})`} tone="info" Icon={Users} />
        <Card title="Morosidad" value={`${d.morosidadPct}%`} sub={`${d.suspendidos} suspendidos / ${d.activos + d.suspendidos} total`} tone="warn" Icon={AlertTriangle} />
        <Card title="Churn mensual" value={`${d.churn}%`} sub="Bajas del último mes" tone={d.churn > 5 ? "danger" : "violet"} Icon={Activity} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <Card title="Cartera pendiente" value={bs(d.deudaPend)} sub="Facturas por cobrar" tone="warn" Icon={DollarSign} />
        <Card title="Cartera vencida" value={bs(d.deudaVenc)} sub="Facturas vencidas" tone="danger" Icon={AlertTriangle} />
        <Card title="Clientes activos" value={String(d.activos)} sub={`${d.suspendidos} suspendidos`} tone="primary" Icon={Users} />
      </div>

      <div className="bg-card rounded-md border overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Ingresos últimos 12 meses</h3>
            <p className="text-[11px] text-muted-foreground">Pagos registrados por mes</p>
          </div>
          <div className="text-right text-xs">
            <div className="font-bold">{bs(d.monthly.reduce((s: number, m: any) => s + m.amount, 0))}</div>
            <div className="text-muted-foreground">Total 12m</div>
          </div>
        </div>
        <div className="p-4 h-[260px] flex items-end gap-2">
          {d.monthly.map((m: any) => {
            const h = Math.max(2, (m.amount / maxM) * 200);
            return (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100">{bs(m.amount)}</div>
                <div className="w-full rounded-t transition-all hover:opacity-80" style={{ height: `${h}px`, background: "#2e9cd6" }} />
                <div className="text-[10px] text-muted-foreground">{m.month.slice(5)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
