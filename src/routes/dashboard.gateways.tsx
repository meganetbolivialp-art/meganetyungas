import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Table, FormPanel, Field, inputCls, DeleteBtn } from "@/components/ui-kit";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/gateways")({
  head: () => ({ meta: [{ title: "Pasarelas de pago — MikroSystem" }, { name: "robots", content: "noindex" }] }),
  component: G,
});

function G() {
  const [rows, setRows] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ provider: "stripe", name: "", is_active: true, config: "{}" });
  const load = async () => { const { data } = await supabase.from("payment_gateways").select("*").order("provider"); setRows(data ?? []); };
  useEffect(() => { load(); }, []);
  const create = async () => {
    let cfg = {}; try { cfg = JSON.parse(f.config || "{}"); } catch { toast.error("JSON inválido"); return; }
    const { error } = await supabase.from("payment_gateways").insert({ provider: f.provider, name: f.name, is_active: f.is_active, config: cfg });
    if (error) toast.error(error.message); else { setShow(false); load(); }
  };
  const del = async (id: string) => { await supabase.from("payment_gateways").delete().eq("id", id); load(); };

  return (
    <AdminLayout>
      <Toolbar title="Pasarelas de pago" actions={<button onClick={()=>setShow(true)} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs">+ Agregar</button>} />
      <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4 text-xs text-amber-800">
        ℹ️ Las claves privadas (STRIPE_SECRET_KEY, MP_ACCESS_TOKEN) se cargan como secrets en el proyecto, no aquí. Esta tabla es para metadata pública (currency, moneda, nombre visible).
      </div>
      <Table headers={["Proveedor","Nombre","Activa","Config",""]} rows={rows.map(r => [
        r.provider, r.name, r.is_active?"Sí":"No",
        <code className="text-xs">{JSON.stringify(r.config)}</code>,
        <DeleteBtn onClick={()=>del(r.id)} />,
      ])} />
      {show && (<FormPanel title="Nueva pasarela" onClose={()=>setShow(false)} onSubmit={create}>
        <Field label="Proveedor"><select className={inputCls} value={f.provider} onChange={e=>setF({...f, provider:e.target.value})}><option value="stripe">Stripe</option><option value="mercadopago">MercadoPago</option><option value="paypal">PayPal</option><option value="manual">Manual</option></select></Field>
        <Field label="Nombre"><input className={inputCls} value={f.name} onChange={e=>setF({...f, name:e.target.value})} /></Field>
        <Field label="Config (JSON)" className="col-span-2"><textarea rows={3} className={inputCls} value={f.config} onChange={e=>setF({...f, config:e.target.value})} /></Field>
      </FormPanel>)}
    </AdminLayout>
  );
}
