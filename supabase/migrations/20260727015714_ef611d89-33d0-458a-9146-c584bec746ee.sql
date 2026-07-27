
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, address text, city text, phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read branches" ON public.branches FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin write branches" ON public.branches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER branches_updated_at BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clients  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
INSERT INTO public.branches (name, city) VALUES ('Casa Matriz','Central') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.client_portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE, password_hash text NOT NULL,
  last_login timestamptz, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_users TO authenticated;
GRANT ALL ON public.client_portal_users TO service_role;
ALTER TABLE public.client_portal_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage portal users" ON public.client_portal_users FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER portal_users_updated_at BEFORE UPDATE ON public.client_portal_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.client_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id uuid NOT NULL REFERENCES public.client_portal_users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.client_portal_sessions TO service_role;
ALTER TABLE public.client_portal_sessions ENABLE ROW LEVEL SECURITY;

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
CREATE POLICY "admins read gateways" ON public.payment_gateways FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin manage gateways" ON public.payment_gateways FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER gateways_updated_at BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider text NOT NULL, external_id text,
  amount numeric(12,2) NOT NULL, currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending', checkout_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_intents TO authenticated;
GRANT ALL ON public.payment_intents TO service_role;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage intents" ON public.payment_intents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER intents_updated_at BEFORE UPDATE ON public.payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.cash_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id),
  opened_by uuid REFERENCES auth.users(id), closed_by uuid REFERENCES auth.users(id),
  opening_amount numeric(12,2) NOT NULL DEFAULT 0,
  closing_amount numeric(12,2), expected_amount numeric(12,2), difference numeric(12,2),
  status text NOT NULL DEFAULT 'open', notes text,
  opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_registers TO authenticated;
GRANT ALL ON public.cash_registers TO service_role;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage cash" ON public.cash_registers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id uuid NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  kind text NOT NULL, category text, method text,
  amount numeric(12,2) NOT NULL, description text, reference_id uuid,
  payment_id uuid, created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage cash mov" ON public.cash_movements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_cash_mov_reg ON public.cash_movements(register_id);
CREATE INDEX IF NOT EXISTS idx_cash_mov_created ON public.cash_movements(created_at);

CREATE TABLE IF NOT EXISTS public.work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id),
  type text NOT NULL DEFAULT 'installation',
  title text NOT NULL, description text,
  status text NOT NULL DEFAULT 'pending', priority text NOT NULL DEFAULT 'normal',
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
CREATE POLICY "admin manage wo" ON public.work_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER wo_updated_at BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
CREATE POLICY "admin manage serials" ON public.inventory_serials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER serials_updated_at BEFORE UPDATE ON public.inventory_serials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL, phone text, email text,
  address text, city text,
  interested_plan_id uuid REFERENCES public.plans(id),
  source text, status text NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES auth.users(id), notes text,
  converted_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage leads" ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
CREATE POLICY "admin manage radius" ON public.radius_users FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER radius_updated_at BEFORE UPDATE ON public.radius_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.hotspot_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  username text NOT NULL UNIQUE, password text NOT NULL, profile text NOT NULL,
  time_limit text, data_limit text, price numeric(12,2),
  status text NOT NULL DEFAULT 'unused', used_at timestamptz,
  router_id uuid REFERENCES public.routers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotspot_vouchers TO authenticated;
GRANT ALL ON public.hotspot_vouchers TO service_role;
ALTER TABLE public.hotspot_vouchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage vouchers" ON public.hotspot_vouchers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, channel text NOT NULL,
  subject text, body text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read templates" ON public.message_templates FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin manage templates" ON public.message_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER tpl_updated_at BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.message_templates (code, channel, subject, body) VALUES
  ('welcome','email','Bienvenido','Hola {{name}}, ¡bienvenido!'),
  ('invoice','email','Nueva factura','Hola {{name}}, factura por {{amount}} vence {{due_date}}.'),
  ('due_soon','whatsapp',NULL,'Hola {{name}}, tu factura vence en 5 días. Monto: {{amount}}'),
  ('overdue','whatsapp',NULL,'Hola {{name}}, tu factura está vencida.'),
  ('cutoff','whatsapp',NULL,'Hola {{name}}, tu servicio fue suspendido.'),
  ('reconnect','whatsapp',NULL,'Hola {{name}}, tu servicio fue reactivado.')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  period_month int NOT NULL, period_year int NOT NULL,
  base_amount numeric(12,2) NOT NULL DEFAULT 0,
  percent numeric(5,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending', paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage commissions" ON public.commissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "user read own commissions" ON public.commissions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.fiber_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node uuid NOT NULL REFERENCES public.network_nodes(id) ON DELETE CASCADE,
  to_node uuid NOT NULL REFERENCES public.network_nodes(id) ON DELETE CASCADE,
  cable_type text DEFAULT 'aerial', fibers int DEFAULT 12,
  length_m int, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiber_links TO authenticated;
GRANT ALL ON public.fiber_links TO service_role;
ALTER TABLE public.fiber_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manages fiber links" ON public.fiber_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER fiber_links_updated BEFORE UPDATE ON public.fiber_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.portal_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  title text NOT NULL DEFAULT 'Servicio suspendido',
  subtitle text NOT NULL DEFAULT 'Tu conexión está temporalmente inactiva',
  message text NOT NULL DEFAULT 'Regularizá el saldo pendiente y reactivamos al instante.',
  whatsapp text NOT NULL DEFAULT '5959XXXXXXX',
  whatsapp_message text NOT NULL DEFAULT 'Quiero pagar mi factura',
  phone text NOT NULL DEFAULT '021-XXXXXX',
  company_name text NOT NULL DEFAULT 'Mi ISP',
  logo_url text,
  primary_color text NOT NULL DEFAULT '#dc2626',
  secondary_color text NOT NULL DEFAULT '#f97316',
  footer_note text NOT NULL DEFAULT 'Al confirmar tu pago, tu conexión se restablece.',
  custom_html text, use_custom_html boolean NOT NULL DEFAULT false,
  template_base_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, INSERT ON public.portal_settings TO authenticated;
GRANT ALL ON public.portal_settings TO service_role;
ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portal_settings admin read" ON public.portal_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "portal_settings admin write" ON public.portal_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.portal_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
CREATE TRIGGER portal_settings_updated_at BEFORE UPDATE ON public.portal_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.job_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ, duration_ms INTEGER,
  detail JSONB, error TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_runs_started ON public.job_runs (started_at DESC);
CREATE INDEX idx_job_runs_name ON public.job_runs (job_name, started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage job runs" ON public.job_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.routers ALTER COLUMN morosos_profile SET DEFAULT 'sistema_cortados';
UPDATE public.routers SET morosos_profile = 'sistema_cortados' WHERE morosos_profile IS NULL OR morosos_profile IN ('morosos_lv','morosos');
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS client_pool_cidr text;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS client_pool_gateway text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS dont_cut boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grace_days_override integer,
  ADD COLUMN IF NOT EXISTS payment_promise_until date,
  ADD COLUMN IF NOT EXISTS billing_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS scheduled_suspend_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspend_reason text,
  ADD COLUMN IF NOT EXISTS mikrotik_synced_at timestamptz;
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS default_grace_days integer NOT NULL DEFAULT 5;

CREATE OR REPLACE FUNCTION public.mark_overdue_invoices(p_grace_days integer DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_overdue integer; v_suspended integer;
BEGIN
  UPDATE public.invoices SET status = 'overdue',
         days_overdue = GREATEST(0, (CURRENT_DATE - due_date)::integer)
   WHERE status = 'pending' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_overdue = ROW_COUNT;
  WITH to_susp AS (
    SELECT DISTINCT s.id FROM public.services s
      JOIN public.clients c ON c.id = s.client_id
      LEFT JOIN public.branches b ON b.id = c.branch_id
      JOIN public.invoices i ON i.service_id = s.id
     WHERE s.status = 'active' AND s.auto_suspend = true AND c.dont_cut = false
       AND (c.payment_promise_until IS NULL OR c.payment_promise_until < CURRENT_DATE)
       AND i.status = 'overdue'
       AND (CURRENT_DATE - i.due_date) > COALESCE(c.grace_days_override, b.default_grace_days, p_grace_days)
  )
  UPDATE public.services s SET status = 'suspended', suspended_at = now(),
         suspend_reason = COALESCE(s.suspend_reason, 'Corte automático por deuda')
    FROM to_susp WHERE s.id = to_susp.id;
  GET DIAGNOSTICS v_suspended = ROW_COUNT;
  RETURN jsonb_build_object('overdue', v_overdue, 'suspended', v_suspended);
END; $function$;

CREATE OR REPLACE FUNCTION public.cutoff_dashboard()
RETURNS TABLE (service_id uuid, client_id uuid, full_name text, document text, phone text,
  plan_name text, ip_address text, suspend_reason text, suspended_at timestamptz,
  days_cut integer, debt numeric, overdue_invoices integer, router_name text,
  dont_cut boolean, promise_until date)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT s.id, c.id, c.full_name, c.document, c.phone, p.name, s.ip_address,
    s.suspend_reason, s.suspended_at,
    GREATEST(0, EXTRACT(DAY FROM (now() - s.suspended_at))::integer),
    COALESCE((SELECT SUM(amount) FROM public.invoices i WHERE i.client_id = c.id AND i.status IN ('pending','overdue')), 0),
    COALESCE((SELECT COUNT(*)::integer FROM public.invoices i WHERE i.client_id = c.id AND i.status = 'overdue'), 0),
    r.name, c.dont_cut, c.payment_promise_until
  FROM public.services s JOIN public.clients c ON c.id = s.client_id
    JOIN public.plans p ON p.id = s.plan_id
    LEFT JOIN public.routers r ON r.id = s.router_id
  WHERE s.status = 'suspended' ORDER BY s.suspended_at DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.cutoff_kpis()
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'total_cut', (SELECT COUNT(*) FROM public.services WHERE status = 'suspended'),
    'cut_today', (SELECT COUNT(*) FROM public.services WHERE status = 'suspended' AND suspended_at::date = CURRENT_DATE),
    'reactivated_today', (SELECT COUNT(*) FROM public.client_actions WHERE action = 'reactivate' AND created_at::date = CURRENT_DATE),
    'recovered_week', COALESCE((SELECT SUM(amount) FROM public.payments
      WHERE paid_at >= date_trunc('week', now())
        AND EXISTS (SELECT 1 FROM public.client_actions ca WHERE ca.client_id = payments.client_id
              AND ca.action = 'reactivate' AND ca.created_at >= date_trunc('week', now()))), 0),
    'active_promises', (SELECT COUNT(*) FROM public.clients WHERE payment_promise_until >= CURRENT_DATE),
    'vip_protected', (SELECT COUNT(*) FROM public.clients WHERE dont_cut = true)
  );
$$;

CREATE OR REPLACE FUNCTION public.expire_payment_promises()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE public.clients SET payment_promise_until = NULL
   WHERE payment_promise_until IS NOT NULL AND payment_promise_until < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $function$;

GRANT EXECUTE ON FUNCTION public.cutoff_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cutoff_kpis() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cutoff_dashboard() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cutoff_kpis() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.expire_payment_promises() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_payment_promises() TO service_role;
REVOKE EXECUTE ON FUNCTION public.mark_overdue_invoices(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices(integer) TO service_role;

CREATE TABLE IF NOT EXISTS public.router_ip_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  name text NOT NULL, cidr text, ranges text, gateway text,
  is_default boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (router_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.router_ip_pools TO authenticated;
GRANT ALL ON public.router_ip_pools TO service_role;
ALTER TABLE public.router_ip_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read pools" ON public.router_ip_pools FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin write pools" ON public.router_ip_pools FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_router_ip_pools_updated BEFORE UPDATE ON public.router_ip_pools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_router_ip_pools_router ON public.router_ip_pools(router_id);

CREATE TABLE public.cutoff_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, description text,
  grace_days integer NOT NULL DEFAULT 5,
  cut_hour integer NOT NULL DEFAULT 9,
  cut_mode text NOT NULL DEFAULT 'ip' CHECK (cut_mode IN ('ip','speed','pppoe')),
  speed_reduced_kbps integer,
  prior_notice_hours integer NOT NULL DEFAULT 24,
  notify_sms boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT true,
  notify_whatsapp boolean NOT NULL DEFAULT false,
  reconnect_fee numeric(10,2) NOT NULL DEFAULT 0,
  late_fee numeric(10,2) NOT NULL DEFAULT 0,
  auto_suspend boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cutoff_policies TO authenticated;
GRANT ALL ON public.cutoff_policies TO service_role;
ALTER TABLE public.cutoff_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage cutoff_policies" ON public.cutoff_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cutoff_policies_updated_at BEFORE UPDATE ON public.cutoff_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cutoff_policy_id uuid REFERENCES public.cutoff_policies(id) ON DELETE SET NULL;
INSERT INTO public.cutoff_policies (name, description, grace_days, cut_hour, is_default) VALUES
  ('Estándar', 'Política estándar: 5 días de gracia', 5, 9, true),
  ('Estricta', 'Sin gracia, corte inmediato', 0, 8, false),
  ('Flexible VIP', '10 días de gracia', 10, 10, false);

CREATE TABLE public.vpn_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL, port integer NOT NULL DEFAULT 443,
  network cidr NOT NULL DEFAULT '10.10.0.0/24',
  server_ip inet NOT NULL DEFAULT '10.10.0.1',
  dns text, server_private_key text NOT NULL, server_public_key text NOT NULL,
  post_up text, post_down text,
  vpn_type text NOT NULL DEFAULT 'sstp' CHECK (vpn_type IN ('wireguard','l2tp','sstp')),
  ipsec_secret text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vpn_servers TO authenticated;
GRANT ALL ON public.vpn_servers TO service_role;
ALTER TABLE public.vpn_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage vpn_servers" ON public.vpn_servers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.vpn_peers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.vpn_servers(id) ON DELETE CASCADE,
  router_id uuid REFERENCES public.routers(id) ON DELETE SET NULL,
  name text NOT NULL, private_key text NOT NULL, public_key text NOT NULL,
  assigned_ip inet NOT NULL,
  allowed_ips cidr NOT NULL DEFAULT '0.0.0.0/0',
  sstp_user text, sstp_password text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vpn_peers TO authenticated;
GRANT ALL ON public.vpn_peers TO service_role;
ALTER TABLE public.vpn_peers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage vpn_peers" ON public.vpn_peers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER vpn_servers_updated_at BEFORE UPDATE ON public.vpn_servers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER vpn_peers_updated_at BEFORE UPDATE ON public.vpn_peers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text, body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_messages TO authenticated;
GRANT ALL ON public.ticket_messages TO service_role;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read ticket messages" ON public.ticket_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "staff write ticket messages" ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update ticket messages" ON public.ticket_messages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete ticket messages" ON public.ticket_messages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.ticket_messages(ticket_id, created_at);

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS ticket_number bigserial;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.services;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.touch_ticket_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.tickets SET last_reply_at = now(), updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_touch_ticket AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_ticket_on_message();

CREATE TABLE public.bulk_change_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, description TEXT,
  action TEXT NOT NULL CHECK (action IN ('billing_day','plan_change','status_change','grace_days','dont_cut','payment_promise')),
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_change_templates TO authenticated;
GRANT ALL ON public.bulk_change_templates TO service_role;
ALTER TABLE public.bulk_change_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage bulk templates" ON public.bulk_change_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_bulk_change_templates_updated BEFORE UPDATE ON public.bulk_change_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.bulk_change_templates (name, description, action, params) VALUES
('Día de pago 5', 'Cambia el día de facturación al 5', 'billing_day', '{"day":5}'::jsonb),
('Día de pago 10', 'Cambia al 10', 'billing_day', '{"day":10}'::jsonb),
('Día de pago 15', 'Cambia al 15', 'billing_day', '{"day":15}'::jsonb),
('Gracia 5 días', '5 días de gracia', 'grace_days', '{"days":5}'::jsonb),
('Proteger VIP', 'No cortar', 'dont_cut', '{"value":true}'::jsonb),
('Quitar protección', 'Permite corte', 'dont_cut', '{"value":false}'::jsonb),
('Promesa de pago 7 días', 'Promesa 7 días', 'payment_promise', '{"days":7}'::jsonb);

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS operator_type text NOT NULL DEFAULT 'operator',
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS router_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS commission_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_days text[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri','sat','sun'],
  ADD COLUMN IF NOT EXISTS access_from time NOT NULL DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS access_to time NOT NULL DEFAULT '23:59';
CREATE UNIQUE INDEX IF NOT EXISTS employees_username_key ON public.employees(username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_key ON public.employees(user_id) WHERE user_id IS NOT NULL;
CREATE POLICY "employee reads own" ON public.employees FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = _user_id AND e.status = 'active'
    AND (e.permissions -> _module) ? _action);
$$;

CREATE TABLE public.cutoff_leaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  detected_at timestamptz NOT NULL DEFAULT now(),
  traffic_bytes bigint NOT NULL DEFAULT 0,
  connections integer NOT NULL DEFAULT 0,
  sample jsonb, resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cutoff_leaks TO authenticated;
GRANT ALL ON public.cutoff_leaks TO service_role;
ALTER TABLE public.cutoff_leaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view leaks" ON public.cutoff_leaks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can update leaks" ON public.cutoff_leaks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Service role manages leaks" ON public.cutoff_leaks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_cutoff_leaks_service ON public.cutoff_leaks(service_id, detected_at DESC);
CREATE INDEX idx_cutoff_leaks_unresolved ON public.cutoff_leaks(resolved, detected_at DESC) WHERE resolved = false;

CREATE OR REPLACE FUNCTION public.cutoff_reincidence_report(p_from date DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date, p_to date DEFAULT CURRENT_DATE)
RETURNS TABLE(client_id uuid, full_name text, phone text, cuts integer, reactivations integer,
  last_cut_at timestamptz, classification text)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.id AS client_id, c.full_name, c.phone,
    COUNT(ca.id) FILTER (WHERE ca.action = 'suspend')::integer AS cuts,
    COUNT(ca.id) FILTER (WHERE ca.action = 'reactivate')::integer AS reactivations,
    MAX(ca.created_at) FILTER (WHERE ca.action = 'suspend') AS last_cut_at,
    CASE WHEN COUNT(ca.id) FILTER (WHERE ca.action = 'suspend') >= 6 THEN 'cronico'
         WHEN COUNT(ca.id) FILTER (WHERE ca.action = 'suspend') >= 3 THEN 'reincidente'
         WHEN COUNT(ca.id) FILTER (WHERE ca.action = 'suspend') >= 1 THEN 'ocasional'
         ELSE 'nuevo' END AS classification
  FROM public.clients c JOIN public.client_actions ca ON ca.client_id = c.id
  WHERE ca.created_at::date BETWEEN p_from AND p_to AND ca.action IN ('suspend','reactivate')
  GROUP BY c.id, c.full_name, c.phone
  HAVING COUNT(ca.id) FILTER (WHERE ca.action = 'suspend') > 0
  ORDER BY cuts DESC, last_cut_at DESC LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION public.cutoff_daily_series(p_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date, p_to date DEFAULT CURRENT_DATE)
RETURNS TABLE(day date, cuts integer, reactivations integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT d::date,
    COALESCE((SELECT COUNT(*)::integer FROM public.client_actions WHERE action = 'suspend' AND created_at::date = d::date), 0),
    COALESCE((SELECT COUNT(*)::integer FROM public.client_actions WHERE action = 'reactivate' AND created_at::date = d::date), 0)
  FROM generate_series(p_from, p_to, INTERVAL '1 day') AS d ORDER BY d;
$$;

CREATE OR REPLACE FUNCTION public.cutoff_recovery_stats(p_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date, p_to date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH pairs AS (
    SELECT s.client_id, s.created_at AS suspended_at,
      (SELECT MIN(r.created_at) FROM public.client_actions r
        WHERE r.client_id = s.client_id AND r.action = 'reactivate' AND r.created_at > s.created_at) AS reactivated_at
    FROM public.client_actions s
    WHERE s.action = 'suspend' AND s.created_at::date BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'total_cuts', (SELECT COUNT(*) FROM pairs),
    'total_recovered', (SELECT COUNT(*) FROM pairs WHERE reactivated_at IS NOT NULL),
    'avg_recovery_hours', COALESCE((SELECT ROUND(AVG(EXTRACT(EPOCH FROM (reactivated_at - suspended_at))/3600)::numeric, 2) FROM pairs WHERE reactivated_at IS NOT NULL), 0),
    'still_cut', (SELECT COUNT(*) FROM pairs WHERE reactivated_at IS NULL),
    'recovered_amount', COALESCE((SELECT SUM(amount) FROM public.payments WHERE paid_at::date BETWEEN p_from AND p_to), 0),
    'pending_debt', COALESCE((SELECT SUM(amount) FROM public.invoices WHERE status IN ('pending','overdue')), 0)
  );
$$;

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text, action text NOT NULL,
  entity text, entity_id text, detail jsonb, ip text, user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "audit_self_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.operator_2fa (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret text NOT NULL, enabled boolean NOT NULL DEFAULT false,
  recovery_codes text[] DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operator_2fa TO authenticated;
GRANT ALL ON public.operator_2fa TO service_role;
ALTER TABLE public.operator_2fa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "op2fa_self_all" ON public.operator_2fa FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_op2fa_updated BEFORE UPDATE ON public.operator_2fa
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_method ON public.payments(method);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON public.payments(created_by);

CREATE OR REPLACE FUNCTION public.link_payment_to_cash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_register uuid; v_actor uuid;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_register FROM public.cash_registers
    WHERE opened_by = v_actor AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
  IF v_register IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.cash_movements (register_id, kind, category, amount, method, description, reference_id, payment_id, created_by)
    VALUES (v_register, 'income', 'pago_cliente', NEW.amount, NEW.method,
      'Pago cliente ' || COALESCE(NEW.reference, ''), NEW.invoice_id, NEW.id, v_actor);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_link_payment_cash AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.link_payment_to_cash();

CREATE OR REPLACE FUNCTION public.set_payment_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF; RETURN NEW; END; $$;
CREATE TRIGGER trg_set_payment_actor BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_payment_actor();

CREATE OR REPLACE FUNCTION public.finance_kpis(p_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date, p_to date DEFAULT CURRENT_DATE, p_operator uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH filtered AS (SELECT amount, method, paid_at, client_id, created_by FROM public.payments
     WHERE paid_at::date BETWEEN p_from AND p_to AND (p_operator IS NULL OR created_by = p_operator)),
  today_pays AS (SELECT amount, method FROM filtered WHERE paid_at::date = CURRENT_DATE),
  week_pays AS (SELECT amount FROM filtered WHERE paid_at >= date_trunc('week', now())),
  month_pays AS (SELECT amount, method FROM filtered WHERE paid_at >= date_trunc('month', now())),
  prev_month AS (SELECT amount FROM public.payments WHERE paid_at >= date_trunc('month', now() - INTERVAL '1 month')
    AND paid_at < date_trunc('month', now()) AND (p_operator IS NULL OR created_by = p_operator)),
  range_expenses AS (SELECT COALESCE(SUM(m.amount),0) AS total FROM public.cash_movements m
    WHERE m.kind = 'expense' AND m.created_at::date BETWEEN p_from AND p_to
      AND (p_operator IS NULL OR m.created_by = p_operator))
  SELECT jsonb_build_object(
    'range_total', COALESCE((SELECT SUM(amount) FROM filtered), 0),
    'range_count', (SELECT COUNT(*) FROM filtered),
    'range_by_method', COALESCE((SELECT jsonb_object_agg(method, s) FROM (SELECT method, SUM(amount) AS s FROM filtered GROUP BY method) t), '{}'::jsonb),
    'today_total', COALESCE((SELECT SUM(amount) FROM today_pays), 0),
    'today_count', (SELECT COUNT(*) FROM today_pays),
    'week_total', COALESCE((SELECT SUM(amount) FROM week_pays), 0),
    'month_total', COALESCE((SELECT SUM(amount) FROM month_pays), 0),
    'month_count', (SELECT COUNT(*) FROM month_pays),
    'month_by_method', COALESCE((SELECT jsonb_object_agg(method, s) FROM (SELECT method, SUM(amount) AS s FROM month_pays GROUP BY method) t), '{}'::jsonb),
    'prev_month_total', COALESCE((SELECT SUM(amount) FROM prev_month), 0),
    'range_expenses', (SELECT total FROM range_expenses),
    'range_net', COALESCE((SELECT SUM(amount) FROM filtered),0) - (SELECT total FROM range_expenses),
    'pending_debt', COALESCE((SELECT SUM(amount) FROM public.invoices WHERE status IN ('pending','overdue')), 0),
    'overdue_debt', COALESCE((SELECT SUM(amount) FROM public.invoices WHERE status = 'overdue'), 0),
    'invoices_paid_month', (SELECT COUNT(*) FROM public.invoices WHERE status='paid' AND paid_at >= date_trunc('month', now())));
$$;

CREATE OR REPLACE FUNCTION public.finance_daily_series(p_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date, p_to date DEFAULT CURRENT_DATE, p_operator uuid DEFAULT NULL)
RETURNS TABLE(day date, income numeric, expense numeric, tx_count integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT d::date,
    COALESCE((SELECT SUM(amount) FROM public.payments WHERE paid_at::date = d::date AND (p_operator IS NULL OR created_by = p_operator)), 0),
    COALESCE((SELECT SUM(m.amount) FROM public.cash_movements m WHERE m.kind='expense' AND m.created_at::date = d::date AND (p_operator IS NULL OR m.created_by = p_operator)), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.payments WHERE paid_at::date = d::date AND (p_operator IS NULL OR created_by = p_operator)), 0)
  FROM generate_series(p_from, p_to, INTERVAL '1 day') AS d ORDER BY d;
$$;

CREATE OR REPLACE FUNCTION public.finance_top_clients(p_limit int DEFAULT 10, p_from date DEFAULT date_trunc('month', now())::date, p_to date DEFAULT CURRENT_DATE, p_operator uuid DEFAULT NULL)
RETURNS TABLE(client_id uuid, full_name text, total numeric, payments integer, last_paid timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.id, c.full_name, SUM(p.amount), COUNT(p.id)::int, MAX(p.paid_at)
    FROM public.payments p JOIN public.clients c ON c.id = p.client_id
   WHERE p.paid_at::date BETWEEN p_from AND p_to AND (p_operator IS NULL OR p.created_by = p_operator)
   GROUP BY c.id, c.full_name ORDER BY SUM(p.amount) DESC LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.finance_operators()
RETURNS TABLE(user_id uuid, full_name text, email text, total_payments integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.created_by, COALESCE(pr.full_name, pr.email, 'Operador'), pr.email, COUNT(*)::int
    FROM public.payments p LEFT JOIN public.profiles pr ON pr.id = p.created_by
   WHERE p.created_by IS NOT NULL GROUP BY p.created_by, pr.full_name, pr.email
   ORDER BY COUNT(*) DESC;
$$;

CREATE TABLE public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE, customer_name text, customer_email text,
  plan text NOT NULL DEFAULT 'basic',
  max_clients integer NOT NULL DEFAULT 500,
  max_routers integer NOT NULL DEFAULT 3,
  price_paid numeric(12,2),
  expires_at date, bound_ip text, bound_hostname text,
  status text NOT NULL DEFAULT 'active',
  activated_at timestamptz, last_heartbeat_at timestamptz, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_licenses_key ON public.licenses(key);
CREATE INDEX idx_licenses_status ON public.licenses(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses TO authenticated;
GRANT ALL ON public.licenses TO service_role;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins manage licenses" ON public.licenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_licenses_updated_at BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.license_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid REFERENCES public.licenses(id) ON DELETE CASCADE,
  license_key text NOT NULL, event text NOT NULL,
  ip text, hostname text, result text NOT NULL, message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activations_license ON public.license_activations(license_id, created_at DESC);
GRANT SELECT, INSERT ON public.license_activations TO authenticated;
GRANT ALL ON public.license_activations TO service_role;
ALTER TABLE public.license_activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read activations" ON public.license_activations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.license_state (
  id integer PRIMARY KEY DEFAULT 1,
  license_key text, plan text, max_clients integer, max_routers integer,
  expires_at date, last_verified_at timestamptz, last_token text,
  status text DEFAULT 'unlicensed',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.license_state (id, status) VALUES (1, 'unlicensed');
GRANT SELECT ON public.license_state TO authenticated;
GRANT ALL ON public.license_state TO service_role;
ALTER TABLE public.license_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read license state" ON public.license_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.generate_license_key()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; seg text; result text := 'MKS'; i int; j int;
BEGIN
  FOR i IN 1..3 LOOP seg := '';
    FOR j IN 1..4 LOOP seg := seg || substr(chars, 1 + floor(random() * length(chars))::int, 1); END LOOP;
    result := result || '-' || seg;
  END LOOP;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.link_payment_to_cash() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_payment_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_ticket_on_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_service_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.generate_monthly_invoices(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_operators() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_operators() TO authenticated;
