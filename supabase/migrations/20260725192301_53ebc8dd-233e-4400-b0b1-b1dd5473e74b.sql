
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

DROP POLICY IF EXISTS "employee reads own" ON public.employees;
CREATE POLICY "employee reads own" ON public.employees
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = _user_id
      AND e.status = 'active'
      AND (e.permissions -> _module) ? _action
  );
$$;
