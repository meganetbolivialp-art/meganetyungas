import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const LogSchema = z.object({
  action: z.string().min(1).max(64),
  entity: z.string().max(64).optional(),
  entity_id: z.string().max(128).optional(),
  detail: z.record(z.any()).optional(),
});

export const logAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => LogSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { error } = await supabase.from("audit_logs").insert({
      user_id: userId,
      user_email: (claims as any)?.email ?? null,
      action: data.action,
      entity: data.entity ?? null,
      entity_id: data.entity_id ?? null,
      detail: data.detail ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ListSchema = z.object({
  limit: z.number().int().min(1).max(200).default(100),
  action: z.string().optional(),
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const listAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ListSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("audit_logs")
      .select("id, user_email, action, entity, entity_id, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.action) q = q.eq("action", data.action);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.q) q = q.or(`user_email.ilike.%${data.q}%,entity.ilike.%${data.q}%,entity_id.ilike.%${data.q}%,action.ilike.%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
