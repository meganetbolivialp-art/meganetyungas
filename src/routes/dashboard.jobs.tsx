import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RefreshCw, Play, CheckCircle2, XCircle, AlertTriangle, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";

export const Route = createFileRoute("/dashboard/jobs")({
  head: () => ({ meta: [
    { title: "Tareas automáticas — MikroSystem ISP" },
    { name: "description", content: "Historial y disparo de tareas programadas: facturación, cortes y reintentos." },
    { property: "og:title", content: "Tareas automáticas — MikroSystem" },
    { property: "og:description", content: "Scheduler de facturación y cortes." },
    { name: "robots", content: "noindex" },
  ]}),
  component: JobsPage,
});

type Run = {
  id: string; job_name: string; status: string;
  started_at: string; finished_at: string | null;
  duration_ms: number | null; detail: any; error: string | null; attempt: number;
};

const BILLING_URL = "/api/public/hooks/billing";

function StatusBadge({ s }: { s: string }) {
  if (s === "success") return <span className="mw-badge mw-badge-green"><CheckCircle2 className="w-3 h-3" /> OK</span>;
  if (s === "partial") return <span className="mw-badge" style={{ background:"#f59e0b22", color:"#b45309", border:"1px solid #f59e0b55" }}><AlertTriangle className="w-3 h-3" /> Parcial</span>;
  if (s === "failed")  return <span className="mw-badge mw-badge-red"><XCircle className="w-3 h-3" /> Falló</span>;
  return <span className="mw-badge" style={{ background:"#3b82f622", color:"#1d4ed8", border:"1px solid #3b82f655" }}><Loader2 className="w-3 h-3 animate-spin" /> En curso</span>;
}

function JobsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("job_runs").select("*").order("started_at", { ascending: false }).limit(100);
    setRuns((data as Run[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const key = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(BILLING_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: "{}",
      });
      const json = await res.json();
      if (json.ok) toast.success(`Ejecutado: ${json.invoicesCreated ?? 0} facturas, ${json.suspended ?? 0} suspendidos`);
      else toast.error(json.error ?? "Falló");
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setRunning(false); }
  };

  const successCount = runs.filter(r => r.status === "success").length;
  const failCount = runs.filter(r => r.status === "failed").length;
  const partialCount = runs.filter(r => r.status === "partial").length;
  const last = runs[0];

  return (
    <AdminLayout>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="mw-panel p-4">
          <div className="text-[11px] uppercase text-muted-foreground">Última ejecución</div>
          <div className="text-sm font-semibold mt-1">{last ? new Date(last.started_at).toLocaleString() : "—"}</div>
          <div className="mt-1">{last ? <StatusBadge s={last.status} /> : null}</div>
        </div>
        <div className="mw-panel p-4"><div className="text-[11px] uppercase text-muted-foreground">Exitosas</div><div className="text-2xl font-bold text-emerald-600">{successCount}</div></div>
        <div className="mw-panel p-4"><div className="text-[11px] uppercase text-muted-foreground">Parciales</div><div className="text-2xl font-bold text-amber-600">{partialCount}</div></div>
        <div className="mw-panel p-4"><div className="text-[11px] uppercase text-muted-foreground">Fallidas</div><div className="text-2xl font-bold text-red-600">{failCount}</div></div>
      </div>

      <div className="mw-panel">
        <div className="mw-panel-header" style={{ background: "#3498db", color: "#fff", borderBottom: 0 }}>
          <div className="mw-panel-title" style={{ color: "#fff" }}>Historial de tareas</div>
          <div className="flex items-center gap-2">
            <button onClick={runNow} disabled={running} className="mw-btn mw-btn-primary">
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Ejecutar ahora
            </button>
            <button onClick={load} className="p-1 hover:bg-white/10 rounded text-white" title="Recargar"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <div className="p-3 border-b bg-muted/30 text-xs text-muted-foreground flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" /> Programado diariamente <b className="mx-1">03:00 UTC</b> · Reintentos automáticos ×3 por servicio.
        </div>

        <div className="overflow-x-auto">
          <table className="mw-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tarea</th>
                <th>Estado</th>
                <th>Duración</th>
                <th>Facturas</th>
                <th>Suspendidos</th>
                <th>Fallos push</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>}
              {!loading && runs.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Sin ejecuciones aún. Presioná "Ejecutar ahora".</td></tr>}
              {runs.map(r => {
                const d = r.detail ?? {};
                const rows = [
                  <tr key={r.id} className="cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <td className="font-mono text-xs">{new Date(r.started_at).toLocaleString()}</td>
                    <td className="text-xs">{r.job_name}</td>
                    <td><StatusBadge s={r.status} /></td>
                    <td className="text-xs">{r.duration_ms ? `${r.duration_ms}ms` : "—"}</td>
                    <td className="text-center">{d.invoicesCreated ?? "—"}</td>
                    <td className="text-center">{d.suspended ?? "—"}</td>
                    <td className="text-center">{d.failedCount ?? 0}</td>
                    <td className="text-xs text-primary">{open === r.id ? "Ocultar" : "Ver detalle"}</td>
                  </tr>
                ];
                if (open === r.id) {
                  rows.push(
                    <tr key={r.id + "-d"}>
                      <td colSpan={8} className="bg-muted/30 p-3">
                        {r.error && <div className="text-red-600 text-xs mb-2"><b>Error:</b> {r.error}</div>}
                        <pre className="text-[11px] whitespace-pre-wrap font-mono">{JSON.stringify(r.detail, null, 2)}</pre>
                      </td>
                    </tr>
                  );
                }
                return rows;
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
