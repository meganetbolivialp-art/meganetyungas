import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { getRouterHealth, monitorInterface, kickPPPoESession } from "@/lib/isp.functions";
import { Activity, Cpu, HardDrive, MemoryStick, ArrowLeft, Play, Pause, LogOut, Radio, ArrowDownCircle, ArrowUpCircle, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/routers_/$routerId/monitor")({
  head: () => ({ meta: [
    { title: "Monitor router — MikroSystem ISP" },
    { name: "description", content: "Métricas en vivo: CPU, memoria, tráfico e interfaces." },
    { property: "og:title", content: "Monitor router" },
    { property: "og:description", content: "Métricas en vivo del router." },
    { name: "robots", content: "noindex" },
  ]}),
  component: MonitorPage,
});

function fmtBps(n: number) {
  if (n > 1e9) return (n / 1e9).toFixed(2) + " Gbps";
  if (n > 1e6) return (n / 1e6).toFixed(2) + " Mbps";
  if (n > 1e3) return (n / 1e3).toFixed(1) + " Kbps";
  return n + " bps";
}
function fmtBytes(n: number) {
  if (n > 1e9) return (n / 1e9).toFixed(2) + " GB";
  if (n > 1e6) return (n / 1e6).toFixed(1) + " MB";
  if (n > 1e3) return (n / 1e3).toFixed(0) + " KB";
  return n + " B";
}

function Sparkline({ data, color, max, height = 56, fill = true }: { data: number[]; color: string; max: number; height?: number; fill?: boolean }) {
  const w = 400, h = height;
  if (data.length < 2) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }}>
        <line x1={0} y1={h - 1} x2={w} y2={h - 1} stroke="currentColor" strokeOpacity={0.15} />
      </svg>
    );
  }
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${h - (v / (max || 1)) * (h - 2) - 1}`).join(" ");
  const gid = `g-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: h }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <polyline points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gid})`} stroke="none" />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MonitorPage() {
  const { routerId } = Route.useParams();
  const [router, setRouter] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [iface, setIface] = useState<string>("");
  const [running, setRunning] = useState(true);
  const [rxHist, setRxHist] = useState<number[]>([]);
  const [txHist, setTxHist] = useState<number[]>([]);
  const [cpuHist, setCpuHist] = useState<number[]>([]);
  const [tick, setTick] = useState(0);
  const timer = useRef<any>(null);

  const healthFn = useServerFn(getRouterHealth);
  const monFn = useServerFn(monitorInterface);
  const kickFn = useServerFn(kickPPPoESession);

  const doKick = async (user: string) => {
    if (!confirm(`¿Desconectar sesión de ${user}?`)) return;
    try {
      await kickFn({ data: { routerId, user } });
      toast.success(`Sesión de ${user} desconectada`);
    } catch (e) { toast.error((e as Error).message); }
  };

  useEffect(() => {
    supabase.from("routers").select("*").eq("id", routerId).single().then(({ data }) => setRouter(data));
  }, [routerId]);

  useEffect(() => {
    if (!running) return;
    const run = async () => {
      try {
        const h: any = await healthFn({ data: { routerId } });
        setHealth(h);
        if (h.resource?.cpu_load != null) setCpuHist((p) => [...p.slice(-59), h.resource.cpu_load]);
        if (!iface && h.ifaces?.interfaces?.length) setIface(h.ifaces.interfaces[0].name);
        if (iface) {
          const m: any = await monFn({ data: { routerId, iface } });
          if (m.ok) {
            setRxHist((p) => [...p.slice(-59), m.rx_bps]);
            setTxHist((p) => [...p.slice(-59), m.tx_bps]);
          }
        }
      } catch (e) { console.error(e); }
    };
    run();
    timer.current = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(timer.current);
  }, [running, iface]);

  useEffect(() => { if (tick > 0 && running) {
    (async () => {
      try {
        const h: any = await healthFn({ data: { routerId } });
        setHealth(h);
        if (h.resource?.cpu_load != null) setCpuHist((p) => [...p.slice(-59), h.resource.cpu_load]);
        if (iface) {
          const m: any = await monFn({ data: { routerId, iface } });
          if (m.ok) {
            setRxHist((p) => [...p.slice(-59), m.rx_bps]);
            setTxHist((p) => [...p.slice(-59), m.tx_bps]);
          }
        }
      } catch (e) { console.error(e); }
    })();
  } }, [tick]);

  const res = health?.resource;
  const ifaces = health?.ifaces?.interfaces || [];
  const active = health?.active?.active || [];
  const maxRx = Math.max(1, ...rxHist);
  const maxTx = Math.max(1, ...txHist);
  const maxRxTx = Math.max(maxRx, maxTx);

  return (
    <AdminLayout title={`Monitor: ${router?.name || "…"}`} subtitle={router?.ip_address} breadcrumb={["Red", "Routers", "Monitor"]}>
      {/* Toolbar */}
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link to="/dashboard/routers" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </Link>
          <button
            onClick={() => setRunning((r) => !r)}
            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold text-white shadow-sm transition ${running ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-500 hover:bg-emerald-600"}`}
          >
            {running ? <><Pause className="h-3.5 w-3.5" /> Pausar</> : <><Play className="h-3.5 w-3.5" /> Reanudar</>}
          </button>
          <div className="relative min-w-0 flex-1 sm:min-w-[220px] sm:flex-none">
            <select
              value={iface}
              onChange={(e) => { setIface(e.target.value); setRxHist([]); setTxHist([]); }}
              className="h-8 w-full appearance-none truncate rounded-md border border-border bg-card pl-2.5 pr-7 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {ifaces.map((i: any) => <option key={i.name} value={i.name}>{i.name} ({i.type})</option>)}
            </select>
            <ChevronRight className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-slate-400" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-500 sm:ml-auto">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${running ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
          <span className="hidden sm:inline">Actualiza cada 3s ·</span>
          <span className="font-mono">{health?.at ? new Date(health.at).toLocaleTimeString() : "—"}</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Kpi icon={<Cpu className="h-4 w-4" />} label="CPU" value={res ? `${res.cpu_load}%` : "…"} accent="from-sky-500/15 to-transparent" iconClass="text-sky-500" />
        <Kpi icon={<MemoryStick className="h-4 w-4" />} label="Memoria libre" value={res ? `${((res.free_memory / res.total_memory) * 100).toFixed(0)}%` : "…"} sub={res ? `${fmtBytes(res.free_memory)} / ${fmtBytes(res.total_memory)}` : ""} accent="from-violet-500/15 to-transparent" iconClass="text-violet-500" />
        <Kpi icon={<HardDrive className="h-4 w-4" />} label="Disco libre" value={res ? `${((res.free_hdd / res.total_hdd) * 100).toFixed(0)}%` : "…"} sub={res ? `${fmtBytes(res.free_hdd)} / ${fmtBytes(res.total_hdd)}` : ""} accent="from-amber-500/15 to-transparent" iconClass="text-amber-500" />
        <Kpi icon={<Activity className="h-4 w-4" />} label="Uptime" value={res?.uptime || "…"} sub={res?.version} accent="from-emerald-500/15 to-transparent" iconClass="text-emerald-500" mono />
      </div>

      {/* Charts */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-2">
        <Chart title={`RX ${iface}`} value={fmtBps(rxHist.at(-1) || 0)} color="#10b981" data={rxHist} max={maxRxTx} icon={<ArrowDownCircle className="h-3.5 w-3.5 text-emerald-500" />} />
        <Chart title={`TX ${iface}`} value={fmtBps(txHist.at(-1) || 0)} color="#3b82f6" data={txHist} max={maxRxTx} icon={<ArrowUpCircle className="h-3.5 w-3.5 text-sky-500" />} />
      </div>

      <div className="mb-3 rounded-lg border border-border bg-card p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Activity className="h-3.5 w-3.5 text-rose-500" /> CPU (últimos {cpuHist.length * 3}s)
          </div>
          <div className="font-mono text-xs font-bold text-rose-500">{res ? `${res.cpu_load}%` : "—"}</div>
        </div>
        <Sparkline data={cpuHist} color="#ef4444" max={100} height={44} />
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-[1.15fr_1fr]">
        {/* Interfaces */}
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border bg-slate-50/70 px-3 py-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Radio className="h-3.5 w-3.5 text-primary" /> Interfaces
            </div>
            <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold text-slate-600">{ifaces.length}</span>
          </header>
          {/* Desktop table */}
          <div className="hidden max-h-[420px] overflow-y-auto sm:block">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white/95 backdrop-blur">
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Nombre</th>
                  <th className="px-2 py-2 font-semibold">Tipo</th>
                  <th className="px-2 py-2 font-semibold">Estado</th>
                  <th className="px-2 py-2 text-right font-semibold">RX</th>
                  <th className="px-3 py-2 text-right font-semibold">TX</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ifaces.map((i: any) => (
                  <tr key={i.name} className="hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-mono text-slate-700">{i.name}</td>
                    <td className="px-2 py-1.5"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{i.type}</span></td>
                    <td className="px-2 py-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${i.running ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${i.running ? "bg-emerald-500" : "bg-rose-500"}`} />
                        {i.running ? "up" : "down"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-600">{fmtBytes(i.rx_byte)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-slate-600">{fmtBytes(i.tx_byte)}</td>
                  </tr>
                ))}
                {!ifaces.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Sin interfaces</td></tr>}
              </tbody>
            </table>
          </div>
          {/* Mobile list */}
          <ul className="max-h-[380px] divide-y divide-border overflow-y-auto sm:hidden">
            {ifaces.map((i: any) => (
              <li key={i.name} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs text-slate-700">{i.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span className="rounded bg-slate-100 px-1 py-0.5">{i.type}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${i.running ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                      <span className={`h-1 w-1 rounded-full ${i.running ? "bg-emerald-500" : "bg-rose-500"}`} />
                      {i.running ? "up" : "down"}
                    </span>
                  </div>
                </div>
                <div className="text-right font-mono text-[10px] leading-tight text-slate-500">
                  <div>↓ {fmtBytes(i.rx_byte)}</div>
                  <div>↑ {fmtBytes(i.tx_byte)}</div>
                </div>
              </li>
            ))}
            {!ifaces.length && <li className="px-3 py-6 text-center text-xs text-slate-400">Sin interfaces</li>}
          </ul>
        </section>

        {/* PPPoE */}
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border bg-slate-50/70 px-3 py-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Activity className="h-3.5 w-3.5 text-emerald-500" /> PPPoE activos
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{active.length}</span>
          </header>
          {/* Desktop */}
          <div className="hidden max-h-[420px] overflow-y-auto sm:block">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white/95 backdrop-blur">
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Usuario</th>
                  <th className="px-2 py-2 font-semibold">IP</th>
                  <th className="px-2 py-2 font-semibold">Uptime</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.map((s: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-mono text-slate-700">{s.name}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-600">{s.address}</td>
                    <td className="px-2 py-1.5 text-slate-600">{s.uptime}</td>
                    <td className="pr-2">
                      <button
                        onClick={() => doKick(s.name)}
                        title="Desconectar sesión"
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-rose-500 transition hover:bg-rose-50"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!active.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Sin sesiones</td></tr>}
              </tbody>
            </table>
          </div>
          {/* Mobile */}
          <ul className="max-h-[380px] divide-y divide-border overflow-y-auto sm:hidden">
            {active.map((s: any, i: number) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs text-slate-700">{s.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="font-mono">{s.address}</span>
                    <span>· {s.uptime}</span>
                  </div>
                </div>
                <button
                  onClick={() => doKick(s.name)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-500 active:bg-rose-100"
                  title="Desconectar"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {!active.length && <li className="px-3 py-6 text-center text-xs text-slate-400">Sin sesiones</li>}
          </ul>
        </section>
      </div>
    </AdminLayout>
  );
}

function Kpi({ icon, label, value, sub, accent, iconClass, mono }: any) {
  return (
    <div className={`relative overflow-hidden rounded-lg border border-border bg-card p-3 sm:p-3.5`}>
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent}`} />
      <div className="relative">
        <div className="mb-1 flex items-center gap-1.5">
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/70 shadow-sm ${iconClass}`}>{icon}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        </div>
        <div className={`truncate text-lg font-extrabold text-slate-800 sm:text-xl ${mono ? "font-mono" : ""}`}>{value}</div>
        {sub && <div className="mt-0.5 truncate text-[10px] text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}

function Chart({ title, value, color, data, max, icon }: any) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-3.5">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">{icon}<span className="truncate">{title}</span></div>
        <div className="font-mono text-xs font-bold" style={{ color }}>{value}</div>
      </div>
      <Sparkline data={data} color={color} max={max} height={52} />
    </div>
  );
}
