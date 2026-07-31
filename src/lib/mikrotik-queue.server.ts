// Cola de operaciones MikroTik pendientes cuando el router está desconectado.
// Uso: envolver una llamada a mikrotik.* con withQueueFallback(). Si falla
// por conectividad, la operación se guarda y se aplica automáticamente al
// reconectar (ver flushPending()).

import type { SupabaseClient } from "@supabase/supabase-js";

export type PendingOp =
  | "createPPPoE"
  | "disablePPPoE"
  | "enablePPPoE"
  | "removePPPoE"
  | "setPppoeProfile"
  | "addToCutoffList"
  | "removeFromCutoffList"
  | "kickPPPoESession";

const OFFLINE_RE = /(timeout|ECONNRESET|EPIPE|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|socket hang up|circuit open|no responde ahora mismo)/i;

export function isOfflineError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err);
  return OFFLINE_RE.test(msg);
}

export async function enqueueOp(
  supabase: SupabaseClient,
  args: {
    routerId: string;
    serviceId?: string | null;
    clientId?: string | null;
    op: PendingOp;
    payload: Record<string, unknown>;
    error?: string;
  },
) {
  const { error } = await supabase.from("mikrotik_pending_ops").insert({
    router_id: args.routerId,
    service_id: args.serviceId ?? null,
    client_id: args.clientId ?? null,
    op: args.op,
    payload: args.payload,
    status: "pending",
    attempts: 0,
    last_error: args.error ?? null,
  });
  if (error) console.error("[mikrotik-queue] enqueue failed", error.message);
}

/**
 * Envuelve una operación MikroTik. Si falla por router desconectado,
 * la guarda en cola y devuelve `{ queued: true }`. Si falla por otro
 * motivo (credenciales, usuario no existe, etc.) re-lanza el error.
 */
export async function withQueueFallback<T>(
  supabase: SupabaseClient,
  ctx: {
    routerId: string;
    serviceId?: string | null;
    clientId?: string | null;
    op: PendingOp;
    payload: Record<string, unknown>;
  },
  fn: () => Promise<T>,
): Promise<T | { queued: true; ok: true }> {
  try {
    return await fn();
  } catch (e) {
    if (isOfflineError(e)) {
      await enqueueOp(supabase, { ...ctx, error: (e as Error).message });
      console.log(`[mikrotik-queue] router offline, en cola: ${ctx.op}`);
      return { queued: true as const, ok: true as const };
    }
    throw e;
  }
}

/**
 * Aplica todas las operaciones pendientes de un router. Se llama tras
 * detectar que el router volvió a estar online.
 */
export async function flushPending(
  supabase: SupabaseClient,
  routerId: string,
): Promise<{ done: number; failed: number; pending: number }> {
  const { data: router } = await supabase.from("routers").select("*").eq("id", routerId).single();
  if (!router) return { done: 0, failed: 0, pending: 0 };

  const { data: ops } = await supabase
    .from("mikrotik_pending_ops")
    .select("*")
    .eq("router_id", routerId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(200);

  if (!ops || ops.length === 0) return { done: 0, failed: 0, pending: 0 };

  const { mikrotik } = await import("./mikrotik.server");
  let done = 0;
  let failed = 0;

  for (const op of ops) {
    try {
      const p = op.payload as any;
      switch (op.op as PendingOp) {
        case "createPPPoE":
          await mikrotik.createPPPoE(router as any, p);
          break;
        case "disablePPPoE":
          await mikrotik.disablePPPoE(router as any, p);
          break;
        case "enablePPPoE":
          await mikrotik.enablePPPoE(router as any, p);
          break;
        case "removePPPoE":
          await mikrotik.removePPPoE(router as any, p);
          break;
        case "setPppoeProfile":
          await mikrotik.setPppoeProfile(router as any, p);
          break;
        case "addToCutoffList":
          await mikrotik.addToCutoffList(router as any, p);
          break;
        case "removeFromCutoffList":
          await mikrotik.removeFromCutoffList(router as any, p);
          break;
        case "kickPPPoESession":
          await mikrotik.kickPPPoESession(router as any, p);
          break;
        default:
          throw new Error(`op desconocida: ${op.op}`);
      }
      await supabase
        .from("mikrotik_pending_ops")
        .update({ status: "done", synced_at: new Date().toISOString(), attempts: op.attempts + 1 })
        .eq("id", op.id);
      done++;
    } catch (e) {
      const msg = (e as Error).message;
      // Si sigue offline, no marcamos como failed — se reintenta el próximo flush.
      if (isOfflineError(e)) {
        await supabase
          .from("mikrotik_pending_ops")
          .update({ attempts: op.attempts + 1, last_error: msg })
          .eq("id", op.id);
        // Salir del bucle: el router volvió a caerse.
        return { done, failed, pending: ops.length - done - failed };
      }
      // Error semántico (usuario ya existe, etc.): marcar failed.
      const attempts = op.attempts + 1;
      await supabase
        .from("mikrotik_pending_ops")
        .update({
          status: attempts >= 5 ? "failed" : "pending",
          attempts,
          last_error: msg,
        })
        .eq("id", op.id);
      failed++;
    }
  }
  return { done, failed, pending: 0 };
}

export async function countPendingByRouter(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("mikrotik_pending_ops")
    .select("router_id")
    .eq("status", "pending");
  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.router_id, (counts.get(row.router_id) ?? 0) + 1);
  return counts;
}
