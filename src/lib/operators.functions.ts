import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, findAuthUserByEmail, roleForOperatorType } from "@/lib/operators.server";
import { getPasswordPolicyError, normalizePasswordAuthError } from "@/lib/password-policy";

type OperatorInput = {
  full_name: string;
  username: string;
  email: string;
  password?: string;
  phone?: string | null;
  branch_id?: string | null;
  operator_type: string; // admin | operator | cashier | technician | seller
  status?: string;
  commission_pct?: number;
  permissions?: Record<string, string[]>;
  router_ids?: string[];
  salary?: number;
  access_days?: string[];
  access_from?: string;
  access_to?: string;
};

export const listOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("employees")
      .select("*")
      .order("full_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: OperatorInput) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.email || !data.password) throw new Error("Email y contraseña requeridos");
    if (!data.full_name || !data.username) throw new Error("Nombre y usuario requeridos");
    const passwordError = getPasswordPolicyError(data.password);
    if (passwordError) throw new Error(passwordError);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const found = await findAuthUserByEmail(supabaseAdmin, data.email);
    let uid = found?.id as string | undefined;
    if (uid) {
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(uid, {
        password: data.password,
        user_metadata: { full_name: data.full_name },
      });
      if (updateErr) throw new Error(normalizePasswordAuthError(updateErr.message));
    } else {
      const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
      if (authErr || !created?.user) throw new Error(normalizePasswordAuthError(authErr?.message ?? "No se pudo crear cuenta"));
      uid = created.user.id;
    }

    const { error: empErr } = await supabaseAdmin.from("employees").insert({
      user_id: uid,
      full_name: data.full_name,
      username: data.username,
      email: data.email,
      phone: data.phone ?? null,
      branch_id: data.branch_id ?? null,
      role: data.operator_type === "admin" ? "admin" : (data.operator_type ?? "operator"),
      operator_type: data.operator_type,
      status: data.status ?? "active",
      salary: data.salary ?? 0,
      commission_pct: data.commission_pct ?? 0,
      permissions: data.permissions ?? {},
      router_ids: data.router_ids ?? [],
      access_days: data.access_days ?? ["mon","tue","wed","thu","fri","sat","sun"],
      access_from: data.access_from ?? "00:00",
      access_to: data.access_to ?? "23:59",
    });
    if (empErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid).catch(() => {});
      throw new Error(empErr.message);
    }

    const role = roleForOperatorType(data.operator_type);
    await supabaseAdmin.from("user_roles").upsert({ user_id: uid, role }, { onConflict: "user_id,role" });

    return { ok: true, user_id: uid };
  });

export const updateOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; patch: Partial<OperatorInput> & { email?: string } }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: getErr } = await supabaseAdmin
      .from("employees").select("user_id, operator_type, email, full_name").eq("id", data.id).maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!existing) throw new Error("Operador no encontrado");

    const patch: any = { ...data.patch };
    delete patch.password;
    delete patch.email;

    if (data.patch.operator_type) {
      patch.role = data.patch.operator_type === "admin" ? "admin" : data.patch.operator_type;
    }

    let userId = existing.user_id as string | null;

    // Si el operador NO tiene cuenta de acceso todavía, crearla ahora
    // (caso: filas viejas o migradas sin auth vinculado).
    if (!userId) {
      const email = (data.patch.email || existing.email) as string | null;
      const password = data.patch.password;
      if (!email || !password) {
        throw new Error("Este operador no tiene cuenta de acceso. Ingresá email y una contraseña para crearla.");
      }
      const passwordError = getPasswordPolicyError(password);
      if (passwordError) throw new Error(passwordError);
      // ¿ya existe una cuenta de acceso con ese email? (por si quedó a medias)
      const found = await findAuthUserByEmail(supabaseAdmin, email);
      if (found) {
        userId = found.id;
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(found.id, { password });
        if (authErr) throw new Error(normalizePasswordAuthError(authErr.message));
      } else {
        const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { full_name: existing.full_name },
        });
        if (authErr || !created?.user) throw new Error(normalizePasswordAuthError(authErr?.message ?? "No se pudo crear cuenta"));
        userId = created.user.id;
      }
      if (!userId) throw new Error("No se pudo vincular la cuenta de acceso");
      patch.user_id = userId;
      patch.email = email;
      const role = roleForOperatorType(data.patch.operator_type ?? existing.operator_type);
      await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
    }

    const { error: upErr } = await supabaseAdmin.from("employees").update(patch).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    if (existing.user_id && (data.patch.password || data.patch.email)) {
      const attrs: any = {};
      if (data.patch.password) {
        const passwordError = getPasswordPolicyError(data.patch.password);
        if (passwordError) throw new Error(passwordError);
        attrs.password = data.patch.password;
      }
      if (data.patch.email) attrs.email = data.patch.email;
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(existing.user_id, attrs);
      if (authErr) throw new Error(normalizePasswordAuthError(authErr.message));
    }

    if (existing.user_id && data.patch.operator_type && data.patch.operator_type !== existing.operator_type) {
      const newRole = roleForOperatorType(data.patch.operator_type);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", existing.user_id);
      await supabaseAdmin.from("user_roles").insert({ user_id: existing.user_id, role: newRole });
    }

    return { ok: true };
  });

export const resolveLoginIdentifier = createServerFn({ method: "POST" })
  .inputValidator((d: { identifier: string }) => d)
  .handler(async ({ data }) => {
    const identifier = data.identifier.trim().toLowerCase();
    if (!identifier) return "";
    if (identifier.includes("@")) return identifier;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: employee } = await supabaseAdmin
      .from("employees")
      .select("email")
      .eq("username", identifier)
      .eq("status", "active")
      .maybeSingle();
    return employee?.email ?? `${identifier}@admin.com`;
  });

export const toggleOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; enabled: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("employees")
      .update({ status: data.enabled ? "active" : "disabled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("employees").select("user_id").eq("id", data.id).maybeSingle();
    await supabaseAdmin.from("employees").delete().eq("id", data.id);
    if (row?.user_id) {
      await supabaseAdmin.auth.admin.deleteUser(row.user_id).catch(() => {});
    }
    return { ok: true };
  });

// Called by every logged-in user (no admin check) to load their own permissions.
export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: roleRows }, { data: emp }] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.from("employees").select("id, full_name, operator_type, permissions, router_ids, status, access_days, access_from, access_to")
        .eq("user_id", context.userId).maybeSingle(),
    ]);
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin");
    return {
      isAdmin,
      employee: emp ?? null,
      permissions: (emp?.permissions ?? {}) as Record<string, string[]>,
      routerIds: (emp?.router_ids ?? []) as string[],
    };
  });
