import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/public/hooks/mercadopago")({
  server: { handlers: { POST: async ({ request }) => {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) return new Response("not configured", { status: 500 });

    const body = await request.text();

    // Verificación de firma Mercado Pago (x-signature: ts=...,v1=...)
    // Requiere MP_WEBHOOK_SECRET configurado en el dashboard de MP.
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;
    if (webhookSecret) {
      const sigHeader = request.headers.get("x-signature") ?? "";
      const reqId = request.headers.get("x-request-id") ?? "";
      const parts = Object.fromEntries(
        sigHeader.split(",").map((kv) => kv.trim().split("=") as [string, string]),
      );
      const ts = parts.ts;
      const v1 = parts.v1;
      let bodyJson: any = {};
      try { bodyJson = JSON.parse(body); } catch {}
      const dataId = bodyJson?.data?.id ?? bodyJson?.id ?? "";
      if (!ts || !v1) return new Response("bad sig", { status: 401 });
      // Manifest oficial: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
      const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
      const expected = createHmac("sha256", webhookSecret).update(manifest).digest("hex");
      const a = Buffer.from(v1);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return new Response("invalid signature", { status: 401 });
      }
    } else {
      // Sin secreto configurado: rechazar en producción.
      if (process.env.NODE_ENV === "production") {
        return new Response("webhook secret not configured", { status: 401 });
      }
    }

    let parsed: any = {};
    try { parsed = JSON.parse(body); } catch { return new Response("bad body", { status: 400 }); }
    const paymentId = parsed?.data?.id ?? parsed?.id;
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
