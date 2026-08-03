import { supabase } from "@/integrations/supabase/client";

async function fixRouterStatus() {
  console.log("Sincronizando estados de router...");
  const { data: routers, error } = await supabase
    .from("routers")
    .select("id, name, status");

  if (error) {
    console.error("Error al leer routers:", error);
    return;
  }

  for (const router of routers || []) {
    if (router.status !== "online") {
      console.log(`Actualizando ${router.name} a online...`);
      const { error: updateError } = await supabase
        .from("routers")
        .update({ status: "online" })
        .eq("id", router.id);
      
      if (updateError) {
        console.error(`Error actualizando ${router.name}:`, updateError);
      }
    }
  }
  console.log("Sincronización completa.");
}

fixRouterStatus();
