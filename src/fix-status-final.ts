import { supabase } from './integrations/supabase/client';
import { mikrotik } from './lib/mikrotik.server';

async function run() {
  console.log("--- SYNC FINAL DE ESTADO DE ROUTERS ---");
  const { data: routers, error } = await supabase.from('routers').select('*');
  
  if (error || !routers) {
    console.error("Error al leer routers:", error);
    return;
  }

  const realRouters = routers.filter(r => !r.simulated);
  console.log(`Encontrados ${realRouters.length} routers reales.`);

  for (const router of realRouters) {
    console.log(`\nProbando ${router.name} (${router.ip_address})...`);
    try {
      const result = await mikrotik.ping(router as any);
      console.log(`Resultado: ONLINE ✅ (${result.latency_ms}ms)`);
      
      const { error: upError } = await supabase.from('routers').update({ 
        status: 'online', 
        last_sync_at: new Date().toISOString() 
      }).eq('id', router.id);
      
      if (upError) console.error("Error actualizando DB:", upError);
      
    } catch (e) {
      console.log(`Resultado: OFFLINE ❌`);
      console.log(`Error: ${(e as Error).message}`);
      
      await supabase.from('routers').update({ 
        status: 'offline',
        last_sync_at: new Date().toISOString()
      }).eq('id', router.id);
    }
  }
}

run();
