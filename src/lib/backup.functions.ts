import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Tables with business/app data that are always included in a backup.
const CORE_BACKUP_TABLES = [
  "app_license",
  "branches",
  "employees",
  "user_roles",
  "profiles",
  "routers",
  "plans",
  "clients",
  "services",
  "subscriptions",
  "invoices",
  "payments",
  "payment_gateways",
  "payment_intents",
  "cash_registers",
  "cash_movements",
  "accounting_entries",
  "commissions",
  "payroll",
  "cutoff_policies",
  "cutoff_leaks",
  "client_actions",
  "client_portal_users",
  "client_portal_sessions",
  "portal_settings",
  "tickets",
  "ticket_messages",
  "work_orders",
  "leads",
  "hotspot_vouchers",
  "inventory_items",
  "inventory_serials",
  "message_templates",
  "messages",
  "bulk_change_templates",
  "network_nodes",
  "fiber_links",
  "radius_users",
  "router_ip_pools",
  "mikrotik_pending_ops",
  "vpn_servers",
  "vpn_peers",
  "licenses",
  "license_activations",
  "license_state",
] as const;

// Heavy/log tables that are only included when the user explicitly requests a full backup.
const LOG_BACKUP_TABLES = ["audit_logs", "job_runs"] as const;

async function requireAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo administradores pueden gestionar backups");
}

const CreateBackupSchema = z.object({
  includeLogs: z.boolean().default(false),
});

export const createBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CreateBackupSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tables = data.includeLogs
      ? [...CORE_BACKUP_TABLES, ...LOG_BACKUP_TABLES]
      : [...CORE_BACKUP_TABLES];

    const dump: Record<string, any[]> = {};
    for (const t of tables) {
      const { data, error } = await supabaseAdmin.from(t as any).select("*");
      if (error) {
        // skip tables that don't exist / are inaccessible
        continue;
      }
      dump[t] = data ?? [];
    }

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "backup.create",
      entity: "system",
      detail: {
        tables: Object.keys(dump).length,
        rows: Object.values(dump).reduce((a, r) => a + r.length, 0),
        full: data.includeLogs,
      },
    });

    return {
      version: "1.0",
      generatedAt: new Date().toISOString(),
      full: data.includeLogs,
      tables: dump,
    };
  });

const RestoreSchema = z.object({
  payload: z.object({
    version: z.string(),
    tables: z.record(z.array(z.any())),
  }),
  mode: z.enum(["merge", "replace"]).default("merge"),
});

export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RestoreSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Restore every table present in the backup payload, in dependency order.
    const allTables = [
      ...CORE_BACKUP_TABLES,
      ...LOG_BACKUP_TABLES,
    ];

    const results: { table: string; inserted: number; error?: string }[] = [];
    for (const t of allTables) {
      const rows = data.payload.tables[t];
      if (!rows || rows.length === 0) continue;

      if (data.mode === "replace") {
        // best-effort wipe
        await supabaseAdmin.from(t as any).delete().gte("created_at", "1900-01-01");
      }

      const { error, count } = await (supabaseAdmin.from(t as any) as any)
        .upsert(rows, { onConflict: "id", ignoreDuplicates: false, count: "exact" });
      if (error) {
        results.push({ table: t, inserted: 0, error: error.message });
      } else {
        results.push({ table: t, inserted: count ?? rows.length });
      }
    }

    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "backup.restore",
      entity: "system",
      detail: { mode: data.mode, results },
    });

    return { ok: true, results };
  });
