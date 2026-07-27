import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listClientManagementData, getClientsOnlineStatus as getClientsOnlineStatusServer } from "@/lib/clients.server";

export const listClientsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listClientManagementData(context));

export const getClientsOnlineStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => getClientsOnlineStatusServer(context));