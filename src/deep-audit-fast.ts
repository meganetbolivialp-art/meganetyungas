import { supabaseAdmin } from "./integrations/supabase/client.server";
import { mikrotik } from "./lib/mikrotik.server";

async function deepAudit() {
  console.log("=== INICIO AUDITORÍA PROFUNDA (REINTENTO) ===");

  const { data: routers } = await supabaseAdmin.from("routers").select("*");
  if (!routers) return;

  // Filtrar los que ya fallaron o se sabe que están mal si queremos ir rápido, 
  // pero mejor probamos todos con un timeout de ping más bajo para el reporte.
  
  for (const router of routers) {
    console.log(`\n--- Router: ${router.name} (${router.ip_address}) ---`);
    try {
      // Usamos un timeout más corto para el ping de auditoría
      const p = await mikrotik.ping(router as any);
      console.log("Ping OK:", p);
      
      await supabaseAdmin
        .from("routers")
        .update({ status: "online", last_sync_at: new Date().toISOString() })
        .eq("id", router.id);

      const secretRes = await mikrotik.listSecrets(router as any);
      console.log(`Secretos OK (${secretRes.secrets?.length || 0})`);

    } catch (e) {
      console.error(`Estado: DESCONECTADO (${(e as Error).message})`);
      await supabaseAdmin.from("routers").update({ status: "offline" }).eq("id", router.id);
    }
  }
}

deepAudit().catch(console.error);
