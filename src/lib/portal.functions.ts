import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcryptjs";

const SESSION_TTL_HOURS = 24 * 7;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function randomToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export const portalLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; password: string }) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: user } = await sb
      .from("client_portal_users")
      .select("id, password_hash, is_active, client_id")
      .eq("username", data.username.trim().toLowerCase())
      .maybeSingle();
    if (!user || !user.is_active) throw new Error("Credenciales inválidas");
    const ok = await bcrypt.compare(data.password, user.password_hash);
    if (!ok) throw new Error("Credenciales inválidas");

    const token = randomToken();
    const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();
    await sb.from("client_portal_sessions").insert({ portal_user_id: user.id, token, expires_at: expires });
    await sb.from("client_portal_users").update({ last_login: new Date().toISOString() }).eq("id", user.id);
    return { token, clientId: user.client_id };
  });

export const portalMe = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: s } = await sb
      .from("client_portal_sessions")
      .select("portal_user_id, expires_at, client_portal_users(client_id, username)")
      .eq("token", data.token)
      .maybeSingle();
    if (!s || new Date(s.expires_at) < new Date()) throw new Error("Sesión inválida");
    const pu: any = s.client_portal_users;
    const { data: client } = await sb.from("clients").select("*").eq("id", pu.client_id).single();
    const { data: invoices } = await sb.from("invoices").select("*").eq("client_id", pu.client_id).order("created_at", { ascending: false });
    const { data: services } = await sb.from("services").select("*, plans(*)").eq("client_id", pu.client_id);
    const { data: tickets } = await sb.from("tickets").select("*").eq("client_id", pu.client_id).order("created_at", { ascending: false });
    return { client, invoices: invoices ?? [], services: services ?? [], tickets: tickets ?? [], username: pu.username };
  });

export const portalCreateTicket = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; subject: string; description: string }) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: s } = await sb.from("client_portal_sessions").select("client_portal_users(client_id)").eq("token", data.token).maybeSingle();
    if (!s) throw new Error("Sesión inválida");
    const clientId = (s.client_portal_users as any).client_id;
    const { error } = await sb.from("tickets").insert({
      client_id: clientId,
      subject: data.subject,
      description: data.description,
      status: "open",
      priority: "normal",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const portalLogout = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    await sb.from("client_portal_sessions").delete().eq("token", data.token);
    return { ok: true };
  });

// Admin: crear cuenta portal para cliente
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createPortalUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; username: string; password: string }) => d)
  .handler(async ({ data, context }) => {
    // Enforce admin/supervisor role — do not rely on service-role bypass of RLS.
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { data: isSup } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" });
    if (!isAdmin && !isSup) throw new Error("Forbidden: se requiere rol admin o supervisor");

    const sb = await admin();
    const hash = await bcrypt.hash(data.password, 10);
    const { error } = await sb.from("client_portal_users").upsert({
      client_id: data.clientId,
      username: data.username.trim().toLowerCase(),
      password_hash: hash,
      is_active: true,
    }, { onConflict: "username" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
