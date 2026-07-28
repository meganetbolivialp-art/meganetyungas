import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin-layout";
import {
  listCutoffs, cutoffKpis, bulkReactivate,
  setPaymentPromise, setDontCut, runScheduledSuspensions,
  listAtRisk, notifyPreCutoff,
} from "@/lib/cutoffs.functions";
import { listCutoffPolicies, applyCutoffPolicy } from "@/lib/cutoff-policies.functions";
import { reactivateService } from "@/lib/isp.functions";
import { ShieldCheck, ShieldOff, Clock, CheckCircle2, XCircle, Search, PlayCircle, CalendarClock, Zap, FileText, AlertTriangle, Send } from "lucide-react";

export const Route = createFileRoute("/dashboard/cutoffs")({
  head: () => ({
    meta: [
      { title: "Cortes / Morosos — MikroSystem" },
      { name: "description", content: "Panel de control de cortes automáticos y clientes suspendidos por deuda." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CutoffsPage,
});

function Kpi({ label, value, color, Icon }: { label: string; value: string | number; color: string; Icon: any }) {
  return (
    <div className="rounded-md border bg-card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-md grid place-items-center text-white" style={{ background: color }}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}

type PromiseTarget = { clientId: string; name: string } | null;

function CutoffsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listCutoffs);
  const kpis = useServerFn(cutoffKpis);
  const doReactivate = useServerFn(reactivateService);
  const bulkReact = useServerFn(bulkReactivate);
  const promise = useServerFn(setPaymentPromise);
  const protect = useServerFn(setDontCut);
  const runSched = useServerFn(runScheduledSuspensions);
  const listPolicies = useServerFn(listCutoffPolicies);
  const applyPolicy = useServerFn(applyCutoffPolicy);
  const atRiskFn = useServerFn(listAtRisk);
  const notifyFn = useServerFn(notifyPreCutoff);
  const [riskOpen, setRiskOpen] = useState(false);
  const riskQ = useQuery({
    queryKey: ["at-risk", 24],
    queryFn: () => atRiskFn({ data: { hours: 24 } }),
    enabled: riskOpen,
  });

  const listQ = useQuery({ queryKey: ["cutoffs"], queryFn: () => list() });
  const kpiQ = useQuery({ queryKey: ["cutoff-kpis"], queryFn: () => kpis() });
  const polQ = useQuery({ queryKey: ["cutoff-policies"], queryFn: () => listPolicies() });

  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [policyId, setPolicyId] = useState<string>("");
  const [promiseModal, setPromiseModal] = useState<PromiseTarget>(null);
  const [promiseDate, setPromiseDate] = useState("");

  const filtered = useMemo(() => {
    const rows = listQ.data ?? [];
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r =>
      r.full_name.toLowerCase().includes(t) ||
      (r.document ?? "").toLowerCase().includes(t) ||
      (r.ip_address ?? "").toLowerCase().includes(t) ||
      (r.plan_name ?? "").toLowerCase().includes(t)
    );
  }, [listQ.data, q]);

  const toggleAll = () => {
    if (sel.size === filtered.length) setSel(new Set());
    else setSel(new Set(filtered.map(r => r.service_id)));
  };
  const toggle = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSel(n);
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["cutoffs"] });
    qc.invalidateQueries({ queryKey: ["cutoff-kpis"] });
  };

  const onReactivateOne = async (id: string) => {
    try {
      await doReactivate({ data: { serviceId: id } });
      toast.success("Servicio reactivado");
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const onBulkReactivate = async () => {
    if (sel.size === 0) return;
    if (!confirm(`¿Reactivar ${sel.size} servicio(s)?`)) return;
    try {
      const r = await bulkReact({ data: { serviceIds: Array.from(sel) } });
      toast.success(`Reactivados: ${r.reactivated}${r.failed ? ` · fallaron: ${r.failed}` : ""}`);
      setSel(new Set());
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const savePromise = async (clear: boolean = false) => {
    if (!promiseModal) return;
    const until = clear ? null : (promiseDate || null);
    try {
      await promise({ data: { clientId: promiseModal.clientId, until } });
      toast.success(until ? `Promesa hasta ${until}` : "Promesa cancelada");
      setPromiseModal(null);
      setPromiseDate("");
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const toggleProtect = async (clientId: string, current: boolean) => {
    try {
      await protect({ data: { clientId, value: !current } });
      toast.success(current ? "Protección quitada" : "Cliente protegido (no cortar)");
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const runScheduledNow = async () => {
    try {
      const r = await runSched();
      toast.success(`Cortes programados ejecutados: ${r.executed}`);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const onApplyPolicy = async () => {
    if (!policyId || sel.size === 0) return;
    const rows = filtered.filter(r => sel.has(r.service_id));
    const clientIds = Array.from(new Set(rows.map(r => r.client_id)));
    try {
      const r = await applyPolicy({ data: { policyId, clientIds } });
      toast.success(`Plantilla aplicada a ${r.count} cliente(s)`);
      setSel(new Set());
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const k = kpiQ.data;
  const totalDebt = filtered.reduce((s, r) => s + Number(r.debt || 0), 0);

  return (
    <AdminLayout>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cortes / Morosos</h1>
          <p className="text-sm text-muted-foreground">Clientes suspendidos por deuda o corte manual</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setRiskOpen(true)}
            className="inline-flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-white px-3 py-2 rounded-md text-sm font-semibold"
          >
            <AlertTriangle className="w-4 h-4" /> En riesgo (24h)
          </button>
          <button
            onClick={async () => {
              if (!confirm("¿Enviar aviso previo a todos los clientes en riesgo (24h)?")) return;
              try {
                const r = await notifyFn({ data: { hours: 24, channel: "whatsapp" } });
                toast.success(`Avisos enviados: ${r.notified}`);
              } catch (e) { toast.error((e as Error).message); }
            }}
            className="inline-flex items-center gap-2 bg-[#2e9cd6] hover:bg-[#1e7bb0] text-white px-3 py-2 rounded-md text-sm font-semibold"
          >
            <Send className="w-4 h-4" /> Avisar previo
          </button>
          <button
            onClick={runScheduledNow}
            className="inline-flex items-center gap-2 bg-[#ff5722] hover:bg-[#e64a19] text-white px-3 py-2 rounded-md text-sm font-semibold"
          >
            <PlayCircle className="w-4 h-4" /> Ejecutar cortes programados
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <Kpi label="Total cortados" value={k?.total_cut ?? "—"} color="#ef4444" Icon={XCircle} />
        <Kpi label="Cortados hoy" value={k?.cut_today ?? "—"} color="#f59e0b" Icon={Zap} />
        <Kpi label="Reactivados hoy" value={k?.reactivated_today ?? "—"} color="#16a394" Icon={CheckCircle2} />
        <Kpi label="Recuperado esta semana" value={`Bs ${Number(k?.recovered_week ?? 0).toFixed(2)}`} color="#2e9cd6" Icon={CheckCircle2} />
        <Kpi label="Promesas activas" value={k?.active_promises ?? "—"} color="#8e5bbf" Icon={Clock} />
        <Kpi label="Clientes protegidos" value={k?.vip_protected ?? "—"} color="#3d4b5c" Icon={ShieldCheck} />
      </div>

      {/* Toolbar */}
      <div className="bg-card border rounded-md p-3 mb-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre, CI, IP o plan…"
            className="w-full pl-9 pr-3 py-2 rounded border bg-background text-sm"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {filtered.length} suspendido(s) · deuda total <b className="text-foreground">Bs {totalDebt.toFixed(2)}</b>
        </div>

        <div className="flex items-center gap-1">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <select
            value={policyId}
            onChange={e => setPolicyId(e.target.value)}
            className="border rounded px-2 py-2 text-sm bg-background"
            title="Plantilla de corte"
          >
            <option value="">Plantilla de corte…</option>
            {(polQ.data ?? []).filter(p => p.is_active).map(p => (
              <option key={p.id} value={p.id}>{p.is_default ? "⭐ " : ""}{p.name}</option>
            ))}
          </select>
          <button
            onClick={onApplyPolicy}
            disabled={!policyId || sel.size === 0}
            className="bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white px-3 py-2 rounded text-sm font-semibold"
            title="Aplicar plantilla a los seleccionados"
          >
            Aplicar ({sel.size})
          </button>
          <Link to="/dashboard/cutoff-policies" className="text-[11px] text-[#ff5722] hover:underline px-1">Gestionar</Link>
        </div>

        <button
          onClick={onBulkReactivate}
          disabled={sel.size === 0}
          className="bg-[#16a394] hover:bg-[#128677] disabled:opacity-40 text-white px-3 py-2 rounded text-sm font-semibold inline-flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" /> Reactivar seleccionados ({sel.size})
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-card border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#1e2a38] text-white text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left w-8">
                  <input type="checkbox" checked={filtered.length > 0 && sel.size === filtered.length} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-left">IP</th>
                <th className="px-3 py-2 text-left">Router</th>
                <th className="px-3 py-2 text-left">Motivo</th>
                <th className="px-3 py-2 text-right">Días</th>
                <th className="px-3 py-2 text-right">Deuda</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading && (
                <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>
              )}
              {!listQ.isLoading && filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                  Sin clientes cortados. ¡Todo al día!
                </td></tr>
              )}
              {filtered.map(r => {
                const hasPromise = !!(r.promise_until && new Date(r.promise_until) >= new Date(new Date().toDateString()));
                return (
                  <tr key={r.service_id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={sel.has(r.service_id)} onChange={() => toggle(r.service_id)} />
                    </td>
                    <td className="px-3 py-2">
                      <Link to="/dashboard/clients/$clientId" params={{ clientId: r.client_id }} className="font-semibold uppercase hover:text-primary">
                        {r.full_name}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">{r.document ?? "—"} · {r.phone ?? "sin tel"}</div>
                    </td>
                    <td className="px-3 py-2">{r.plan_name}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{r.ip_address ?? "—"}</td>
                    <td className="px-3 py-2 text-[12px]">{r.router_name ?? "—"}</td>
                    <td className="px-3 py-2 text-[12px] max-w-[200px] truncate" title={r.suspend_reason ?? ""}>
                      {r.suspend_reason ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{r.days_cut}d</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#ef4444]">
                      Bs {Number(r.debt).toFixed(2)}
                      <div className="text-[10px] text-muted-foreground font-normal">{r.overdue_invoices} vencida(s)</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex flex-col gap-1 items-center">
                        {r.dont_cut && <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">Protegido</span>}
                        {hasPromise && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold uppercase">Promesa {r.promise_until}</span>}
                        {!r.dont_cut && !hasPromise && <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold uppercase">Cortado</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => onReactivateOne(r.service_id)}
                        className="text-[11px] bg-[#16a394] hover:bg-[#128677] text-white px-2 py-1 rounded font-semibold mr-1"
                        title="Reactivar"
                      >Reactivar</button>
                      <button
                        onClick={() => { setPromiseModal({ clientId: r.client_id, name: r.full_name }); setPromiseDate(r.promise_until ?? ""); }}
                        className="text-[11px] bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded font-semibold mr-1 inline-flex items-center gap-1"
                        title="Promesa de pago"
                      ><CalendarClock className="w-3 h-3" /> Promesa</button>
                      <button
                        onClick={() => toggleProtect(r.client_id, r.dont_cut)}
                        className={`text-[11px] px-2 py-1 rounded font-semibold inline-flex items-center gap-1 ${r.dont_cut ? "bg-slate-500 hover:bg-slate-600 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-800"}`}
                        title={r.dont_cut ? "Quitar protección" : "Proteger de cortes automáticos"}
                      >{r.dont_cut ? <ShieldOff className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal promesa */}
      {promiseModal && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={() => setPromiseModal(null)}>
          <div className="bg-card rounded-md border w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Promesa de pago — {promiseModal.name}</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Mientras la promesa esté vigente, el cliente <b>no será cortado</b> por el proceso automático.
            </p>
            <input
              type="date"
              value={promiseDate}
              onChange={e => setPromiseDate(e.target.value)}
              min={new Date().toISOString().slice(0,10)}
              className="w-full border rounded px-3 py-2 text-sm mb-3 bg-background"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPromiseModal(null)} className="px-3 py-2 text-sm border rounded">Cancelar</button>
              <button onClick={() => savePromise(true)} className="px-3 py-2 text-sm border rounded">Quitar promesa</button>
              <button onClick={() => savePromise(false)} disabled={!promiseDate} className="px-3 py-2 text-sm bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded font-semibold">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {riskOpen && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={() => setRiskOpen(false)}>
          <div className="bg-card border rounded-lg p-4 w-full max-w-3xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Clientes en riesgo de corte (próx. 24h)</h2>
              <button onClick={() => setRiskOpen(false)} className="text-sm text-muted-foreground">Cerrar</button>
            </div>
            {riskQ.isLoading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Cargando…</div>
            ) : !riskQ.data?.length ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No hay clientes en riesgo en las próximas 24h.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b">
                  <tr><th className="text-left py-2">Cliente</th><th className="text-left">Teléfono</th><th className="text-right">Deuda</th><th className="text-right">Horas</th></tr>
                </thead>
                <tbody>
                  {(riskQ.data as any[]).map((r: any) => (
                    <tr key={r.invoice_id} className="border-b last:border-0">
                      <td className="py-2">{r.full_name}</td>
                      <td>{r.phone ?? "—"}</td>
                      <td className="text-right">Bs {Number(r.amount).toFixed(2)}</td>
                      <td className="text-right"><span className={`px-2 py-0.5 rounded text-xs ${r.hours_left <= 6 ? "bg-red-500 text-white" : "bg-amber-500 text-white"}`}>{r.hours_left}h</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
