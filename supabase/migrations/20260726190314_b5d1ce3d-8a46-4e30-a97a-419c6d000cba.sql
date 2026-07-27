
-- Tabla maestra de licencias emitidas
CREATE TABLE public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  customer_name text,
  customer_email text,
  plan text NOT NULL DEFAULT 'basic', -- basic | pro | enterprise
  max_clients integer NOT NULL DEFAULT 500,
  max_routers integer NOT NULL DEFAULT 3,
  price_paid numeric(12,2),
  expires_at date,
  bound_ip text,
  bound_hostname text,
  status text NOT NULL DEFAULT 'active', -- active | suspended | revoked | expired
  activated_at timestamptz,
  last_heartbeat_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_licenses_key ON public.licenses(key);
CREATE INDEX idx_licenses_status ON public.licenses(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses TO authenticated;
GRANT ALL ON public.licenses TO service_role;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins manage licenses" ON public.licenses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_licenses_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Historial de activaciones / heartbeats
CREATE TABLE public.license_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid REFERENCES public.licenses(id) ON DELETE CASCADE,
  license_key text NOT NULL,
  event text NOT NULL, -- activate | heartbeat | verify | reject
  ip text,
  hostname text,
  result text NOT NULL, -- ok | invalid_key | ip_mismatch | expired | revoked | suspended
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activations_license ON public.license_activations(license_id, created_at DESC);

GRANT SELECT, INSERT ON public.license_activations TO authenticated;
GRANT ALL ON public.license_activations TO service_role;
ALTER TABLE public.license_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read activations" ON public.license_activations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Estado local: licencia instalada en ESTE panel
CREATE TABLE public.license_state (
  id integer PRIMARY KEY DEFAULT 1,
  license_key text,
  plan text,
  max_clients integer,
  max_routers integer,
  expires_at date,
  last_verified_at timestamptz,
  last_token text,
  status text DEFAULT 'unlicensed',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.license_state (id, status) VALUES (1, 'unlicensed');

GRANT SELECT ON public.license_state TO authenticated;
GRANT ALL ON public.license_state TO service_role;
ALTER TABLE public.license_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read license state" ON public.license_state
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Generador de claves formato MKS-XXXX-XXXX-XXXX
CREATE OR REPLACE FUNCTION public.generate_license_key()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  seg text;
  result text := 'MKS';
  i int; j int;
BEGIN
  FOR i IN 1..3 LOOP
    seg := '';
    FOR j IN 1..4 LOOP
      seg := seg || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    result := result || '-' || seg;
  END LOOP;
  RETURN result;
END;
$$;
