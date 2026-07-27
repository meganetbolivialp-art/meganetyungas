
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

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER t_plans_upd BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_clients_upd BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_subs_upd BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_inv_upd BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_tk_upd BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.assign_default_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.assign_default_admin();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
ON CONFLICT DO NOTHING;

DROP POLICY "auth read plans" ON public.plans;
DROP POLICY "auth write plans" ON public.plans;
CREATE POLICY "admin all plans" ON public.plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY "auth read clients" ON public.clients;
DROP POLICY "auth write clients" ON public.clients;
CREATE POLICY "admin all clients" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY "auth read subs" ON public.subscriptions;
DROP POLICY "auth write subs" ON public.subscriptions;
CREATE POLICY "admin all subs" ON public.subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY "auth read inv" ON public.invoices;
DROP POLICY "auth write inv" ON public.invoices;
CREATE POLICY "admin all inv" ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY "auth read tk" ON public.tickets;
DROP POLICY "auth write tk" ON public.tickets;
CREATE POLICY "admin all tk" ON public.tickets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS latitude numeric(10,6);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS longitude numeric(10,6);

CREATE TABLE public.routers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ip_address text NOT NULL,
  type text NOT NULL DEFAULT 'mikrotik',
  location text,
  api_port integer DEFAULT 8728,
  status text NOT NULL DEFAULT 'online',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routers TO authenticated;
GRANT ALL ON public.routers TO service_role;
ALTER TABLE public.routers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all routers" ON public.routers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  router_id uuid REFERENCES public.routers(id) ON DELETE SET NULL,
  ip_address text,
  mac_address text,
  pppoe_user text,
  pppoe_password text,
  installation_address text,
  installation_date date DEFAULT current_date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all services" ON public.services FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  method text NOT NULL DEFAULT 'cash',
  reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all payments" ON public.payments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL DEFAULT 'email',
  subject text,
  content text NOT NULL,
  recipients_count integer NOT NULL DEFAULT 0,
  target text,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all messages" ON public.messages FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'equipment',
  serial text,
  quantity integer NOT NULL DEFAULT 0,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  location text,
  status text NOT NULL DEFAULT 'in_stock',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all inv items" ON public.inventory_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.accounting_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL,
  entry_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_entries TO authenticated;
GRANT ALL ON public.accounting_entries TO service_role;
ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all acct" ON public.accounting_entries FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  document text,
  email text,
  phone text,
  role text NOT NULL DEFAULT 'technician',
  salary numeric(10,2) NOT NULL DEFAULT 0,
  hire_date date DEFAULT current_date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all emp" ON public.employees FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period text NOT NULL,
  base_salary numeric(10,2) NOT NULL,
  bonuses numeric(10,2) NOT NULL DEFAULT 0,
  deductions numeric(10,2) NOT NULL DEFAULT 0,
  net_amount numeric(10,2) NOT NULL,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll TO authenticated;
GRANT ALL ON public.payroll TO service_role;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all payroll" ON public.payroll FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.network_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'tower',
  latitude numeric(10,6) NOT NULL,
  longitude numeric(10,6) NOT NULL,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.network_nodes TO authenticated;
GRANT ALL ON public.network_nodes TO service_role;
ALTER TABLE public.network_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all nodes" ON public.network_nodes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER t_routers_upd BEFORE UPDATE ON public.routers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_services_upd BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_inv_items_upd BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_emp_upd BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.routers (name, ip_address, type, location, status) VALUES
  ('NAS-Central', '192.168.10.1', 'mikrotik', 'Data Center Central', 'online'),
  ('NAS-Norte', '192.168.20.1', 'mikrotik', 'Torre Zona Norte', 'online'),
  ('NAS-Sur', '192.168.30.1', 'mikrotik', 'Torre Zona Sur', 'offline');

INSERT INTO public.network_nodes (name, type, latitude, longitude, status) VALUES
  ('Torre Central', 'tower', -16.5000, -68.1500, 'active'),
  ('Torre Norte', 'tower', -16.4700, -68.1200, 'active'),
  ('Torre Sur', 'tower', -16.5400, -68.1800, 'active'),
  ('Repetidor Este', 'repeater', -16.4900, -68.0900, 'active');

INSERT INTO public.inventory_items (name, category, serial, quantity, unit_price, location, status) VALUES
  ('Router TP-Link Archer C6', 'router', 'TPL-C6-001', 25, 45.00, 'Almacén Central', 'in_stock'),
  ('Antena Ubiquiti LiteBeam 5AC', 'antenna', 'UBQ-LB5-045', 15, 89.00, 'Almacén Central', 'in_stock'),
  ('Cable UTP Cat6 (305m)', 'cable', 'CAT6-305', 8, 120.00, 'Almacén Norte', 'in_stock'),
  ('ONU GPON XPON', 'onu', 'ONU-XP-201', 3, 32.00, 'Almacén Central', 'low_stock'),
  ('Switch Mikrotik CRS-328', 'switch', 'MKT-CRS-01', 2, 350.00, 'Data Center', 'in_stock');

INSERT INTO public.employees (full_name, document, email, phone, role, salary, status) VALUES
  ('Roberto Salazar', '11223344', 'roberto@mikrosystem.net', '+591 76001122', 'technician', 850.00, 'active'),
  ('Patricia Núñez', '22334455', 'patricia@mikrosystem.net', '+591 76112233', 'admin', 1200.00, 'active'),
  ('Fernando Ríos', '33445566', 'fernando@mikrosystem.net', '+591 76223344', 'technician', 850.00, 'active'),
  ('Silvia Cortez', '44556677', 'silvia@mikrosystem.net', '+591 76334455', 'support', 700.00, 'active');

INSERT INTO public.accounting_entries (entry_type, category, description, amount, entry_date) VALUES
  ('income', 'services', 'Cobranza mensual clientes', 4800.00, current_date - 5),
  ('expense', 'infrastructure', 'Pago proveedor de ancho de banda', 1500.00, current_date - 10),
  ('expense', 'salaries', 'Salarios mensuales', 3600.00, current_date - 8),
  ('income', 'installations', 'Instalaciones nuevas', 800.00, current_date - 3),
  ('expense', 'utilities', 'Electricidad data center', 320.00, current_date - 12);

INSERT INTO public.services (client_id, plan_id, router_id, ip_address, pppoe_user, status)
SELECT c.id,
       (SELECT id FROM public.plans ORDER BY price LIMIT 1),
       (SELECT id FROM public.routers WHERE status='online' ORDER BY random() LIMIT 1),
       '10.0.0.' || (row_number() OVER () + 10)::text,
       lower(split_part(c.full_name,' ',1)) || (row_number() OVER ())::text,
       CASE WHEN c.status = 'active' THEN 'active' ELSE c.status END
FROM public.clients c;

UPDATE public.clients SET latitude = -16.5000 + (random() - 0.5) * 0.05,
                          longitude = -68.1500 + (random() - 0.5) * 0.05
WHERE latitude IS NULL;

INSERT INTO public.messages (channel, subject, content, recipients_count, target, status) VALUES
  ('email', 'Recordatorio de pago', 'Estimado cliente, su factura vence en 3 días.', 12, 'pending_invoices', 'sent'),
  ('whatsapp', NULL, 'Mantenimiento programado esta madrugada de 2:00 a 4:00 AM.', 45, 'all_active', 'sent'),
  ('sms', NULL, 'Su pago fue recibido. Gracias.', 8, 'recent_payments', 'sent');

INSERT INTO public.payments (client_id, amount, method, reference)
SELECT id, 40.00, 'transfer', 'REF-' || substring(id::text, 1, 8) FROM public.clients LIMIT 3;

ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS api_user text DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS api_password text,
  ADD COLUMN IF NOT EXISTS simulated boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_day integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS balance numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS monthly_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS auto_suspend boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_billed_month text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_number serial,
  ADD COLUMN IF NOT EXISTS period_month integer,
  ADD COLUMN IF NOT EXISTS period_year integer,
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS days_overdue integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.client_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_actions TO authenticated;
GRANT ALL ON public.client_actions TO service_role;
ALTER TABLE public.client_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all client_actions" ON public.client_actions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.log_service_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.client_actions (client_id, service_id, action, detail)
    VALUES (NEW.client_id, NEW.id,
      CASE NEW.status WHEN 'suspended' THEN 'suspend' WHEN 'active' THEN 'reactivate' ELSE 'status_change' END,
      'Servicio pasó de ' || OLD.status || ' a ' || NEW.status);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS t_services_log ON public.services;
CREATE TRIGGER t_services_log AFTER UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.log_service_change();

CREATE OR REPLACE FUNCTION public.generate_monthly_invoices(p_month integer DEFAULT NULL, p_year integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month integer := COALESCE(p_month, EXTRACT(MONTH FROM now())::integer);
  v_year  integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);
  v_tag   text := v_year || '-' || lpad(v_month::text, 2, '0');
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT s.id AS service_id, s.client_id, s.plan_id, s.monthly_price,
           COALESCE(s.monthly_price, p.price) AS price,
           c.billing_day
      FROM public.services s
      JOIN public.clients c ON c.id = s.client_id
      JOIN public.plans p ON p.id = s.plan_id
     WHERE s.status = 'active'
       AND (s.last_billed_month IS DISTINCT FROM v_tag)
  LOOP
    INSERT INTO public.invoices (client_id, service_id, amount, due_date, status, concept, period_month, period_year)
    VALUES (r.client_id, r.service_id, r.price,
            make_date(v_year, v_month, LEAST(GREATEST(r.billing_day,1),28)),
            'pending',
            'Servicio de internet ' || v_tag,
            v_month, v_year);
    UPDATE public.services SET last_billed_month = v_tag WHERE id = r.service_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.mark_overdue_invoices(p_grace_days integer DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_overdue integer;
  v_suspended integer;
BEGIN
  UPDATE public.invoices
     SET status = 'overdue',
         days_overdue = GREATEST(0, (CURRENT_DATE - due_date)::integer)
   WHERE status = 'pending' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_overdue = ROW_COUNT;

  WITH to_susp AS (
    SELECT DISTINCT s.id
      FROM public.services s
      JOIN public.invoices i ON i.service_id = s.id
     WHERE s.status = 'active'
       AND s.auto_suspend = true
       AND i.status = 'overdue'
       AND (CURRENT_DATE - i.due_date) > p_grace_days
  )
  UPDATE public.services s
     SET status = 'suspended', suspended_at = now()
    FROM to_susp WHERE s.id = to_susp.id;
  GET DIAGNOSTICS v_suspended = ROW_COUNT;

  RETURN jsonb_build_object('overdue', v_overdue, 'suspended', v_suspended);
END; $$;

GRANT EXECUTE ON FUNCTION public.generate_monthly_invoices(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices(integer) TO authenticated;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS mikrotik_profile_name text,
  ADD COLUMN IF NOT EXISTS burst_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'pppoe',
  ADD COLUMN IF NOT EXISTS queue_target text,
  ADD COLUMN IF NOT EXISTS hotspot_user text,
  ADD COLUMN IF NOT EXISTS hotspot_password text,
  ADD COLUMN IF NOT EXISTS previous_profile text;

ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_type_chk;
ALTER TABLE public.services
  ADD CONSTRAINT services_type_chk CHECK (service_type IN ('pppoe','queue','hotspot'));

ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS morosos_profile text NOT NULL DEFAULT 'morosos',
  ADD COLUMN IF NOT EXISTS walled_garden_ip text;

UPDATE public.plans
   SET mikrotik_profile_name = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))
 WHERE mikrotik_profile_name IS NULL;
