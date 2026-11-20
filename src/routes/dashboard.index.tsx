import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  ArrowUpRight,
  CreditCard,
  MessageCircle,
  Receipt,
  Users,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { TrafficChart } from "@/components/traffic-chart";
import { getLiveOnlineCount } from "@/lib/dashboard.functions";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Inicio — MegaNet Admin" },
      { name: "description", content: "Panel administrativo ISP MegaNet." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardHome,
});

type StatTone = "teal" | "blue" | "violet" | "slate";
type SummaryTone = "teal" | "red" | "pink" | "blue" | "amber" | "violet";

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
}

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return `Hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const dd = Math.floor(h / 24);
  return `Hace ${dd} d`;
}

function StatCard({ label, value, sub, tone, href, cta, Icon }: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  tone: StatTone;
  href: string;
  cta: string;
  Icon: LucideIcon;
}) {
  return (
    <article className={`dash-stat dash-stat--${tone}`}>
      <div className="dash-stat__shine" />
      <Icon className="dash-stat__icon" strokeWidth={1.35} />
      <div className="dash-stat__body">
        <div className="dash-stat__label">{label}</div>
        <div className="dash-stat__value">{value}</div>
        <div className="dash-stat__sub">{sub}</div>
      </div>
      <Link to={href as any} className="dash-stat__link">
        <span>{cta}</span><ArrowUpRight className="h-4 w-4" />
      </Link>
    </article>
  );
}

function SummaryRow({ n, label, value, tone }: {
  n: number;
  label: string;
  value: number | string;
  tone: SummaryTone;
}) {
  return (
    <div className="dash-summary__row">
      <span className="dash-summary__label"><span>{n}.</span>{label}</span>
      <span className={`dash-summary__value dash-summary__value--${tone}`}>{value}</span>
    </div>
  );
}

function DashboardHome() {
  const [s, setS] = useState({ clients: 0, revenueMonth: 0, pending: 0, overdue: 0, tickets: 0, routers: 0, routersOn: 0, services: 0, suspended: 0, active: 0, paidMonth: 0 });
  const [liveOnline, setLiveOnline] = useState<number | null>(null);
  const [firstRouter, setFirstRouter] = useState<string | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [connected, setConnected] = useState<any[]>([]);
  const [weekly, setWeekly] = useState<{ date: string; amount: number }[]>([]);
  const fetchLive = useServerFn(getLiveOnlineCount);
  const { can } = usePermissions();
  const w = (k: string) => can("inicio", `w_${k}`);

  useEffect(() => {
    (async () => {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const weekStart = new Date(Date.now() - 6 * 24 * 3600 * 1000);
      weekStart.setHours(0, 0, 0, 0);
      const [c, a, susp, srv, pend, over, tk, r, ron, income, paid, pays, conn, weekPays] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "suspended"),
        supabase.from("services").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).neq("status", "closed"),
        supabase.from("routers").select("id", { count: "exact", head: true }),
        supabase.from("routers").select("id", { count: "exact", head: true }).eq("status", "online"),
        supabase.from("payments").select("amount, paid_at").gte("paid_at", monthStart),
        supabase.from("invoices").select("amount").eq("status", "paid").gte("updated_at", monthStart),
        supabase.from("payments").select("id, amount, method, paid_at, clients(full_name)").order("paid_at", { ascending: false }).limit(10),
        supabase.from("services").select("id, updated_at, clients(id, full_name)").eq("status", "active").order("updated_at", { ascending: false }).limit(8),
        supabase.from("payments").select("amount, paid_at").gte("paid_at", weekStart.toISOString()),
      ]);
      setS({
        clients: c.count ?? 0,
        active: a.count ?? 0,
        suspended: susp.count ?? 0,
        services: srv.count ?? 0,
        pending: pend.count ?? 0,
        overdue: over.count ?? 0,
        tickets: tk.count ?? 0,
        routers: r.count ?? 0,
        routersOn: ron.count ?? 0,
        revenueMonth: (income.data ?? []).reduce((sum, i) => sum + Number(i.amount), 0),
        paidMonth: (paid.data ?? []).reduce((sum, i) => sum + Number(i.amount), 0),
      });
      setPayments(pays.data ?? []);
      setConnected((conn.data ?? []).map((x: any) => ({ id: x.clients?.id, full_name: x.clients?.full_name, updated_at: x.updated_at })).filter((x: any) => x.full_name));
      const buckets: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        buckets[d.toISOString().slice(0, 10)] = 0;
      }
      (weekPays.data ?? []).forEach((p: any) => {
        const k = new Date(p.paid_at).toISOString().slice(0, 10);
        if (k in buckets) buckets[k] += Number(p.amount);
      });
      setWeekly(Object.entries(buckets).map(([date, amount]) => ({ date, amount })));
      const { data: routerRow } = await supabase.from("routers").select("id").eq("status", "online").limit(1).maybeSingle();
      if (routerRow) setFirstRouter(routerRow.id);
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) return;
        const r = await fetchLive();
        if (alive) setLiveOnline(r.total);
      } catch { /* El último dato conocido permanece visible. */ }
    };
    tick();
    const iv = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const todayTotal = payments.filter((p) => new Date(p.paid_at).toDateString() === new Date().toDateString()).reduce((sum, p) => sum + Number(p.amount), 0);
  const weekTotal = weekly.reduce((a, b) => a + b.amount, 0);
  const maxW = Math.max(1, ...weekly.map((item) => item.amount));
  const totalMes = s.paidMonth + s.revenueMonth || 1;
  const pctPagado = Math.round((s.paidMonth / totalMes) * 100) || 0;
  const C = 2 * Math.PI * 70;
  const dash = (pctPagado / 100) * C;

  const chartPoints = useMemo(() => {
    const width = 560;
    const height = 230;
    const padL = 54;
    const padR = 20;
    const padT = 22;
    const padB = 44;
    const iw = width - padL - padR;
    const ih = height - padT - padB;
    return weekly.map((d, i) => {
      const x = padL + (weekly.length <= 1 ? 0 : (i * iw) / (weekly.length - 1));
      const y = padT + ih - (d.amount / maxW) * ih;
      return { x, y, ...d };
    });
  }, [weekly, maxW]);

  const linePath = chartPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = chartPoints.length
    ? `${linePath} L${chartPoints[chartPoints.length - 1].x},186 L${chartPoints[0].x},186 Z`
    : "";

  return (
    <AdminLayout>
      <section className="dash-welcome">
        <div>
          <div className="dash-eyebrow">PANEL GENERAL</div>
          <h1 className="dash-welcome__title">Bienvenido, <span>MEGANET</span></h1>
          <p className="dash-welcome__subtitle">Tu red, tus clientes y tus cobros en una sola vista.</p>
        </div>
        <div className="dash-live-pill"><Activity className="h-4 w-4" /> Monitoreo en tiempo real</div>
      </section>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {w("clientes") && (
          <StatCard
            label="Clientes online"
            value={liveOnline ?? s.services}
            sub={<><span>PPPoE activos ahora {liveOnline !== null && <b className="dash-live-dot">● EN VIVO</b>}</span><span>Total registrados <b>{s.clients}</b></span></>}
            tone="teal"
            Icon={Users}
            href="/dashboard/clients"
            cta="Ver clientes"
          />
        )}
        {w("transacciones") && (
          <StatCard
            label="Transacciones hoy"
            value={`Bs ${todayTotal.toFixed(2)}`}
            sub={<span>Cobrado este mes <b>Bs {s.revenueMonth.toFixed(2)}</b></span>}
            tone="blue"
            Icon={CreditCard}
            href="/dashboard/payments"
            cta="Ver transacciones"
          />
        )}
        {w("facturas") && (
          <StatCard
            label="Facturas no pagadas"
            value={s.pending + s.overdue}
            sub={<span>Total vencidas <b>{s.overdue}</b></span>}
            tone="violet"
            Icon={Receipt}
            href="/dashboard/invoices"
            cta="Ver facturas"
          />
        )}
        {w("tickets") && (
          <StatCard
            label="Tickets de soporte"
            value={s.tickets}
            sub={<span>Total abiertos <b>{s.tickets}</b></span>}
            tone="slate"
            Icon={MessageCircle}
            href="/dashboard/tickets"
            cta="Ver tickets"
          />
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {w("ingresos") && (
          <section className="dash-chart-card xl:col-span-2">
            <div className="dash-chart-card__header">
              <div>
                <h2>Ingresos de la semana</h2>
                <p>Pagos registrados durante los últimos 7 días</p>
              </div>
              <div className="dash-chart-total">
                <span>Total semana</span>
                <strong>Bs {weekTotal.toFixed(2)}</strong>
              </div>
            </div>
            <div className="dash-chart-card__content">
              <div className="dash-revenue-chart">
                <svg viewBox="0 0 560 230" className="h-full w-full" role="img" aria-label="Ingresos de los últimos siete días">
                  <defs>
                    <linearGradient id="revenueArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" className="dash-revenue-area-start" />
                      <stop offset="100%" className="dash-revenue-area-end" />
                    </linearGradient>
                    <filter id="revenueGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <line key={i} x1="54" y1={22 + i * 41} x2="540" y2={22 + i * 41} className="dash-chart-grid" />
                  ))}
                  {[4, 3, 2, 1, 0].map((i, idx) => (
                    <text key={i} x="4" y={27 + idx * 41} className="dash-chart-axis">
                      Bs {((maxW * i) / 4).toFixed(0)}
                    </text>
                  ))}
                  {areaPath && <path d={areaPath} fill="url(#revenueArea)" />}
                  {linePath && <path d={linePath} className="dash-revenue-line" filter="url(#revenueGlow)" />}
                  {chartPoints.map((p) => (
                    <g key={p.date}>
                      <circle cx={p.x} cy={p.y} r="5" className="dash-revenue-point">
                        <title>{`${p.date}: Bs ${p.amount.toFixed(2)}`}</title>
                      </circle>
                      <text x={p.x} y={216} textAnchor="middle" className="dash-chart-date">
                        {p.date.slice(5).replace("-", "/")}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>

              <div className="dash-donut-wrap">
                <div className="dash-donut">
                  <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
                    <circle cx="100" cy="100" r="70" className="dash-donut-track" />
                    <circle cx="100" cy="100" r="70" className="dash-donut-progress" strokeDasharray={`${dash} ${C}`} />
                  </svg>
                  <div className="dash-donut__label">
                    <strong>{pctPagado}%</strong>
                    <span>Cobrado</span>
                  </div>
                </div>
                <div className="dash-chart-legend">
                  <div><span className="dash-legend-dot dash-legend-dot--paid" /><span><b>Bs {s.paidMonth.toFixed(2)}</b> Pagado</span></div>
                  <div><span className="dash-legend-dot dash-legend-dot--received" /><span><b>Bs {s.revenueMonth.toFixed(2)}</b> Cobrado</span></div>
                </div>
              </div>
            </div>
          </section>
        )}

        {w("resumen") && (
          <section className="dash-summary">
            <div className="dash-summary__header">
              <div>
                <h2>Resumen del sistema</h2>
                <p>Estado general de tu operación</p>
              </div>
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <SummaryRow n={1} label="Routers activos" value={s.routersOn} tone="teal" />
              <SummaryRow n={2} label="Routers desconectados" value={s.routers - s.routersOn} tone="red" />
              <SummaryRow n={3} label="Clientes activos" value={s.active} tone="teal" />
              <SummaryRow n={4} label="Clientes suspendidos" value={s.suspended} tone="pink" />
              <SummaryRow n={5} label="Servicios activos" value={s.services} tone="blue" />
              <SummaryRow n={6} label="Facturas pendientes" value={s.pending} tone="amber" />
              <SummaryRow n={7} label="Facturas vencidas" value={s.overdue} tone="violet" />
            </div>
          </section>
        )}
      </div>

      {firstRouter && w("trafico") && (
        <div className="mb-6">
          <TrafficChart routerId={firstRouter} iface="ether1" intervalMs={3000} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {w("pagos") && (
          <section className="dash-panel">
            <div className="dash-panel__header">
              <div>
                <h2>Últimos pagos registrados</h2>
                <p>Los cobros más recientes de tu equipo</p>
              </div>
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="overflow-x-auto">
              <table className="dash-table">
                <thead>
                  <tr><th>Cliente</th><th>Cobrado</th><th>Método</th><th>Tiempo</th></tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="dash-table__client">{p.clients?.full_name ?? "—"}</td>
                      <td className="dash-table__money">Bs {Number(p.amount).toFixed(2)}</td>
                      <td className="uppercase">{p.method}</td>
                      <td className="text-muted-foreground">{timeAgo(p.paid_at)}</td>
                    </tr>
                  ))}
                  {payments.length === 0 && <tr><td colSpan={4} className="dash-empty">Todavía no hay pagos registrados</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="dash-panel__footer">
              <Link to="/dashboard/payments">Ver todos los pagos <ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </section>
        )}

        {w("conectados") && (
          <section className="dash-panel">
            <div className="dash-panel__header">
              <div>
                <h2>Últimos conectados</h2>
                <p>Clientes con actividad reciente</p>
              </div>
              <Users className="h-5 w-5" />
            </div>
            <div className="dash-connected-grid">
              {connected.map((c, i) => (
                <div key={c.id || i} className="dash-connected">
                  <div className={`dash-avatar dash-avatar--${i % 8}`}>{initials(c.full_name)}</div>
                  <div className="dash-connected__name">{c.full_name}</div>
                  <div className="dash-connected__time">{c.updated_at ? timeAgo(c.updated_at) : ""}</div>
                </div>
              ))}
              {connected.length === 0 && <div className="dash-empty col-span-full">Sin conexiones recientes</div>}
            </div>
            <div className="dash-panel__footer">
              <Link to="/dashboard/clients">Ver todos los clientes <ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
