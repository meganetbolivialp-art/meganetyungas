import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";

export const Route = createFileRoute("/dashboard/tickets")({
  head: () => ({
    meta: [
      { title: "Tickets de Soporte — MikroSystem ISP" },
      { name: "description", content: "Gestión de tickets de soporte técnico ISP." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TicketsPage,
});

type Ticket = {
  id: string; ticket_number: number; client_id: string | null; subject: string;
  description: string | null; priority: string; status: string;
  created_at: string; last_reply_at: string | null;
  clients: { full_name: string } | null;
};
type ClientOpt = { id: string; full_name: string };

const PRIORITIES = ["low", "medium", "high", "urgent"];
const STATUS_TABS = [
  { key: "all", label: "Todos" },
  { key: "open", label: "Abiertos" },
  { key: "in_progress", label: "En proceso" },
  { key: "resolved", label: "Resueltos" },
  { key: "closed", label: "Cerrados" },
];

function TicketsPage() {
  const [rows, setRows] = useState<Ticket[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [form, setForm] = useState({ client_id: "", subject: "", description: "", priority: "medium" });

  const load = async () => {
    const [tk, cs] = await Promise.all([
      supabase.from("tickets").select("*, clients(full_name)").order("created_at", { ascending: false }),
      supabase.from("clients").select("id, full_name").order("full_name"),
    ]);
    setRows((tk.data as Ticket[]) ?? []);
    setClients((cs.data as ClientOpt[]) ?? []);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("tickets-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (tab !== "all" && r.status !== tab) return false;
    if (q && !(`${r.subject} ${r.clients?.full_name ?? ""} #${r.ticket_number}`).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rows, tab, q]);

  const create = async () => {
    if (!form.subject.trim()) return;
    await supabase.from("tickets").insert({ ...form, client_id: form.client_id || null, status: "open" });
    setForm({ client_id: "", subject: "", description: "", priority: "medium" });
    setShowForm(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar ticket?")) return;
    await supabase.from("tickets").delete().eq("id", id);
    load();
  };

  const counts = {
    all: rows.length,
    open: rows.filter(r => r.status === "open").length,
    in_progress: rows.filter(r => r.status === "in_progress").length,
    resolved: rows.filter(r => r.status === "resolved").length,
    closed: rows.filter(r => r.status === "closed").length,
  };

  const priorityColor = (p: string) =>
    p === "urgent" ? "bg-destructive text-destructive-foreground" :
    p === "high" ? "bg-orange-500 text-white" :
    p === "medium" ? "bg-amber-500 text-white" :
    "bg-muted text-muted-foreground";

  const statusColor = (s: string) =>
    s === "resolved" ? "bg-emerald-500 text-white" :
    s === "closed" ? "bg-slate-500 text-white" :
    s === "in_progress" ? "bg-sky-500 text-white" :
    "bg-amber-500 text-white";

  return (
    <AdminLayout title="Tickets de Soporte" subtitle={`${rows.length} tickets`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar por asunto, cliente, #número..."
            className="w-full pl-9 pr-3 py-2 rounded-md border bg-background text-sm" />
        </div>
        <button onClick={() => setShowForm(s => !s)} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">
          <Plus className="w-4 h-4" /> Nuevo ticket
        </button>
      </div>

      <div className="flex gap-1 mb-4 border-b overflow-x-auto">
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label} <span className="ml-1 text-xs opacity-70">({(counts as any)[t.key]})</span>
          </button>
        ))}
      </div>

      {showForm && (
        <div className="mb-4 p-4 border rounded-md bg-muted/30 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}
              className="px-3 py-2 rounded-md border bg-background text-sm">
              <option value="">— Sin cliente —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
              className="px-3 py-2 rounded-md border bg-background text-sm">
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
            placeholder="Asunto" className="w-full px-3 py-2 rounded-md border bg-background text-sm" />
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="Descripción" rows={3} className="w-full px-3 py-2 rounded-md border bg-background text-sm" />
          <div className="flex gap-2">
            <button onClick={create} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm">Crear</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md border text-sm">Cancelar</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Asunto</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Prioridad</th>
                  <th className="text-left px-3 py-2">Estado</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}
                    className={`border-t cursor-pointer hover:bg-muted/40 ${selected?.id === t.id ? "bg-primary/5" : ""}`}
                    onClick={() => setSelected(t)}>
                    <td className="px-3 py-2 font-mono text-xs">#{t.ticket_number}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{t.subject}</div>
                      <div className="text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
                    </td>
                    <td className="px-3 py-2">{t.clients?.full_name ?? "—"}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${priorityColor(t.priority)}`}>{t.priority}</span></td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusColor(t.status)}`}>{t.status}</span></td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={(e) => { e.stopPropagation(); remove(t.id); }} className="text-destructive hover:opacity-70"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Sin tickets</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border rounded-md overflow-hidden min-h-[300px]">
          {selected ? <TicketDetail ticket={selected} onChanged={load} onClose={() => setSelected(null)} />
            : <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                <MessageCircle className="w-10 h-10 opacity-30" />
                Seleccioná un ticket para ver el hilo
              </div>}
        </div>
      </div>
    </AdminLayout>
  );
}

type TMsg = { id: string; body: string; author_name: string | null; is_internal: boolean; created_at: string };

function TicketDetail({ ticket, onChanged, onClose }: { ticket: Ticket; onChanged: () => void; onClose: () => void }) {
  const [msgs, setMsgs] = useState<TMsg[]>([]);
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("ticket_messages").select("*").eq("ticket_id", ticket.id).order("created_at");
    setMsgs((data as TMsg[]) ?? []);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel(`tm-${ticket.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticket.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ticket.id]);

  const send = async () => {
    if (!body.trim()) return;
    const { addTicketMessage } = await import("@/lib/tickets.functions");
    await addTicketMessage({ data: { ticket_id: ticket.id, body: body.trim(), is_internal: internal } });
    setBody("");
    load();
  };

  const changeStatus = async (status: string) => {
    const { setTicketStatus } = await import("@/lib/tickets.functions");
    await setTicketStatus({ data: { ticket_id: ticket.id, status } });
    onChanged();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">#{ticket.ticket_number}</div>
            <div className="font-semibold">{ticket.subject}</div>
            <div className="text-[11px] text-muted-foreground">{ticket.clients?.full_name ?? "Sin cliente"}</div>
          </div>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="flex gap-1 mt-2">
          {["open", "in_progress", "resolved", "closed"].map(s => (
            <button key={s} onClick={() => changeStatus(s)}
              className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${ticket.status === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[420px]">
        {ticket.description && (
          <div className="p-3 rounded bg-muted/40 text-sm">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Descripción inicial</div>
            {ticket.description}
          </div>
        )}
        {msgs.map(m => (
          <div key={m.id} className={`p-3 rounded text-sm ${m.is_internal ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800" : "bg-muted/30"}`}>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span className="font-semibold">{m.author_name ?? "Operador"}{m.is_internal && <span className="ml-2 text-amber-700 dark:text-amber-400">[NOTA INTERNA]</span>}</span>
              <span>{new Date(m.created_at).toLocaleString()}</span>
            </div>
            <div className="whitespace-pre-wrap">{m.body}</div>
          </div>
        ))}
        {msgs.length === 0 && !ticket.description && <div className="text-center text-xs text-muted-foreground py-6">Sin mensajes todavía</div>}
      </div>

      <div className="p-3 border-t space-y-2">
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} placeholder="Escribe una respuesta..."
          className="w-full px-3 py-2 rounded border bg-background text-sm" />
        <div className="flex items-center justify-between">
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> Nota interna
          </label>
          <button onClick={send} disabled={!body.trim()} className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50">Enviar</button>
        </div>
      </div>
    </div>
  );
}
