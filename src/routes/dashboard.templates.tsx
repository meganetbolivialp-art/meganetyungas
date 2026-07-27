import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Table, FormPanel, Field, inputCls, DeleteBtn } from "@/components/ui-kit";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/templates")({
  head: () => ({ meta: [{ title: "Plantillas — MikroSystem" }, { name: "robots", content: "noindex" }] }),
  component: T,
});

function T() {
  const [rows, setRows] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ code: "", channel: "email", subject: "", body: "" });
  const load = async () => { const { data } = await supabase.from("message_templates").select("*").order("code"); setRows(data ?? []); };
  useEffect(() => { load(); }, []);
  const create = async () => { const { error } = await supabase.from("message_templates").upsert(f as any, { onConflict: "code" }); if (error) toast.error(error.message); else { setShow(false); setF({ code:"",channel:"email",subject:"",body:""}); load(); } };
  const del = async (id: string) => { await supabase.from("message_templates").delete().eq("id", id); load(); };
  return (
    <AdminLayout>
      <Toolbar title="Plantillas de mensajes" actions={<button onClick={()=>setShow(true)} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs">+ Nueva</button>} />
      <div className="mb-3 text-xs text-muted-foreground">Variables disponibles: <code>{`{{name}} {{email}} {{phone}} {{amount}} {{due_date}} {{invoice_number}}`}</code></div>
      <Table headers={["Código","Canal","Asunto","Cuerpo","Activa",""]} rows={rows.map(r => [
        <b>{r.code}</b>, r.channel, r.subject ?? "-",
        <span className="text-xs truncate max-w-xs inline-block">{r.body}</span>,
        r.is_active?"Sí":"No", <DeleteBtn onClick={()=>del(r.id)} />,
      ])} />
      {show && (<FormPanel title="Nueva plantilla" onClose={()=>setShow(false)} onSubmit={create}>
        <Field label="Código"><input className={inputCls} value={f.code} onChange={e=>setF({...f, code:e.target.value})} /></Field>
        <Field label="Canal"><select className={inputCls} value={f.channel} onChange={e=>setF({...f, channel:e.target.value})}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></Field>
        <Field label="Asunto" className="col-span-2"><input className={inputCls} value={f.subject} onChange={e=>setF({...f, subject:e.target.value})} /></Field>
        <Field label="Cuerpo" className="col-span-2"><textarea rows={5} className={inputCls} value={f.body} onChange={e=>setF({...f, body:e.target.value})} /></Field>
      </FormPanel>)}
    </AdminLayout>
  );
}
