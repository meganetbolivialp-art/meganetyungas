ALTER TABLE public.cutoff_policies ADD COLUMN IF NOT EXISTS invoice_day integer;
ALTER TABLE public.cutoff_policies ADD COLUMN IF NOT EXISTS due_day integer;

CREATE OR REPLACE FUNCTION public.validate_cutoff_policy_day()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.cut_day IS NOT NULL AND (NEW.cut_day < 1 OR NEW.cut_day > 28) THEN RAISE EXCEPTION 'El día de corte debe estar entre 1 y 28'; END IF;
  IF NEW.invoice_day IS NOT NULL AND (NEW.invoice_day < 1 OR NEW.invoice_day > 28) THEN RAISE EXCEPTION 'El día de factura debe estar entre 1 y 28'; END IF;
  IF NEW.due_day IS NOT NULL AND (NEW.due_day < 1 OR NEW.due_day > 28) THEN RAISE EXCEPTION 'El día de pago debe estar entre 1 y 28'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_policy_invoices(p_today date DEFAULT ((now() AT TIME ZONE 'America/La_Paz')::date))
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_month integer := EXTRACT(MONTH FROM p_today)::integer;
  v_year integer := EXTRACT(YEAR FROM p_today)::integer;
  v_dom integer := EXTRACT(DAY FROM p_today)::integer;
  v_tag text := v_year || '-' || lpad(v_month::text, 2, '0');
  v_count integer := 0; v_due date; v_dd integer; r record;
BEGIN
  FOR r IN
    SELECT s.id AS service_id, s.client_id, COALESCE(s.monthly_price, p.price) AS price,
           c.billing_day, cp.invoice_day, cp.due_day
      FROM public.services s
      JOIN public.clients c ON c.id = s.client_id
      JOIN public.plans p ON p.id = s.plan_id
      LEFT JOIN public.routers rt ON rt.id = s.router_id
      LEFT JOIN LATERAL (SELECT dp.id FROM public.cutoff_policies dp WHERE dp.is_default AND dp.is_active ORDER BY dp.updated_at DESC LIMIT 1) dflt ON true
      JOIN public.cutoff_policies cp ON cp.id = COALESCE(c.cutoff_policy_id, rt.cutoff_policy_id, dflt.id)
     WHERE s.status = 'active' AND cp.is_active AND cp.invoice_day IS NOT NULL
       AND v_dom >= cp.invoice_day
       AND s.last_billed_month IS DISTINCT FROM v_tag
  LOOP
    v_dd := LEAST(GREATEST(COALESCE(r.due_day, r.billing_day, r.invoice_day), 1), 28);
    v_due := make_date(v_year, v_month, v_dd);
    IF v_dd < r.invoice_day THEN v_due := (v_due + INTERVAL '1 month')::date; END IF;
    INSERT INTO public.invoices (client_id, service_id, amount, due_date, status, concept, period_month, period_year)
    VALUES (r.client_id, r.service_id, r.price, v_due, 'pending', 'Servicio de internet ' || v_tag, v_month, v_year);
    UPDATE public.services SET last_billed_month = v_tag WHERE id = r.service_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.generate_policy_invoices(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_policy_invoices(date) TO service_role;