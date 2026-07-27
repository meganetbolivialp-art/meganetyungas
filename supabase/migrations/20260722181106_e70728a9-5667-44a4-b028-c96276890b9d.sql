
-- Extend routers
ALTER TABLE public.routers
  ADD COLUMN IF NOT EXISTS api_user text DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS api_password text,
  ADD COLUMN IF NOT EXISTS simulated boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;

-- Extend clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_day integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS balance numeric(10,2) NOT NULL DEFAULT 0;

-- Extend services
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS monthly_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS auto_suspend boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_billed_month text;

-- Extend invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_number serial,
  ADD COLUMN IF NOT EXISTS period_month integer,
  ADD COLUMN IF NOT EXISTS period_year integer,
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS days_overdue integer NOT NULL DEFAULT 0;

-- client_actions log
CREATE TABLE IF NOT EXISTS public.client_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_actions TO authenticated;
GRANT ALL ON public.client_actions TO service_role;
ALTER TABLE public.client_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all client_actions" ON public.client_actions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger: log service status changes
CREATE OR REPLACE FUNCTION public.log_service_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.client_actions (client_id, service_id, action, detail)
    VALUES (NEW.client_id, NEW.id,
      CASE NEW.status WHEN 'suspended' THEN 'suspend' WHEN 'active' THEN 'reactivate' ELSE 'status_change' END,
      'Servicio pasó de ' || OLD.status || ' a ' || NEW.status);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS t_services_log ON public.services;
CREATE TRIGGER t_services_log AFTER UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.log_service_change();

-- Generate monthly invoices
CREATE OR REPLACE FUNCTION public.generate_monthly_invoices(p_month integer DEFAULT NULL, p_year integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month integer := COALESCE(p_month, EXTRACT(MONTH FROM now())::integer);
  v_year  integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);
  v_tag   text := v_year || '-' || lpad(v_month::text, 2, '0');
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT s.id AS service_id, s.client_id, s.plan_id, s.monthly_price,
           COALESCE(s.monthly_price, p.price) AS price,
           c.billing_day
      FROM public.services s
      JOIN public.clients c ON c.id = s.client_id
      JOIN public.plans p ON p.id = s.plan_id
     WHERE s.status = 'active'
       AND (s.last_billed_month IS DISTINCT FROM v_tag)
  LOOP
    INSERT INTO public.invoices (client_id, service_id, amount, due_date, status, concept, period_month, period_year)
    VALUES (r.client_id, r.service_id, r.price,
            make_date(v_year, v_month, LEAST(GREATEST(r.billing_day,1),28)),
            'pending',
            'Servicio de internet ' || v_tag,
            v_month, v_year);
    UPDATE public.services SET last_billed_month = v_tag WHERE id = r.service_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

-- Mark overdue and suspend
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices(p_grace_days integer DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_overdue integer;
  v_suspended integer;
BEGIN
  UPDATE public.invoices
     SET status = 'overdue',
         days_overdue = GREATEST(0, (CURRENT_DATE - due_date)::integer)
   WHERE status = 'pending' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_overdue = ROW_COUNT;

  WITH to_susp AS (
    SELECT DISTINCT s.id
      FROM public.services s
      JOIN public.invoices i ON i.service_id = s.id
     WHERE s.status = 'active'
       AND s.auto_suspend = true
       AND i.status = 'overdue'
       AND (CURRENT_DATE - i.due_date) > p_grace_days
  )
  UPDATE public.services s
     SET status = 'suspended', suspended_at = now()
    FROM to_susp WHERE s.id = to_susp.id;
  GET DIAGNOSTICS v_suspended = ROW_COUNT;

  RETURN jsonb_build_object('overdue', v_overdue, 'suspended', v_suspended);
END; $$;

GRANT EXECUTE ON FUNCTION public.generate_monthly_invoices(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices(integer) TO authenticated;
