DROP POLICY IF EXISTS "Authenticated can manage pending ops" ON public.mikrotik_pending_ops;
CREATE POLICY "Admins manage pending ops" ON public.mikrotik_pending_ops
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));