import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Table, Badge, DeleteBtn, FormPanel, Field, inputCls } from "@/components/ui-kit";
import { Check } from "lucide-react";

export const Route = createFileRoute("/dashboard/payroll")({
  head: () => ({
    meta: [
      { title: "Nómina — MikroSystem ISP" },
      { name: "description", content: "Gestión de nómina mensual del personal." },
      { property: "og:title", content: "Nómina — MikroSystem ISP" },
      { property: "og:description", content: "Pagos al personal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PayrollPage,
});

function PayrollPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const [f, setF] = useState({ employee_id: "", period: currentPeriod, base_salary: 0, bonuses: 0, deductions: 0 });

  const load = async () => {
    const [p, e] = await Promise.all([
      supabase.from("payroll").select("*, employees(full_name, role)").order("period", { ascending: false }),
      supabase.from("employees").select("id, full_name, salary").eq("status", "active"),
    ]);
    setRows(p.data ?? []); setEmployees(e.data ?? []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!f.employee_id) return;
    const net = f.base_salary + f.bonuses - f.deductions;
    await supabase.from("payroll").insert({ ...f, net_amount: net, status: "pending" });
    setF({ employee_id: "", period: currentPeriod, base_salary: 0, bonuses: 0, deductions: 0 });
    setShow(false); load();
  };
  const markPaid = async (id: string) => {
    await supabase.from("payroll").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("¿Eliminar?")) return;
    await supabase.from("payroll").delete().eq("id", id); load();
  };

  const totalPending = rows.filter(r => r.status === "pending").reduce((s, r) => s + Number(r.net_amount), 0);

  return (
    <AdminLayout title="Nómina" subtitle={`${rows.length} liquidaciones · Pendiente: Bs ${totalPending.toFixed(2)}`} breadcrumb={["Operaciones", "Nómina"]}>
      <Toolbar onNew={() => setShow(s => !s)} newLabel="Nueva liquidación" />
      {show && (
        <FormPanel onCancel={() => setShow(false)} onSave={create}>
          <Field label="Empleado *"><select value={f.employee_id} onChange={e => { const emp = employees.find(x => x.id === e.target.value); setF({ ...f, employee_id: e.target.value, base_salary: emp?.salary ?? 0 }); }} className={inputCls}><option value="">Seleccionar</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
          <Field label="Período (YYYY-MM)"><input value={f.period} onChange={e => setF({ ...f, period: e.target.value })} className={inputCls} /></Field>
          <Field label="Salario base"><input type="number" step="0.01" value={f.base_salary} onChange={e => setF({ ...f, base_salary: +e.target.value })} className={inputCls} /></Field>
          <Field label="Bonos"><input type="number" step="0.01" value={f.bonuses} onChange={e => setF({ ...f, bonuses: +e.target.value })} className={inputCls} /></Field>
          <Field label="Descuentos"><input type="number" step="0.01" value={f.deductions} onChange={e => setF({ ...f, deductions: +e.target.value })} className={inputCls} /></Field>
          <Field label="Neto (calculado)"><input readOnly value={(f.base_salary + f.bonuses - f.deductions).toFixed(2)} className={`${inputCls} bg-muted`} /></Field>
        </FormPanel>
      )}
      <Table headers={["Período", "Empleado", "Base", "Bonos", "Descuentos", "Neto", "Estado", ""]} empty={rows.length === 0}>
        {rows.map(r => (
          <tr key={r.id} className="border-t hover:bg-muted/30">
            <td className="px-4 py-2.5 font-mono">{r.period}</td>
            <td className="px-4 py-2.5"><div className="font-medium">{r.employees?.full_name}</div><div className="text-xs text-muted-foreground">{r.employees?.role}</div></td>
            <td className="px-4 py-2.5 font-mono">Bs {Number(r.base_salary).toFixed(2)}</td>
            <td className="px-4 py-2.5 font-mono text-emerald-600">+Bs {Number(r.bonuses).toFixed(2)}</td>
            <td className="px-4 py-2.5 font-mono text-destructive">-Bs {Number(r.deductions).toFixed(2)}</td>
            <td className="px-4 py-2.5 font-mono font-semibold">Bs {Number(r.net_amount).toFixed(2)}</td>
            <td className="px-4 py-2.5"><Badge tone={r.status === "paid" ? "success" : "warning"}>{r.status}</Badge></td>
            <td className="px-4 py-2.5 text-right whitespace-nowrap">
              {r.status !== "paid" && <button onClick={() => markPaid(r.id)} className="p-1.5 rounded hover:bg-emerald-500/10 text-emerald-600 mr-1" title="Marcar pagado"><Check className="w-4 h-4" /></button>}
              <DeleteBtn onClick={() => remove(r.id)} />
            </td>
          </tr>
        ))}
      </Table>
    </AdminLayout>
  );
}
