import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Opts = {
  routerId: string;
  setIdentity: boolean;
  enableApi: boolean;
  allowApiFromVpn: boolean;
  enableNtp: boolean;
  dryRun: boolean;
};

export const applyBasicSafeSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Opts) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase
      .from("routers")
      .select("id,name,ip_address,api_port,api_user,api_password,simulated,morosos_profile,walled_garden_ip")
      .eq("id", data.routerId)
      .maybeSingle();
    if (error || !r) throw new Error("Router no encontrado");

    const { mikrotik } = await import("./mikrotik.server");
    const result = await mikrotik.basicSafeSetup(r as any, {
      setIdentity: data.setIdentity,
      enableApi: data.enableApi,
      allowApiFromVpn: data.allowApiFromVpn,
      enableNtp: data.enableNtp,
      dryRun: data.dryRun,
    });

    if (!data.dryRun) {
      await context.supabase.from("audit_logs").insert({
        user_id: context.userId,
        action: "router.basic_safe_setup",
        entity: "router",
        entity_id: data.routerId,
        detail: { router: r.name, result } as any,
      } as any).then(() => {}, () => {});
    }

    return result;
  });

export const undoBasicSafeSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase
      .from("routers")
      .select("id,name,ip_address,api_port,api_user,api_password,simulated,morosos_profile,walled_garden_ip")
      .eq("id", data.routerId)
      .maybeSingle();
    if (error || !r) throw new Error("Router no encontrado");
    const { mikrotik } = await import("./mikrotik.server");
    return mikrotik.basicSafeUndo(r as any);
  });
