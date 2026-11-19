DROP POLICY IF EXISTS "Authenticated staff can read receipt settings" ON public.receipt_settings;
CREATE POLICY "Staff can read receipt settings" ON public.receipt_settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
DROP POLICY IF EXISTS "Staff can read billing settings" ON public.billing_settings;
CREATE POLICY "Staff can read billing settings" ON public.billing_settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));