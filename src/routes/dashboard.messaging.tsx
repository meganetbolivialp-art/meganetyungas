import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, FormPanel, Field, inputCls, Badge } from "@/components/ui-kit";
import { Mail, MessageSquare, Smartphone, Send } from "lucide-react";

export const Route = createFileRoute("/dashboard/messaging")({
  head: () => ({
    meta: [
      { title: "Mensajería masiva — MikroSystem ISP" },
      { name: "description", content: "Envío masivo de correos, WhatsApp y SMS a clientes." },
      { property: "og:title", content: "Mensajería — MikroSystem ISP" },
      { property: "og:description", content: "Comunicaciones masivas." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagingPage,
});

function MessagingPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ channel: "email", subject: "", content: "", target: "all_active" });

  const load = async () => {
    const { data } = await supabase.from("messages").select("*").order("sent_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!f.content) return;
    const { count } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "active");
    await supabase.from("messages").insert({ ...f, recipients_count: count ?? 0, status: "sent" });
    setF({ channel: "email", subject: "", content: "", target: "all_active" });
    setShow(false); load();
  };

  const icon = (c: string) => c === "email" ? Mail : c === "whatsapp" ? MessageSquare : Smartphone;

  return (
    <AdminLayout title="Mensajería masiva" subtitle={`${rows.length} campañas enviadas`} breadcrumb={["Soporte", "Mensajería"]}>
      <Toolbar onNew={() => setShow(s => !s)} newLabel="Nueva campaña" />
      {show && (
        <FormPanel onCancel={() => setShow(false)} onSave={send} saveLabel="Enviar">
          <Field label="Canal"><select value={f.channel} onChange={e => setF({ ...f, channel: e.target.value })} className={inputCls}><option value="email">Correo</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></Field>
          <Field label="Destinatarios"><select value={f.target} onChange={e => setF({ ...f, target: e.target.value })} className={inputCls}><option value="all_active">Todos los activos</option><option value="pending_invoices">Con facturas pendientes</option><option value="overdue">Con facturas vencidas</option><option value="suspended">Suspendidos</option></select></Field>
          <Field label="Asunto"><input value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} className={inputCls} /></Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Contenido del mensaje"><textarea value={f.content} onChange={e => setF({ ...f, content: e.target.value })} className={`${inputCls} min-h-32`} placeholder="Estimado {nombre}, ..." /></Field>
          </div>
        </FormPanel>
      )}
      <div className="grid gap-3">
        {rows.map(m => {
          const Icon = icon(m.channel);
          return (
            <div key={m.id} className="rounded-md border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-md bg-primary/10 text-primary grid place-items-center flex-shrink-0"><Icon className="w-5 h-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {m.subject && <span className="font-semibold">{m.subject}</span>}
                    <Badge tone="info">{m.channel}</Badge>
                    <Badge tone="default">{m.target}</Badge>
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(m.sent_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{m.content}</p>
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                    <Send className="w-3 h-3" /> Enviado a {m.recipients_count} destinatarios
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="rounded-md border bg-card p-8 text-center text-muted-foreground">Sin campañas</div>}
      </div>
    </AdminLayout>
  );
}
