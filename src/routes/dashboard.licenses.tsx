import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { supabase } from "@/integrations/supabase/client";
import { issueLicense, updateLicense, deleteLicense, activateLocalLicense, getLocalLicense, clearLocalLicense } from "@/lib/license.functions";
import { Key, Plus, Copy, Check, Trash2, RefreshCcw, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/licenses")({
  head: () => ({ meta: [{ title: "Licencias — MikroSystem" }, { name: "robots", content: "noindex" }] }),
  component: LicensesPage,
});

const PLAN_PRESETS: Record<string, { max_clients: number; max_routers: number; price: number }> = {
  basic: { max_clients: 500, max_routers: 3, price: 150 },
  pro: { max_clients: 2000, max_routers: 15, price: 350 },
  enterprise: { max_clients: 999999, max_routers: 999, price: 700 },
};

function LicensesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [f, setF] = useState({
    customer_name: "", customer_email: "", plan: "basic" as "basic"|"pro"|"enterprise",
    max_clients: 500, max_routers: 3, expires_at: "", price_paid: 150, notes: "",
  });
  const [actKey, setActKey] = useState("");

  const { data: licenses = [] } = useQuery({
    queryKey: ["licenses"],
    queryFn: async () => {
      const { data } = await supabase.from("licenses").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const getLocal = useServerFn(getLocalLicense);
  const { data: local } = useQuery({ queryKey: ["local-license"], queryFn: () => getLocal() });

  const issueFn = useServerFn(issueLicense);
  const updateFn = useServerFn(updateLicense);
  const deleteFn = useServerFn(deleteLicense);
  const activateFn = useServerFn(activateLocalLicense);
  const clearFn = useServerFn(clearLocalLicense);

  const setPlan = (plan: "basic"|"pro"|"enterprise") => {
    const p = PLAN_PRESETS[plan];
    setF(s => ({ ...s, plan, max_clients: p.max_clients, max_routers: p.max_routers, price_paid: p.price }));
  };

  const create = async () => {
    if (!f.customer_name.trim()) return toast.error("Nombre del cliente requerido");
    try {
      const lic: any = await issueFn({ data: { ...f, expires_at: f.expires_at || null, customer_email: f.customer_email || undefined } });
      toast.success(`Licencia emitida: ${lic.key}`);
      setShowForm(false);
      setF({ customer_name: "", customer_email: "", plan: "basic", max_clients: 500, max_routers: 3, expires_at: "", price_paid: 150, notes: "" });
      qc.invalidateQueries({ queryKey: ["licenses"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const copy = (key: string) => { navigator.clipboard.writeText(key); setCopied(key); setTimeout(() => setCopied(null), 2000); };

  const changeStatus = async (id: string, status: "active"|"suspended"|"revoked") => {
    try { await updateFn({ data: { id, status } }); toast.success("Actualizado"); qc.invalidateQueries({ queryKey: ["licenses"] }); }
    catch (e) { toast.error((e as Error).message); }
  };

  const resetBinding = async (id: string) => {
    if (!confirm("Resetear IP/hostname vinculado? El cliente podrá activarla en otro servidor.")) return;
    try { await updateFn({ data: { id, reset_binding: true } }); toast.success("Vínculo reseteado"); qc.invalidateQueries({ queryKey: ["licenses"] }); }
    catch (e) { toast.error((e as Error).message); }
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminar licencia definitivamente?")) return;
    try { await deleteFn({ data: { id } }); toast.success("Eliminada"); qc.invalidateQueries({ queryKey: ["licenses"] }); }
    catch (e) { toast.error((e as Error).message); }
  };

  const activate = async () => {
    if (!actKey.trim()) return;
    try {
      await activateFn({ data: { key: actKey.trim() } });
      toast.success("Licencia activada en este panel ✅");
      setShowActivate(false); setActKey("");
      qc.invalidateQueries({ queryKey: ["local-license"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const disconnect = async () => {
    if (!confirm("Desactivar licencia local?")) return;
    await clearFn(); toast.success("Licencia local removida"); qc.invalidateQueries({ queryKey: ["local-license"] });
  };

  const stats = {
    total: licenses.length,
    active: licenses.filter((l: any) => l.status === "active").length,
    suspended: licenses.filter((l: any) => l.status === "suspended").length,
    revenue: licenses.reduce((s: number, l: any) => s + Number(l.price_paid ?? 0), 0),
  };

  return (
    <AdminLayout>
      <div className="mb-4 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Licencias</h2>
          <p className="text-sm text-muted-foreground">Emisión, activación y control de licencias del sistema</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowActivate(true)} className="px-3 py-2 rounded-md border text-sm hover:bg-muted flex items-center gap-2"><Key className="w-4 h-4" />Activar aquí</button>
          <button onClick={() => setShowForm(true)} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 flex items-center gap-2"><Plus className="w-4 h-4" />Emitir licencia</button>
        </div>
      </div>

      {/* Estado local */}
      <div className={`mb-4 rounded-lg p-4 border ${local?.status === "licensed" ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30" : "bg-amber-50 border-amber-200 dark:bg-amber-950/30"}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {local?.status === "licensed"
              ? <ShieldCheck className="w-8 h-8 text-emerald-600" />
              : <ShieldAlert className="w-8 h-8 text-amber-600" />}
            <div>
              <div className="text-sm font-semibold">{local?.status === "licensed" ? "Este panel tiene licencia activa" : "Este panel no tiene licencia"}</div>
              {local?.status === "licensed" ? (
                <div className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-mono">{local.license_key}</span> • Plan <b>{local.plan}</b> • Hasta {local.max_clients} clientes
                  {local.expires_at && <> • Expira {new Date(local.expires_at).toLocaleDateString("es-BO")}</>}
                  {local.last_verified_at && <> • Verificada {new Date(local.last_verified_at).toLocaleString("es-BO")}</>}
                </div>
              ) : <div className="text-xs text-muted-foreground mt-0.5">Activá una licencia para eliminar límites de la instalación.</div>}
            </div>
          </div>
          {local?.status === "licensed" && (
            <button onClick={disconnect} className="text-xs px-2 py-1 rounded border hover:bg-background">Desactivar</button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total emitidas" value={stats.total} />
        <StatCard label="Activas" value={stats.active} tone="emerald" />
        <StatCard label="Suspendidas / Revocadas" value={stats.suspended + licenses.filter((l:any) => l.status === "revoked").length} tone="red" />
        <StatCard label="Ingresos por licencias" value={`$ ${stats.revenue.toFixed(2)}`} tone="indigo" />
      </div>

      {showActivate && (
        <div className="bg-card border rounded-lg p-4 mb-4">
          <div className="text-sm font-semibold mb-2">Activar licencia en este panel</div>
          <div className="flex gap-2 flex-wrap">
            <input value={actKey} onChange={e => setActKey(e.target.value.toUpperCase())} placeholder="MKS-XXXX-XXXX-XXXX" className="flex-1 min-w-[240px] px-3 py-2 rounded border bg-background text-sm font-mono outline-none focus:border-primary" />
            <button onClick={activate} className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-semibold">Activar</button>
            <button onClick={() => setShowActivate(false)} className="px-4 py-2 rounded border text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-card border rounded-lg p-4 mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Cliente *"><input value={f.customer_name} onChange={e => setF({ ...f, customer_name: e.target.value })} className={cls} /></Field>
          <Field label="Email"><input type="email" value={f.customer_email} onChange={e => setF({ ...f, customer_email: e.target.value })} className={cls} /></Field>
          <Field label="Plan">
            <select value={f.plan} onChange={e => setPlan(e.target.value as any)} className={cls}>
              <option value="basic">Basic — 500 clientes ($150)</option>
              <option value="pro">Pro — 2000 clientes ($350)</option>
              <option value="enterprise">Enterprise — Ilimitado ($700)</option>
            </select>
          </Field>
          <Field label="Precio pagado ($)"><input type="number" value={f.price_paid} onChange={e => setF({ ...f, price_paid: +e.target.value })} className={cls} /></Field>
          <Field label="Máx. clientes"><input type="number" value={f.max_clients} onChange={e => setF({ ...f, max_clients: +e.target.value })} className={cls} /></Field>
          <Field label="Máx. routers"><input type="number" value={f.max_routers} onChange={e => setF({ ...f, max_routers: +e.target.value })} className={cls} /></Field>
          <Field label="Expira (opcional)"><input type="date" value={f.expires_at} onChange={e => setF({ ...f, expires_at: e.target.value })} className={cls} /></Field>
          <Field label="Notas"><input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} className={cls} /></Field>
          <div className="md:col-span-2 flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded border text-sm">Cancelar</button>
            <button onClick={create} className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-semibold">Emitir</button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Clave</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Vinculado a</th>
                <th className="px-3 py-2 text-left">Expira</th>
                <th className="px-3 py-2 text-left">Último ping</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {licenses.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">Aún no hay licencias emitidas</td></tr>
              ) : licenses.map((l: any) => (
                <tr key={l.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">
                    <button onClick={() => copy(l.key)} className="inline-flex items-center gap-1 hover:text-primary">
                      {l.key} {copied === l.key ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 opacity-50" />}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.customer_name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{l.customer_email ?? ""}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">{l.plan}</span>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{l.max_clients} clientes</div>
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
                  <td className="px-3 py-2 text-xs">
                    {l.bound_ip ? (
                      <>
                        <div className="font-mono">{l.bound_ip}</div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-[140px]">{l.bound_hostname ?? ""}</div>
                      </>
                    ) : <span className="text-muted-foreground">Sin activar</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{l.expires_at ? new Date(l.expires_at).toLocaleDateString("es-BO") : "Sin vencimiento"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.last_heartbeat_at ? new Date(l.last_heartbeat_at).toLocaleString("es-BO") : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex gap-1 justify-end">
                      {l.status === "active" ? (
                        <button onClick={() => changeStatus(l.id, "suspended")} title="Suspender" className="p-1.5 rounded hover:bg-muted text-amber-600"><ShieldAlert className="w-3.5 h-3.5" /></button>
                      ) : (
                        <button onClick={() => changeStatus(l.id, "active")} title="Reactivar" className="p-1.5 rounded hover:bg-muted text-emerald-600"><ShieldCheck className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={() => resetBinding(l.id)} title="Resetear IP" className="p-1.5 rounded hover:bg-muted text-blue-600"><RefreshCcw className="w-3.5 h-3.5" /></button>
                      <button onClick={() => changeStatus(l.id, "revoked")} title="Revocar" className="p-1.5 rounded hover:bg-muted text-red-600"><ShieldX className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(l.id)} title="Eliminar" className="p-1.5 rounded hover:bg-muted text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 bg-muted/40 border rounded-lg p-3 text-xs text-muted-foreground">
        <div className="font-semibold text-foreground mb-1">API pública para el instalador (self-hosted)</div>
        <div><span className="font-mono">POST /api/public/license/activate</span> — <code>{`{ key, hostname }`}</code></div>
        <div><span className="font-mono">POST /api/public/license/heartbeat</span> — <code>{`{ key, hostname }`}</code></div>
        <div className="mt-1">Responden con un token JWT firmado (HMAC SHA-256) válido 7 días para operar offline.</div>
      </div>
    </AdminLayout>
  );
}

const cls = "w-full px-2 py-1.5 rounded border bg-background text-sm outline-none focus:border-primary";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] text-muted-foreground mb-1">{label}</label>{children}</div>;
}
function StatCard({ label, value, tone }: { label: string; value: any; tone?: string }) {
  const t: Record<string, string> = { emerald: "text-emerald-600", red: "text-red-600", indigo: "text-indigo-600" };
  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tone ? t[tone] : ""}`}>{value}</div>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    suspended: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    revoked: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    expired: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${map[status] ?? map.expired}`}>{status}</span>;
}
