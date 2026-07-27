import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Table, FormPanel, Field, inputCls, DeleteBtn } from "@/components/ui-kit";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/serials")({
  head: () => ({ meta: [{ title: "Inventario Serial — MikroSystem" }, { name: "robots", content: "noindex" }] }),
  component: S,
});

function S() {
  const [rows, setRows] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ item_id: "", serial: "", mac_address: "", assigned_client_id: "" });

  const load = async () => {
    const { data } = await supabase.from("inventory_serials").select("*, inventory_items(name), clients(full_name)").order("created_at", { ascending: false });
    setRows(data ?? []);
    const { data: it } = await supabase.from("inventory_items").select("id, name");
    setItems(it ?? []);
    const { data: cs } = await supabase.from("clients").select("id, full_name").order("full_name");
    setClients(cs ?? []);
  };
  useEffect(() => { load(); }, []);
  const create = async () => {
    const payload: any = { ...f };
    if (!payload.assigned_client_id) delete payload.assigned_client_id; else { payload.status = "assigned"; payload.assigned_at = new Date().toISOString(); }
    if (!payload.item_id) delete payload.item_id;
    const { error } = await supabase.from("inventory_serials").insert(payload);
    if (error) toast.error(error.message); else { setShow(false); load(); }
  };
  const del = async (id: string) => { await supabase.from("inventory_serials").delete().eq("id", id); load(); };

  return (
    <AdminLayout>
      <Toolbar title="Inventario · Seriales" actions={<button onClick={()=>setShow(true)} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs">+ Alta</button>} />
      <Table headers={["Serial","MAC","Ítem","Cliente","Estado","Asignado",""]} rows={rows.map(r => [
        <code className="text-xs">{r.serial}</code>, r.mac_address ?? "-", r.inventory_items?.name ?? "-", r.clients?.full_name ?? "-",
        r.status, r.assigned_at ? new Date(r.assigned_at).toLocaleDateString() : "-",
        <DeleteBtn onClick={()=>del(r.id)} />,
      ])} />
      {show && (<FormPanel title="Alta de equipo" onClose={()=>setShow(false)} onSubmit={create}>
        <Field label="Ítem"><select className={inputCls} value={f.item_id} onChange={e=>setF({...f, item_id:e.target.value})}><option value="">-</option>{items.map(i=>(<option key={i.id} value={i.id}>{i.name}</option>))}</select></Field>
        <Field label="Serial"><input className={inputCls} value={f.serial} onChange={e=>setF({...f, serial:e.target.value})} /></Field>
        <Field label="MAC"><input className={inputCls} value={f.mac_address} onChange={e=>setF({...f, mac_address:e.target.value})} /></Field>
        <Field label="Asignar a cliente"><select className={inputCls} value={f.assigned_client_id} onChange={e=>setF({...f, assigned_client_id:e.target.value})}><option value="">-</option>{clients.map(c=>(<option key={c.id} value={c.id}>{c.full_name}</option>))}</select></Field>
      </FormPanel>)}
    </AdminLayout>
  );
}
