import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin-layout";
import {
  listCutoffPolicies, listPolicyRouters, upsertCutoffPolicy, deleteCutoffPolicy,
  type CutoffPolicy,
} from "@/lib/cutoff-policies.functions";
import { Plus, Pencil, Trash2, Star, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/cutoff-policies")({
  head: () => ({
    meta: [
      { title: "Plantillas de corte — MikroSystem" },
      { name: "description", content: "Plantillas reutilizables de política de corte: días de gracia, hora, modo y notificaciones." },
      { property: "og:title", content: "Plantillas de corte — MEGANET" },
      { property: "og:description", content: "Ciclo de facturación, vencimiento y corte por nodo y cliente en MEGANET." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CutoffPoliciesPageRoute,
});

const empty: Partial<CutoffPolicy> = {
  name: "",
  description: "",
  grace_days: 5,
  cut_hour: 9,
  cut_day: null,
  invoice_day: null,
  due_day: null,
  router_ids: [],
  cut_mode: "ip",
  speed_reduced_kbps: null,
  prior_notice_hours: 24,
  notify_sms: true,
  notify_email: true,
  notify_whatsapp: false,
  reconnect_fee: 0,
  late_fee: 0,
  auto_suspend: true,
  is_default: false,
  is_active: true,
};

export function CutoffPoliciesPageContent() {
  const qc = useQueryClient();
  const list = useServerFn(listCutoffPolicies);
  const save = useServerFn(upsertCutoffPolicy);
  const del = useServerFn(deleteCutoffPolicy);

  const q = useQuery({ queryKey: ["cutoff-policies"], queryFn: () => list() });
  const listRouters = useServerFn(listPolicyRouters);
  const routersQ = useQuery({ queryKey: ["cutoff-policy-routers"], queryFn: () => listRouters() });
  const routers = routersQ.data ?? [];
  const [editing, setEditing] = useState<Partial<CutoffPolicy> | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["cutoff-policies"] });
    qc.invalidateQueries({ queryKey: ["cutoff-policy-routers"] });
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["cutoff-dashboard"] });
  };

  const onSave = async () => {
    if (saving) return;
    if (!editing?.name?.trim()) { toast.error("Nombre requerido"); return; }
    const selectedNodes = routers.filter(r => editing.router_ids?.includes(r.id));
    if (selectedNodes.length && !window.confirm(
      `¿Aplicar la plantilla a TODOS los clientes de ${selectedNodes.map(r => r.name).join(", ")}?\n\nSe reemplazarán sus plantillas anteriores y se actualizarán el día de pago, la gracia y el corte automático. Los pagos, facturas, precios, promesas y «no cortar» se conservarán.`
    )) return;
    setSaving(true);
    try {
      const result = await save({ data: { ...editing, name: editing.name.trim() } });
      toast.success(`Plantilla guardada · ${result.updatedClients} clientes actualizados`);
      setEditing(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const onDelete = async (id: string) => {
    if (!confirm("¿Eliminar plantilla?")) return;
    try { await del({ data: { id } }); toast.success("Eliminada"); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const modeLabel = (m: string) =>
    m === "ip" ? "Corte por IP" : m === "speed" ? "Baja velocidad" : "Deshabilitar PPPoE";

  return (
    <>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Plantillas de corte</h1>
          <p className="text-sm text-muted-foreground">Definí políticas reutilizables y aplicalas a los clientes desde el panel de Cortes.</p>
        </div>
        <button
          onClick={() => setEditing({ ...empty })}
          className="inline-flex items-center gap-2 bg-[#ff5722] hover:bg-[#e64a19] text-white px-4 py-2 rounded-md text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Nueva plantilla
        </button>
      </div>

      <div className="bg-card border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#1e2a38] text-white text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">Nombre</th>
              <th className="px-3 py-2 text-left">Modo</th>
              <th className="px-3 py-2 text-right">Cuándo corta</th>
              <th className="px-3 py-2 text-right">Hora</th>
              <th className="px-3 py-2 text-right">Aviso</th>
              <th className="px-3 py-2 text-right">Reconexión</th>
              <th className="px-3 py-2 text-left">Nodos</th>
              <th className="px-3 py-2 text-center">Notif.</th>
              <th className="px-3 py-2 text-center">Estado</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>}
            {!q.isLoading && (q.data ?? []).length === 0 && (
              <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">Sin plantillas aún.</td></tr>
            )}
            {(q.data ?? []).map(p => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2">
                  <div className="font-semibold flex items-center gap-2">
                    {p.is_default && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                    {p.name}
                  </div>
                  {p.description && <div className="text-[11px] text-muted-foreground">{p.description}</div>}
                </td>
                <td className="px-3 py-2">{modeLabel(p.cut_mode)}{p.cut_mode === "speed" && p.speed_reduced_kbps ? ` (${p.speed_reduced_kbps}k)` : ""}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{p.cut_day ? `Día ${p.cut_day} del mes` : `${p.grace_days}d de gracia`}
                  {p.invoice_day ? <div className="text-[11px] text-muted-foreground">Factura día {p.invoice_day}{p.due_day ? ` · paga día ${p.due_day}` : ""}</div> : null}</td>
                <td className="px-3 py-2 text-right">{String(p.cut_hour).padStart(2,"0")}:00</td>
                <td className="px-3 py-2 text-right">{p.prior_notice_hours}h</td>
                <td className="px-3 py-2 text-right">Bs {Number(p.reconnect_fee).toFixed(2)}</td>
                <td className="px-3 py-2 text-[11px]">
                  {(p.router_ids ?? []).map((id) => routers.find((r) => r.id === id)?.name).filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-3 py-2 text-center text-[11px]">
                  {[p.notify_sms && "SMS", p.notify_email && "Email", p.notify_whatsapp && "WA"].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  {p.is_active
                    ? <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">Activa</span>
                    : <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold uppercase">Inactiva</span>}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => setEditing(p)} className="text-[11px] bg-slate-600 hover:bg-slate-700 text-white px-2 py-1 rounded mr-1 inline-flex items-center gap-1">
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                  <button onClick={() => onDelete(p.id)} className="text-[11px] bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded inline-flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4" onClick={() => { if (!saving) setEditing(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="cutoff-policy-dialog-title" className="bg-card rounded-md border w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 id="cutoff-policy-dialog-title" className="font-semibold mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#ff5722]" />
              {editing.id ? "Editar plantilla" : "Nueva plantilla de corte"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <Field label="Nombre *">
                <input className="mw-input" value={editing.name ?? ""} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Modo de corte">
                <select className="mw-input" value={editing.cut_mode} onChange={e => setEditing({ ...editing, cut_mode: e.target.value as any })}>
                  <option value="ip">Corte por IP (address-list)</option>
                  <option value="speed">Bajar velocidad</option>
                  <option value="pppoe">Deshabilitar PPPoE</option>
                </select>
              </Field>
              <Field label="Descripción" wide>
                <input className="mw-input" value={editing.description ?? ""} onChange={e => setEditing({ ...editing, description: e.target.value })} />
              </Field>
              <Field label="Día que se genera la factura (1-28)">
                <input type="number" min={1} max={28} placeholder="Manual (sin automático)" className="mw-input" value={editing.invoice_day ?? ""} onChange={e => setEditing({ ...editing, invoice_day: e.target.value === "" ? null : Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
              </Field>
              <Field label="Día de pago / vencimiento (1-28)">
                <input type="number" min={1} max={28} placeholder="El del cliente" className="mw-input" value={editing.due_day ?? ""} onChange={e => setEditing({ ...editing, due_day: e.target.value === "" ? null : Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
              </Field>
              {editing.invoice_day && editing.due_day && editing.due_day < editing.invoice_day ? (
                <p className="md:col-span-2 text-[11px] text-muted-foreground">El día de pago es antes que el día de factura: la factura vencerá el mes siguiente.</p>
              ) : null}
              <Field label="¿Cuándo corta?">
                <select className="mw-input" value={editing.cut_day ? "day" : "grace"} onChange={e => setEditing({ ...editing, cut_day: e.target.value === "day" ? (editing.cut_day || 5) : null })}>
                  <option value="grace">Días después del vencimiento</option>
                  <option value="day">Un día fijo del mes</option>
                </select>
              </Field>
              {editing.cut_day ? (
                <Field label="Día de corte del mes (1-28)">
                  <input type="number" min={1} max={28} className="mw-input" value={editing.cut_day} onChange={e => setEditing({ ...editing, cut_day: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
                </Field>
              ) : (
                <Field label="Días de gracia">
                  <input type="number" min={0} className="mw-input" value={editing.grace_days ?? 0} onChange={e => setEditing({ ...editing, grace_days: Number(e.target.value) })} />
                </Field>
              )}
              <Field label="Hora de corte (0-23)">
                <input type="number" min={0} max={23} className="mw-input" value={editing.cut_hour ?? 9} onChange={e => setEditing({ ...editing, cut_hour: Number(e.target.value) })} />
              </Field>
              {editing.cut_mode === "speed" && (
                <Field label="Velocidad reducida (kbps)">
                  <input type="number" min={0} className="mw-input" value={editing.speed_reduced_kbps ?? 0} onChange={e => setEditing({ ...editing, speed_reduced_kbps: Number(e.target.value) })} />
                </Field>
              )}
              <Field label="Aviso previo (horas)">
                <input type="number" min={0} className="mw-input" value={editing.prior_notice_hours ?? 0} onChange={e => setEditing({ ...editing, prior_notice_hours: Number(e.target.value) })} />
              </Field>
              <Field label="Cargo reconexión (Bs)">
                <input type="number" step="0.01" className="mw-input" value={editing.reconnect_fee ?? 0} onChange={e => setEditing({ ...editing, reconnect_fee: Number(e.target.value) })} />
              </Field>
              <Field label="Mora (Bs)">
                <input type="number" step="0.01" className="mw-input" value={editing.late_fee ?? 0} onChange={e => setEditing({ ...editing, late_fee: Number(e.target.value) })} />
              </Field>
            </div>

            <div className="mt-4 border-t pt-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Aplicar automáticamente a los nodos</div>
              <p className="text-sm text-muted-foreground mb-2">Todos los clientes de estos nodos, incluso los que tengan otra plantilla. Se conservan pagos, facturas, precios, promesas y «no cortar».</p>
              {routers.length === 0 ? <p className="text-sm text-muted-foreground">No hay nodos registrados.</p> : (
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {routers.map((r) => {
                    const ids = editing.router_ids ?? [];
                    const other = r.cutoff_policy_id && r.cutoff_policy_id !== editing.id;
                    return (
                      <label key={r.id} className="inline-flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={ids.includes(r.id)} onChange={e => setEditing({ ...editing, router_ids: e.target.checked ? [...ids, r.id] : ids.filter((x) => x !== r.id) })} />
                        <span>{r.name}{other && !ids.includes(r.id) ? <span className="text-[10px] text-muted-foreground"> (tiene otra)</span> : null}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 border-t pt-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Notificaciones</div>
              <div className="flex flex-wrap gap-4 text-sm">
                <Check label="SMS" v={!!editing.notify_sms} onChange={v => setEditing({ ...editing, notify_sms: v })} />
                <Check label="Email" v={!!editing.notify_email} onChange={v => setEditing({ ...editing, notify_email: v })} />
                <Check label="WhatsApp" v={!!editing.notify_whatsapp} onChange={v => setEditing({ ...editing, notify_whatsapp: v })} />
              </div>
            </div>

            <div className="mt-4 border-t pt-3 flex flex-wrap gap-4 text-sm">
              <Check label="Corte automático" v={!!editing.auto_suspend} onChange={v => setEditing({ ...editing, auto_suspend: v })} />
              <Check label="Plantilla por defecto" v={!!editing.is_default} onChange={v => setEditing({ ...editing, is_default: v })} />
              <Check label="Activa" v={editing.is_active !== false} onChange={v => setEditing({ ...editing, is_active: v })} />
            </div>

            <div className="mt-5 flex gap-2 justify-end">
              <Button variant="outline" size="lg" disabled={saving} onClick={() => setEditing(null)}>Cancelar</Button>
              <Button size="lg" disabled={saving} onClick={onSave}>{saving ? "Actualizando clientes…" : "Guardar plantilla"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "md:col-span-2" : ""}`}>
      <div className="text-[11px] font-semibold uppercase text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}

function Check({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={v} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function CutoffPoliciesPageRoute() {
  return (
    <AdminLayout>
      <CutoffPoliciesPageContent />
    </AdminLayout>
  );
}
