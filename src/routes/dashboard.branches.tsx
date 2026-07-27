import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Table, FormPanel, Field, inputCls, DeleteBtn } from "@/components/ui-kit";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/branches")({
  head: () => ({ meta: [{ title: "Sucursales — MikroSystem" }, { name: "robots", content: "noindex" }] }),
  component: B,
});

function B() {
  const [rows, setRows] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ name: "", address: "", city: "", phone: "" });
  const load = async () => { const { data } = await supabase.from("branches").select("*").order("name"); setRows(data ?? []); };
  useEffect(() => { load(); }, []);
  const create = async () => { const { error } = await supabase.from("branches").insert(f); if (error) toast.error(error.message); else { setShow(false); setF({name:"",address:"",city:"",phone:""}); load(); } };
  const del = async (id: string) => { await supabase.from("branches").delete().eq("id", id); load(); };
  return (
    <AdminLayout>
      <Toolbar title="Sucursales" actions={<button onClick={()=>setShow(true)} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs">+ Nueva</button>} />
      <Table headers={["Nombre","Ciudad","Dirección","Teléfono","Activa",""]} rows={rows.map(r => [r.name, r.city ?? "-", r.address ?? "-", r.phone ?? "-", r.is_active?"Sí":"No", <DeleteBtn onClick={()=>del(r.id)} />])} />
      {show && (<FormPanel title="Nueva sucursal" onClose={()=>setShow(false)} onSubmit={create}>
        <Field label="Nombre"><input className={inputCls} value={f.name} onChange={e=>setF({...f, name:e.target.value})} /></Field>
        <Field label="Ciudad"><input className={inputCls} value={f.city} onChange={e=>setF({...f, city:e.target.value})} /></Field>
        <Field label="Dirección" className="col-span-2"><input className={inputCls} value={f.address} onChange={e=>setF({...f, address:e.target.value})} /></Field>
        <Field label="Teléfono"><input className={inputCls} value={f.phone} onChange={e=>setF({...f, phone:e.target.value})} /></Field>
      </FormPanel>)}
    </AdminLayout>
  );
}
