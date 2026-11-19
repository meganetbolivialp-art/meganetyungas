CREATE OR REPLACE FUNCTION public.mark_overdue_invoices(p_grace_days integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_overdue integer;
  v_suspended integer;
  v_today date := (now() AT TIME ZONE 'America/La_Paz')::date;
  v_time time := (now() AT TIME ZONE 'America/La_Paz')::time;
BEGIN
  UPDATE public.invoices
     SET status = 'overdue',
         days_overdue = GREATEST(0, (v_today - due_date)::integer)
   WHERE status = 'pending' AND due_date < v_today;
  GET DIAGNOSTICS v_overdue = ROW_COUNT;

  WITH to_susp AS (
    SELECT DISTINCT s.id
      FROM public.services s
      JOIN public.clients c ON c.id = s.client_id
      LEFT JOIN public.branches b ON b.id = c.branch_id
      LEFT JOIN public.cutoff_policies cp ON cp.id = c.cutoff_policy_id
      LEFT JOIN LATERAL (
        SELECT dp.grace_days, dp.cut_hour, dp.auto_suspend, dp.is_active
          FROM public.cutoff_policies dp
         WHERE dp.is_default = true AND dp.is_active = true
         ORDER BY dp.updated_at DESC
         LIMIT 1
      ) dp ON true
      JOIN public.invoices i ON i.service_id = s.id
     WHERE s.status = 'active'
       AND s.auto_suspend = true
       AND c.dont_cut = false
       AND COALESCE(cp.is_active, dp.is_active, true)
       AND COALESCE(cp.auto_suspend, dp.auto_suspend, true)
       AND v_time >= make_time(COALESCE(cp.cut_hour, dp.cut_hour, 0), 0, 0)
       AND (c.payment_promise_until IS NULL OR c.payment_promise_until < v_today)
       AND i.status = 'overdue'
       AND (v_today - i.due_date) > COALESCE(
         c.grace_days_override,
         cp.grace_days,
         b.default_grace_days,
         dp.grace_days,
         p_grace_days
       )
  ), suspended AS (
    UPDATE public.services s
       SET status = 'suspended',
           suspended_at = now(),
           suspend_reason = COALESCE(s.suspend_reason, 'Corte automático por deuda')
      FROM to_susp
     WHERE s.id = to_susp.id
    RETURNING s.id, s.client_id
  ), updated_clients AS (
    UPDATE public.clients c
       SET status = 'suspended'
     WHERE c.id IN (SELECT client_id FROM suspended)
       AND c.status <> 'suspended'
    RETURNING c.id
  )
  SELECT count(*) INTO v_suspended FROM suspended;

  RETURN jsonb_build_object('overdue', v_overdue, 'suspended', v_suspended);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_overdue_invoices(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices(integer) TO service_role;