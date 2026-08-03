import { supabase } from './integrations/supabase/client';
import { mikrotik } from './lib/mikrotik.server';

async function run() {
  console.log("--- SYNC FINAL DE ESTADO DE ROUTERS ---");
  const { data: routers, error } = await supabase.from('routers').select('*').eq('is_simulated', false);
  
  if (error || !routers) {
    console.error("Error al leer routers:", error);
    return;
  }

  for (const router of routers) {
    console.log(`\nProbando ${router.name} (${router.ip_address})...`);
    try {
      // mikrotik.ping devuelve { ok: true, latency_ms: ... } o lanza error
      const result = await mikrotik.ping(router as any);
      console.log(`Resultado: ONLINE ✅ (${result.latency_ms}ms)`);
      
      await supabase.from('routers').update({ 
        status: 'online', 
        last_seen: new Date().toISOString() 
      }).eq('id', router.id);
      
    } catch (e) {
      console.log(`Resultado: OFFLINE ❌`);
      console.log(`Error: ${(e as Error).message}`);
      
      await supabase.from('routers').update({ 
        status: 'offline',
        last_seen: new Date().toISOString()
      }).eq('id', router.id);
    }
  }
}

run();
