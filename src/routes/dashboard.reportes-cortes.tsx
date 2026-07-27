import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { getReincidenceReport, getDailySeries, getRecoveryStats } from "@/lib/cutoff-monitor.functions";
import { Download, TrendingUp, AlertCircle, Clock, DollarSign } from "lucide-react";

export const Route = createFileRoute("/dashboard/reportes-cortes")({
  head: () => ({
    meta: [
      { title: "Reportes de Cortes — Meganet" },
      { name: "description", content: "Reportes históricos, reincidencia y estadísticas de recuperación de cortes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsPage,
});

function toISODate(d: Date) { return d.toISOString().slice(0, 10); }

function classificationBadge(c: string) {
  const map: Record<string, string> = {
    cronico: "bg-red-600 text-white",
    reincidente: "bg-orange-500 text-white",
    ocasional: "bg-amber-400 text-slate-900",
    nuevo: "bg-slate-200 text-slate-700",
  };
  return map[c] ?? "bg-slate-200";
}

function ReportsPage() {
  const today = new Date();
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
  const [from, setFrom] = useState(toISODate(monthAgo));
  const [to, setTo] = useState(toISODate(today));

  const reinc = useServerFn(getReincidenceReport);
  const series = useServerFn(getDailySeries);
  const stats = useServerFn(getRecoveryStats);

  const reincQ = useQuery({ queryKey: ["rep-reinc", from, to], queryFn: () => reinc({ data: { from, to } }) });
  const seriesQ = useQuery({ queryKey: ["rep-series", from, to], queryFn: () => series({ data: { from, to } }) });
  const statsQ = useQuery({ queryKey: ["rep-stats", from, to], queryFn: () => stats({ data: { from, to } }) });

  const maxCuts = useMemo(() => {
    const rows = seriesQ.data ?? [];
    return Math.max(1, ...rows.map(r => Math.max(r.cuts, r.reactivations)));
  }, [seriesQ.data]);

  function exportCsv() {
    const rows = reincQ.data ?? [];
    const header = ["Cliente", "Teléfono", "Cortes", "Reactivaciones", "Último corte", "Clasificación"];
    const csv = [
      header.join(","),
      ...rows.map(r => [
        `"${r.full_name.replace(/"/g, '""')}"`,
        r.phone ?? "",
        r.cuts,
        r.reactivations,
        r.last_cut_at ?? "",
        r.classification,
      ].join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `reincidencia-cortes-${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const s = statsQ.data;

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">📊 Reportes de Cortes</h1>
            <p className="text-sm text-muted-foreground">Análisis histórico y reincidencia por cliente</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm">Desde</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-2 py-1.5 rounded border text-sm" />
            <label className="text-sm">Hasta</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-2 py-1.5 rounded border text-sm" />
            <button onClick={exportCsv} className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm flex items-center gap-2 hover:bg-emerald-700">
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>

        {/* Stats KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-semibold">
              <AlertCircle className="w-4 h-4 text-red-500" /> Total cortes
            </div>
            <div className="text-2xl font-bold mt-1">{s?.total_cuts ?? "—"}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-semibold">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Recuperados
            </div>
            <div className="text-2xl font-bold mt-1">{s?.total_recovered ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              {s && s.total_cuts > 0 ? `${Math.round((s.total_recovered / s.total_cuts) * 100)}%` : ""}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-semibold">
              <Clock className="w-4 h-4 text-blue-500" /> Reconexión prom.
            </div>
            <div className="text-2xl font-bold mt-1">{s ? `${Number(s.avg_recovery_hours).toFixed(1)}h` : "—"}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase font-semibold">
              <DollarSign className="w-4 h-4 text-teal-500" /> Recuperado
            </div>
            <div className="text-2xl font-bold mt-1">Bs {Number(s?.recovered_amount ?? 0).toFixed(0)}</div>
            <div className="text-xs text-red-600">Deuda: Bs {Number(s?.pending_debt ?? 0).toFixed(0)}</div>
          </div>
        </div>

        {/* Daily series bar chart */}
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold mb-3">Cortes vs Reactivaciones por día</h2>
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1 min-w-full h-40" style={{ minWidth: `${(seriesQ.data?.length ?? 0) * 24}px` }}>
              {(seriesQ.data ?? []).map(row => (
                <div key={row.day} className="flex-1 flex flex-col items-center gap-0.5 min-w-[20px]" title={`${row.day}: ${row.cuts} cortes, ${row.reactivations} reactivaciones`}>
                  <div className="flex items-end gap-0.5 h-32">
                    <div className="w-2 bg-red-500 rounded-t" style={{ height: `${(row.cuts / maxCuts) * 100}%` }} />
                    <div className="w-2 bg-emerald-500 rounded-t" style={{ height: `${(row.reactivations / maxCuts) * 100}%` }} />
                  </div>
                  <div className="text-[9px] text-muted-foreground rotate-45 origin-left mt-1 whitespace-nowrap">
                    {row.day.slice(5)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded" /> Cortes</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded" /> Reactivaciones</span>
          </div>
        </div>

        {/* Reincidence table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Top clientes reincidentes</h2>
            <p className="text-xs text-muted-foreground">Clientes con más cortes en el rango seleccionado</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Teléfono</th>
                  <th className="px-3 py-2 text-center">Cortes</th>
                  <th className="px-3 py-2 text-center">Reactivaciones</th>
                  <th className="px-3 py-2 text-left">Último corte</th>
                  <th className="px-3 py-2 text-left">Clasificación</th>
                </tr>
              </thead>
              <tbody>
                {(reincQ.data ?? []).map(r => (
                  <tr key={r.client_id} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{r.full_name}</td>
                    <td className="px-3 py-2 text-xs">{r.phone ?? "—"}</td>
                    <td className="px-3 py-2 text-center font-bold text-red-600">{r.cuts}</td>
                    <td className="px-3 py-2 text-center">{r.reactivations}</td>
                    <td className="px-3 py-2 text-xs">{r.last_cut_at ? new Date(r.last_cut_at).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${classificationBadge(r.classification)}`}>
                        {r.classification}
                      </span>
                    </td>
                  </tr>
                ))}
                {(reincQ.data?.length ?? 0) === 0 && (
                  <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Sin datos en el rango</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
