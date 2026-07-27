import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { useServerFn } from "@tanstack/react-start";
import {
  suspendService, reactivateService, changeServicePlan, provisionPPPoE, getServiceLive,
} from "@/lib/isp.functions";
import { toast } from "sonner";
import {
  Search, Plus, Trash2, Power, PowerOff, Radio, Pencil, X, Check,
  Wifi, Eye, Loader2, RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/services")({
  head: () => ({
    meta: [
      { title: "Servicios / Contratos — MikroSystem ISP" },
      { name: "description", content: "Contratos PPPoE / Queue / Hotspot: crear, editar, suspender, reactivar, cambiar plan y push a Mikrotik." },
      { property: "og:title", content: "Servicios — MikroSystem ISP" },
      { property: "og:description", content: "Gestión completa de contratos de internet." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ServicesPage,
});

type Svc = {
  id: string; client_id: string; plan_id: string; router_id: string | null;
  ip_address: string | null; pppoe_user: string | null; pppoe_password: string | null;
  service_type: string; status: string; installation_date: string;
  monthly_price: number | null; auto_suspend: boolean; suspended_at: string | null;
  clients: { full_name: string; document: string | null } | null;
  plans: { name: string; price: number; download_mbps: number; upload_mbps: number } | null;
  routers: { name: string } | null;
};

const inputCls = "w-full px-2.5 py-1.5 rounded border bg-background text-sm outline-none focus:border-primary";

function ServicesPage() {
  const [rows, setRows] = useState<Svc[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [routers, setRouters] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended" | "cancelled">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, string | null>>({});
  const [showForm, setShowForm] = useState<null | { mode: "create" | "edit"; data: any }>(null);
  const [live, setLive] = useState<Record<string, any>>({});

  const suspend = useServerFn(suspendService);
  const reactivate = useServerFn(reactivateService);
  const changePlan = useServerFn(changeServicePlan);
  const provision = useServerFn(provisionPPPoE);
  const liveFn = useServerFn(getServiceLive);

  const load = async () => {
    setLoading(true);
    const [s, c, p, r] = await Promise.all([
      supabase.from("services").select("*, clients(full_name, document), plans(name, price, download_mbps, upload_mbps), routers(name)").order("created_at", { ascending: false }),
      supabase.from("clients").select("id, full_name").order("full_name"),
      supabase.from("plans").select("id, name, price, download_mbps, upload_mbps").eq("active", true),
      supabase.from("routers").select("id, name"),
    ]);
    setRows((s.data as any) ?? []); setClients(c.data ?? []); setPlans(p.data ?? []); setRouters(r.data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setRowBusy = (id: string, label: string | null) => setBusy(b => ({ ...b, [id]: label }));

  const run = async (id: string, label: string, fn: () => Promise<any>) => {
    setRowBusy(id, label);
    const tId = toast.loading(`${label}...`);
    try { await fn(); toast.dismiss(tId); toast.success(`${label} OK`); await load(); }
    catch (e: any) { toast.dismiss(tId); toast.error(`${label}: ${e.message}`); }
    finally { setRowBusy(id, null); }
  };

  const remove = async (svc: Svc) => {
    if (!confirm(`¿Eliminar contrato de ${svc.clients?.full_name}?`)) return;
    setRowBusy(svc.id, "Eliminando");
    const { error } = await supabase.from("services").delete().eq("id", svc.id);
    if (error) toast.error(error.message); else toast.success("Servicio eliminado");
    setRowBusy(svc.id, null); load();
  };

  const saveForm = async () => {
    if (!showForm) return;
    const f = showForm.data;
    if (!f.client_id || !f.plan_id) { toast.error("Cliente y plan son obligatorios"); return; }
    const payload = {
      client_id: f.client_id, plan_id: f.plan_id, router_id: f.router_id || null,
      ip_address: f.ip_address || null, pppoe_user: f.pppoe_user || null,
      pppoe_password: f.pppoe_password || null, service_type: f.service_type || "pppoe",
      status: f.status || "active", auto_suspend: f.auto_suspend ?? true,
      monthly_price: f.monthly_price ? Number(f.monthly_price) : null,
    };
    const tId = toast.loading(showForm.mode === "create" ? "Creando..." : "Guardando...");
    const { error } = showForm.mode === "create"
      ? await supabase.from("services").insert(payload)
      : await supabase.from("services").update(payload).eq("id", f.id);
    toast.dismiss(tId);
    if (error) return toast.error(error.message);
    toast.success(showForm.mode === "create" ? "Servicio creado" : "Servicio actualizado");
    setShowForm(null); load();
  };

  const loadLive = async (id: string) => {
    setRowBusy(id, "Consultando");
    try { const r = await liveFn({ data: { serviceId: id } }); setLive(l => ({ ...l, [id]: r })); }
    catch (e: any) { setLive(l => ({ ...l, [id]: { error: e.message } })); }
    finally { setRowBusy(id, null); }
  };

  const filtered = useMemo(() => {
    const term = q.toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!term) return true;
      return (
        r.clients?.full_name.toLowerCase().includes(term) ||
        r.clients?.document?.toLowerCase().includes(term) ||
        r.ip_address?.toLowerCase().includes(term) ||
        r.pppoe_user?.toLowerCase().includes(term) ||
        r.plans?.name.toLowerCase().includes(term)
      );
    });
  }, [rows, q, statusFilter]);

  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter(r => r.status === "active").length,
    suspended: rows.filter(r => r.status === "suspended").length,
    cancelled: rows.filter(r => r.status === "cancelled").length,
  }), [rows]);

  return (
    <AdminLayout title="Servicios / Contratos" subtitle={`${counts.all} contratos · ${counts.active} activos · ${counts.suspended} suspendidos`} breadcrumb={["Clientes", "Servicios"]}>
      {/* Toolbar */}
      <div className="rounded-md border bg-card mb-3">
        <div className="flex items-center gap-2 p-3 flex-wrap border-b">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente, plan, IP o PPPoE..." className="w-full pl-9 pr-3 py-2 rounded border bg-background text-sm outline-none focus:border-primary" />
          </div>
          <button onClick={load} className="inline-flex items-center gap-1 px-3 py-2 rounded border text-sm hover:bg-muted"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refrescar</button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setShowForm({ mode: "create", data: { service_type: "pppoe", status: "active", auto_suspend: true } })} className="inline-flex items-center gap-1 px-3 py-2 rounded bg-primary text-primary-foreground text-sm hover:opacity-90"><Plus className="w-4 h-4" /> Nuevo contrato</button>
          </div>
        </div>
        <div className="flex gap-1 p-2 text-xs">
          {(["all", "active", "suspended", "cancelled"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full border transition ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
              {s === "all" ? "Todos" : s === "active" ? "Activos" : s === "suspended" ? "Suspendidos" : "Cancelados"} <span className="opacity-70">({counts[s]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <ServiceForm
          data={showForm.data}
          mode={showForm.mode}
          clients={clients} plans={plans} routers={routers}
          onChange={(d: any) => setShowForm({ ...showForm, data: d })}
          onCancel={() => setShowForm(null)}
          onSave={saveForm}
        />
      )}

      {/* Table */}
      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left">Cliente</th>
              <th className="px-3 py-2.5 text-left">Tipo</th>
              <th className="px-3 py-2.5 text-left">Plan</th>
              <th className="px-3 py-2.5 text-left">Router</th>
              <th className="px-3 py-2.5 text-left">IP</th>
              <th className="px-3 py-2.5 text-left">PPPoE</th>
              <th className="px-3 py-2.5 text-left">Estado</th>
              <th className="px-3 py-2.5 text-right w-1">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground"><Loader2 className="inline w-4 h-4 animate-spin mr-2" />Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">Sin resultados</td></tr>
            ) : filtered.map(s => {
              const rowBusy = busy[s.id];
              const l = live[s.id];
              return (
                <tr key={s.id} className={`border-t hover:bg-muted/30 ${rowBusy ? "opacity-60" : ""}`}>
                  <td className="px-3 py-2">
                    <Link to="/dashboard/clients/$clientId" params={{ clientId: s.client_id }} className="font-medium text-primary hover:underline">{s.clients?.full_name ?? "—"}</Link>
                    {s.clients?.document && <div className="text-[11px] text-muted-foreground">{s.clients.document}</div>}
                  </td>
                  <td className="px-3 py-2"><span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 uppercase font-semibold">{s.service_type}</span></td>
                  <td className="px-3 py-2">
                    <select
                      defaultValue={s.plan_id}
                      disabled={!!rowBusy}
                      onChange={e => e.target.value !== s.plan_id && run(s.id, "Cambio de plan", () => changePlan({ data: { serviceId: s.id, planId: e.target.value } }))}
                      className="text-xs border rounded px-2 py-1 bg-background max-w-[160px]"
                    >
                      {plans.map(p => <option key={p.id} value={p.id}>{p.name} — Bs {p.price}</option>)}
                    </select>
                    {s.plans && <div className="text-[10px] text-muted-foreground mt-0.5">{s.plans.download_mbps}/{s.plans.upload_mbps} Mbps</div>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.routers?.name ?? <span className="italic text-xs">sin asignar</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.ip_address ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {s.pppoe_user ?? "—"}
                    {l && !l.error && (
                      <div className={`text-[10px] mt-0.5 ${l.active ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {l.active ? `● online · ${l.active.uptime ?? ""}` : "○ offline"}
                      </div>
                    )}
                    {l?.error && <div className="text-[10px] text-destructive">✗ {l.error}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={s.status} />
                    {s.suspended_at && <div className="text-[10px] text-muted-foreground mt-0.5">desde {new Date(s.suspended_at).toLocaleDateString()}</div>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-0.5">
                      {rowBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary mr-1" />}
                      {s.pppoe_user && s.router_id && (
                        <IconBtn title="Estado en vivo" onClick={() => loadLive(s.id)} disabled={!!rowBusy}><Eye className="w-4 h-4" /></IconBtn>
                      )}
                      {s.pppoe_user && s.router_id && (
                        <IconBtn title="Push Mikrotik" onClick={() => run(s.id, "Push Mikrotik", () => provision({ data: { serviceId: s.id } }))} disabled={!!rowBusy} tone="primary"><Radio className="w-4 h-4" /></IconBtn>
                      )}
                      {s.status === "active" ? (
                        <IconBtn title="Suspender (morosos)" onClick={() => run(s.id, "Suspender", () => suspend({ data: { serviceId: s.id, mode: "morosos_lv" } }))} disabled={!!rowBusy} tone="warn"><PowerOff className="w-4 h-4" /></IconBtn>
                      ) : s.status === "suspended" ? (
                        <IconBtn title="Reactivar" onClick={() => run(s.id, "Reactivar", () => reactivate({ data: { serviceId: s.id } }))} disabled={!!rowBusy} tone="success"><Power className="w-4 h-4" /></IconBtn>
                      ) : (
                        <IconBtn title="Reactivar" onClick={() => run(s.id, "Reactivar", () => reactivate({ data: { serviceId: s.id } }))} disabled={!!rowBusy} tone="success"><Power className="w-4 h-4" /></IconBtn>
                      )}
                      <IconBtn title="Editar" onClick={() => setShowForm({ mode: "edit", data: { ...s } })} disabled={!!rowBusy}><Pencil className="w-4 h-4" /></IconBtn>
                      <IconBtn title="Eliminar" onClick={() => remove(s)} disabled={!!rowBusy} tone="danger"><Trash2 className="w-4 h-4" /></IconBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    suspended: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase ${map[status] ?? "bg-muted text-muted-foreground"}`}>{status}</span>;
}

function IconBtn({ children, onClick, title, disabled, tone = "default" }: any) {
  const map: Record<string, string> = {
    default: "hover:bg-muted text-muted-foreground",
    primary: "hover:bg-primary/10 text-primary",
    success: "hover:bg-emerald-500/15 text-emerald-600",
    warn: "hover:bg-amber-500/15 text-amber-600",
    danger: "hover:bg-destructive/15 text-destructive",
  };
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`p-1.5 rounded transition disabled:opacity-30 disabled:cursor-not-allowed ${map[tone]}`}>
      {children}
    </button>
  );
}

function ServiceForm({ data, mode, clients, plans, routers, onChange, onCancel, onSave }: any) {
  const upd = (k: string, v: any) => onChange({ ...data, [k]: v });
  return (
    <div className="rounded-md border bg-card mb-3 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b">
        <div className="text-sm font-semibold inline-flex items-center gap-2"><Wifi className="w-4 h-4 text-primary" />{mode === "create" ? "Nuevo contrato" : "Editar contrato"}</div>
        <button onClick={onCancel} className="p-1 rounded hover:bg-background"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
        <Field label="Cliente *">
          <select value={data.client_id ?? ""} onChange={e => upd("client_id", e.target.value)} className={inputCls} disabled={mode === "edit"}>
            <option value="">Seleccionar...</option>
            {clients.map((c: any) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </Field>
        <Field label="Tipo">
          <select value={data.service_type ?? "pppoe"} onChange={e => upd("service_type", e.target.value)} className={inputCls}>
            <option value="pppoe">PPPoE</option><option value="queue">Simple Queue</option><option value="hotspot">Hotspot</option>
          </select>
        </Field>
        <Field label="Estado">
          <select value={data.status ?? "active"} onChange={e => upd("status", e.target.value)} className={inputCls}>
            <option value="active">Activo</option><option value="suspended">Suspendido</option><option value="cancelled">Cancelado</option>
          </select>
        </Field>
        <Field label="Plan *">
          <select value={data.plan_id ?? ""} onChange={e => upd("plan_id", e.target.value)} className={inputCls}>
            <option value="">Seleccionar...</option>
            {plans.map((p: any) => <option key={p.id} value={p.id}>{p.name} — Bs {p.price} ({p.download_mbps}/{p.upload_mbps})</option>)}
          </select>
        </Field>
        <Field label="Router / NAS">
          <select value={data.router_id ?? ""} onChange={e => upd("router_id", e.target.value)} className={inputCls}>
            <option value="">Sin asignar</option>
            {routers.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Precio mensual (opcional)">
          <input type="number" step="0.01" value={data.monthly_price ?? ""} onChange={e => upd("monthly_price", e.target.value)} placeholder="Sobrescribe precio del plan" className={inputCls} />
        </Field>
        <Field label="Usuario PPPoE"><input value={data.pppoe_user ?? ""} onChange={e => upd("pppoe_user", e.target.value)} className={inputCls} /></Field>
        <Field label="Contraseña PPPoE"><input value={data.pppoe_password ?? ""} onChange={e => upd("pppoe_password", e.target.value)} className={inputCls} /></Field>
        <Field label="IP fija (opcional)"><input value={data.ip_address ?? ""} onChange={e => upd("ip_address", e.target.value)} placeholder="10.0.0.100" className={inputCls} /></Field>
        <label className="inline-flex items-center gap-2 text-sm md:col-span-3">
          <input type="checkbox" checked={data.auto_suspend ?? true} onChange={e => upd("auto_suspend", e.target.checked)} />
          Auto-suspender al vencer facturas
        </label>
      </div>
      <div className="flex justify-end gap-2 px-4 py-3 border-t bg-muted/20">
        <button onClick={onCancel} className="px-3 py-1.5 rounded border text-sm hover:bg-muted">Cancelar</button>
        <button onClick={onSave} className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm hover:opacity-90"><Check className="w-4 h-4" />Guardar</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>{children}</label>;
}
