
CREATE TABLE public.cutoff_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
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

CREATE POLICY "admins manage cutoff_policies" ON public.cutoff_policies
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "authenticated read cutoff_policies" ON public.cutoff_policies
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER cutoff_policies_updated_at BEFORE UPDATE ON public.cutoff_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cutoff_policy_id uuid REFERENCES public.cutoff_policies(id) ON DELETE SET NULL;

INSERT INTO public.cutoff_policies (name, description, grace_days, cut_hour, cut_mode, prior_notice_hours, is_default)
VALUES
  ('Estándar', 'Política estándar: 5 días de gracia, corte por IP a las 9:00', 5, 9, 'ip', 24, true),
  ('Estricta', 'Sin gracia, corte inmediato al vencer', 0, 8, 'ip', 12, false),
  ('Flexible VIP', '10 días de gracia, aviso previo 48h', 10, 10, 'ip', 48, false);
