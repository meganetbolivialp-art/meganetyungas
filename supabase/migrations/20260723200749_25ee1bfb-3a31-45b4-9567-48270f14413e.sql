
-- Tighten RLS on financial / operational tables to admin only
DROP POLICY IF EXISTS "auth manage cash mov" ON public.cash_movements;
CREATE POLICY "admin manage cash mov" ON public.cash_movements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "auth manage cash" ON public.cash_registers;
CREATE POLICY "admin manage cash" ON public.cash_registers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "auth manage vouchers" ON public.hotspot_vouchers;
CREATE POLICY "admin manage vouchers" ON public.hotspot_vouchers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "auth manage serials" ON public.inventory_serials;
CREATE POLICY "admin manage serials" ON public.inventory_serials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "auth manage leads" ON public.leads;
CREATE POLICY "admin manage leads" ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "auth read intents" ON public.payment_intents;
DROP POLICY IF EXISTS "auth write intents" ON public.payment_intents;
CREATE POLICY "admin manage intents" ON public.payment_intents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "auth manage wo" ON public.work_orders;
CREATE POLICY "admin manage wo" ON public.work_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- payment_gateways: keep admin-manage, restrict read to admins (config contains provider secrets/keys)
DROP POLICY IF EXISTS "auth read gateways" ON public.payment_gateways;

-- portal_settings: restrict read to admins; public suspended page will fetch via a server function
DROP POLICY IF EXISTS "portal_settings readable by all" ON public.portal_settings;
CREATE POLICY "portal_settings admin read" ON public.portal_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Revoke direct EXECUTE on SECURITY DEFINER functions from anon/authenticated/public.
-- They are still callable from RLS policies, triggers, and trusted server (service_role) code.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_default_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_service_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_monthly_invoices(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_overdue_invoices(integer) FROM PUBLIC, anon, authenticated;
