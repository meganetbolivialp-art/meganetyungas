import { supabase } from './integrations/supabase/client';
import { checkRouterConnectivity } from './lib/mikrotik.server';

async function run() {
  console.log("--- DIAGNÓSTICO DE ESTADO DE ROUETERS ---");
  const { data: routers, error } = await supabase.from('routers').select('*').eq('is_simulated', false);
  
  if (error || !routers) {
    console.error("Error al leer routers:", error);
    return;
  }

  for (const router of routers) {
    console.log(`\nProbando ${router.name} (${router.ip_address})...`);
    try {
      const result = await checkRouterConnectivity(router.id);
      console.log(`Resultado: ${result.online ? 'ONLINE ✅' : 'OFFLINE ❌'}`);
      if (!result.online) {
        console.log(`Motivo: ${result.error || 'Desconocido'}`);
      }
      
      // Forzar actualización en DB
      const status = result.online ? 'online' : 'offline';
      await supabase.from('routers').update({ 
        status, 
        last_seen: new Date().toISOString() 
      }).eq('id', router.id);
      
    } catch (e) {
      console.error(`Error crítico probando ${router.name}:`, e);
    }
  }
}

run();
