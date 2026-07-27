import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(ctx: any) {
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden: solo admins");
}

// Emitir nueva licencia
export const issueLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      customer_name: z.string().min(1),
      customer_email: z.string().email().optional().or(z.literal("")),
      plan: z.enum(["basic", "pro", "enterprise"]).default("basic"),
      max_clients: z.number().int().positive().default(500),
      max_routers: z.number().int().positive().default(3),
      expires_at: z.string().optional().nullable(),
      price_paid: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: keyRow } = await supabaseAdmin.rpc("generate_license_key" as any);
    const key = String(keyRow);
    const { data: lic, error } = await supabaseAdmin.from("licenses").insert({
      key,
      customer_name: data.customer_name,
      customer_email: data.customer_email || null,
      plan: data.plan,
      max_clients: data.max_clients,
      max_routers: data.max_routers,
      expires_at: data.expires_at || null,
      price_paid: data.price_paid ?? null,
      notes: data.notes || null,
      status: "active",
    }).select().single();
    if (error) throw new Error(error.message);
    return lic;
  });

// Cambiar estado / renovar / revocar
export const updateLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["active", "suspended", "revoked", "expired"]).optional(),
      expires_at: z.string().optional().nullable(),
      max_clients: z.number().int().positive().optional(),
      max_routers: z.number().int().positive().optional(),
      plan: z.enum(["basic", "pro", "enterprise"]).optional(),
      notes: z.string().optional().nullable(),
      reset_binding: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = {};
    for (const k of ["status", "expires_at", "max_clients", "max_routers", "plan", "notes"] as const) {
      if ((data as any)[k] !== undefined) patch[k] = (data as any)[k];
    }
    if (data.reset_binding) { patch.bound_ip = null; patch.bound_hostname = null; patch.activated_at = null; }
    const { error } = await supabaseAdmin.from("licenses").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("licenses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------- Cliente local: activar/heartbeat contra este mismo servidor -------

async function callLicenseApi(path: string, body: any, request?: Request) {
  const origin = request?.headers.get("origin") ?? request?.headers.get("host")
    ? `https://${request!.headers.get("host")}`
    : (process.env.PUBLIC_APP_URL ?? "");
  const url = origin ? `${origin}${path}` : path;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() as any };
}

export const activateLocalLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const hostname = req.headers.get("host") ?? "";
    const { status, body } = await callLicenseApi("/api/public/license/activate", { key: data.key.trim().toUpperCase(), hostname }, req);
    if (!body?.ok) throw new Error(body?.error ?? `Activación falló (${status})`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("license_state").upsert({
      id: 1,
      license_key: body.license.key,
      plan: body.license.plan,
      max_clients: body.license.max_clients,
      max_routers: body.license.max_routers,
      expires_at: body.license.expires_at,
      last_verified_at: new Date().toISOString(),
      last_token: body.token,
      status: "licensed",
      updated_at: new Date().toISOString(),
    });
    return { ok: true, license: body.license };
  });

export const getLocalLicense = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("license_state").select("*").eq("id", 1).maybeSingle();
    return data ?? { status: "unlicensed" };
  });

export const clearLocalLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("license_state").upsert({
      id: 1, license_key: null, plan: null, max_clients: null, max_routers: null,
      expires_at: null, last_verified_at: null, last_token: null, status: "unlicensed",
      updated_at: new Date().toISOString(),
    });
    return { ok: true };
  });
