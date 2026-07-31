import { createFileRoute } from "@tanstack/react-router";
import { signLicenseToken } from "@/lib/license-crypto.server";
import { verifiedClientIp, parseLicenseKey, parseHostname } from "@/lib/license-request.server";

export const Route = createFileRoute("/api/public/license/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let body: any;
        try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
        const key = parseLicenseKey(body?.key);
        const hostname = parseHostname(body?.hostname);
        // Solo la IP verificada por la infraestructura.
        const ip = verifiedClientIp(request);
        if (!key) return json({ ok: false, error: "missing_key" }, 400);


        const { data: lic } = await supabaseAdmin.from("licenses").select("*").eq("key", key).maybeSingle();
        if (!lic) return json({ ok: false, error: "invalid_key" }, 404);
        if (lic.status !== "active") return json({ ok: false, error: lic.status }, 403);
        if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
          await supabaseAdmin.from("licenses").update({ status: "expired" }).eq("id", lic.id);
          return json({ ok: false, error: "expired" }, 403);
        }
        if (lic.bound_ip && ip && lic.bound_ip !== ip) {
          await supabaseAdmin.from("license_activations").insert({ license_id: lic.id, license_key: key, event: "heartbeat", ip, hostname, result: "ip_mismatch" });
          return json({ ok: false, error: "ip_mismatch" }, 403);
        }

        await supabaseAdmin.from("licenses").update({ last_heartbeat_at: new Date().toISOString() }).eq("id", lic.id);
        await supabaseAdmin.from("license_activations").insert({ license_id: lic.id, license_key: key, event: "heartbeat", ip, hostname, result: "ok" });

        const token = signLicenseToken({
          key: lic.key,
          plan: lic.plan,
          max_clients: lic.max_clients,
          max_routers: lic.max_routers,
          expires_at: lic.expires_at,
          bound_ip: lic.bound_ip,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
        });
        return json({ ok: true, token, expires_at: lic.expires_at });
      },
    },
  },
});
function json(d: any, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
function clientIp(req: Request): string | null {
  const h = req.headers;
  return (h.get("cf-connecting-ip") || h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || null);
}
