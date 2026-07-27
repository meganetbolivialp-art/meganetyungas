
DROP POLICY IF EXISTS "auth read gateways" ON public.payment_gateways;
CREATE POLICY "admins read gateways" ON public.payment_gateways FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "auth read branches" ON public.branches;
CREATE POLICY "admins read branches" ON public.branches FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "auth read templates" ON public.message_templates;
CREATE POLICY "admins read templates" ON public.message_templates FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
