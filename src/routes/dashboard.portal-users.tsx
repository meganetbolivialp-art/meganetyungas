import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Table, FormPanel, Field, inputCls } from "@/components/ui-kit";
import { createPortalUser } from "@/lib/portal.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/portal-users")({
  head: () => ({ meta: [{ title: "Usuarios Portal — MikroSystem" }, { name: "robots", content: "noindex" }] }),
  component: PU,
});

function PU() {
  const [rows, setRows] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ clientId: "", username: "", password: "" });
  const create = useServerFn(createPortalUser);

  const load = async () => {
    const { data } = await supabase.from("client_portal_users").select("*, clients(full_name)").order("created_at", { ascending: false });
    setRows(data ?? []);
    const { data: cs } = await supabase.from("clients").select("id, full_name").order("full_name");
    setClients(cs ?? []);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try { await create({ data: f }); toast.success("Cuenta portal creada"); setShow(false); setF({ clientId:"", username:"", password:"" }); load(); }
    catch (e: any) { toast.error(e.message); }
  };
  const toggle = async (id: string, active: boolean) => { await supabase.from("client_portal_users").update({ is_active: !active }).eq("id", id); load(); };

  return (
    <AdminLayout>
      <Toolbar title="Cuentas Portal Cliente" actions={<button onClick={()=>setShow(true)} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs">+ Nueva cuenta</button>} />
      <Table headers={["Usuario","Cliente","Activo","Último acceso","Acciones"]} rows={rows.map(r => [
        r.username, r.clients?.full_name ?? "-",
        <span className={r.is_active?"text-emerald-600":"text-slate-400"}>{r.is_active?"Sí":"No"}</span>,
        r.last_login ? new Date(r.last_login).toLocaleString() : "Nunca",
        <button onClick={()=>toggle(r.id, r.is_active)} className="text-xs bg-slate-200 px-2 py-0.5 rounded">{r.is_active?"Desactivar":"Activar"}</button>,
      ])} />
      {show && (<FormPanel title="Nueva cuenta portal" onClose={()=>setShow(false)} onSubmit={submit}>
        <Field label="Cliente" className="col-span-2"><select className={inputCls} value={f.clientId} onChange={e=>setF({...f, clientId:e.target.value})}><option value="">-</option>{clients.map(c=>(<option key={c.id} value={c.id}>{c.full_name}</option>))}</select></Field>
        <Field label="Usuario"><input className={inputCls} value={f.username} onChange={e=>setF({...f, username:e.target.value})} /></Field>
        <Field label="Contraseña"><input type="text" className={inputCls} value={f.password} onChange={e=>setF({...f, password:e.target.value})} /></Field>
      </FormPanel>)}
    </AdminLayout>
  );
}
