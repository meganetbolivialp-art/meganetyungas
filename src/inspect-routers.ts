import { supabase } from './integrations/supabase/client';
async function run() {
  const { data, error } = await supabase.from('routers').select('*');
  console.log(JSON.stringify(data, null, 2));
}
run();
