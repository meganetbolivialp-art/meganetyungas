import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/mercadopago")({
  server: { handlers: { POST: async ({ request }) => {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) return new Response("not configured", { status: 500 });
    const body: any = await request.json().catch(() => ({}));
    const paymentId = body?.data?.id ?? body?.id;
    if (!paymentId) return new Response("ok");

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pay: any = await res.json();
    if (pay.status !== "approved") return new Response("ok");

    const invoiceId = pay.external_reference ?? pay.metadata?.invoice_id;
    const clientId = pay.metadata?.client_id;
    if (invoiceId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("payment_intents").update({ status: "paid" }).eq("external_id", String(pay.preference_id ?? ""));
      if (clientId) {
        await supabaseAdmin.from("payments").insert({ client_id: clientId, invoice_id: invoiceId, amount: pay.transaction_amount, method: "mercadopago", reference: String(pay.id) });
      }
      await supabaseAdmin.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoiceId);
    }
    return new Response("ok");
  } } },
});
