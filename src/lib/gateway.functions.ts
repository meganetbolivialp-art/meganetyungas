import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeReturnUrls, assertSameSite } from "@/lib/gateway-urls";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Crea sesión de Stripe Checkout para una factura
export const createStripeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(safeReturnUrls)
  .handler(async ({ data, context }) => {
    assertSameSite([data.successUrl, data.cancelUrl], process.env.PUBLIC_SITE_URL);
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("Stripe no configurado (falta STRIPE_SECRET_KEY)");
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select("id, client_id, amount, concept, clients(full_name, email)")
      .eq("id", data.invoiceId)
      .single();
    if (error || !inv) throw new Error("Factura no encontrada");

    const client: any = inv.clients;
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("success_url", data.successUrl);
    params.append("cancel_url", data.cancelUrl);
    params.append("client_reference_id", inv.id);
    params.append("line_items[0][price_data][currency]", "usd");
    params.append("line_items[0][price_data][product_data][name]", inv.concept ?? "Servicio internet");
    params.append("line_items[0][price_data][unit_amount]", String(Math.round(Number(inv.amount) * 100)));
    params.append("line_items[0][quantity]", "1");
    if (client?.email) params.append("customer_email", client.email);
    params.append("metadata[invoice_id]", inv.id);
    params.append("metadata[client_id]", inv.client_id);

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const json: any = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? "Error Stripe");

    const sb = await admin();
    await sb.from("payment_intents").insert({
      invoice_id: inv.id,
      client_id: inv.client_id,
      provider: "stripe",
      external_id: json.id,
      amount: inv.amount,
      currency: "USD",
      status: "pending",
      checkout_url: json.url,
    });
    return { url: json.url as string };
  });

// MercadoPago Checkout (preference)
export const createMPCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(safeReturnUrls)
  .handler(async ({ data, context }) => {
    assertSameSite([data.successUrl, data.cancelUrl], process.env.PUBLIC_SITE_URL);
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) throw new Error("MercadoPago no configurado (falta MP_ACCESS_TOKEN)");
    const { data: inv, error } = await context.supabase
      .from("invoices").select("id, client_id, amount, concept, clients(email)").eq("id", data.invoiceId).single();
    if (error || !inv) throw new Error("Factura no encontrada");

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ title: inv.concept ?? "Servicio internet", quantity: 1, unit_price: Number(inv.amount), currency_id: "USD" }],
        external_reference: inv.id,
        back_urls: { success: data.successUrl, failure: data.cancelUrl, pending: data.cancelUrl },
        auto_return: "approved",
        metadata: { invoice_id: inv.id, client_id: inv.client_id },
        payer: (inv.clients as any)?.email ? { email: (inv.clients as any).email } : undefined,
      }),
    });
    const json: any = await res.json();
    if (!res.ok) throw new Error(json.message ?? "Error MercadoPago");

    const sb = await admin();
    await sb.from("payment_intents").insert({
      invoice_id: inv.id, client_id: inv.client_id, provider: "mercadopago",
      external_id: json.id, amount: inv.amount, currency: "USD",
      status: "pending", checkout_url: json.init_point,
    });
    return { url: json.init_point as string };
  });
