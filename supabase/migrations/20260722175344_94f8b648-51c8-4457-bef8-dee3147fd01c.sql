
-- Extend clients with location
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS latitude numeric(10,6);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS longitude numeric(10,6);

-- ROUTERS
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

-- SERVICES (contratos)
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

-- PAYMENTS
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

-- MESSAGES (mensajería masiva)
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

-- INVENTORY
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

-- ACCOUNTING
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

-- EMPLOYEES
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

-- PAYROLL
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

-- NETWORK NODES
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

-- update triggers
CREATE TRIGGER t_routers_upd BEFORE UPDATE ON public.routers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_services_upd BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_inv_items_upd BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_emp_upd BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- DEMO DATA
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

-- Create services for existing clients using first plan
INSERT INTO public.services (client_id, plan_id, router_id, ip_address, pppoe_user, status)
SELECT c.id,
       (SELECT id FROM public.plans ORDER BY price LIMIT 1),
       (SELECT id FROM public.routers WHERE status='online' ORDER BY random() LIMIT 1),
       '10.0.0.' || (row_number() OVER () + 10)::text,
       lower(split_part(c.full_name,' ',1)) || (row_number() OVER ())::text,
       CASE WHEN c.status = 'active' THEN 'active' ELSE c.status END
FROM public.clients c;

-- Add coords to a few clients
UPDATE public.clients SET latitude = -16.5000 + (random() - 0.5) * 0.05,
                          longitude = -68.1500 + (random() - 0.5) * 0.05
WHERE latitude IS NULL;

-- Sample messages
INSERT INTO public.messages (channel, subject, content, recipients_count, target, status) VALUES
  ('email', 'Recordatorio de pago', 'Estimado cliente, su factura vence en 3 días.', 12, 'pending_invoices', 'sent'),
  ('whatsapp', NULL, 'Mantenimiento programado esta madrugada de 2:00 a 4:00 AM.', 45, 'all_active', 'sent'),
  ('sms', NULL, 'Su pago fue recibido. Gracias.', 8, 'recent_payments', 'sent');

-- Sample payments
INSERT INTO public.payments (client_id, amount, method, reference)
SELECT id, 40.00, 'transfer', 'REF-' || substring(id::text, 1, 8) FROM public.clients LIMIT 3;
