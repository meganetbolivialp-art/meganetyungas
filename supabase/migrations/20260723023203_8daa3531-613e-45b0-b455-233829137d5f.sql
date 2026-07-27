
-- Sucursales
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text, city text, phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read branches" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write branches" ON public.branches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER branches_updated_at BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clients  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
INSERT INTO public.branches (name, city) VALUES ('Casa Matriz','Central') ON CONFLICT DO NOTHING;

-- Portal cliente
CREATE TABLE IF NOT EXISTS public.client_portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  last_login timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_users TO authenticated;
GRANT ALL ON public.client_portal_users TO service_role;
ALTER TABLE public.client_portal_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage portal users" ON public.client_portal_users FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE TRIGGER portal_users_updated_at BEFORE UPDATE ON public.client_portal_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.client_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id uuid NOT NULL REFERENCES public.client_portal_users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.client_portal_sessions TO service_role;
ALTER TABLE public.client_portal_sessions ENABLE ROW LEVEL SECURITY;

-- Pasarelas
CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL, name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read gateways" ON public.payment_gateways FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage gateways" ON public.payment_gateways FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER gateways_updated_at BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider text NOT NULL, external_id text,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  checkout_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_intents TO authenticated;
GRANT ALL ON public.payment_intents TO service_role;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read intents" ON public.payment_intents FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write intents" ON public.payment_intents FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE TRIGGER intents_updated_at BEFORE UPDATE ON public.payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Caja
CREATE TABLE IF NOT EXISTS public.cash_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id),
  opened_by uuid REFERENCES auth.users(id),
  closed_by uuid REFERENCES auth.users(id),
  opening_amount numeric(12,2) NOT NULL DEFAULT 0,
  closing_amount numeric(12,2),
  expected_amount numeric(12,2),
  difference numeric(12,2),
  status text NOT NULL DEFAULT 'open',
  notes text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_registers TO authenticated;
GRANT ALL ON public.cash_registers TO service_role;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage cash" ON public.cash_registers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id uuid NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  kind text NOT NULL, category text,
  amount numeric(12,2) NOT NULL,
  description text, reference_id uuid,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage cash mov" ON public.cash_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Órdenes trabajo
CREATE TABLE IF NOT EXISTS public.work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id),
  type text NOT NULL DEFAULT 'installation',
  title text NOT NULL, description text,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'normal',
  assigned_to uuid REFERENCES auth.users(id),
  scheduled_at timestamptz, completed_at timestamptz,
  signature_data text, evidence_url text, notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders TO authenticated;
GRANT ALL ON public.work_orders TO service_role;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage wo" ON public.work_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER wo_updated_at BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Inventario serial
CREATE TABLE IF NOT EXISTS public.inventory_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  serial text NOT NULL UNIQUE, mac_address text,
  status text NOT NULL DEFAULT 'in_stock',
  assigned_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  assigned_service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  assigned_at timestamptz, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_serials TO authenticated;
GRANT ALL ON public.inventory_serials TO service_role;
ALTER TABLE public.inventory_serials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage serials" ON public.inventory_serials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER serials_updated_at BEFORE UPDATE ON public.inventory_serials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Leads
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL, phone text, email text,
  address text, city text,
  interested_plan_id uuid REFERENCES public.plans(id),
  source text,
  status text NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES auth.users(id), notes text,
  converted_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage leads" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Radius
CREATE TABLE IF NOT EXISTS public.radius_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE, password text NOT NULL,
  profile text, is_active boolean NOT NULL DEFAULT true,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.radius_users TO authenticated;
GRANT ALL ON public.radius_users TO service_role;
ALTER TABLE public.radius_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage radius" ON public.radius_users FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'));
CREATE TRIGGER radius_updated_at BEFORE UPDATE ON public.radius_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Vouchers hotspot
CREATE TABLE IF NOT EXISTS public.hotspot_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  username text NOT NULL UNIQUE, password text NOT NULL,
  profile text NOT NULL,
  time_limit text, data_limit text, price numeric(12,2),
  status text NOT NULL DEFAULT 'unused',
  used_at timestamptz,
  router_id uuid REFERENCES public.routers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotspot_vouchers TO authenticated;
GRANT ALL ON public.hotspot_vouchers TO service_role;
ALTER TABLE public.hotspot_vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage vouchers" ON public.hotspot_vouchers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Plantillas
CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, channel text NOT NULL,
  subject text, body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read templates" ON public.message_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage templates" ON public.message_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE TRIGGER tpl_updated_at BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.message_templates (code, channel, subject, body) VALUES
  ('welcome','email','Bienvenido','Hola {{name}}, ¡bienvenido! Tu servicio ya está activo.'),
  ('invoice','email','Nueva factura','Hola {{name}}, tienes una nueva factura por {{amount}} con vencimiento {{due_date}}.'),
  ('due_soon','whatsapp',NULL,'Hola {{name}}, tu factura vence en 5 días. Monto: {{amount}}'),
  ('overdue','whatsapp',NULL,'Hola {{name}}, tu factura está vencida. Regulariza para evitar corte.'),
  ('cutoff','whatsapp',NULL,'Hola {{name}}, tu servicio fue suspendido por falta de pago.'),
  ('reconnect','whatsapp',NULL,'Hola {{name}}, pago recibido. Tu servicio fue reactivado. ¡Gracias!')
ON CONFLICT (code) DO NOTHING;

-- Comisiones
CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  period_month int NOT NULL, period_year int NOT NULL,
  base_amount numeric(12,2) NOT NULL DEFAULT 0,
  percent numeric(5,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage commissions" ON public.commissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "user read own commissions" ON public.commissions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
