
-- Plans: perfil Mikrotik y burst
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS mikrotik_profile_name text,
  ADD COLUMN IF NOT EXISTS burst_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

-- Services: tipo (pppoe | queue | hotspot) + campos
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'pppoe',
  ADD COLUMN IF NOT EXISTS queue_target text,
  ADD COLUMN IF NOT EXISTS hotspot_user text,
  ADD COLUMN IF NOT EXISTS hotspot_password text,
  ADD COLUMN IF NOT EXISTS previous_profile text;

ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_type_chk;
ALTER TABLE public.services
  ADD CONSTRAINT services_type_chk CHECK (service_type IN ('pppoe','queue','hotspot'));

-- Routers: perfil morosos + walled garden
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS morosos_profile text NOT NULL DEFAULT 'morosos',
  ADD COLUMN IF NOT EXISTS walled_garden_ip text;

-- Auto-generar nombre de perfil si falta
UPDATE public.plans
   SET mikrotik_profile_name = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))
 WHERE mikrotik_profile_name IS NULL;
