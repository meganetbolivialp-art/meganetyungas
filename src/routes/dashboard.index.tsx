import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Users, Receipt, MessageCircle, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { TrafficChart } from "@/components/traffic-chart";
import { getLiveOnlineCount } from "@/lib/dashboard.functions";

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

const AVATAR_COLORS = ["#16a394","#22c55e","#0891b2","#e879a4","#f472b6","#8b5cf6","#f59e0b","#ef4444"];

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0,2).map(s => s[0]).join("").toUpperCase();
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

function StatCard({ label, value, sub, color, href, cta, Icon }: {
  label: string; value: ReactNode; sub: ReactNode; color: string; href: string; cta: string; Icon: any;
}) {
  return (
    <div className="rounded-md overflow-hidden shadow-sm text-white relative" style={{ background: color }}>
      <Icon className="absolute -right-3 -bottom-3 w-32 h-32 text-white/10 pointer-events-none" strokeWidth={1.5} />
      <div className="p-5 relative">
        <div className="text-[11px] uppercase tracking-widest text-white/85 font-semibold">{label}</div>
        <div className="text-[34px] leading-tight font-bold mt-2">{value}</div>
        <div className="text-[13px] text-white/85 mt-3 border-b border-white/25 pb-3">{sub}</div>
      </div>
      <Link to={href as any} className="block px-5 py-2 text-xs text-white/90 hover:bg-black/15 transition-colors text-right relative">
        {cta} →
      </Link>
    </div>
  );
}

function SummaryRow({ n, label, value, color }: { n: number; label: string; value: number | string; color: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b last:border-0 text-sm">
      <span className="text-foreground/80">{n}. {label}</span>
      <span className="min-w-[42px] text-center px-2 py-0.5 rounded text-white text-[11px] font-bold" style={{ background: color }}>{value}</span>
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

  useEffect(() => {
    (async () => {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const weekStart = new Date(Date.now() - 6 * 24 * 3600 * 1000); weekStart.setHours(0,0,0,0);
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
      // Group by day for last 7 days
      const buckets: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
        buckets[d.toISOString().slice(0,10)] = 0;
      }
      (weekPays.data ?? []).forEach((p: any) => {
        const k = new Date(p.paid_at).toISOString().slice(0,10);
        if (k in buckets) buckets[k] += Number(p.amount);
      });
      setWeekly(Object.entries(buckets).map(([date, amount]) => ({ date, amount })));
      const { data: routerRow } = await supabase.from("routers").select("id").eq("status", "online").limit(1).maybeSingle();
      if (routerRow) setFirstRouter(routerRow.id);
    })();
  }, []);

  // Poll live PPPoE count from Mikrotik every 15s (solo con sesión activa)
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        // Sin sesión hydratada el serverFn responde 401 → evitamos la llamada
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) return;
        const r = await fetchLive();
        if (alive) setLiveOnline(r.total);
      } catch { /* ignore */ }
    };
    tick();
    const iv = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const todayTotal = payments.filter(p => new Date(p.paid_at).toDateString() === new Date().toDateString()).reduce((s, p) => s + Number(p.amount), 0);
  const weekTotal = weekly.reduce((a, b) => a + b.amount, 0);
  const maxW = Math.max(1, ...weekly.map(w => w.amount));

  // Donut: pagado vs pendiente del mes
  const totalMes = s.paidMonth + s.revenueMonth || 1;
  const pctPagado = Math.round((s.paidMonth / totalMes) * 100) || 0;
  const C = 2 * Math.PI * 70;
  const dash = (pctPagado / 100) * C;

  const chartPoints = useMemo(() => {
    const w = 400, h = 200, padL = 40, padR = 15, padT = 20, padB = 40;
    const iw = w - padL - padR, ih = h - padT - padB;
    return weekly.map((d, i) => {
      const x = padL + (weekly.length <= 1 ? 0 : (i * iw) / (weekly.length - 1));
      const y = padT + ih - (d.amount / maxW) * ih;
      return { x, y, ...d };
    });
  }, [weekly, maxW]);

  return (
    <AdminLayout>
      {/* Welcome */}
      <div className="mb-5">
        <h1 className="text-xl">
          <span className="font-normal">Bienvenido</span>{" "}
          <span className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">MEGANET ADMINISTRADOR</span>
        </h1>
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <StatCard label="Clientes Online" value={liveOnline ?? s.services}
          sub={<>PPPoE activos ahora {liveOnline !== null && <b className="text-emerald-300">● LIVE</b>}<br/>Total Registrados <b>{s.clients}</b></>}
          color="#16a394" Icon={Users}
          href="/dashboard/clients" cta="Ver clientes" />
        <StatCard label="Transacciones Hoy" value={`Bs ${todayTotal.toFixed(2)}`}
          sub={<>Cobrado este mes <b>Bs {s.revenueMonth.toFixed(2)}</b></>}
          color="#2e9cd6" Icon={CreditCard}
          href="/dashboard/payments" cta="Ver transacciones" />
        <StatCard label="Facturas No Pagadas" value={s.pending + s.overdue}
          sub={<>Total vencidas <b>{s.overdue}</b></>}
          color="#8e5bbf" Icon={Receipt}
          href="/dashboard/invoices" cta="Ver Facturas" />
        <StatCard label="Ticket Soporte" value={s.tickets}
          sub={<>Total Abiertos <b>{s.tickets}</b></>}
          color="#3d4b5c" Icon={MessageCircle}
          href="/dashboard/tickets" cta="Ver Tickets" />
      </div>

      {/* Revenue chart + summary */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        <div className="xl:col-span-2 bg-card rounded-md border overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Ingresos últimos 7 días</h3>
              <p className="text-[11px] text-muted-foreground">Pagos registrados por día</p>
            </div>
            <div className="text-right">
              <div className="font-bold">Bs {weekTotal.toFixed(2)}</div>
              <div className="text-[11px] text-muted-foreground">Total semana</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-4">
            <div className="md:col-span-2 h-[240px] relative">
              <svg viewBox="0 0 400 200" className="w-full h-full">
                {[0,1,2,3,4].map(i => (
                  <line key={i} x1="40" y1={20 + i*40} x2="385" y2={20 + i*40} stroke="currentColor" strokeOpacity="0.08" />
                ))}
                {[4,3,2,1,0].map((i, idx) => (
                  <text key={i} x="5" y={25 + idx*40} fontSize="8" fill="currentColor" opacity="0.55">
                    Bs {((maxW * i) / 4).toFixed(0)}
                  </text>
                ))}
                <polyline fill="none" stroke="#2e9cd6" strokeWidth="2"
                  points={chartPoints.map(p => `${p.x},${p.y}`).join(" ")} />
                {chartPoints.map((p, i) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r="3.5" fill="#2e9cd6" />
                    <text x={p.x} y={190} fontSize="7" textAnchor="middle" fill="currentColor" opacity="0.65">
                      {p.date.slice(5).replace("-", "/")}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            <div className="flex flex-col items-center justify-center">
              <div className="relative w-[170px] h-[170px]">
                <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                  <circle cx="100" cy="100" r="70" fill="none" stroke="#e5e7eb" strokeWidth="22" />
                  <circle cx="100" cy="100" r="70" fill="none" stroke="#16a394" strokeWidth="22"
                    strokeDasharray={`${dash} ${C}`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-2xl font-bold">{pctPagado}%</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Cobrado</div>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs w-full">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{background:"#16a394"}} /><b>Bs {s.paidMonth.toFixed(2)}</b> Pagado</div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{background:"#e5e7eb"}} /><b>Bs {s.revenueMonth.toFixed(2)}</b> Cobrado</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-md border overflow-hidden">
          <div className="px-4 py-3 border-b"><h3 className="font-semibold text-sm">Resumen del sistema</h3></div>
          <SummaryRow n={1} label="Routers Activos" value={s.routersOn} color="#16a394" />
          <SummaryRow n={2} label="Routers desconectados" value={s.routers - s.routersOn} color="#ef4444" />
          <SummaryRow n={3} label="Clientes Activos" value={s.active} color="#16a394" />
          <SummaryRow n={4} label="Clientes suspendidos" value={s.suspended} color="#ec4899" />
          <SummaryRow n={5} label="Servicios Activos" value={s.services} color="#16a394" />
          <SummaryRow n={6} label="Facturas pendientes" value={s.pending} color="#f59e0b" />
          <SummaryRow n={7} label="Facturas vencidas" value={s.overdue} color="#8b5cf6" />
        </div>
      </div>

      {/* Tráfico en vivo del router principal */}
      {firstRouter && (
        <div className="mb-5">
          <TrafficChart routerId={firstRouter} iface="ether1" intervalMs={3000} />
        </div>
      )}


      {/* Payments + connected */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-card rounded-md border overflow-hidden">
          <div className="px-4 py-3 border-b"><h3 className="font-semibold text-sm">Últimos pagos registrados</h3></div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Cobrado</th>
                <th className="px-4 py-2 font-medium">Método</th>
                <th className="px-4 py-2 font-medium">Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2 uppercase text-[12px]">{p.clients?.full_name ?? "—"}</td>
                  <td className="px-4 py-2">Bs {Number(p.amount).toFixed(2)}</td>
                  <td className="px-4 py-2 uppercase text-[12px]">{p.method}</td>
                  <td className="px-4 py-2 text-muted-foreground text-[12px]">{timeAgo(p.paid_at)}</td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Sin pagos</td></tr>}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t text-center">
            <Link to="/dashboard/payments" className="text-xs text-primary hover:underline">Ver todos →</Link>
          </div>
        </div>

        <div className="bg-card rounded-md border overflow-hidden">
          <div className="px-4 py-3 border-b"><h3 className="font-semibold text-sm">Últimos conectados</h3></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
            {connected.map((c, i) => (
              <div key={c.id || i} className="flex flex-col items-center text-center gap-1">
                <div className="w-14 h-14 rounded-full grid place-items-center text-white font-bold text-sm" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                  {initials(c.full_name)}
                </div>
                <div className="text-[11px] font-semibold uppercase truncate max-w-full">{c.full_name}</div>
                <div className="text-[10px] text-muted-foreground">{c.updated_at ? timeAgo(c.updated_at) : ""}</div>
              </div>
            ))}
            {connected.length === 0 && <div className="col-span-full text-center text-muted-foreground text-sm py-6">Sin conexiones</div>}
          </div>
          <div className="px-4 py-2 border-t text-center">
            <Link to="/dashboard/clients" className="text-xs text-primary hover:underline">Ver todos →</Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
