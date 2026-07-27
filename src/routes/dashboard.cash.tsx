import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Table, FormPanel, Field, inputCls } from "@/components/ui-kit";
import { openCashRegister, closeCashRegister, addCashMovement } from "@/lib/cash.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/cash")({
  head: () => ({ meta: [{ title: "Caja — MikroSystem" }, { name: "robots", content: "noindex" }] }),
  component: CashPage,
});

function CashPage() {
  const [regs, setRegs] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [movs, setMovs] = useState<any[]>([]);
  const [openForm, setOpenForm] = useState(false);
  const [closeForm, setCloseForm] = useState(false);
  const [movForm, setMovForm] = useState(false);
  const [openAmt, setOpenAmt] = useState(0);
  const [closeAmt, setCloseAmt] = useState(0);
  const [mov, setMov] = useState({ kind: "income", amount: 0, category: "", description: "" });
  const openFn = useServerFn(openCashRegister); const closeFn = useServerFn(closeCashRegister); const movFn = useServerFn(addCashMovement);

  const load = async () => {
    const { data } = await supabase.from("cash_registers").select("*").order("opened_at", { ascending: false }).limit(20);
    setRegs(data ?? []);
    const open = (data ?? []).find(r => r.status === "open");
    setCurrent(open ?? null);
    if (open) {
      const { data: m } = await supabase.from("cash_movements").select("*").eq("register_id", open.id).order("created_at", { ascending: false });
      setMovs(m ?? []);
    } else setMovs([]);
  };
  useEffect(() => { load(); }, []);

  const doOpen = async () => { try { await openFn({ data: { openingAmount: openAmt } }); toast.success("Caja abierta"); setOpenForm(false); load(); } catch (e: any) { toast.error(e.message); } };
  const doClose = async () => { try { const r = await closeFn({ data: { registerId: current.id, closingAmount: closeAmt } }); toast.success(`Cierre OK. Esperado: Bs ${r.expected}, dif: Bs ${r.difference}`); setCloseForm(false); load(); } catch (e: any) { toast.error(e.message); } };
  const doMov = async () => { try { await movFn({ data: { registerId: current.id, ...mov } as any }); toast.success("Movimiento agregado"); setMovForm(false); setMov({ kind:"income", amount:0, category:"", description:"" }); load(); } catch (e: any) { toast.error(e.message); } };

  return (
    <AdminLayout>
      <Toolbar title="Caja diaria" actions={current ? <>
        <button onClick={()=>setMovForm(true)} className="px-3 py-1.5 rounded bg-emerald-500 text-white text-xs">+ Movimiento</button>
        <button onClick={()=>setCloseForm(true)} className="px-3 py-1.5 rounded bg-red-500 text-white text-xs">Cerrar caja</button>
      </> : <button onClick={()=>setOpenForm(true)} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs">Abrir caja</button>} />

      {current && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white border rounded p-3"><div className="text-xs text-muted-foreground">Apertura</div><div className="text-xl font-bold">Bs {Number(current.opening_amount).toFixed(2)}</div></div>
          <div className="bg-white border rounded p-3"><div className="text-xs text-muted-foreground">Ingresos</div><div className="text-xl font-bold text-emerald-600">Bs {movs.filter(m=>m.kind==="income").reduce((a,b)=>a+Number(b.amount),0).toFixed(2)}</div></div>
          <div className="bg-white border rounded p-3"><div className="text-xs text-muted-foreground">Egresos</div><div className="text-xl font-bold text-red-600">Bs {movs.filter(m=>m.kind==="expense").reduce((a,b)=>a+Number(b.amount),0).toFixed(2)}</div></div>
          <div className="bg-white border rounded p-3"><div className="text-xs text-muted-foreground">Movimientos</div><div className="text-xl font-bold">{movs.length}</div></div>
        </div>
      )}

      <Table headers={["Fecha","Estado","Apertura","Cierre","Diferencia"]} rows={regs.map(r => [
        new Date(r.opened_at).toLocaleString(),
        <span className={r.status==="open"?"text-emerald-600":"text-slate-600"}>{r.status}</span>,
        `Bs ${Number(r.opening_amount).toFixed(2)}`,
        r.closing_amount != null ? `Bs ${Number(r.closing_amount).toFixed(2)}` : "-",
        r.difference != null ? `Bs ${Number(r.difference).toFixed(2)}` : "-",
      ])} />

      {current && movs.length > 0 && (
        <><h3 className="mt-6 mb-2 font-semibold text-sm">Movimientos actuales</h3>
        <Table headers={["Hora","Tipo","Categoría","Monto","Descripción"]} rows={movs.map(m => [
          new Date(m.created_at).toLocaleTimeString(),
          <span className={m.kind==="income"?"text-emerald-600":"text-red-600"}>{m.kind}</span>,
          m.category ?? "-", `Bs ${Number(m.amount).toFixed(2)}`, m.description ?? "-",
        ])} /></>
      )}

      {openForm && (<FormPanel title="Abrir caja" onClose={()=>setOpenForm(false)} onSubmit={doOpen}>
        <Field label="Monto de apertura"><input type="number" step="0.01" className={inputCls} value={openAmt} onChange={e=>setOpenAmt(+e.target.value)} /></Field>
      </FormPanel>)}
      {closeForm && (<FormPanel title="Cerrar caja" onClose={()=>setCloseForm(false)} onSubmit={doClose}>
        <Field label="Monto contado al cierre"><input type="number" step="0.01" className={inputCls} value={closeAmt} onChange={e=>setCloseAmt(+e.target.value)} /></Field>
      </FormPanel>)}
      {movForm && (<FormPanel title="Nuevo movimiento" onClose={()=>setMovForm(false)} onSubmit={doMov}>
        <Field label="Tipo"><select className={inputCls} value={mov.kind} onChange={e=>setMov({...mov, kind:e.target.value})}><option value="income">Ingreso</option><option value="expense">Egreso</option></select></Field>
        <Field label="Categoría"><input className={inputCls} value={mov.category} onChange={e=>setMov({...mov, category:e.target.value})} /></Field>
        <Field label="Monto"><input type="number" step="0.01" className={inputCls} value={mov.amount} onChange={e=>setMov({...mov, amount:+e.target.value})} /></Field>
        <Field label="Descripción"><input className={inputCls} value={mov.description} onChange={e=>setMov({...mov, description:e.target.value})} /></Field>
      </FormPanel>)}
    </AdminLayout>
  );
}
