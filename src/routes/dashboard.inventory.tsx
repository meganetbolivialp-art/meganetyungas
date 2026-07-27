import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Table, Badge, DeleteBtn, FormPanel, Field, inputCls, StatCard } from "@/components/ui-kit";
import { Boxes, AlertTriangle, DollarSign } from "lucide-react";

export const Route = createFileRoute("/dashboard/inventory")({
  head: () => ({
    meta: [
      { title: "Inventario — MikroSystem ISP" },
      { name: "description", content: "Control de inventario de equipos y suministros." },
      { property: "og:title", content: "Inventario — MikroSystem ISP" },
      { property: "og:description", content: "Equipos y stock." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ name: "", category: "equipment", serial: "", quantity: 1, unit_price: 0, location: "", status: "in_stock" });

  const load = async () => {
    const { data } = await supabase.from("inventory_items").select("*").order("name");
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!f.name) return;
    await supabase.from("inventory_items").insert(f);
    setF({ name: "", category: "equipment", serial: "", quantity: 1, unit_price: 0, location: "", status: "in_stock" });
    setShow(false); load();
  };
  const remove = async (id: string) => {
    if (!confirm("¿Eliminar item?")) return;
    await supabase.from("inventory_items").delete().eq("id", id); load();
  };

  const filtered = rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase()) || r.serial?.toLowerCase().includes(q.toLowerCase()));
  const totalItems = rows.reduce((s, r) => s + r.quantity, 0);
  const totalValue = rows.reduce((s, r) => s + r.quantity * Number(r.unit_price), 0);
  const lowStock = rows.filter(r => r.status === "low_stock" || r.quantity < 5).length;

  return (
    <AdminLayout title="Inventario" subtitle={`${rows.length} productos`} breadcrumb={["Operaciones", "Inventario"]}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Unidades" value={totalItems} icon={Boxes} />
        <StatCard label="Valor total" value={`Bs ${totalValue.toFixed(2)}`} icon={DollarSign} color="text-emerald-600" />
        <StatCard label="Bajo stock" value={lowStock} icon={AlertTriangle} color="text-amber-600" />
      </div>
      <Toolbar search={q} onSearch={setQ} onNew={() => setShow(s => !s)} newLabel="Nuevo item" />
      {show && (
        <FormPanel onCancel={() => setShow(false)} onSave={create}>
          <Field label="Nombre *"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
          <Field label="Categoría"><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} className={inputCls}><option value="equipment">Equipo</option><option value="router">Router</option><option value="antenna">Antena</option><option value="cable">Cable</option><option value="onu">ONU</option><option value="switch">Switch</option><option value="other">Otro</option></select></Field>
          <Field label="Serial / SKU"><input value={f.serial} onChange={e => setF({ ...f, serial: e.target.value })} className={inputCls} /></Field>
          <Field label="Cantidad"><input type="number" value={f.quantity} onChange={e => setF({ ...f, quantity: +e.target.value })} className={inputCls} /></Field>
          <Field label="Precio unitario"><input type="number" step="0.01" value={f.unit_price} onChange={e => setF({ ...f, unit_price: +e.target.value })} className={inputCls} /></Field>
          <Field label="Ubicación"><input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} className={inputCls} /></Field>
        </FormPanel>
      )}
      <Table headers={["Item", "Categoría", "Serial", "Cantidad", "P. Unit.", "Total", "Ubicación", "Estado", ""]} empty={filtered.length === 0}>
        {filtered.map(r => (
          <tr key={r.id} className="border-t hover:bg-muted/30">
            <td className="px-4 py-2.5 font-medium">{r.name}</td>
            <td className="px-4 py-2.5"><Badge tone="info">{r.category}</Badge></td>
            <td className="px-4 py-2.5 font-mono text-xs">{r.serial ?? "—"}</td>
            <td className="px-4 py-2.5 font-mono">{r.quantity}</td>
            <td className="px-4 py-2.5 font-mono">Bs {Number(r.unit_price).toFixed(2)}</td>
            <td className="px-4 py-2.5 font-mono font-semibold">Bs {(r.quantity * Number(r.unit_price)).toFixed(2)}</td>
            <td className="px-4 py-2.5 text-muted-foreground">{r.location ?? "—"}</td>
            <td className="px-4 py-2.5"><Badge tone={r.status === "in_stock" ? "success" : r.status === "low_stock" ? "warning" : "danger"}>{r.status}</Badge></td>
            <td className="px-4 py-2.5 text-right"><DeleteBtn onClick={() => remove(r.id)} /></td>
          </tr>
        ))}
      </Table>
    </AdminLayout>
  );
}
