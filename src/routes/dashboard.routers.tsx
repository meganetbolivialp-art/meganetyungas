import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Wifi, WifiOff, Zap, Loader2, Radio, Activity, Pencil, Trash2, Wrench, Users, Printer, Search, Maximize2, RefreshCw, Minus, Network, Download, Star, X, Eye, Clock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { FormPanel, Field, inputCls } from "@/components/ui-kit";
import { testRouterConnection, listActiveSessions, pingAllRouters, importRouterPools, listRouterPools, upsertRouterPool, deleteRouterPool, poolIpUsage, pendingOpsSummary, flushRouterQueue } from "@/lib/isp.functions";
import { oneClickProvisionRouter } from "@/lib/router-oneclick.functions";
import { applyBasicSafeSetup, undoBasicSafeSetup } from "@/lib/router-basic-setup.functions";




export const Route = createFileRoute("/dashboard/routers")({
  head: () => ({ meta: [
    { title: "Routers / NAS — MikroSystem ISP" },
    { name: "description", content: "Administración y prueba de conexión de routers." },
    { property: "og:title", content: "Routers — MikroSystem ISP" },
    { property: "og:description", content: "Equipos de red y NAS." },
    { name: "robots", content: "noindex" },
  ]}),
  component: RoutersPage,
});

type R = {
  id: string; name: string; ip_address: string; type: string;
  location: string | null; api_port: number; api_user: string | null;
  api_password: string | null; simulated: boolean;
  status: string; last_sync_at: string | null;
  morosos_profile: string; walled_garden_ip: string | null;
  client_pool_cidr: string | null; client_pool_gateway: string | null;
};

function RoutersPage() {
  const [rows, setRows] = useState<R[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<R | null>(null);
  const [show, setShow] = useState(false);
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(15);
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  const empty = (): R => ({
    id: "", name: "", ip_address: "", type: "mikrotik", location: "",
    api_port: 8728, api_user: "", api_password: "", simulated: true,
    status: "offline", last_sync_at: null,
    morosos_profile: "sistema_cortados", walled_garden_ip: "",
    client_pool_cidr: "", client_pool_gateway: "",
  });

  const [f, setF] = useState<R>(empty());

  const testFn = useServerFn(testRouterConnection);
  const sessFn = useServerFn(listActiveSessions);
  const pingAllFn = useServerFn(pingAllRouters);
  const importPoolsFn = useServerFn(importRouterPools);
  const listPoolsFn = useServerFn(listRouterPools);
  const upsertPoolFn = useServerFn(upsertRouterPool);
  const deletePoolFn = useServerFn(deleteRouterPool);
  const usageFn = useServerFn(poolIpUsage);
  const oneClickFn = useServerFn(oneClickProvisionRouter);
  const [wizard, setWizard] = useState<{ name: string; location: string } | null>(null);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [autoPoll, setAutoPoll] = useState(true);
  const [lastPoll, setLastPoll] = useState<number | null>(null);
  const [pending, setPending] = useState<{ total: number; byRouter: Record<string, number> }>({ total: 0, byRouter: {} });
  const pendingFn = useServerFn(pendingOpsSummary);
  const flushFn = useServerFn(flushRouterQueue);
  const [poolsFor, setPoolsFor] = useState<R | null>(null);
  const [pools, setPools] = useState<any[]>([]);
  const [poolEdit, setPoolEdit] = useState<any | null>(null);
  const [poolsLoading, setPoolsLoading] = useState(false);
  const [usageFor, setUsageFor] = useState<any | null>(null);
  const [usage, setUsage] = useState<any | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageFilter, setUsageFilter] = useState<"all" | "used" | "free">("all");
  const portalUrl = typeof window !== "undefined" ? window.location.origin : "https://control-shine-hub.lovable.app";
  const portalHost = portalUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  void portalHost;

  // Genera credenciales únicas por router (nombre-slug + sufijo random)
  const genCreds = (routerName: string) => {
    const slug = (routerName || "router").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 10) || "router";
    const rand = Math.random().toString(36).slice(2, 8);
    return { user: `ms_${slug}`, pass: `${slug.toUpperCase()}${rand}!${Math.floor(Math.random() * 90 + 10)}` };
  };



  const openUsage = async (p: any) => {
    setUsageFor(p); setUsage(null); setUsageLoading(true);
    try { const res: any = await usageFn({ data: { poolId: p.id } }); setUsage(res); }
    catch (e: any) { toast.error(e.message); }
    finally { setUsageLoading(false); }
  };

  const openPools = async (r: R) => {
    setPoolsFor(r); setPoolEdit(null); setPoolsLoading(true);
    try { const res: any = await listPoolsFn({ data: { routerId: r.id } }); setPools(res.pools ?? []); }
    catch (e: any) { toast.error(e.message); }
    finally { setPoolsLoading(false); }
  };
  const reloadPools = async () => { if (!poolsFor) return; const res: any = await listPoolsFn({ data: { routerId: poolsFor.id } }); setPools(res.pools ?? []); };
  const doImport = async () => {
    if (!poolsFor) return;
    try {
      const res: any = await importPoolsFn({ data: { routerId: poolsFor.id } });
      toast.success(`${res.imported} nuevos · ${res.updated} actualizados`);
      await reloadPools();
    } catch (e: any) { toast.error(e.message); }
  };
  const savePool = async () => {
    if (!poolsFor || !poolEdit) return;
    try {
      await upsertPoolFn({ data: { ...poolEdit, routerId: poolsFor.id } });
      toast.success("Pool guardado"); setPoolEdit(null); await reloadPools();
    } catch (e: any) { toast.error(e.message); }
  };
  const removePool = async (id: string) => {
    if (!confirm("¿Eliminar este pool?")) return;
    try { await deletePoolFn({ data: { id } }); await reloadPools(); }
    catch (e: any) { toast.error(e.message); }
  };
  const setDefault = async (p: any) => {
    if (!poolsFor) return;
    await upsertPoolFn({ data: { id: p.id, routerId: poolsFor.id, name: p.name, ranges: p.ranges, cidr: p.cidr, gateway: p.gateway, is_default: true } });
    await reloadPools();
  };

  const load = async () => {
    const { data } = await supabase.from("routers").select("*").order("name");
    setRows((data as R[]) ?? []);
    // client counts per router
    const { data: subs } = await supabase.from("services").select("router_id");
    const c: Record<string, number> = {};
    (subs ?? []).forEach((s: any) => { if (s.router_id) c[s.router_id] = (c[s.router_id] ?? 0) + 1; });
    setCounts(c);
  };
  useEffect(() => { load(); }, []);

  // Auto-ping cada 30s + refresco de cola pendiente
  useEffect(() => {
    if (!autoPoll) return;
    let cancelled = false;
    const hasSession = async () => {
      const { data } = await supabase.auth.getSession();
      return !!data.session;
    };
    const tick = async () => {
      if (cancelled) return;
      if (!(await hasSession())) return;
      await pingAllFn({}).catch((e) => console.error("ping failed", e));
      if (cancelled || !(await hasSession())) return;
      const p: any = await pendingFn({}).catch(() => null);
      if (cancelled) return;
      setLastPoll(Date.now());
      if (p) setPending(p);
      if (!(await hasSession())) return;
      await load().catch((e) => console.error("load failed", e));
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [autoPoll]);

  const flushRouter = async (routerId: string, routerName: string) => {
    try {
      const res: any = await flushFn({ data: { routerId } });
      toast.success(`${routerName}: aplicadas ${res.done}, fallidas ${res.failed}, pendientes ${res.pending}`);
      const p: any = await pendingFn({}); setPending(p);
    } catch (e: any) { toast.error(e.message); }
  };

  // ---- Setup básico y seguro ----
  const applySetupFn = useServerFn(applyBasicSafeSetup);
  const undoSetupFn = useServerFn(undoBasicSafeSetup);
  const [setupFor, setSetupFor] = useState<R | null>(null);
  const [setupOpts, setSetupOpts] = useState({ setIdentity: true, enableApi: true, allowApiFromVpn: true, enableNtp: true });
  const [setupPreview, setSetupPreview] = useState<any[] | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);

  const openSetup = (r: R) => { setSetupFor(r); setSetupPreview(null); setSetupOpts({ setIdentity: true, enableApi: true, allowApiFromVpn: true, enableNtp: true }); };

  const runPreview = async () => {
    if (!setupFor) return;
    setSetupBusy(true);
    try {
      const res: any = await applySetupFn({ data: { routerId: setupFor.id, ...setupOpts, dryRun: true } });
      setSetupPreview(res.steps ?? []);
    } catch (e: any) { toast.error(e.message); }
    finally { setSetupBusy(false); }
  };

  const runApply = async () => {
    if (!setupFor) return;
    if (!confirm(`¿Aplicar configuración básica en ${setupFor.name}?\n\nEs seguro: solo agrega lo mínimo, no modifica reglas existentes.`)) return;
    setSetupBusy(true);
    try {
      const res: any = await applySetupFn({ data: { routerId: setupFor.id, ...setupOpts, dryRun: false } });
      setSetupPreview(res.steps ?? []);
      const ok = (res.steps ?? []).filter((s: any) => s.status === "ok").length;
      const skip = (res.steps ?? []).filter((s: any) => s.status === "skipped").length;
      toast.success(`${setupFor.name}: ${ok} aplicadas, ${skip} ya estaban`);
    } catch (e: any) { toast.error(e.message); }
    finally { setSetupBusy(false); }
  };

  const runUndo = async () => {
    if (!setupFor) return;
    if (!confirm(`¿Deshacer el setup en ${setupFor.name}? (Solo elimina reglas con comentario "meganet-panel-*")`)) return;
    setSetupBusy(true);
    try {
      const res: any = await undoSetupFn({ data: { routerId: setupFor.id } });
      toast.success(`${setupFor.name}: ${res.removed} regla(s) eliminada(s)`);
    } catch (e: any) { toast.error(e.message); }
    finally { setSetupBusy(false); }
  };

  const openNew = () => {
    setEditing(null);
    const c = genCreds("nuevo");
    setF({ ...empty(), api_user: c.user, api_password: c.pass, simulated: false });
    setShow(true);
  };
  const openEdit = (r: R) => { setEditing(r); setF({ ...r, api_password: r.api_password ?? "", api_user: r.api_user ?? "" }); setShow(true); };

  const save = async () => {
    if (!f.name || !f.ip_address) { toast.error("Nombre e IP son obligatorios"); return; }
    const payload = {
      name: f.name, ip_address: f.ip_address, type: f.type, location: f.location || null,
      api_port: f.api_port, api_user: f.api_user || null, api_password: f.api_password || null,
      simulated: f.simulated, status: f.status,
      morosos_profile: f.morosos_profile || "sistema_cortados",
      walled_garden_ip: f.walled_garden_ip || null,
      client_pool_cidr: f.client_pool_cidr || null,
      client_pool_gateway: f.client_pool_gateway || null,
    };

    if (editing) {
      const { error } = await supabase.from("routers").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Router actualizado");
    } else {
      const { error } = await supabase.from("routers").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Router creado");
      setShow(false); setEditing(null); await load();
      return;
    }
    setShow(false); setEditing(null); load();
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar router?")) return;
    const { error } = await supabase.from("routers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Router eliminado"); load();
  };

  const runTest = async (r: R) => {
    setTesting(t => ({ ...t, [r.id]: true }));
    try {
      const res = await testFn({ data: { routerId: r.id } });
      if (res.ok) toast.success(`${r.name}: conexión OK (${res.elapsed_ms}ms)`);
      else toast.error(`${r.name}: ${res.error}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(t => ({ ...t, [r.id]: false }));
    }
  };

  const loadSessions = async (r: R) => {
    try {
      const res: any = await sessFn({ data: { routerId: r.id } });
      const n = res.active?.length ?? 0;
      toast.success(`${r.name}: ${n} sesiones PPPoE activas`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      r.name.toLowerCase().includes(s) ||
      r.ip_address.toLowerCase().includes(s) ||
      (r.location ?? "").toLowerCase().includes(s) ||
      r.type.toLowerCase().includes(s)
    );
  }, [rows, q]);

  const paged = filtered.slice(0, pageSize);

  return (
    <AdminLayout title="Routers / NAS" subtitle={`${rows.length} equipos · prueba de conexión en vivo`} breadcrumb={["Red", "Routers"]}>
      {show && (
        <FormPanel onCancel={() => { setShow(false); setEditing(null); }} onSave={save}>
          <Field label="Nombre *"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} placeholder="NAS-Centro" /></Field>
          <Field label="Tipo">
            <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} className={inputCls}>
              <option value="mikrotik">Mikrotik RouterOS</option>
              <option value="cisco">Cisco</option>
              <option value="ubiquiti">Ubiquiti</option>
              <option value="other">Otro</option>
            </select>
          </Field>
          <Field label="Dirección IP *"><input value={f.ip_address} onChange={e => setF({ ...f, ip_address: e.target.value })} className={inputCls} placeholder="192.168.88.1" /></Field>
          <Field label="Puerto API"><input type="number" value={f.api_port} onChange={e => setF({ ...f, api_port: +e.target.value })} className={inputCls} /></Field>
          <Field label="Usuario API"><input value={f.api_user ?? ""} onChange={e => setF({ ...f, api_user: e.target.value })} className={inputCls} placeholder="admin" /></Field>
          <Field label="Contraseña API"><input type="password" value={f.api_password ?? ""} onChange={e => setF({ ...f, api_password: e.target.value })} className={inputCls} placeholder="••••••••" /></Field>
          <Field label="Ubicación"><input value={f.location ?? ""} onChange={e => setF({ ...f, location: e.target.value })} className={inputCls} placeholder="POP Central" /></Field>
          <Field label="Modo">
            <label className="flex items-center gap-2 h-9 px-3 rounded border bg-background">
              <input type="checkbox" checked={f.simulated} onChange={e => setF({ ...f, simulated: e.target.checked })} />
              <span className="text-sm">Modo simulado (sin conexión real)</span>
            </label>
          </Field>
          <Field label="Perfil morosos"><input value={f.morosos_profile} onChange={e => setF({ ...f, morosos_profile: e.target.value })} className={inputCls} placeholder="sistema_cortados" /></Field>
          <Field label="IP página de aviso (walled garden)"><input value={f.walled_garden_ip ?? ""} onChange={e => setF({ ...f, walled_garden_ip: e.target.value })} className={inputCls} placeholder="10.10.99.2" /></Field>
          <Field label="Pool IPs clientes (CIDR)"><input value={f.client_pool_cidr ?? ""} onChange={e => setF({ ...f, client_pool_cidr: e.target.value })} className={inputCls} placeholder="10.0.0.0/24" /></Field>
          <Field label="Gateway del pool"><input value={f.client_pool_gateway ?? ""} onChange={e => setF({ ...f, client_pool_gateway: e.target.value })} className={inputCls} placeholder="10.0.0.1" /></Field>
        </FormPanel>
      )}

      <div className="mw-panel">
        <div className="mw-panel-header" style={{ background: "#3498db", color: "#fff", borderBottom: 0 }}>
          <div className="mw-panel-title" style={{ color: "#fff" }}>Lista de Router</div>
          <div className="flex items-center gap-2 text-white/90">
            <button className="p-1 hover:bg-white/10 rounded" title="Pantalla completa"><Maximize2 className="w-3.5 h-3.5" /></button>
            <button onClick={load} className="p-1 hover:bg-white/10 rounded" title="Recargar"><RefreshCw className="w-3.5 h-3.5" /></button>
            <button className="p-1 hover:bg-white/10 rounded" title="Minimizar"><Minus className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-3 border-b">
          <div className="flex items-center gap-2">
            <select value={pageSize} onChange={e => setPageSize(+e.target.value)} className={inputCls + " !w-16"}>
              <option value={15}>15</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
            </select>
            <button className="mw-btn mw-btn-outline" title="Columnas"><Wrench className="w-3.5 h-3.5" /></button>
            <button className="mw-btn mw-btn-outline" title="Exportar"><Printer className="w-3.5 h-3.5" /></button>
            <button onClick={() => setWizard({ name: "", location: "" })} className="mw-btn mw-btn-primary" title="Asistente 1-clic: crea el router, reserva IP en la VPN y descarga el .rsc listo"><Zap className="w-3.5 h-3.5" /> 1-clic</button>
            <button onClick={openNew} className="mw-btn mw-btn-outline"><span className="text-base leading-none">+</span> Nuevo</button>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-2 select-none">
              <input type="checkbox" checked={autoPoll} onChange={e => setAutoPoll(e.target.checked)} />
              Auto-ping 30s
              {lastPoll && <span className="text-emerald-600 font-medium">· {new Date(lastPoll).toLocaleTimeString()}</span>}
            </label>
            {pending.total > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-700 text-[11px] font-semibold" title="Operaciones en cola esperando a que el router vuelva online">
                <Clock className="w-3 h-3" /> {pending.total} en cola
              </span>
            )}
          </div>
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar..." className={inputCls + " pl-8"} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="mw-table">
            <thead>
              <tr>
                <th className="w-12">ID</th>
                <th>Nombre</th>
                <th>IP</th>
                <th>Modelo</th>
                <th>Versión</th>
                <th className="text-center">Clientes</th>
                <th className="text-center">Estado</th>
                <th className="text-right pr-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Sin registros</td></tr>
              )}
              {paged.map((r, i) => {
                const isT = testing[r.id];
                const online = r.status === "online";
                return (
                  <tr key={r.id}>
                    <td className="text-muted-foreground">{i + 1}</td>
                    <td>
                      <div className="font-semibold text-[13px] uppercase">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground">{r.type === "mikrotik" ? "PPPoe + Colas simples Dinámicas" : r.type} {r.simulated && <span className="ml-1 px-1 py-px rounded bg-amber-500/15 text-amber-700 border border-amber-500/30">SIM</span>}</div>
                    </td>
                    <td className="font-mono">{r.ip_address}</td>
                    <td className="font-mono text-xs">{r.location ?? "—"}</td>
                    <td className="text-xs">{r.last_sync_at ? new Date(r.last_sync_at).toLocaleString() : "—"}</td>
                    <td className="text-center">
                      <span className="inline-flex items-center justify-center min-w-[42px] px-2 py-0.5 rounded-full border text-xs font-semibold bg-muted/40">{counts[r.id] ?? 0}</span>
                    </td>
                    <td className="text-center">
                      {online
                        ? <span className="mw-badge mw-badge-green"><Wifi className="w-3 h-3" /> Conectado</span>
                        : <span className="mw-badge mw-badge-red"><WifiOff className="w-3 h-3" /> Desconectado</span>}
                      {(pending.byRouter[r.id] ?? 0) > 0 && (
                        <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-px rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-700 text-[10px] font-semibold" title="Operaciones pendientes en cola">
                          <Clock className="w-2.5 h-2.5" /> {pending.byRouter[r.id]} en cola
                        </div>
                      )}
                    </td>
                    <td className="text-right pr-3">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => openEdit(r)} title="Editar" className="p-1.5 rounded hover:bg-muted text-sky-600"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => remove(r.id)} title="Eliminar" className="p-1.5 rounded hover:bg-muted text-destructive"><Trash2 className="w-4 h-4" /></button>
                        {(pending.byRouter[r.id] ?? 0) > 0 && (
                          <button onClick={() => flushRouter(r.id, r.name)} title="Aplicar operaciones en cola ahora" className="p-1.5 rounded hover:bg-muted text-amber-600"><Clock className="w-4 h-4" /></button>
                        )}
                        <button onClick={() => runTest(r)} disabled={isT} title="Probar conexión" className="p-1.5 rounded hover:bg-muted text-amber-600 disabled:opacity-50">
                          {isT ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        </button>
                        <button onClick={() => loadSessions(r)} title="Sesiones PPPoE" className="p-1.5 rounded hover:bg-muted text-emerald-600"><Users className="w-4 h-4" /></button>
                        <button onClick={() => openPools(r)} title="Pools de IP" className="p-1.5 rounded hover:bg-muted text-orange-600"><Network className="w-4 h-4" /></button>
                        <button onClick={() => openSetup(r)} title="Configuración básica y segura" className="p-1.5 rounded hover:bg-muted text-teal-600"><ShieldCheck className="w-4 h-4" /></button>
                        
                        <Link to="/dashboard/routers/$routerId/monitor" params={{ routerId: r.id }} title="Monitor" className="p-1.5 rounded hover:bg-muted text-indigo-600 inline-flex"><Activity className="w-4 h-4" /></Link>
                        <Link to="/dashboard/router-sync" title="Sincronizar" className="p-1.5 rounded hover:bg-muted text-slate-600 inline-flex"><Radio className="w-4 h-4" /></Link>

                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between p-3 text-xs text-muted-foreground border-t">
          <div>Mostrando de 1 al {paged.length} de un total de {filtered.length}</div>
          <div className="flex items-center gap-1">
            <button className="mw-btn mw-btn-outline !h-7 !px-2">‹</button>
            <button className="mw-btn mw-btn-primary !h-7 !px-3">1</button>
            <button className="mw-btn mw-btn-outline !h-7 !px-2">›</button>
          </div>
        </div>
      </div>

      {poolsFor && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPoolsFor(null)}>
          <div className="bg-background rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b bg-slate-800 text-white">
              <div className="flex items-center gap-2"><Network className="w-4 h-4" /><span className="font-semibold text-sm">Pools de IP — {poolsFor.name}</span></div>
              <button onClick={() => setPoolsFor(null)} className="p-1 hover:bg-white/10 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 border-b flex items-center gap-2 bg-muted/30">
              <button onClick={doImport} className="mw-btn mw-btn-primary"><Download className="w-3.5 h-3.5" /> Importar desde Mikrotik</button>
              <button onClick={() => setPoolEdit({ id: null, name: "", ranges: "", cidr: "", gateway: "", is_default: pools.length === 0 })} className="mw-btn mw-btn-outline">+ Nuevo pool</button>
              <span className="text-xs text-muted-foreground ml-2">Escanea <code>/ip/pool</code> del router e importa rangos. El pool marcado como <b>default</b> se usa al asignar IPs automáticas.</span>
            </div>
            <div className="overflow-auto flex-1">
              {poolsLoading ? <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /> Cargando...</div> : (
                <table className="mw-table">
                  <thead><tr><th>Default</th><th>Nombre</th><th>Rangos</th><th>CIDR</th><th>Gateway</th><th>Origen</th><th className="text-right pr-3">Acciones</th></tr></thead>
                  <tbody>
                    {pools.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Sin pools. Importá desde Mikrotik o creá uno manual.</td></tr>}
                    {pools.map((p) => (
                      <tr key={p.id}>
                        <td><button onClick={() => setDefault(p)} title={p.is_default ? "Default" : "Marcar default"}><Star className={`w-4 h-4 ${p.is_default ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`} /></button></td>
                        <td className="font-semibold">{p.name}</td>
                        <td className="font-mono text-xs">{p.ranges || "—"}</td>
                        <td className="font-mono text-xs">{p.cidr || "—"}</td>
                        <td className="font-mono text-xs">{p.gateway || "—"}</td>
                        <td><span className={`mw-badge ${p.source === "mikrotik" ? "mw-badge-green" : "mw-badge-red"}`}>{p.source}</span></td>
                        <td className="text-right pr-3">
                          <button onClick={() => openUsage(p)} title="Ver IPs usadas/libres" className="p-1.5 rounded hover:bg-muted text-emerald-600"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => setPoolEdit(p)} className="p-1.5 rounded hover:bg-muted text-sky-600"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => removePool(p.id)} className="p-1.5 rounded hover:bg-muted text-destructive"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {poolEdit && (
              <div className="border-t p-3 bg-muted/20 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
                <Field label="Nombre *"><input value={poolEdit.name} onChange={e => setPoolEdit({ ...poolEdit, name: e.target.value })} className={inputCls} /></Field>
                <Field label="Rangos"><input value={poolEdit.ranges ?? ""} onChange={e => setPoolEdit({ ...poolEdit, ranges: e.target.value })} className={inputCls} placeholder="10.0.0.10-10.0.0.254" /></Field>
                <Field label="CIDR"><input value={poolEdit.cidr ?? ""} onChange={e => setPoolEdit({ ...poolEdit, cidr: e.target.value })} className={inputCls} placeholder="10.0.0.0/24" /></Field>
                <Field label="Gateway"><input value={poolEdit.gateway ?? ""} onChange={e => setPoolEdit({ ...poolEdit, gateway: e.target.value })} className={inputCls} placeholder="10.0.0.1" /></Field>
                <Field label="Default"><label className="flex items-center gap-2 h-9 px-3 rounded border bg-background"><input type="checkbox" checked={!!poolEdit.is_default} onChange={e => setPoolEdit({ ...poolEdit, is_default: e.target.checked })} /><span className="text-sm">Usar por defecto</span></label></Field>
                <div className="flex gap-1">
                  <button onClick={savePool} className="mw-btn mw-btn-primary flex-1">Guardar</button>
                  <button onClick={() => setPoolEdit(null)} className="mw-btn mw-btn-outline">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {usageFor && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setUsageFor(null)}>
          <div className="bg-background rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b bg-slate-800 text-white">
              <div className="flex items-center gap-2"><Network className="w-4 h-4" /><span className="font-semibold text-sm">IPs — {usageFor.name}</span></div>
              <button onClick={() => setUsageFor(null)} className="p-1 hover:bg-white/10 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 border-b flex items-center gap-3 bg-muted/30 text-xs">
              {usage && (
                <>
                  <span><b>{usage.total}</b> total</span>
                  <span className="text-rose-600"><b>{usage.used}</b> usadas</span>
                  <span className="text-emerald-600"><b>{usage.free}</b> libres</span>
                  {usage.truncated && <span className="text-amber-600">(truncado a {usage.ips.length})</span>}
                </>
              )}
              <div className="ml-auto flex gap-1">
                {(["all", "used", "free"] as const).map(k => (
                  <button key={k} onClick={() => setUsageFilter(k)} className={`mw-btn ${usageFilter === k ? "mw-btn-primary" : "mw-btn-outline"} !py-1 !px-2 !text-xs`}>{k === "all" ? "Todas" : k === "used" ? "Usadas" : "Libres"}</button>
                ))}
                <button onClick={() => openUsage(usageFor)} className="mw-btn mw-btn-outline !py-1 !px-2 !text-xs"><RefreshCw className="w-3 h-3" /></button>
              </div>
            </div>
            <div className="overflow-auto flex-1">
              {usageLoading || !usage ? (
                <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /> Escaneando…</div>
              ) : (
                <table className="mw-table">
                  <thead><tr><th>IP</th><th>Estado</th><th>Cliente</th><th>Documento</th></tr></thead>
                  <tbody>
                    {usage.ips
                      .filter((x: any) => usageFilter === "all" || (usageFilter === "used" && (x.status === "used" || x.status === "live")) || (usageFilter === "free" && x.status === "free"))
                      .map((x: any) => (
                      <tr key={x.ip}>
                        <td className="font-mono text-xs">{x.ip}</td>
                        <td>
                          {x.status === "gateway" && <span className="mw-badge mw-badge-blue">gateway</span>}
                          {x.status === "router" && <span className="mw-badge mw-badge-blue">router</span>}
                          {x.status === "used" && <span className="mw-badge mw-badge-red">asignada</span>}
                          {x.status === "live" && <span className="mw-badge mw-badge-amber">en router</span>}
                          {x.status === "free" && <span className="mw-badge mw-badge-green">libre</span>}
                        </td>
                        <td>{x.clientName ?? "—"}</td>
                        <td className="font-mono text-xs">{x.document ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {wizard && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={() => !wizardBusy && setWizard(null)}>
          <div className="bg-background rounded-lg shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b bg-sky-600 text-white">
              <div className="flex items-center gap-2"><Zap className="w-4 h-4" /><span className="font-semibold text-sm">Asistente 1-clic — Nuevo router</span></div>
              <button disabled={wizardBusy} onClick={() => setWizard(null)} className="p-1 hover:bg-white/10 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">Reserva la próxima IP libre en la VPN (10.8.0.12+), genera certificados en el VPS y descarga <b>4 archivos</b>: <code>ca.crt</code>, <code>.crt</code>, <code>.key</code> y <code>.rsc</code> auto-instalable.</p>
              <Field label="Nombre del router *"><input autoFocus value={wizard.name} onChange={e => setWizard({ ...wizard, name: e.target.value })} className={inputCls} placeholder="SUCURSAL2" /></Field>
              <Field label="Ubicación"><input value={wizard.location} onChange={e => setWizard({ ...wizard, location: e.target.value })} className={inputCls} placeholder="POP Norte" /></Field>
              <div className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded">
                Luego subí los 3 archivos al MikroTik (Files) y ejecutá en Terminal:<br/>
                <code>/import file-name={(wizard.name || "router").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0,15)}.rsc</code>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-3 border-t bg-muted/30">
              <button disabled={wizardBusy} onClick={() => setWizard(null)} className="mw-btn mw-btn-outline">Cancelar</button>
              <button
                disabled={wizardBusy || !wizard.name.trim()}
                onClick={async () => {
                  setWizardBusy(true);
                  try {
                    const res: any = await oneClickFn({ data: { name: wizard.name.trim(), location: wizard.location.trim() || undefined } });
                    // Descargar los 4 archivos
                    for (const [fname, content] of Object.entries(res.files as Record<string, string>)) {
                      const blob = new Blob([content], { type: "application/octet-stream" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = fname; a.click();
                      URL.revokeObjectURL(url);
                      await new Promise(r => setTimeout(r, 250));
                    }
                    if (res.provisioned) {
                      toast.success(`Router creado con IP ${res.ip}. Subí los 4 archivos al MikroTik.`);
                    } else {
                      toast.warning(`Router guardado con IP ${res.ip}, pero el VPS no generó certificados. Se descargó una guía.`);
                    }
                    setWizard(null);
                    await load();
                  } catch (e: any) {
                    toast.error(e.message);
                  } finally {
                    setWizardBusy(false);
                  }
                }}
                className="mw-btn mw-btn-primary"
              >
                {wizardBusy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Provisionando…</> : <><Zap className="w-3.5 h-3.5" /> Generar y descargar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {setupFor && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !setupBusy && setSetupFor(null)}>
          <div className="bg-background rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b bg-teal-600 text-white">
              <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /><span className="font-semibold text-sm">Configuración básica y segura — {setupFor.name}</span></div>
              <button onClick={() => setSetupFor(null)} disabled={setupBusy} className="p-1 hover:bg-white/10 rounded disabled:opacity-50"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3 overflow-auto">
              <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded p-2">
                Solo <b>agrega</b> lo mínimo necesario. No modifica reglas existentes, no toca NAT, DNS ni rutas. Todo lo agregado lleva el comentario <code>meganet-panel-*</code> y podés deshacerlo.
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={setupOpts.setIdentity} onChange={e => setSetupOpts(o => ({ ...o, setIdentity: e.target.checked }))} /> Poner nombre del router (<code>/system identity</code>)</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={setupOpts.enableApi} onChange={e => setSetupOpts(o => ({ ...o, enableApi: e.target.checked }))} /> Habilitar servicio API en 8728</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={setupOpts.allowApiFromVpn} onChange={e => setSetupOpts(o => ({ ...o, allowApiFromVpn: e.target.checked }))} /> Permitir API desde OVPN (<code>ovpn-panel</code>)</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={setupOpts.enableNtp} onChange={e => setSetupOpts(o => ({ ...o, enableNtp: e.target.checked }))} /> Activar NTP (hora correcta para cortes programados)</label>
              </div>

              {setupPreview && (
                <div className="border rounded overflow-hidden">
                  <div className="px-3 py-1.5 bg-slate-100 text-xs font-semibold">Comandos a ejecutar</div>
                  <ul className="divide-y">
                    {setupPreview.map((s: any, i: number) => (
                      <li key={i} className="p-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className={
                            s.status === "ok" ? "px-1.5 py-px rounded bg-emerald-100 text-emerald-700 text-[10px]" :
                            s.status === "skipped" ? "px-1.5 py-px rounded bg-slate-100 text-slate-600 text-[10px]" :
                            s.status === "error" ? "px-1.5 py-px rounded bg-red-100 text-red-700 text-[10px]" :
                            "px-1.5 py-px rounded bg-blue-100 text-blue-700 text-[10px]"
                          }>{s.status}</span>
                          <span className="font-semibold">{s.label}</span>
                          {s.detail && <span className="text-muted-foreground">· {s.detail}</span>}
                        </div>
                        <code className="block mt-1 text-[11px] text-slate-600 bg-slate-50 rounded p-1 font-mono break-all">{s.command}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="p-3 border-t bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
              <button onClick={runUndo} disabled={setupBusy} className="mw-btn mw-btn-outline text-red-600 border-red-300 disabled:opacity-50" title="Elimina solo lo que agregó este asistente">
                <Trash2 className="w-3.5 h-3.5" /> Deshacer
              </button>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => setSetupFor(null)} disabled={setupBusy} className="mw-btn mw-btn-outline">Cancelar</button>
                <button onClick={runPreview} disabled={setupBusy} className="mw-btn mw-btn-outline">
                  {setupBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Vista previa
                </button>
                <button onClick={runApply} disabled={setupBusy} className="mw-btn mw-btn-primary bg-teal-600 hover:bg-teal-700">
                  {setupBusy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Aplicando…</> : <><ShieldCheck className="w-3.5 h-3.5" /> Aplicar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}
