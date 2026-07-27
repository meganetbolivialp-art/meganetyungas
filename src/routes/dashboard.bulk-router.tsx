import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Router as RouterIcon, Users, Calendar, MessageSquare, Send, CheckSquare, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/bulk-router")({
  head: () => ({
    meta: [
      { title: "Cambios masivos por router — MikroSystem ISP" },
      { name: "description", content: "Cambio masivo de fecha de pago o envío de plantilla a clientes de un router." },
      { property: "og:title", content: "Cambios masivos por router" },
      { property: "og:description", content: "Actualiza clientes en lote seleccionados por router." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BulkRouterPage,
});

type Router = { id: string; name: string; ip_address: string | null };
type Client = { id: string; full_name: string; document: string | null; phone: string | null; email: string | null; billing_day: number | null; status: string };
type Template = { id: string; code: string; channel: string; subject: string | null; body: string };

function BulkRouterPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [routerId, setRouterId] = useState<string>("");
  const [clients, setClients] = useState<Client[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"billing" | "template">("billing");

  // Billing form
  const [newDay, setNewDay] = useState<number>(1);
  // Template form
  const [tplId, setTplId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [r, t] = await Promise.all([
        supabase.from("routers").select("id, name, ip_address").order("name"),
        supabase.from("message_templates").select("*").eq("is_active", true).order("code"),
      ]);
      setRouters((r.data as any) ?? []);
      setTemplates((t.data as any) ?? []);
    })();
  }, []);

  const loadClients = async (rid: string) => {
    setRouterId(rid);
    setSel(new Set());
    if (!rid) { setClients([]); return; }
    setLoading(true);
    const { data: svcs } = await supabase.from("services").select("client_id").eq("router_id", rid);
    const ids = Array.from(new Set((svcs ?? []).map((s: any) => s.client_id).filter(Boolean)));
    if (!ids.length) { setClients([]); setLoading(false); return; }
    const { data: cli } = await supabase
      .from("clients")
      .select("id, full_name, document, phone, email, billing_day, status")
      .in("id", ids)
      .order("full_name");
    setClients((cli as any) ?? []);
    setLoading(false);
  };

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(s => s.size === clients.length ? new Set() : new Set(clients.map(c => c.id)));
  const allChecked = clients.length > 0 && sel.size === clients.length;

  const selectedTpl = useMemo(() => templates.find(t => t.id === tplId), [tplId, templates]);

  const applyBilling = async () => {
    if (!sel.size) return toast.error("Selecciona al menos un cliente");
    if (newDay < 1 || newDay > 28) return toast.error("Día debe estar entre 1 y 28");
    if (!confirm(`¿Cambiar día de pago a ${newDay} para ${sel.size} cliente(s)?`)) return;
    setBusy(true);
    const { error } = await supabase.from("clients").update({ billing_day: newDay }).in("id", Array.from(sel));
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${sel.size} clientes actualizados`);
    loadClients(routerId);
  };

  const sendTemplate = async () => {
    if (!sel.size) return toast.error("Selecciona al menos un cliente");
    if (!selectedTpl) return toast.error("Selecciona una plantilla");
    if (!confirm(`¿Enviar plantilla "${selectedTpl.code}" (${selectedTpl.channel}) a ${sel.size} cliente(s)?`)) return;
    setBusy(true);
    const { error } = await supabase.from("messages").insert({
      channel: selectedTpl.channel,
      subject: selectedTpl.subject,
      content: selectedTpl.body,
      target: `router:${routers.find(r => r.id === routerId)?.name ?? routerId}`,
      recipients_count: sel.size,
      status: "sent",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Enviado a ${sel.size} clientes`);
    setSel(new Set());
  };

  return (
    <AdminLayout title="Cambios masivos por router" subtitle="Cambia fecha de pago o envía plantillas a clientes de un router" breadcrumb={["Herramientas", "Cambios masivos"]}>
      {/* Selector de router */}
      <div className="rounded-md border bg-card p-3 mb-3">
        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5 mb-1.5"><RouterIcon className="w-3.5 h-3.5" /> Router</label>
        <div className="flex flex-wrap items-center gap-2">
          <select value={routerId} onChange={e => loadClients(e.target.value)} className="mw-input h-9 min-w-[220px] flex-1 sm:flex-none">
            <option value="">— Selecciona un router —</option>
            {routers.map(r => <option key={r.id} value={r.id}>{r.name}{r.ip_address ? ` (${r.ip_address})` : ""}</option>)}
          </select>
          {routerId && (
            <span className="text-xs text-slate-500 inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{clients.length} cliente(s)</span>
          )}
        </div>
      </div>

      {routerId && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
          {/* Lista clientes */}
          <div className="rounded-md border bg-card overflow-hidden">
            <div className="flex items-center justify-between p-2 border-b bg-slate-50">
              <button onClick={toggleAll} className="text-xs inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900">
                {allChecked ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                {allChecked ? "Deseleccionar todos" : "Seleccionar todos"}
              </button>
              <span className="text-xs text-slate-500">{sel.size} seleccionado(s)</span>
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y">
              {loading && <div className="p-6 text-center text-sm text-slate-500 inline-flex w-full items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Cargando…</div>}
              {!loading && clients.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Sin clientes en este router</div>}
              {clients.map(c => {
                const checked = sel.has(c.id);
                return (
                  <label key={c.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 ${checked ? "bg-primary/5" : ""}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} className="w-4 h-4" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 truncate">{c.full_name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{c.document ?? "—"} · {c.phone ?? c.email ?? "sin contacto"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-slate-500">Día pago</div>
                      <div className="text-sm font-mono font-semibold text-slate-700">{c.billing_day ?? "—"}</div>
                    </div>
                    <span className={`mw-badge shrink-0 ${c.status === "active" ? "mw-badge-green" : c.status === "suspended" ? "mw-badge-yellow" : "mw-badge-red"}`}>{c.status}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Panel de acción */}
          <div className="rounded-md border bg-card overflow-hidden">
            <div className="grid grid-cols-2 border-b">
              <button onClick={() => setTab("billing")} className={`h-10 text-sm inline-flex items-center justify-center gap-1.5 ${tab === "billing" ? "bg-primary text-primary-foreground" : "hover:bg-slate-50"}`}>
                <Calendar className="w-4 h-4" />Fecha de pago
              </button>
              <button onClick={() => setTab("template")} className={`h-10 text-sm inline-flex items-center justify-center gap-1.5 ${tab === "template" ? "bg-primary text-primary-foreground" : "hover:bg-slate-50"}`}>
                <MessageSquare className="w-4 h-4" />Plantilla
              </button>
            </div>
            <div className="p-3 space-y-3">
              {tab === "billing" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Nuevo día de pago (1-28)</label>
                    <input type="number" min={1} max={28} value={newDay} onChange={e => setNewDay(Number(e.target.value))} className="mw-input h-9 w-full" />
                    <p className="text-[11px] text-slate-500 mt-1">Se aplicará al ciclo del próximo mes.</p>
                  </div>
                  <button disabled={busy || !sel.size} onClick={applyBilling} className="mw-btn mw-btn-green w-full h-10 justify-center disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                    Aplicar a {sel.size} cliente(s)
                  </button>
                </>
              )}
              {tab === "template" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Plantilla</label>
                    <select value={tplId} onChange={e => setTplId(e.target.value)} className="mw-input h-9 w-full">
                      <option value="">— Selecciona —</option>
                      {templates.map(t => <option key={t.id} value={t.id}>[{t.channel}] {t.code}</option>)}
                    </select>
                  </div>
                  {selectedTpl && (
                    <div className="rounded border bg-slate-50 p-2 text-[12px]">
                      {selectedTpl.subject && <div className="font-semibold text-slate-800 mb-1">{selectedTpl.subject}</div>}
                      <div className="text-slate-600 whitespace-pre-line max-h-32 overflow-y-auto">{selectedTpl.body}</div>
                    </div>
                  )}
                  <button disabled={busy || !sel.size || !tplId} onClick={sendTemplate} className="mw-btn mw-btn-green w-full h-10 justify-center disabled:opacity-50">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar a {sel.size} cliente(s)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
