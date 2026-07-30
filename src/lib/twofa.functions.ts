import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import * as OTPAuth from "otpauth";
import { secureString } from "@/lib/secure-random";
import QRCode from "qrcode";

const ISSUER = "MegaNet ISP";

function makeSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totp(secret: string, email: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export const get2faStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("operator_2fa")
      .select("enabled, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { enabled: !!data?.enabled, updated_at: data?.updated_at ?? null };
  });

export const setup2fa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as any)?.email ?? "user";
    const secret = makeSecret();
    const uri = totp(secret, email).toString();
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    await context.supabase
      .from("operator_2fa")
      .upsert({ user_id: context.userId, secret, enabled: false }, { onConflict: "user_id" });
    return { secret, uri, qr };
  });

export const enable2fa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().length(6) }).parse(d))
  .handler(async ({ data, context }) => {
    const email = (context.claims as any)?.email ?? "user";
    const { data: row } = await context.supabase
      .from("operator_2fa").select("secret").eq("user_id", context.userId).maybeSingle();
    if (!row?.secret) throw new Error("Debes generar el QR primero");
    const delta = totp(row.secret, email).validate({ token: data.code, window: 1 });
    if (delta === null) throw new Error("Código inválido");
    const codes = Array.from({ length: 8 }, () =>
      `${secureString(4, "abcdefghijkmnpqrstuvwxyz23456789")}-${secureString(4, "abcdefghijkmnpqrstuvwxyz23456789")}`
    );
    await context.supabase
      .from("operator_2fa")
      .update({ enabled: true, recovery_codes: codes })
      .eq("user_id", context.userId);
    return { ok: true, recovery_codes: codes };
  });

export const disable2fa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().length(6) }).parse(d))
  .handler(async ({ data, context }) => {
    const email = (context.claims as any)?.email ?? "user";
    const { data: row } = await context.supabase
      .from("operator_2fa").select("secret, enabled").eq("user_id", context.userId).maybeSingle();
    if (!row?.enabled) return { ok: true };
    const delta = totp(row.secret, email).validate({ token: data.code, window: 1 });
    if (delta === null) throw new Error("Código inválido");
    await context.supabase.from("operator_2fa").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export const verify2faLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(6).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const email = (context.claims as any)?.email ?? "user";
    const { data: row } = await context.supabase
      .from("operator_2fa").select("secret, enabled, recovery_codes").eq("user_id", context.userId).maybeSingle();
    if (!row?.enabled) return { ok: true, required: false };
    const code = data.code.trim();
    if (code.length === 6 && /^\d{6}$/.test(code)) {
      const delta = totp(row.secret, email).validate({ token: code, window: 1 });
      if (delta !== null) return { ok: true, required: true };
    } else if (Array.isArray(row.recovery_codes) && row.recovery_codes.includes(code)) {
      const remaining = (row.recovery_codes as string[]).filter((c) => c !== code);
      await context.supabase.from("operator_2fa").update({ recovery_codes: remaining }).eq("user_id", context.userId);
      return { ok: true, required: true, recovery_used: true };
    }
    throw new Error("Código 2FA inválido");
  });

export const check2faRequired = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("operator_2fa").select("enabled").eq("user_id", context.userId).maybeSingle();
    return { required: !!data?.enabled };
  });

