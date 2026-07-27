import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Table, Badge, DeleteBtn, FormPanel, Field, inputCls, StatCard } from "@/components/ui-kit";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";

export const Route = createFileRoute("/dashboard/accounting")({
  head: () => ({
    meta: [
      { title: "Contabilidad — MikroSystem ISP" },
      { name: "description", content: "Registro contable de ingresos y egresos del ISP." },
      { property: "og:title", content: "Contabilidad — MikroSystem ISP" },
      { property: "og:description", content: "Movimientos contables." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountingPage,
});

function AccountingPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ entry_type: "income", category: "services", description: "", amount: 0, entry_date: new Date().toISOString().slice(0, 10) });
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");

  const load = async () => {
    const { data } = await supabase.from("accounting_entries").select("*").order("entry_date", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!f.description || !f.amount) return;
    await supabase.from("accounting_entries").insert(f);
    setF({ entry_type: "income", category: "services", description: "", amount: 0, entry_date: new Date().toISOString().slice(0, 10) });
    setShow(false); load();
  };
  const remove = async (id: string) => {
    if (!confirm("¿Eliminar movimiento?")) return;
    await supabase.from("accounting_entries").delete().eq("id", id); load();
  };

  const income = rows.filter(r => r.entry_type === "income").reduce((s, r) => s + Number(r.amount), 0);
  const expense = rows.filter(r => r.entry_type === "expense").reduce((s, r) => s + Number(r.amount), 0);
  const filtered = filter === "all" ? rows : rows.filter(r => r.entry_type === filter);

  return (
    <AdminLayout title="Contabilidad" subtitle={`${rows.length} movimientos`} breadcrumb={["Operaciones", "Contabilidad"]}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Ingresos" value={`Bs ${income.toFixed(2)}`} icon={TrendingUp} color="text-emerald-600" />
        <StatCard label="Egresos" value={`Bs ${expense.toFixed(2)}`} icon={TrendingDown} color="text-destructive" />
        <StatCard label="Balance" value={`Bs ${(income - expense).toFixed(2)}`} icon={Wallet} color={income - expense >= 0 ? "text-emerald-600" : "text-destructive"} />
      </div>
      <Toolbar onNew={() => setShow(s => !s)} newLabel="Nuevo movimiento">
        <div className="flex gap-1 p-1 rounded-md bg-muted">
          {(["all", "income", "expense"] as const).map(k => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1 text-xs rounded ${filter === k ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              {k === "all" ? "Todos" : k === "income" ? "Ingresos" : "Egresos"}
            </button>
          ))}
        </div>
      </Toolbar>
      {show && (
        <FormPanel onCancel={() => setShow(false)} onSave={create}>
          <Field label="Tipo"><select value={f.entry_type} onChange={e => setF({ ...f, entry_type: e.target.value })} className={inputCls}><option value="income">Ingreso</option><option value="expense">Egreso</option></select></Field>
          <Field label="Categoría"><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} className={inputCls}><option value="services">Servicios</option><option value="installations">Instalaciones</option><option value="infrastructure">Infraestructura</option><option value="salaries">Salarios</option><option value="utilities">Servicios básicos</option><option value="other">Otro</option></select></Field>
          <Field label="Fecha"><input type="date" value={f.entry_date} onChange={e => setF({ ...f, entry_date: e.target.value })} className={inputCls} /></Field>
          <Field label="Descripción *"><input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={inputCls} /></Field>
          <Field label="Monto *"><input type="number" step="0.01" value={f.amount} onChange={e => setF({ ...f, amount: +e.target.value })} className={inputCls} /></Field>
        </FormPanel>
      )}
      <Table headers={["Fecha", "Tipo", "Categoría", "Descripción", "Monto", ""]} empty={filtered.length === 0}>
        {filtered.map(r => (
          <tr key={r.id} className="border-t hover:bg-muted/30">
            <td className="px-4 py-2.5">{new Date(r.entry_date).toLocaleDateString()}</td>
            <td className="px-4 py-2.5"><Badge tone={r.entry_type === "income" ? "success" : "danger"}>{r.entry_type === "income" ? "Ingreso" : "Egreso"}</Badge></td>
            <td className="px-4 py-2.5 text-muted-foreground">{r.category}</td>
            <td className="px-4 py-2.5">{r.description}</td>
            <td className={`px-4 py-2.5 font-mono font-semibold ${r.entry_type === "income" ? "text-emerald-600" : "text-destructive"}`}>{r.entry_type === "income" ? "+" : "-"}Bs {Number(r.amount).toFixed(2)}</td>
            <td className="px-4 py-2.5 text-right"><DeleteBtn onClick={() => remove(r.id)} /></td>
          </tr>
        ))}
      </Table>
    </AdminLayout>
  );
}
