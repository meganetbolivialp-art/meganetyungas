import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Table, FormPanel, Field, inputCls, DeleteBtn } from "@/components/ui-kit";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/work-orders")({
  head: () => ({ meta: [{ title: "Órdenes de trabajo — MikroSystem" }, { name: "robots", content: "noindex" }] }),
  component: WOPage,
});

function WOPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ client_id: "", type: "installation", title: "", description: "", priority: "normal", scheduled_at: "" });

  const load = async () => {
    const { data } = await supabase.from("work_orders").select("*, clients(full_name)").order("created_at", { ascending: false });
    setRows(data ?? []);
    const { data: cs } = await supabase.from("clients").select("id, full_name").order("full_name");
    setClients(cs ?? []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const { error } = await supabase.from("work_orders").insert({ ...f, scheduled_at: f.scheduled_at || null });
    if (error) toast.error(error.message); else { toast.success("Orden creada"); setShow(false); load(); }
  };
  const setStatus = async (id: string, status: string) => {
    await supabase.from("work_orders").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", id);
    load();
  };
  const remove = async (id: string) => { await supabase.from("work_orders").delete().eq("id", id); load(); };

  return (
    <AdminLayout>
      <Toolbar title="Órdenes de trabajo" actions={<button onClick={()=>setShow(true)} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs">+ Nueva orden</button>} />
      <Table headers={["Título","Cliente","Tipo","Prioridad","Estado","Programada","Acciones"]} rows={rows.map(r => [
        r.title, r.clients?.full_name ?? "-", r.type, r.priority,
        <select value={r.status} onChange={e=>setStatus(r.id, e.target.value)} className="text-xs border rounded px-1 py-0.5">
          <option value="pending">Pendiente</option><option value="assigned">Asignada</option><option value="in_progress">En curso</option><option value="done">Hecho</option><option value="cancelled">Cancelada</option>
        </select>,
        r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "-",
        <DeleteBtn onClick={()=>remove(r.id)} />,
      ])} />
      {show && (<FormPanel title="Nueva orden" onClose={()=>setShow(false)} onSubmit={create}>
        <Field label="Cliente"><select className={inputCls} value={f.client_id} onChange={e=>setF({...f, client_id:e.target.value})}><option value="">-</option>{clients.map(c=>(<option key={c.id} value={c.id}>{c.full_name}</option>))}</select></Field>
        <Field label="Tipo"><select className={inputCls} value={f.type} onChange={e=>setF({...f, type:e.target.value})}><option value="installation">Instalación</option><option value="repair">Reparación</option><option value="removal">Retiro</option><option value="visit">Visita</option></select></Field>
        <Field label="Título"><input className={inputCls} value={f.title} onChange={e=>setF({...f, title:e.target.value})} /></Field>
        <Field label="Descripción" className="col-span-2"><textarea className={inputCls} rows={3} value={f.description} onChange={e=>setF({...f, description:e.target.value})} /></Field>
        <Field label="Prioridad"><select className={inputCls} value={f.priority} onChange={e=>setF({...f, priority:e.target.value})}><option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></Field>
        <Field label="Programada"><input type="datetime-local" className={inputCls} value={f.scheduled_at} onChange={e=>setF({...f, scheduled_at:e.target.value})} /></Field>
      </FormPanel>)}
    </AdminLayout>
  );
}
