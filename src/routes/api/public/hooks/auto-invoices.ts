import { createFileRoute } from "@tanstack/react-router";
import { laPazToday, monthTag, shouldAutoGenerateInvoices } from "@/lib/auto-invoices";

function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (!b.length || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

// Llamado por el cron local del servidor (cada hora). Genera las facturas del mes una sola vez.
export const Route = createFileRoute("/api/public/hooks/auto-invoices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        if (!safeEqual(provided, process.env.CRON_SECRET ?? "")) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: s, error } = await supabaseAdmin.from("billing_settings").select("*").eq("id", true).maybeSingle();
        if (error || !s) return Response.json({ ok: false, error: error?.message ?? "sin configuración" }, { status: 500 });
        const today = laPazToday();
        // Plantillas con "día que genera factura": cada cliente según su plantilla (una vez por mes).
        const { data: byPolicy, error: ep } = await supabaseAdmin.rpc("generate_policy_invoices", {});
        if (ep || byPolicy) {
          await supabaseAdmin.from("job_runs").insert({
            job_name: "policy-invoices", status: ep ? "failed" : "success",
            finished_at: new Date().toISOString(), detail: { created: byPolicy }, error: ep?.message ?? null,
          });
        }
        if (!shouldAutoGenerateInvoices(s, today)) return Response.json({ ok: true, skipped: true, byPolicy });
        const tag = monthTag(today);
        // Marca primero el mes para que dos llamadas seguidas no generen dos veces.
        const { data: claimed } = await supabaseAdmin.from("billing_settings")
          .update({ last_auto_run_month: tag }).eq("id", true)
          .or(`last_auto_run_month.is.null,last_auto_run_month.neq.${tag}`).select("id");
        if (!claimed?.length) return Response.json({ ok: true, skipped: true });
        const { data: created, error: e1 } = await supabaseAdmin.rpc("generate_monthly_invoices", { p_month: today.month, p_year: today.year });
        await supabaseAdmin.from("job_runs").insert({
          job_name: "auto-invoices", status: e1 ? "failed" : "success",
          finished_at: new Date().toISOString(), detail: { month: tag, created }, error: e1?.message ?? null,
        });
        if (e1) {
          await supabaseAdmin.from("billing_settings").update({ last_auto_run_month: s.last_auto_run_month }).eq("id", true);
          return Response.json({ ok: false, error: e1.message }, { status: 500 });
        }
        return Response.json({ ok: true, month: tag, created });
      },
    },
  },
});
