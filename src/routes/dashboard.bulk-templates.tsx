import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Calendar, Shield, ShieldOff, Clock, Zap, Plus, Pencil, Trash2, Play, Users, Router as RouterIcon, CheckSquare, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/bulk-templates")({
  head: () => ({
    meta: [
      { title: "Plantillas de cambios masivos — MikroSystem ISP" },
      { name: "description", content: "Crea plantillas reutilizables para cambiar día de pago, gracia, promesas y protección de corte en lote." },
      { property: "og:title", content: "Plantillas de cambios masivos" },
      { property: "og:description", content: "Aplica cambios reutilizables a clientes en lote." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type Tpl = { id: string; name: string; description: string | null; action: string; params: any; is_active: boolean };
type Client = { id: string; full_name: string; document: string | null; billing_day: number | null; status: string; dont_cut: boolean | null; grace_days_override: number | null; payment_promise_until: string | null };
type Router = { id: string; name: string };

const ACTIONS: Record<string, { label: string; icon: any; color: string; help: string }> = {
  billing_day:     { label: "Cambiar día de pago",     icon: Calendar,  color: "text-blue-600",   help: "Cambia el día del mes en que se factura (1-28)." },
  grace_days:      { label: "Días de gracia",           icon: Clock,     color: "text-amber-600",  help: "Días extra antes del corte por deuda." },
  dont_cut:        { label: "Protección de corte",      icon: Shield,    color: "text-emerald-600",help: "Marca/desmarca al cliente como VIP (no cortar)." },
  payment_promise: { label: "Promesa de pago",          icon: Zap,       color: "text-purple-600", help: "Otorga promesa de pago por N días." },
  status_change:   { label: "Cambiar estado",           icon: ShieldOff, color: "text-rose-600",   help: "Fuerza estado del servicio (activo/suspendido)." },
  plan_change:     { label: "Cambiar plan",             icon: Zap,       color: "text-indigo-600", help: "Reasigna el plan de internet." },
};

function Page() {
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);
  const [edit, setEdit] = useState<Partial<Tpl> | null>(null);
  const [applyFor, setApplyFor] = useState<Tpl | null>(null);

  const load = async () => {
    const [t, r, p] = await Promise.all([
      supabase.from("bulk_change_templates").select("*").order("created_at"),
      supabase.from("routers").select("id, name").order("name"),
      supabase.from("plans").select("id, name").order("name"),
    ]);
    setTpls((t.data as any) ?? []);
    setRouters((r.data as any) ?? []);
    setPlans((p.data as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!edit?.name || !edit?.action) return toast.error("Nombre y acción son obligatorios");
    const payload = { name: edit.name, description: edit.description ?? null, action: edit.action, params: edit.params ?? {}, is_active: edit.is_active ?? true };
    const q = edit.id
      ? supabase.from("bulk_change_templates").update(payload).eq("id", edit.id)
      : supabase.from("bulk_change_templates").insert(payload);
    const { error } = await q;
    if (error) return toast.error(error.message);
    toast.success("Plantilla guardada");
    setEdit(null); load();
  };
  const del = async (id: string) => {
    if (!confirm("¿Eliminar plantilla?")) return;
    const { error } = await supabase.from("bulk_change_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <AdminLayout title="Plantillas de cambios masivos" subtitle="Crea plantillas reutilizables para aplicar a clientes en lote" breadcrumb={["Mensajería", "Plantillas de cambio"]}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500">Guarda cambios frecuentes (día de pago, gracia, VIP, promesa) y aplícalos con un clic.</p>
        <button onClick={() => setEdit({ action: "billing_day", params: { day: 5 }, is_active: true })} className="mw-btn mw-btn-green h-9 px-3 text-xs"><Plus className="w-3.5 h-3.5" />Nueva plantilla</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tpls.map(t => {
          const A = ACTIONS[t.action] ?? ACTIONS.billing_day;
          const Icon = A.icon;
          return (
            <div key={t.id} className="rounded-lg border bg-card p-3 flex flex-col gap-2 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-2">
                <div className={`w-9 h-9 rounded-md bg-slate-100 grid place-items-center shrink-0 ${A.color}`}><Icon className="w-4.5 h-4.5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-slate-800 truncate">{t.name}</div>
                  <div className="text-[11px] text-slate-500">{A.label}</div>
                </div>
                <span className={`mw-badge shrink-0 ${t.is_active ? "mw-badge-green" : "mw-badge-red"}`}>{t.is_active ? "Activa" : "Inactiva"}</span>
              </div>
              {t.description && <p className="text-xs text-slate-600 line-clamp-2">{t.description}</p>}
              <div className="text-[11px] text-slate-500 font-mono bg-slate-50 rounded px-2 py-1 truncate">{summarize(t)}</div>
              <div className="flex gap-1.5 mt-auto pt-1">
                <button onClick={() => setApplyFor(t)} disabled={!t.is_active} className="mw-btn mw-btn-green flex-1 h-8 text-xs justify-center disabled:opacity-40"><Play className="w-3.5 h-3.5" />Aplicar</button>
                <button onClick={() => setEdit(t)} className="mw-btn h-8 px-2 text-xs"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => del(t.id)} className="mw-btn mw-btn-red h-8 px-2 text-xs"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          );
        })}
        {tpls.length === 0 && <div className="col-span-full text-center py-8 text-sm text-slate-500 border rounded-lg bg-card">Sin plantillas. Crea una para empezar.</div>}
      </div>

      {edit && <EditModal edit={edit} setEdit={setEdit} save={save} plans={plans} />}
      {applyFor && <ApplyModal tpl={applyFor} routers={routers} plans={plans} onClose={() => { setApplyFor(null); }} />}
    </AdminLayout>
  );
}

function summarize(t: Tpl) {
  const p = t.params ?? {};
  switch (t.action) {
    case "billing_day": return `Día ${p.day ?? "?"} de cada mes`;
    case "grace_days": return `${p.days ?? "?"} días de gracia`;
    case "dont_cut": return p.value ? "Activar VIP (no cortar)" : "Desactivar VIP";
    case "payment_promise": return `Promesa por ${p.days ?? "?"} días`;
    case "status_change": return `Estado → ${p.status ?? "?"}`;
    case "plan_change": return `Plan → ${p.plan_id ? p.plan_id.slice(0, 8) : "?"}`;
    default: return JSON.stringify(p);
  }
}

function EditModal({ edit, setEdit, save, plans }: { edit: any; setEdit: any; save: () => void; plans: { id: string; name: string }[] }) {
  const setParam = (k: string, v: any) => setEdit({ ...edit, params: { ...(edit.params ?? {}), [k]: v } });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4" onClick={() => setEdit(null)}>
      <div className="bg-card rounded-lg w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="border-b px-4 py-3 font-semibold text-slate-800">{edit.id ? "Editar plantilla" : "Nueva plantilla"}</div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Nombre</label>
            <input className="mw-input h-9 w-full" value={edit.name ?? ""} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="Ej: Día de pago 5" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Descripción</label>
            <input className="mw-input h-9 w-full" value={edit.description ?? ""} onChange={e => setEdit({ ...edit, description: e.target.value })} placeholder="Opcional" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Acción</label>
            <select className="mw-input h-9 w-full" value={edit.action ?? "billing_day"} onChange={e => setEdit({ ...edit, action: e.target.value, params: {} })}>
              {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">{ACTIONS[edit.action ?? "billing_day"]?.help}</p>
          </div>
          <div className="rounded border bg-slate-50 p-3 space-y-2">
            {edit.action === "billing_day" && (
              <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Día (1-28)</label>
                <input type="number" min={1} max={28} className="mw-input h-9 w-full" value={edit.params?.day ?? 5} onChange={e => setParam("day", Number(e.target.value))} /></div>
            )}
            {edit.action === "grace_days" && (
              <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Días de gracia</label>
                <input type="number" min={0} max={30} className="mw-input h-9 w-full" value={edit.params?.days ?? 5} onChange={e => setParam("days", Number(e.target.value))} /></div>
            )}
            {edit.action === "dont_cut" && (
              <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Acción</label>
                <select className="mw-input h-9 w-full" value={String(edit.params?.value ?? true)} onChange={e => setParam("value", e.target.value === "true")}>
                  <option value="true">Activar (proteger de corte)</option>
                  <option value="false">Desactivar (permitir corte)</option>
                </select></div>
            )}
            {edit.action === "payment_promise" && (
              <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Días de promesa</label>
                <input type="number" min={1} max={30} className="mw-input h-9 w-full" value={edit.params?.days ?? 7} onChange={e => setParam("days", Number(e.target.value))} /></div>
            )}
            {edit.action === "status_change" && (
              <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Nuevo estado</label>
                <select className="mw-input h-9 w-full" value={edit.params?.status ?? "active"} onChange={e => setParam("status", e.target.value)}>
                  <option value="active">Activo</option>
                  <option value="suspended">Suspendido</option>
                  <option value="cancelled">Cancelado</option>
                </select></div>
            )}
            {edit.action === "plan_change" && (
              <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Nuevo plan</label>
                <select className="mw-input h-9 w-full" value={edit.params?.plan_id ?? ""} onChange={e => setParam("plan_id", e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
            )}
          </div>
          <label className="inline-flex items-center gap-2 text-xs">
            <input type="checkbox" checked={edit.is_active ?? true} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} />
            Plantilla activa
          </label>
        </div>
        <div className="border-t px-4 py-3 flex justify-end gap-2">
          <button onClick={() => setEdit(null)} className="mw-btn h-9 px-3 text-xs">Cancelar</button>
          <button onClick={save} className="mw-btn mw-btn-green h-9 px-3 text-xs">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function ApplyModal({ tpl, routers, plans, onClose }: { tpl: Tpl; routers: Router[]; plans: { id: string; name: string }[]; onClose: () => void }) {
  const [routerId, setRouterId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const A = ACTIONS[tpl.action] ?? ACTIONS.billing_day;
  const Icon = A.icon;

  const search = async () => {
    setLoading(true);
    let ids: string[] | null = null;
    if (routerId) {
      const { data: svcs } = await supabase.from("services").select("client_id").eq("router_id", routerId);
      ids = Array.from(new Set((svcs ?? []).map((s: any) => s.client_id).filter(Boolean)));
      if (!ids.length) { setClients([]); setLoading(false); return; }
    }
    let query = supabase.from("clients").select("id, full_name, document, billing_day, status, dont_cut, grace_days_override, payment_promise_until").order("full_name").limit(500);
    if (ids) query = query.in("id", ids);
    if (status) query = query.eq("status", status);
    if (q.trim()) query = query.or(`full_name.ilike.%${q}%,document.ilike.%${q}%`);
    const { data } = await query;
    setClients((data as any) ?? []); setSel(new Set()); setLoading(false);
  };
  useEffect(() => { search(); /* eslint-disable-next-line */ }, [routerId, status]);

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(s => s.size === clients.length ? new Set() : new Set(clients.map(c => c.id)));
  const allChecked = clients.length > 0 && sel.size === clients.length;

  const apply = async () => {
    if (!sel.size) return toast.error("Selecciona al menos un cliente");
    if (!confirm(`¿Aplicar "${tpl.name}" a ${sel.size} cliente(s)?`)) return;
    setBusy(true);
    const ids = Array.from(sel);
    const p = tpl.params ?? {};
    try {
      if (tpl.action === "billing_day") {
        const { error } = await supabase.from("clients").update({ billing_day: p.day }).in("id", ids);
        if (error) throw error;
      } else if (tpl.action === "grace_days") {
        const { error } = await supabase.from("clients").update({ grace_days_override: p.days }).in("id", ids);
        if (error) throw error;
      } else if (tpl.action === "dont_cut") {
        const { error } = await supabase.from("clients").update({ dont_cut: p.value }).in("id", ids);
        if (error) throw error;
      } else if (tpl.action === "payment_promise") {
        const until = new Date(); until.setDate(until.getDate() + Number(p.days ?? 7));
        const { error } = await supabase.from("clients").update({ payment_promise_until: until.toISOString().slice(0, 10) }).in("id", ids);
        if (error) throw error;
      } else if (tpl.action === "status_change") {
        const patch: any = { status: p.status };
        if (p.status === "suspended") { patch.suspended_at = new Date().toISOString(); patch.suspend_reason = "Cambio masivo por plantilla"; }
        const { error } = await supabase.from("services").update(patch).in("client_id", ids);
        if (error) throw error;
      } else if (tpl.action === "plan_change") {
        if (!p.plan_id) throw new Error("Plantilla sin plan definido");
        const { error } = await supabase.from("services").update({ plan_id: p.plan_id }).in("client_id", ids);
        if (error) throw error;
      }
      toast.success(`${sel.size} cliente(s) actualizados`);
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Error al aplicar");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <div className={`w-8 h-8 rounded-md bg-slate-100 grid place-items-center ${A.color}`}><Icon className="w-4 h-4" /></div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-800 text-sm truncate">Aplicar: {tpl.name}</div>
            <div className="text-[11px] text-slate-500 truncate">{summarize(tpl)}</div>
          </div>
        </div>
        <div className="p-3 border-b bg-slate-50 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1 mb-1"><RouterIcon className="w-3 h-3" />Router</label>
            <select value={routerId} onChange={e => setRouterId(e.target.value)} className="mw-input h-8 w-full text-xs">
              <option value="">Todos los routers</option>
              {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Estado</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="mw-input h-8 w-full text-xs">
              <option value="">Todos</option>
              <option value="active">Activo</option>
              <option value="suspended">Suspendido</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Buscar</label>
            <div className="flex gap-1">
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="Nombre o CI…" className="mw-input h-8 w-full text-xs" />
              <button onClick={search} className="mw-btn h-8 px-2 text-xs">Ir</button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
          <button onClick={toggleAll} className="text-xs inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900">
            {allChecked ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
            {allChecked ? "Deseleccionar" : "Seleccionar todos"}
          </button>
          <span className="text-xs text-slate-500 inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{sel.size}/{clients.length}</span>
        </div>
        <div className="overflow-y-auto flex-1 divide-y">
          {loading && <div className="p-6 text-center text-sm text-slate-500 inline-flex w-full items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Cargando…</div>}
          {!loading && clients.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Sin resultados</div>}
          {clients.map(c => {
            const checked = sel.has(c.id);
            return (
              <label key={c.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 ${checked ? "bg-primary/5" : ""}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} className="w-4 h-4" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{c.full_name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{c.document ?? "—"} · Día pago: {c.billing_day ?? "—"}{c.dont_cut ? " · VIP" : ""}</div>
                </div>
                <span className={`mw-badge shrink-0 ${c.status === "active" ? "mw-badge-green" : c.status === "suspended" ? "mw-badge-yellow" : "mw-badge-red"}`}>{c.status}</span>
              </label>
            );
          })}
        </div>
        <div className="border-t px-4 py-3 flex justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="mw-btn h-9 px-3 text-xs">Cancelar</button>
          <button disabled={busy || !sel.size} onClick={apply} className="mw-btn mw-btn-green h-9 px-3 text-xs disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Aplicar a {sel.size}
          </button>
        </div>
      </div>
    </div>
  );
}
