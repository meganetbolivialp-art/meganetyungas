
-- PLANS
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  download_mbps integer NOT NULL,
  upload_mbps integer NOT NULL,
  price numeric(10,2) NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read plans" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write plans" ON public.plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CLIENTS
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  document text,
  email text,
  phone text,
  address text,
  city text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write clients" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- SUBSCRIPTIONS
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  start_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read subs" ON public.subscriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write subs" ON public.subscriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- INVOICES
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  due_date date NOT NULL,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  concept text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read inv" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write inv" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- TICKETS
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  subject text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read tk" ON public.tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write tk" ON public.tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER t_plans_upd BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_clients_upd BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_subs_upd BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_inv_upd BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_tk_upd BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- DEMO DATA
WITH p AS (
  INSERT INTO public.plans (name, download_mbps, upload_mbps, price, description) VALUES
    ('Básico 20M', 20, 5, 25.00, 'Ideal para navegación y correo'),
    ('Hogar 50M', 50, 15, 40.00, 'Streaming HD y videollamadas'),
    ('Familiar 100M', 100, 30, 60.00, 'Múltiples dispositivos, 4K'),
    ('Pro 300M', 300, 100, 95.00, 'Trabajo remoto y gaming')
  RETURNING id, name
),
c AS (
  INSERT INTO public.clients (full_name, document, email, phone, address, city, status) VALUES
    ('Juan Pérez García', '12345678', 'juan.perez@example.com', '+591 70011122', 'Av. Siempre Viva 123', 'La Paz', 'active'),
    ('María López Vera', '87654321', 'maria.lopez@example.com', '+591 71122334', 'Calle Sucre 456', 'Cochabamba', 'active'),
    ('Carlos Ramírez', '45678912', 'carlos.r@example.com', '+591 72233445', 'Zona Sur, Calacoto', 'La Paz', 'active'),
    ('Ana Torres', '32165498', 'ana.torres@example.com', '+591 73344556', 'Av. Cristo Redentor', 'Santa Cruz', 'suspended'),
    ('Luis Fernández', '78912345', 'luis.f@example.com', '+591 74455667', 'Barrio Petrolero', 'Santa Cruz', 'active'),
    ('Rosa Mendoza', '15975348', 'rosa.m@example.com', '+591 75566778', 'Villa Nueva 789', 'El Alto', 'inactive')
  RETURNING id, full_name
),
subs AS (
  INSERT INTO public.subscriptions (client_id, plan_id, status)
  SELECT c.id, (SELECT id FROM p ORDER BY random() LIMIT 1), 'active' FROM c
  RETURNING id
)
INSERT INTO public.invoices (client_id, amount, due_date, status, concept)
SELECT c.id, 40.00, current_date + 10, 'pending', 'Servicio mensual' FROM c
UNION ALL
SELECT c.id, 40.00, current_date - 5, 'overdue', 'Servicio mensual' FROM c LIMIT 3;

INSERT INTO public.tickets (client_id, subject, description, priority, status)
SELECT id, 'Sin conexión a internet', 'El cliente reporta que no tiene señal desde ayer.', 'high', 'open' FROM public.clients LIMIT 1;
INSERT INTO public.tickets (client_id, subject, description, priority, status)
SELECT id, 'Velocidad lenta', 'Solicita revisión de velocidad contratada.', 'medium', 'in_progress' FROM public.clients OFFSET 1 LIMIT 1;
INSERT INTO public.tickets (client_id, subject, description, priority, status)
SELECT id, 'Cambio de plan', 'Cliente desea upgrade al plan 100M.', 'low', 'resolved' FROM public.clients OFFSET 2 LIMIT 1;
