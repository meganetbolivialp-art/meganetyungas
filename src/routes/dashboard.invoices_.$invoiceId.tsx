import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Printer, Send, Mail, ArrowLeft, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendClientMessage } from "@/lib/comms.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/invoices_/$invoiceId")({
  head: () => ({ meta: [{ title: "Factura — ISP" }, { name: "robots", content: "noindex" }] }),
  component: InvoiceView,
});

function InvoiceView() {
  const { invoiceId } = Route.useParams();
  const nav = useNavigate();
  const [inv, setInv] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [service, setService] = useState<any>(null);
  const [sending, setSending] = useState<string | null>(null);
  const sendFn = useServerFn(sendClientMessage);

  useEffect(() => {
    (async () => {
      const { data: i } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
      setInv(i);
      if (i?.client_id) {
        const { data: c } = await supabase.from("clients").select("*").eq("id", i.client_id).single();
        setClient(c);
      }
      if (i?.service_id) {
        const { data: s } = await supabase.from("services").select("*, plans(name, price, download_mbps, upload_mbps)").eq("id", i.service_id).single();
        setService(s);
      }
    })();
  }, [invoiceId]);

  const send = async (code: string, label: string) => {
    if (!client) return;
    setSending(code);
    try {
      await sendFn({ data: { clientId: client.id, templateCode: code, extraVars: { invoice_id: inv.id, amount: inv.amount, due_date: inv.due_date, concept: inv.concept } } });
      toast.success(`${label} enviado`);
    } catch (e: any) { toast.error(e.message); }
    finally { setSending(null); }
  };

  if (!inv) return <div className="min-h-screen grid place-items-center text-muted-foreground">Cargando factura...</div>;

  const num = inv.id.slice(0, 8).toUpperCase();
  const statusColor = inv.status === "paid" ? "bg-emerald-500" : inv.status === "overdue" ? "bg-destructive" : "bg-amber-500";
  const statusLabel = inv.status === "paid" ? "PAGADA" : inv.status === "overdue" ? "VENCIDA" : "PENDIENTE";

  return (
    <div className="min-h-screen bg-muted/30 py-6">
      {/* Toolbar — hidden on print */}
      <div className="max-w-3xl mx-auto mb-4 flex items-center justify-between print:hidden px-4">
        <button onClick={() => nav({ to: "/dashboard/invoices" })} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
        <div className="flex gap-2">
          <button onClick={() => send("invoice_email", "Email")} disabled={!client?.email || sending === "invoice_email"}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded border text-sm hover:bg-card disabled:opacity-40">
            <Mail className="w-4 h-4" /> Email
          </button>
          <button onClick={() => send("invoice_whatsapp", "WhatsApp")} disabled={!client?.phone || sending === "invoice_whatsapp"}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded border text-sm hover:bg-card disabled:opacity-40">
            <MessageSquare className="w-4 h-4" /> WhatsApp
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Printable */}
      <div className="max-w-3xl mx-auto bg-white text-slate-900 shadow-lg print:shadow-none rounded-md print:rounded-none">
        <div className="flex justify-between items-start p-8 border-b-4" style={{ borderColor: "#16a394" }}>
          <div>
            <div className="flex items-center gap-2 font-black text-2xl mb-1">
              <div className="w-10 h-10 rounded grid place-items-center text-white" style={{ background: "linear-gradient(135deg,#ff4d2e,#c93a1e)" }}>M</div>
              MEGA<span style={{ color: "#ff4d2e" }}>NET</span>
            </div>
            <div className="text-xs text-slate-500 leading-tight">
              Proveedor de servicios de internet<br/>
              RUC/NIT: 000000000<br/>
              contacto@meganet.local
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-widest text-slate-500">Factura Nº</div>
            <div className="text-2xl font-bold">#{num}</div>
            <div className={`inline-block mt-2 px-3 py-1 text-white text-xs font-bold rounded ${statusColor}`}>{statusLabel}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 p-8 border-b">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Facturar a</div>
            <div className="font-bold uppercase">{client?.full_name ?? "—"}</div>
            <div className="text-sm text-slate-600 leading-relaxed">
              {client?.document && <>Doc: {client.document}<br/></>}
              {client?.address && <>{client.address}<br/></>}
              {client?.city && <>{client.city}<br/></>}
              {client?.email && <>{client.email}<br/></>}
              {client?.phone && <>{client.phone}</>}
            </div>
          </div>
          <div className="text-right space-y-1 text-sm">
            <div><span className="text-slate-500 text-xs">Fecha emisión:</span> <b>{new Date(inv.created_at).toLocaleDateString()}</b></div>
            <div><span className="text-slate-500 text-xs">Vencimiento:</span> <b>{new Date(inv.due_date).toLocaleDateString()}</b></div>
            {inv.period_month && <div><span className="text-slate-500 text-xs">Período:</span> <b>{String(inv.period_month).padStart(2, "0")}/{inv.period_year}</b></div>}
            {inv.paid_at && <div className="text-emerald-600"><span className="text-slate-500 text-xs">Pagada:</span> <b>{new Date(inv.paid_at).toLocaleDateString()}</b></div>}
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-slate-500 border-b">
              <th className="px-8 py-3 font-medium">Concepto</th>
              <th className="px-8 py-3 font-medium text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="px-8 py-4">
                <div className="font-medium">{inv.concept ?? "Servicio de internet"}</div>
                {service && <div className="text-xs text-slate-500 mt-1">Plan {service.plans?.name} — {service.plans?.download_mbps}/{service.plans?.upload_mbps} Mbps</div>}
              </td>
              <td className="px-8 py-4 text-right font-mono">Bs {Number(inv.amount).toFixed(2)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-b bg-slate-50">
              <td className="px-8 py-2 text-right text-sm text-slate-600">Subtotal</td>
              <td className="px-8 py-2 text-right font-mono text-sm">Bs {Number(inv.amount).toFixed(2)}</td>
            </tr>
            <tr className="bg-slate-100">
              <td className="px-8 py-3 text-right font-bold uppercase text-sm">Total</td>
              <td className="px-8 py-3 text-right font-mono text-xl font-bold" style={{ color: "#16a394" }}>Bs {Number(inv.amount).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="p-8 text-xs text-slate-500 border-t space-y-2">
          <p><b>Formas de pago:</b> Efectivo en oficina, transferencia bancaria, pago online desde el portal cliente.</p>
          <p><b>Nota:</b> Después de {5} días de vencida, el servicio será suspendido automáticamente. Al pagar, se reactiva de forma automática.</p>
        </div>

        <div className="text-center py-4 text-[11px] text-slate-400 border-t">
          Documento generado electrónicamente · MegaNet ISP
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 0; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
