import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin-layout";
import {
  listCutoffs, cutoffKpis, bulkReactivate,
  setPaymentPromise, setDontCut, runScheduledSuspensions,
  listAtRisk, notifyPreCutoff, listManualCutoffCandidates, manualSuspendByRouter,
  type ManualCutoffCandidate,
} from "@/lib/cutoffs.functions";
import { listCutoffPolicies, applyCutoffPolicy } from "@/lib/cutoff-policies.functions";
import { reactivateService } from "@/lib/isp.functions";
import { usePermissions } from "@/hooks/use-permissions";
import { ShieldCheck, ShieldOff, Clock, CheckCircle2, XCircle, Search, PlayCircle, CalendarClock, Zap, FileText, AlertTriangle, Send, Scissors, Router, Loader2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/cutoffs")({
  head: () => ({
    meta: [
      { title: "Cortes / Morosos — MikroSystem" },
      { name: "description", content: "Panel de control de cortes automáticos y clientes suspendidos por deuda." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CutoffsPageRoute,
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

export function CutoffsPageContent() {
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
  const manualListFn = useServerFn(listManualCutoffCandidates);
  const manualSuspendFn = useServerFn(manualSuspendByRouter);
  const { can } = usePermissions();
  const [riskOpen, setRiskOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualRouterId, setManualRouterId] = useState("");
  const [manualSel, setManualSel] = useState<Set<string>>(new Set());
  const [forceExceptions, setForceExceptions] = useState(false);
  const [forceConfirmed, setForceConfirmed] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const manualQ = useQuery({
    queryKey: ["manual-cutoff-candidates"],
    queryFn: () => manualListFn(),
    enabled: manualOpen,
  });
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

  const manualCandidates = useMemo(
    () => (manualQ.data?.candidates ?? []).filter((candidate) => candidate.router_id === manualRouterId),
    [manualQ.data, manualRouterId],
  );
  const manualSelectedRows = manualCandidates.filter((candidate) => manualSel.has(candidate.service_id));
  const manualForcedCount = manualSelectedRows.filter((candidate) => candidate.exception !== null).length;
  const manualSelectable = manualCandidates.filter((candidate) => candidate.exception === null || forceExceptions);

  const toggleManual = (candidate: ManualCutoffCandidate) => {
    if (candidate.exception !== null && !forceExceptions) return;
    const next = new Set(manualSel);
    if (next.has(candidate.service_id)) next.delete(candidate.service_id);
    else next.add(candidate.service_id);
    setManualSel(next);
    setForceConfirmed(false);
  };

  const toggleAllManual = () => {
    const next = new Set(manualSel);
    const allSelected = manualSelectable.length > 0 && manualSelectable.every((candidate) => next.has(candidate.service_id));
    for (const candidate of manualSelectable) {
      if (allSelected) next.delete(candidate.service_id);
      else next.add(candidate.service_id);
    }
    setManualSel(next);
    setForceConfirmed(false);
  };

  const closeManual = () => {
    setManualOpen(false);
    setManualRouterId("");
    setManualSel(new Set());
    setForceExceptions(false);
    setForceConfirmed(false);
  };

  const executeManualCut = async (serviceIds: string[]) => {
    if (!manualRouterId || serviceIds.length === 0 || manualBusy) return;
    const rows = manualCandidates.filter((candidate) => serviceIds.includes(candidate.service_id));
    const forced = rows.filter((candidate) => candidate.exception !== null);
    if (forced.length > 0 && (!forceExceptions || !forceConfirmed)) {
      toast.error("Confirma expresamente el corte de las excepciones seleccionadas");
      return;
    }
    const routerName = manualQ.data?.routers.find((router: { id: string; name: string }) => router.id === manualRouterId)?.name ?? "el nodo";
    if (!confirm(`¿Cortar ahora ${rows.length} servicio(s) de ${routerName}?\n\nSe adelantará la hora programada${forced.length ? ` y se forzarán ${forced.length} excepción(es)` : ""}.`)) return;
    setManualBusy(true);
    try {
      const result = await manualSuspendFn({
        data: { routerId: manualRouterId, serviceIds, forceExceptions },
      });
      toast.success(`Cortes aplicados: ${result.suspended}${result.queued ? ` · en cola: ${result.queued}` : ""}${result.failed ? ` · fallaron: ${result.failed}` : ""}`);
      if (result.skipped.length > 0) toast.warning(result.skipped.slice(0, 3).join(" · "));
      refresh();
      qc.invalidateQueries({ queryKey: ["clients"] });
      await manualQ.refetch();
      if (result.suspended > 0) closeManual();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setManualBusy(false);
    }
  };

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
    <>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cortes / Morosos</h1>
          <p className="text-sm text-muted-foreground">Clientes suspendidos por deuda o corte manual</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {can("cortes", "cut") && (
            <button
              onClick={() => setManualOpen(true)}
              className="inline-flex items-center gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground px-3 py-2 rounded-md text-sm font-semibold"
            >
              <Scissors className="w-4 h-4" /> Cortar ahora por nodo
            </button>
          )}
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
                      <Link
                        to="/dashboard/cortes"
                        search={{ tab: "cobrar", clientId: r.client_id }}
                        className="inline-flex items-center text-[11px] bg-primary hover:bg-primary/90 text-primary-foreground px-2 py-1 rounded font-semibold mr-1"
                        title="Cobrar deuda y reactivar automáticamente"
                      >Cobrar</Link>
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

      {manualOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm p-2 md:p-6 grid place-items-center" onClick={closeManual}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Corte inmediato por nodo"
            data-modal-open
            className="bg-card border rounded-xl shadow-2xl w-full max-w-6xl max-h-[94vh] min-w-0 overflow-hidden flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-4 md:p-5 border-b flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2"><Scissors className="w-5 h-5 text-destructive" /> Cortar ahora por nodo</h2>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">Adelanta cortes por deuda sin esperar la hora configurada.</p>
              </div>
              <button onClick={closeManual} disabled={manualBusy} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted disabled:opacity-40">Cerrar</button>
            </div>

            <div className="p-4 md:p-5 space-y-4 overflow-y-auto">
              <div className="grid md:grid-cols-[minmax(240px,1fr)_auto] gap-3 items-end">
                <label className="text-sm font-semibold">
                  Nodo / router
                  <div className="relative mt-1">
                    <Router className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <select
                      value={manualRouterId}
                      onChange={(event) => {
                        setManualRouterId(event.target.value);
                        setManualSel(new Set());
                        setForceExceptions(false);
                        setForceConfirmed(false);
                      }}
                      className="w-full border rounded-md pl-9 pr-3 py-2.5 bg-background font-normal"
                    >
                      <option value="">Selecciona un nodo…</option>
                      {(manualQ.data?.routers ?? []).map((router: { id: string; name: string; status: string | null }) => (
                        <option key={router.id} value={router.id}>{router.name}{router.status === "offline" ? " (desconectado)" : ""}</option>
                      ))}
                    </select>
                  </div>
                </label>
                {manualRouterId && (
                  <div className="text-sm bg-muted rounded-md px-4 py-2.5">
                    <b>{manualCandidates.length}</b> cliente(s) con corte habilitado · <b>Bs {manualCandidates.reduce((sum, candidate) => sum + candidate.debt, 0).toFixed(2)}</b> vencidos
                  </div>
                )}
              </div>

              {manualRouterId && manualCandidates.some((candidate) => candidate.exception !== null) && (
                <label className="flex items-start gap-3 border border-amber-500/40 bg-amber-500/10 rounded-md p-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={forceExceptions}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setForceExceptions(checked);
                      setForceConfirmed(false);
                      if (!checked) {
                        setManualSel(new Set(Array.from(manualSel).filter((id) => manualCandidates.find((candidate) => candidate.service_id === id)?.exception === null)));
                      }
                    }}
                  />
                  <span>
                    <b>Permitir forzar excepciones</b>
                    <span className="block text-xs text-muted-foreground mt-0.5">Habilita la selección de clientes con promesa vigente o marca “no cortar”. Después deberás confirmarlo otra vez.</span>
                  </span>
                </label>
              )}

              {manualQ.isLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Buscando deudas y cortes pendientes…</div>
              ) : manualQ.isError ? (
                <div className="py-8 text-center text-sm text-destructive">{(manualQ.error as Error).message}</div>
              ) : !manualRouterId ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Elige un nodo para ver los clientes que puedes cortar ahora.</div>
              ) : manualCandidates.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" /> Este nodo no tiene clientes activos con deuda fuera de gracia.</div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[850px]">
                      <thead className="bg-muted text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-3 text-left w-10">
                            <input
                              type="checkbox"
                              aria-label="Seleccionar todos los clientes disponibles"
                              checked={manualSelectable.length > 0 && manualSelectable.every((candidate) => manualSel.has(candidate.service_id))}
                              onChange={toggleAllManual}
                            />
                          </th>
                          <th className="px-3 py-3 text-left">Cliente</th>
                          <th className="px-3 py-3 text-left">Servicio</th>
                          <th className="px-3 py-3 text-right">Deuda vencida</th>
                          <th className="px-3 py-3 text-left">Corte programado</th>
                          <th className="px-3 py-3 text-left">Condición</th>
                          <th className="px-3 py-3 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualCandidates.map((candidate) => {
                          const blocked = candidate.exception !== null && !forceExceptions;
                          return (
                            <tr key={candidate.service_id} className="border-t hover:bg-muted/30">
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  aria-label={`Seleccionar ${candidate.full_name}`}
                                  checked={manualSel.has(candidate.service_id)}
                                  disabled={blocked || manualBusy}
                                  onChange={() => toggleManual(candidate)}
                                />
                              </td>
                              <td className="px-3 py-3">
                                <div className="font-semibold uppercase">{candidate.full_name}</div>
                                <div className="text-xs text-muted-foreground">{candidate.document ?? "Sin documento"} · {candidate.phone ?? "Sin teléfono"}</div>
                              </td>
                              <td className="px-3 py-3">
                                <div>{candidate.plan_name}</div>
                                <div className="text-xs font-mono text-muted-foreground">{candidate.ip_address ?? candidate.pppoe_user ?? "Sin IP"}</div>
                              </td>
                              <td className="px-3 py-3 text-right">
                                <b className="text-destructive">Bs {candidate.debt.toFixed(2)}</b>
                                <div className="text-xs text-muted-foreground">{candidate.overdue_invoices} factura(s)</div>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                {candidate.scheduled_date.split("-").reverse().join("/")} · {String(candidate.cut_hour).padStart(2, "0")}:00
                                <span className="block text-xs text-primary font-medium">Puedes cortarlo ahora</span>
                              </td>
                              <td className="px-3 py-3">
                                {candidate.exception === "dont_cut" && <span className="text-xs font-bold px-2 py-1 rounded bg-muted">NO CORTAR</span>}
                                {candidate.exception === "promise" && <span className="text-xs font-bold px-2 py-1 rounded bg-amber-500/15 text-amber-600">PROMESA VIGENTE</span>}
                                {candidate.exception === null && <span className="text-xs font-bold px-2 py-1 rounded bg-destructive/10 text-destructive">LISTO PARA CORTE</span>}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <button
                                  onClick={() => executeManualCut([candidate.service_id])}
                                  disabled={blocked || manualBusy || (candidate.exception !== null && !forceConfirmed)}
                                  className="inline-flex items-center gap-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-40 px-3 py-1.5 rounded-md text-xs font-semibold"
                                >
                                  <Scissors className="w-3 h-3" /> Cortar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {manualForcedCount > 0 && (
                <label className="flex items-start gap-3 border border-destructive/40 bg-destructive/10 rounded-md p-3 text-sm cursor-pointer">
                  <input type="checkbox" className="mt-1" checked={forceConfirmed} onChange={(event) => setForceConfirmed(event.target.checked)} />
                  <span><b>Confirmación adicional obligatoria</b><span className="block text-xs mt-0.5">Confirmo cortar {manualForcedCount} cliente(s) aunque tengan promesa vigente o protección “no cortar”.</span></span>
                </label>
              )}
            </div>

            <div className="p-4 md:p-5 border-t flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-muted-foreground">Si el nodo está desconectado, el corte queda en cola y se aplica al reconectar.</div>
              <button
                onClick={() => executeManualCut(Array.from(manualSel))}
                disabled={manualBusy || manualSel.size === 0 || (manualForcedCount > 0 && !forceConfirmed)}
                className="inline-flex items-center justify-center gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-40 px-4 py-2.5 rounded-md text-sm font-semibold w-full sm:w-auto"
              >
                {manualBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
                {manualBusy ? "Aplicando cortes…" : `Cortar seleccionados (${manualSel.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

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
    </>
  );
}

function CutoffsPageRoute() {
  return (
    <AdminLayout>
      <CutoffsPageContent />
    </AdminLayout>
  );
}
