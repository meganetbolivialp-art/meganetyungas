import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Table, FormPanel, Field, inputCls } from "@/components/ui-kit";
import { generateVouchers } from "@/lib/vouchers.functions";
import { toast } from "sonner";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/dashboard/vouchers")({
  head: () => ({ meta: [{ title: "Vouchers Hotspot — MikroSystem" }, { name: "robots", content: "noindex" }] }),
  component: V,
});

function V() {
  const [rows, setRows] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [batch, setBatch] = useState<any[]>([]);
  const [f, setF] = useState({ count: 20, profile: "default", timeLimit: "1d", dataLimit: "", price: 0 });
  const gen = useServerFn(generateVouchers);

  const load = async () => {
    const { data } = await supabase.from("hotspot_vouchers").select("*").order("created_at", { ascending: false }).limit(200);
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      const r = await gen({ data: { count: +f.count, profile: f.profile, timeLimit: f.timeLimit || undefined, dataLimit: f.dataLimit || undefined, price: +f.price || undefined } });
      toast.success(`${r.vouchers.length} vouchers generados`);
      setBatch(r.vouchers); setShow(false); load();
    } catch (e: any) { toast.error(e.message); }
  };
  const print = () => window.print();

  return (
    <AdminLayout>
      <Toolbar title="Vouchers Hotspot" actions={<>
        {batch.length > 0 && <button onClick={print} className="px-3 py-1.5 rounded bg-slate-700 text-white text-xs flex items-center gap-1"><Printer className="w-3 h-3"/>Imprimir último lote</button>}
        <button onClick={()=>setShow(true)} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs">+ Generar lote</button>
      </>} />

      {batch.length > 0 && (
        <div className="mb-6 print:block">
          <h3 className="text-sm font-semibold mb-2">Último lote — {batch.length} vouchers</h3>
          <div className="grid grid-cols-4 gap-2">
            {batch.map(v => (
              <div key={v.id} className="border-2 border-dashed border-slate-400 rounded p-2 text-center bg-white">
                <div className="text-[10px] text-slate-500">WiFi Voucher</div>
                <div className="text-xs">Usuario: <b>{v.username}</b></div>
                <div className="text-xs">Clave: <b>{v.password}</b></div>
                <div className="text-[10px] mt-1">{v.time_limit ?? ""} {v.data_limit ?? ""}</div>
                {v.price && <div className="text-[10px] font-bold">Bs {v.price}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <Table headers={["Usuario","Clave","Perfil","Tiempo","Datos","Precio","Estado","Creado"]} rows={rows.map(r => [
        r.username, r.password, r.profile, r.time_limit ?? "-", r.data_limit ?? "-", r.price ? `Bs Bs {r.price}` : "-",
        <span className={r.status==="used"?"text-slate-400":"text-emerald-600"}>{r.status}</span>,
        new Date(r.created_at).toLocaleDateString(),
      ])} />

      {show && (<FormPanel title="Generar lote de vouchers" onClose={()=>setShow(false)} onSubmit={create}>
        <Field label="Cantidad"><input type="number" min={1} max={500} className={inputCls} value={f.count} onChange={e=>setF({...f, count:+e.target.value})} /></Field>
        <Field label="Perfil Mikrotik"><input className={inputCls} value={f.profile} onChange={e=>setF({...f, profile:e.target.value})} /></Field>
        <Field label="Tiempo (ej: 1d, 4h)"><input className={inputCls} value={f.timeLimit} onChange={e=>setF({...f, timeLimit:e.target.value})} /></Field>
        <Field label="Datos (ej: 1G)"><input className={inputCls} value={f.dataLimit} onChange={e=>setF({...f, dataLimit:e.target.value})} /></Field>
        <Field label="Precio"><input type="number" step="0.01" className={inputCls} value={f.price} onChange={e=>setF({...f, price:+e.target.value})} /></Field>
      </FormPanel>)}
    </AdminLayout>
  );
}
