import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin-layout";
import { supabase } from "@/integrations/supabase/client";
import { listCutoffs, cutoffKpis } from "@/lib/cutoffs.functions";
import { listLeaks, resolveLeak, detectLeaksNow } from "@/lib/cutoff-monitor.functions";
import { reactivateService } from "@/lib/isp.functions";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, ShieldCheck, Signal,
  Zap, MessageCircle, Eye, RefreshCw, DollarSign,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/cortes-monitor")({
  head: () => ({
    meta: [
      { title: "Monitor de Cortes en Vivo — Meganet" },
      { name: "description", content: "Dashboard en tiempo real de clientes cortados, alertas de fuga y recuperaciones." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MonitorPageRoute,
});

function Kpi({ label, value, color, Icon }: { label: string; value: string | number; color: string; Icon: any }) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-3 shadow-sm">
      <div className="w-11 h-11 rounded-lg grid place-items-center text-white shrink-0" style={{ background: color }}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold truncate">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function daysBadge(d: number) {
  if (d >= 30) return "bg-red-600 text-white";
  if (d >= 15) return "bg-orange-500 text-white";
  if (d >= 7) return "bg-amber-500 text-white";
  return "bg-slate-200 text-slate-700";
}

export function MonitorPageContent() {
  const qc = useQueryClient();
  const list = useServerFn(listCutoffs);
  const kpis = useServerFn(cutoffKpis);
  const leaks = useServerFn(listLeaks);
  const detectNow = useServerFn(detectLeaksNow);
  const doResolve = useServerFn(resolveLeak);
  const doReactivate = useServerFn(reactivateService);

  const listQ = useQuery({ queryKey: ["monitor-cutoffs"], queryFn: () => list(), refetchInterval: 30_000 });
  const kpiQ = useQuery({ queryKey: ["monitor-kpis"], queryFn: () => kpis(), refetchInterval: 30_000 });
  const leaksQ = useQuery({ queryKey: ["monitor-leaks"], queryFn: () => leaks({ data: { resolved: false } }), refetchInterval: 60_000 });

  const [routerFilter, setRouterFilter] = useState("");
  const [daysFilter, setDaysFilter] = useState<"all" | "7" | "15" | "30">("all");

  // Realtime: refresh on service changes
  useEffect(() => {
    const ch = supabase
      .channel("cutoffs-monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "services" }, () => {
        qc.invalidateQueries({ queryKey: ["monitor-cutoffs"] });
        qc.invalidateQueries({ queryKey: ["monitor-kpis"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cutoff_leaks" }, () => {
        qc.invalidateQueries({ queryKey: ["monitor-leaks"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const routers = useMemo(() => {
    const set = new Set<string>();
    for (const r of listQ.data ?? []) if (r.router_name) set.add(r.router_name);
    return Array.from(set).sort();
  }, [listQ.data]);

  const filtered = useMemo(() => {
    let rows = listQ.data ?? [];
    if (routerFilter) rows = rows.filter(r => r.router_name === routerFilter);
    if (daysFilter !== "all") {
      const min = Number(daysFilter);
      rows = rows.filter(r => (r.days_cut ?? 0) >= min);
    }
    return rows;
  }, [listQ.data, routerFilter, daysFilter]);

  async function handleReactivate(id: string, name: string) {
    if (!confirm(`Reconectar servicio de ${name}?`)) return;
    try {
      await doReactivate({ data: { serviceId: id } });
      toast.success("Servicio reconectado");
      qc.invalidateQueries({ queryKey: ["monitor-cutoffs"] });
      qc.invalidateQueries({ queryKey: ["monitor-kpis"] });
    } catch (e: any) { toast.error(e?.message ?? "Error"); }
  }

  async function handleDetectNow() {
    const t = toast.loading("Escaneando routers...");
    try {
      const r = await detectNow();
      toast.dismiss(t);
      toast.success(`${r.checked} servicios revisados, ${r.leaks_found} fugas detectadas`);
      qc.invalidateQueries({ queryKey: ["monitor-leaks"] });
    } catch (e: any) { toast.dismiss(t); toast.error(e?.message ?? "Error"); }
  }

  const k = kpiQ.data;
  const leaksCount = leaksQ.data?.length ?? 0;

  return (
    <>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Activity className="w-6 h-6 text-emerald-500" />
              Monitor de Cortes en Vivo
              <span className="relative flex h-2 w-2 ml-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            </h1>
            <p className="text-sm text-muted-foreground">Se actualiza automáticamente cada 30s</p>
          </div>
          <div className="flex gap-2">
            <Link to="/dashboard/reportes-cortes" className="px-3 py-2 rounded-md border bg-white text-sm hover:bg-slate-50">
              📊 Reportes
            </Link>
            <button onClick={handleDetectNow} className="px-3 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Detectar fugas ahora
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Cortados ahora" value={k?.total_cut ?? "—"} color="#dc2626" Icon={Signal} />
          <Kpi label="Cortados hoy" value={k?.cut_today ?? "—"} color="#f97316" Icon={Zap} />
          <Kpi label="Reactivados hoy" value={k?.reactivated_today ?? "—"} color="#16a34a" Icon={CheckCircle2} />
          <Kpi label="Recuperado semana" value={`Bs ${Number(k?.recovered_week ?? 0).toFixed(0)}`} color="#0891b2" Icon={DollarSign} />
          <Kpi label="Promesas activas" value={k?.active_promises ?? "—"} color="#7c3aed" Icon={Clock} />
          <Kpi label="VIP protegidos" value={k?.vip_protected ?? "—"} color="#334155" Icon={ShieldCheck} />
        </div>

        {/* Leak alerts */}
        {leaksCount > 0 && (
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-red-900">
                  ⚠️ {leaksCount} cliente{leaksCount === 1 ? "" : "s"} cortado{leaksCount === 1 ? "" : "s"} con tráfico anómalo
                </div>
                <p className="text-sm text-red-800 mt-0.5">
                  Estos servicios están marcados como suspendidos pero aún tienen sesión PPPoE activa en el router.
                </p>
                <div className="mt-3 grid gap-2">
                  {(leaksQ.data ?? []).slice(0, 5).map((l: any) => (
                    <div key={l.id} className="flex items-center justify-between bg-white rounded-md p-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{l.clients?.full_name ?? l.client_id}</div>
                        <div className="text-xs text-muted-foreground">
                          Router: {l.services?.routers?.name ?? "—"} · IP: {l.sample?.address ?? "—"} · uptime: {l.sample?.uptime ?? "—"}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          await doResolve({ data: { id: l.id } });
                          toast.success("Marcado como resuelto");
                          qc.invalidateQueries({ queryKey: ["monitor-leaks"] });
                        }}
                        className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700 shrink-0"
                      >
                        Resolver
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <select value={routerFilter} onChange={e => setRouterFilter(e.target.value)} className="px-3 py-2 rounded-md border text-sm">
            <option value="">Todos los routers</option>
            {routers.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="flex gap-1">
            {(["all", "7", "15", "30"] as const).map(v => (
              <button key={v} onClick={() => setDaysFilter(v)}
                className={`px-3 py-2 rounded-md text-sm border ${daysFilter === v ? "bg-slate-800 text-white" : "bg-white"}`}>
                {v === "all" ? "Todos" : `+${v} días`}
              </button>
            ))}
          </div>
          <div className="ml-auto text-sm text-muted-foreground">
            {filtered.length} de {listQ.data?.length ?? 0} cortados
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Plan</th>
                  <th className="text-left px-3 py-2">Router</th>
                  <th className="text-left px-3 py-2">IP</th>
                  <th className="text-left px-3 py-2">Días</th>
                  <th className="text-right px-3 py-2">Deuda</th>
                  <th className="text-left px-3 py-2">Motivo</th>
                  <th className="text-right px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.service_id} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-medium truncate max-w-[200px]">{r.full_name}</div>
                      <div className="text-xs text-muted-foreground">{r.document ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.plan_name}</td>
                    <td className="px-3 py-2 text-xs">{r.router_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs font-mono">{r.ip_address ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${daysBadge(r.days_cut ?? 0)}`}>
                        {r.days_cut ?? 0}d
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      Bs {Number(r.debt ?? 0).toFixed(0)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[180px]">
                      {r.suspend_reason ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        <Link to="/dashboard/clients/$clientId" params={{ clientId: r.client_id }}
                          className="p-1.5 rounded hover:bg-slate-200" title="Ver cliente">
                          <Eye className="w-4 h-4" />
                        </Link>
                        {r.phone && (
                          <a href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                            className="p-1.5 rounded hover:bg-green-100 text-green-600" title="WhatsApp">
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                        <button onClick={() => handleReactivate(r.service_id, r.full_name)}
                          className="p-1.5 rounded hover:bg-emerald-100 text-emerald-600" title="Reconectar">
                          <Zap className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Sin cortes que mostrar</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function MonitorPageRoute() {
  return (
    <AdminLayout>
      <MonitorPageContent />
    </AdminLayout>
  );
}
