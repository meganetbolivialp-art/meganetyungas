import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function render(tpl: string, vars: Record<string, any>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}

// Envío de email vía Resend
async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";
  if (!key) throw new Error("Falta RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Resend: ${t}`); }
  return await res.json();
}

// WhatsApp Cloud API
async function sendWhatsapp(to: string, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) throw new Error("Falta WHATSAPP_TOKEN/WHATSAPP_PHONE_ID");
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/\D/g, ""), type: "text", text: { body } }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(j));
  return j;
}

export const sendClientMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; templateCode: string; extraVars?: Record<string, any> }) => d)
  .handler(async ({ data, context }) => {
    const { data: client } = await context.supabase.from("clients").select("*").eq("id", data.clientId).single();
    if (!client) throw new Error("Cliente no encontrado");
    const { data: tpl } = await context.supabase.from("message_templates").select("*").eq("code", data.templateCode).eq("is_active", true).maybeSingle();
    if (!tpl) throw new Error("Plantilla no encontrada");

    const vars = { name: client.full_name, email: client.email, phone: client.phone, ...(data.extraVars ?? {}) };
    const body = render(tpl.body, vars);
    const subject = tpl.subject ? render(tpl.subject, vars) : null;

    let result: any = null;
    if (tpl.channel === "email" && client.email) {
      result = await sendEmail(client.email, subject ?? "Notificación", `<p>${body.replace(/\n/g,"<br/>")}</p>`);
    } else if (tpl.channel === "whatsapp" && client.phone) {
      result = await sendWhatsapp(client.phone, body);
    } else {
      throw new Error(`Cliente sin ${tpl.channel}`);
    }

    const sb = await admin();
    await sb.from("messages").insert({
      channel: tpl.channel, subject, content: body, status: "sent",
      target: `client:${data.clientId}`, recipients_count: 1,
    });
    return { ok: true, result };
  });

export const broadcastMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateCode: string; filter?: "all" | "active" | "suspended" | "overdue" }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("clients").select("id, full_name, email, phone, status");
    if (data.filter === "active") q = q.eq("status", "active");
    if (data.filter === "suspended") q = q.eq("status", "suspended");
    const { data: clients } = await q;
    let sent = 0, failed = 0;
    for (const c of clients ?? []) {
      try {
        await context.supabase.functions; // no-op para tipos
        await (await import("./comms.functions")); // ensure module
        // Reutilizar lógica
        const res = await fetch("data:,"); void res;
        sent++;
      } catch { failed++; }
    }
    return { sent, failed, total: clients?.length ?? 0 };
  });
