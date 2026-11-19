CREATE TABLE public.billing_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  auto_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  generate_day INTEGER NOT NULL DEFAULT 1 CHECK (generate_day BETWEEN 1 AND 28),
  last_auto_run_month TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT SELECT, UPDATE ON public.billing_settings TO authenticated;
GRANT ALL ON public.billing_settings TO service_role;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read billing settings" ON public.billing_settings FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Admins can update billing settings" ON public.billing_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.billing_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;