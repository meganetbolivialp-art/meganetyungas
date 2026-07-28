
CREATE TABLE IF NOT EXISTS public.app_license (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_license TO authenticated;
GRANT ALL ON public.app_license TO service_role;

ALTER TABLE public.app_license ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage license" ON public.app_license;
CREATE POLICY "admins manage license" ON public.app_license
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.check_app_license()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'valid', (active = true AND expires_at > now()),
       'expires_at', expires_at,
       'active', active,
       'days_left', GREATEST(0, EXTRACT(DAY FROM (expires_at - now()))::int)
     )
     FROM public.app_license
     ORDER BY created_at DESC LIMIT 1),
    jsonb_build_object('valid', false, 'expires_at', null, 'active', false, 'days_left', 0)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.check_app_license() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_app_license() TO authenticated;

INSERT INTO public.app_license (expires_at, active, note)
SELECT now() + interval '30 days', true, 'Licencia inicial (30 días)'
WHERE NOT EXISTS (SELECT 1 FROM public.app_license);
