import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Table, FormPanel, Field, inputCls } from "@/components/ui-kit";
import { convertLeadToClient } from "@/lib/leads.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/leads")({
  head: () => ({ meta: [{ title: "CRM Leads — MikroSystem" }, { name: "robots", content: "noindex" }] }),
  component: LeadsPage,
});

const STATUSES = ["new","contacted","quoted","won","lost"];

function LeadsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ full_name: "", phone: "", email: "", city: "", address: "", source: "web", interested_plan_id: "" });
  const conv = useServerFn(convertLeadToClient);

  const load = async () => {
    const { data } = await supabase.from("leads").select("*, plans(name)").order("created_at", { ascending: false });
    setRows(data ?? []);
    const { data: p } = await supabase.from("plans").select("id, name");
    setPlans(p ?? []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const payload: any = { ...f }; if (!payload.interested_plan_id) delete payload.interested_plan_id;
    const { error } = await supabase.from("leads").insert(payload);
    if (error) toast.error(error.message); else { toast.success("Lead creado"); setShow(false); load(); }
  };
  const setStatus = async (id: string, status: string) => { await supabase.from("leads").update({ status }).eq("id", id); load(); };
  const convert = async (id: string) => { try { await conv({ data: { leadId: id } }); toast.success("Convertido a cliente"); load(); } catch (e: any) { toast.error(e.message); } };

  return (
    <AdminLayout>
      <Toolbar title="CRM · Leads" actions={<button onClick={()=>setShow(true)} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs">+ Nuevo lead</button>} />
      <div className="grid grid-cols-5 gap-3 mb-4">
        {STATUSES.map(s => (
          <div key={s} className="bg-white border rounded p-2 text-center">
            <div className="text-xs uppercase text-muted-foreground">{s}</div>
            <div className="text-xl font-bold">{rows.filter(r=>r.status===s).length}</div>
          </div>
        ))}
      </div>
      <Table headers={["Nombre","Teléfono","Ciudad","Plan interés","Origen","Estado","Acciones"]} rows={rows.map(r => [
        r.full_name, r.phone ?? "-", r.city ?? "-", r.plans?.name ?? "-", r.source ?? "-",
        <select value={r.status} onChange={e=>setStatus(r.id, e.target.value)} className="text-xs border rounded px-1 py-0.5">
          {STATUSES.map(s=>(<option key={s} value={s}>{s}</option>))}
        </select>,
        r.converted_client_id ? <span className="text-xs text-emerald-600">✓ Cliente</span> : <button onClick={()=>convert(r.id)} className="text-xs bg-emerald-500 text-white px-2 py-1 rounded">Convertir</button>,
      ])} />
      {show && (<FormPanel title="Nuevo lead" onClose={()=>setShow(false)} onSubmit={create}>
        <Field label="Nombre completo"><input className={inputCls} value={f.full_name} onChange={e=>setF({...f, full_name:e.target.value})} /></Field>
        <Field label="Teléfono"><input className={inputCls} value={f.phone} onChange={e=>setF({...f, phone:e.target.value})} /></Field>
        <Field label="Email"><input className={inputCls} value={f.email} onChange={e=>setF({...f, email:e.target.value})} /></Field>
        <Field label="Ciudad"><input className={inputCls} value={f.city} onChange={e=>setF({...f, city:e.target.value})} /></Field>
        <Field label="Dirección" className="col-span-2"><input className={inputCls} value={f.address} onChange={e=>setF({...f, address:e.target.value})} /></Field>
        <Field label="Origen"><select className={inputCls} value={f.source} onChange={e=>setF({...f, source:e.target.value})}><option value="web">Web</option><option value="referral">Referido</option><option value="social">Redes</option><option value="walkin">Presencial</option></select></Field>
        <Field label="Plan interés"><select className={inputCls} value={f.interested_plan_id} onChange={e=>setF({...f, interested_plan_id:e.target.value})}><option value="">-</option>{plans.map(p=>(<option key={p.id} value={p.id}>{p.name}</option>))}</select></Field>
      </FormPanel>)}
    </AdminLayout>
  );
}
