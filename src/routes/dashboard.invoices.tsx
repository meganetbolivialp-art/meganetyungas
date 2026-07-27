import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Check, Trash2, Zap, AlertTriangle, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { generateMonthlyInvoices, markOverdueInvoices, registerPayment } from "@/lib/isp.functions";
import { AdminLayout } from "@/components/admin-layout";

export const Route = createFileRoute("/dashboard/invoices")({
  head: () => ({
    meta: [
      { title: "Facturación — MikroSystem ISP" },
      { name: "description", content: "Facturas, pagos y estados de cuenta del ISP." },
      { property: "og:title", content: "Facturación — MikroSystem ISP" },
      { property: "og:description", content: "Control de facturas y pagos." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvoicesPage,
});

type Invoice = { id: string; client_id: string; amount: number; due_date: string; status: string; concept: string | null; paid_at: string | null; clients: { full_name: string } | null };
type ClientOpt = { id: string; full_name: string };

function InvoicesPage() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ client_id: "", amount: 40, due_date: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10), concept: "Servicio mensual" });
  const [filter, setFilter] = useState<"all" | "pending" | "paid" | "overdue">("all");
  const genFn = useServerFn(generateMonthlyInvoices);
  const overFn = useServerFn(markOverdueInvoices);
  const payFn = useServerFn(registerPayment);

  const load = async () => {
    const [inv, cs] = await Promise.all([
      supabase.from("invoices").select("*, clients(full_name)").order("due_date", { ascending: false }),
      supabase.from("clients").select("id, full_name").order("full_name"),
    ]);
    setRows((inv.data as Invoice[]) ?? []);
    setClients((cs.data as ClientOpt[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.client_id) return;
    await supabase.from("invoices").insert({ ...form, status: "pending" });
    setShowForm(false);
    load();
  };

  const markPaid = async (id: string) => {
    await payFn({ data: { invoiceId: id, method: "cash" } });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar factura?")) return;
    await supabase.from("invoices").delete().eq("id", id);
    load();
  };

  const filtered = filter === "all" ? rows : rows.filter(r => r.status === filter);
  const totals = {
    pending: rows.filter(r => r.status === "pending").reduce((s, r) => s + Number(r.amount), 0),
    paid: rows.filter(r => r.status === "paid").reduce((s, r) => s + Number(r.amount), 0),
    overdue: rows.filter(r => r.status === "overdue").reduce((s, r) => s + Number(r.amount), 0),
  };

  return (
    <AdminLayout title="Facturación" subtitle={`${rows.length} facturas registradas`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Cobrado</div>
          <div className="text-2xl font-bold text-emerald-600">Bs {totals.paid.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Por cobrar</div>
          <div className="text-2xl font-bold text-amber-600">Bs {totals.pending.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Vencido</div>
          <div className="text-2xl font-bold text-destructive">Bs {totals.overdue.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 p-1 rounded-md bg-muted">
          {(["all", "pending", "paid", "overdue"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-xs rounded ${filter === f ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              {f === "all" ? "Todas" : f === "pending" ? "Pendientes" : f === "paid" ? "Pagadas" : "Vencidas"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={async () => { const r = await genFn({ data: {} }); alert(`Facturas generadas: ${r.created}`); load(); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted"><Zap className="w-4 h-4 text-primary" /> Generar mes</button>
          <button onClick={async () => { const r = await overFn({ data: {} }); alert(`Vencidas: ${r.overdue} · Suspendidos: ${r.suspended}`); load(); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-muted"><AlertTriangle className="w-4 h-4 text-amber-600" /> Aplicar mora</button>
          <button onClick={() => setShowForm(s => !s)} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm">
            <Plus className="w-4 h-4" /> Nueva factura
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-4 rounded-lg border bg-card p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className="px-3 py-2 rounded-md border bg-background text-sm">
            <option value="">Seleccionar cliente</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
          <input type="number" step="0.01" placeholder="Monto" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} className="px-3 py-2 rounded-md border bg-background text-sm" />
          <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="px-3 py-2 rounded-md border bg-background text-sm" />
          <input placeholder="Concepto" value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} className="px-3 py-2 rounded-md border bg-background text-sm" />
          <div className="lg:col-span-4 flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md border text-sm">Cancelar</button>
            <button onClick={create} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm">Emitir</button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Concepto</th>
              <th className="px-4 py-3 font-medium">Vencimiento</th>
              <th className="px-4 py-3 font-medium">Monto</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{r.clients?.full_name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.concept}</td>
                <td className="px-4 py-3">{new Date(r.due_date).toLocaleDateString()}</td>
                <td className="px-4 py-3 font-mono">Bs {Number(r.amount).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    r.status === "paid" ? "bg-emerald-500/15 text-emerald-600" :
                    r.status === "overdue" ? "bg-destructive/15 text-destructive" :
                    "bg-amber-500/15 text-amber-600"
                  }`}>{r.status}</span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link to="/dashboard/invoices/$invoiceId" params={{ invoiceId: r.id }} className="inline-block p-1 rounded hover:bg-primary/10 text-primary mr-1" title="Ver / Imprimir">
                    <FileText className="w-4 h-4" />
                  </Link>
                  {r.status !== "paid" && (
                    <button onClick={() => markPaid(r.id)} className="p-1 rounded hover:bg-emerald-500/10 text-emerald-600 mr-1" title="Marcar pagada">
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => remove(r.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Sin facturas</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
