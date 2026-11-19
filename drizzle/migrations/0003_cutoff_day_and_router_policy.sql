ALTER TABLE public.cutoff_policies ADD COLUMN IF NOT EXISTS cut_day integer;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS cutoff_policy_id uuid REFERENCES public.cutoff_policies(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_cutoff_policy_day()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.cut_day IS NOT NULL AND (NEW.cut_day < 1 OR NEW.cut_day > 28) THEN
    RAISE EXCEPTION 'El día de corte debe estar entre 1 y 28';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS cutoff_policies_validate_day ON public.cutoff_policies;
CREATE TRIGGER cutoff_policies_validate_day BEFORE INSERT OR UPDATE ON public.cutoff_policies
FOR EACH ROW EXECUTE FUNCTION public.validate_cutoff_policy_day();

CREATE OR REPLACE FUNCTION public.mark_overdue_invoices(p_grace_days integer DEFAULT 5)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_overdue integer;
  v_suspended integer;
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
  v_time time := (now() AT TIME ZONE 'America/La_Paz')::time;
  v_dom integer := EXTRACT(DAY FROM (now() AT TIME ZONE 'America/La_Paz'))::integer;
BEGIN
  UPDATE public.invoices
     SET status = 'overdue', days_overdue = GREATEST(0, (v_today - due_date)::integer)
   WHERE status = 'pending' AND due_date < v_today;
  GET DIAGNOSTICS v_overdue = ROW_COUNT;

  WITH to_susp AS (
    SELECT DISTINCT s.id
      FROM public.services s
      JOIN public.clients c ON c.id = s.client_id
      LEFT JOIN public.branches b ON b.id = c.branch_id
      LEFT JOIN public.routers r ON r.id = s.router_id
      LEFT JOIN LATERAL (
        SELECT dp.id FROM public.cutoff_policies dp
         WHERE dp.is_default = true AND dp.is_active = true
         ORDER BY dp.updated_at DESC LIMIT 1
      ) dflt ON true
      LEFT JOIN public.cutoff_policies cp ON cp.id = COALESCE(c.cutoff_policy_id, r.cutoff_policy_id, dflt.id)
      JOIN public.invoices i ON i.service_id = s.id
     WHERE s.status = 'active'
       AND s.auto_suspend = true
       AND c.dont_cut = false
       AND COALESCE(cp.is_active, true)
       AND COALESCE(cp.auto_suspend, true)
       AND v_time >= make_time(COALESCE(cp.cut_hour, 0), 0, 0)
       AND (c.payment_promise_until IS NULL OR c.payment_promise_until < v_today)
       AND i.status = 'overdue'
       AND (
         (cp.cut_day IS NOT NULL AND v_dom >= cp.cut_day)
         OR (cp.cut_day IS NULL AND (v_today - i.due_date) > COALESCE(
               c.grace_days_override, cp.grace_days, b.default_grace_days, p_grace_days))
       )
  ), suspended AS (
    UPDATE public.services s
       SET status = 'suspended', suspended_at = now(),
           suspend_reason = COALESCE(s.suspend_reason, 'Corte automático por deuda')
      FROM to_susp WHERE s.id = to_susp.id
    RETURNING s.id, s.client_id
  ), updated_clients AS (
    UPDATE public.clients c SET status = 'suspended'
     WHERE c.id IN (SELECT client_id FROM suspended) AND c.status <> 'suspended'
    RETURNING c.id
  )
  SELECT count(*) INTO v_suspended FROM suspended;

  RETURN jsonb_build_object('overdue', v_overdue, 'suspended', v_suspended);
END;
$function$;

DROP FUNCTION IF EXISTS public.generate_monthly_invoices(integer, integer);
CREATE OR REPLACE FUNCTION public.generate_monthly_invoices(p_month integer DEFAULT NULL::integer, p_year integer DEFAULT NULL::integer, p_router_id uuid DEFAULT NULL::uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_month integer := COALESCE(p_month, EXTRACT(MONTH FROM now())::integer);
  v_year  integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);
  v_tag   text := v_year || '-' || lpad(v_month::text, 2, '0');
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT s.id AS service_id, s.client_id, COALESCE(s.monthly_price, p.price) AS price, c.billing_day
      FROM public.services s
      JOIN public.clients c ON c.id = s.client_id
      JOIN public.plans p ON p.id = s.plan_id
     WHERE s.status = 'active'
       AND (p_router_id IS NULL OR s.router_id = p_router_id)
       AND (s.last_billed_month IS DISTINCT FROM v_tag)
  LOOP
    INSERT INTO public.invoices (client_id, service_id, amount, due_date, status, concept, period_month, period_year)
    VALUES (r.client_id, r.service_id, r.price,
            make_date(v_year, v_month, LEAST(GREATEST(r.billing_day,1),28)),
            'pending', 'Servicio de internet ' || v_tag, v_month, v_year);
    UPDATE public.services SET last_billed_month = v_tag WHERE id = r.service_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $function$;
GRANT EXECUTE ON FUNCTION public.generate_monthly_invoices(integer, integer, uuid) TO authenticated, service_role;