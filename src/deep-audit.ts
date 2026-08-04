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

      // Auditoría de secrets vs servicios
      console.log("Auditando secretos PPPoE...");
      const secretRes = await mikrotik.listSecrets(router as any);
      const secrets = secretRes.secrets;
      console.log(`Secretos encontrados en MikroTik: ${secrets?.length || 0}`);

      const { data: services } = await supabaseAdmin
        .from("services")
        .select("pppoe_user")
        .eq("router_id", router.id);

      const panelUsers = new Set(services?.map(s => s.pppoe_user).filter(Boolean));
      const orphanSecrets = secrets?.filter(s => !panelUsers.has(s.name));
      
      if (orphanSecrets && orphanSecrets.length > 0) {
        console.log(`¡Alerta! ${orphanSecrets.length} secretos huérfanos en MikroTik (no están en el panel).`);
        console.log("Primeros 5 huérfanos:", orphanSecrets.slice(0, 5).map(s => s.name).join(", "));
      } else {
        console.log("Sincronización de secretos OK (0 huérfanos).");
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
