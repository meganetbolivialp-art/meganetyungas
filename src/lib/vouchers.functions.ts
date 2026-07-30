import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { secureString } from "@/lib/secure-random";

function rand(n: number) {
  return secureString(n, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
}

export const generateVouchers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { count: number; profile: string; timeLimit?: string; dataLimit?: string; price?: number; routerId?: string }) => d)
  .handler(async ({ data, context }) => {
    const batch = crypto.randomUUID();
    const rows = Array.from({ length: Math.min(data.count, 500) }, () => ({
      batch_id: batch,
      username: rand(6),
      password: rand(6),
      profile: data.profile,
      time_limit: data.timeLimit ?? null,
      data_limit: data.dataLimit ?? null,
      price: data.price ?? null,
      router_id: data.routerId ?? null,
    }));
    const { data: inserted, error } = await context.supabase.from("hotspot_vouchers").insert(rows).select();
    if (error) throw new Error(error.message);
    return { batchId: batch, vouchers: inserted };
  });
