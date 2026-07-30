import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/public/hooks/stripe")({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = request.headers.get("stripe-signature") ?? "";
    const body = await request.text();

    // La firma es OBLIGATORIA: sin secreto configurado el endpoint no procesa nada.
    if (!secret) return new Response("webhook not configured", { status: 503 });
    {
      const parts = Object.fromEntries(sig.split(",").map(kv => kv.split("=")));
      const t = parts.t; const v1 = parts.v1;
      if (!t || !v1) return new Response("bad sig", { status: 401 });
      const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
      const a = Buffer.from(v1); const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("invalid", { status: 401 });
    }


    const event = JSON.parse(body);
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      const invoiceId = s.metadata?.invoice_id ?? s.client_reference_id;
      const clientId = s.metadata?.client_id;
      const amount = (s.amount_total ?? 0) / 100;
      if (invoiceId && clientId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("payment_intents").update({ status: "paid", external_id: s.id }).eq("external_id", s.id);
        await supabaseAdmin.from("payments").insert({ client_id: clientId, invoice_id: invoiceId, amount, method: "stripe", reference: s.id });
        await supabaseAdmin.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", invoiceId);
      }
    }
    return new Response("ok");
  } } },
});
