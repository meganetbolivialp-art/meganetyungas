import { createFileRoute } from "@tanstack/react-router";
import { signLicenseToken } from "@/lib/license-crypto.server";

export const Route = createFileRoute("/api/public/license/activate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let body: any;
        try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_body" }, 400); }
        const key = String(body?.key ?? "").trim().toUpperCase();
        const hostname = String(body?.hostname ?? "").slice(0, 200);
        const ip = clientIp(request) ?? String(body?.ip ?? "").slice(0, 64) ?? null;
        if (!key) return json({ ok: false, error: "missing_key" }, 400);

        const { data: lic } = await supabaseAdmin.from("licenses").select("*").eq("key", key).maybeSingle();
        if (!lic) {
          await log(supabaseAdmin, null, key, "activate", ip, hostname, "invalid_key");
          return json({ ok: false, error: "invalid_key" }, 404);
        }
        if (lic.status === "revoked" || lic.status === "suspended") {
          await log(supabaseAdmin, lic.id, key, "activate", ip, hostname, lic.status);
          return json({ ok: false, error: lic.status }, 403);
        }
        if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
          await supabaseAdmin.from("licenses").update({ status: "expired" }).eq("id", lic.id);
          await log(supabaseAdmin, lic.id, key, "activate", ip, hostname, "expired");
          return json({ ok: false, error: "expired" }, 403);
        }
        // Bind IP on first activation; reject if trying to use elsewhere
        if (lic.bound_ip && ip && lic.bound_ip !== ip) {
          await log(supabaseAdmin, lic.id, key, "activate", ip, hostname, "ip_mismatch", `Bound to ${lic.bound_ip}`);
          return json({ ok: false, error: "ip_mismatch", bound_ip: lic.bound_ip }, 403);
        }

        const now = new Date().toISOString();
        await supabaseAdmin.from("licenses").update({
          bound_ip: lic.bound_ip ?? ip,
          bound_hostname: lic.bound_hostname ?? hostname,
          activated_at: lic.activated_at ?? now,
          last_heartbeat_at: now,
        }).eq("id", lic.id);

        const token = signLicenseToken({
          key: lic.key,
          plan: lic.plan,
          max_clients: lic.max_clients,
          max_routers: lic.max_routers,
          expires_at: lic.expires_at,
          bound_ip: lic.bound_ip ?? ip,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 días
        });

        await log(supabaseAdmin, lic.id, key, "activate", ip, hostname, "ok");
        return json({
          ok: true,
          token,
          license: {
            key: lic.key,
            plan: lic.plan,
            max_clients: lic.max_clients,
            max_routers: lic.max_routers,
            expires_at: lic.expires_at,
          },
        });
      },
    },
  },
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
function clientIp(req: Request): string | null {
  const h = req.headers;
  return (h.get("cf-connecting-ip") || h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || null);
}
async function log(sb: any, license_id: string | null, license_key: string, event: string, ip: string | null, hostname: string, result: string, message?: string) {
  await sb.from("license_activations").insert({ license_id, license_key, event, ip, hostname, result, message: message ?? null });
}
