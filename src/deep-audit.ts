import { supabaseAdmin } from "./integrations/supabase/client.server";
import { mikrotik } from "./lib/mikrotik.server";

async function deepAudit() {
  console.log("=== INICIO AUDITORÍA PROFUNDA ===");

  // 1. Obtener routers
  const { data: routers, error: rErr } = await supabaseAdmin
    .from("routers")
    .select("*");

  if (rErr || !routers) {
    console.error("Error obteniendo routers:", rErr);
    return;
  }

  console.log(`Analizando ${routers.length} routers...`);

  for (const router of routers) {
    console.log(`\n--- Router: ${router.name} (${router.ip_address}) ---`);
    try {
      // Intento de conexión y ping
      console.log("Probando ping/identidad...");
      const p = await mikrotik.ping(router as any);
      console.log("Ping OK:", p);

      // Verificación de servicios activos
      console.log("Sincronizando estado en DB...");
      await supabaseAdmin
        .from("routers")
        .update({ status: "online", last_sync_at: new Date().toISOString() })
        .eq("id", router.id);

      // Auditoría de secrets vs clientes
      console.log("Auditando secretos PPPoE...");
      const { secrets } = await mikrotik.listSecrets(router as any);
      console.log(`Secretos encontrados: ${secrets?.length || 0}`);

      const { data: clients } = await supabaseAdmin
        .from("clients")
        .select("name, pppoe_user")
        .eq("router_id", router.id);

      const clientUsers = new Set(clients?.map(c => c.pppoe_user));
      const orphanSecrets = secrets?.filter(s => !clientUsers.has(s.name));
      
      if (orphanSecrets && orphanSecrets.length > 0) {
        console.log(`¡Alerta! ${orphanSecrets.length} secretos huérfanos en MikroTik (no están en el panel).`);
      }

    } catch (e) {
      console.error(`ERROR en ${router.name}:`, (e as Error).message);
      await supabaseAdmin
        .from("routers")
        .update({ status: "offline" })
        .eq("id", router.id);
    }
  }

  console.log("\n=== AUDITORÍA FINALIZADA ===");
}

deepAudit().catch(console.error);
