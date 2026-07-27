
-- Clientes: safety fields
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS dont_cut boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grace_days_override integer,
  ADD COLUMN IF NOT EXISTS payment_promise_until date;

-- Services: scheduled suspension + reason
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS scheduled_suspend_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspend_reason text;

-- Branches: default grace days
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS default_grace_days integer NOT NULL DEFAULT 5;

-- Rebuild mark_overdue_invoices to respect dont_cut, promise, override + per-branch grace
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices(p_grace_days integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      JOIN public.clients c ON c.id = s.client_id
      LEFT JOIN public.branches b ON b.id = c.branch_id
      JOIN public.invoices i ON i.service_id = s.id
     WHERE s.status = 'active'
       AND s.auto_suspend = true
       AND c.dont_cut = false
       AND (c.payment_promise_until IS NULL OR c.payment_promise_until < CURRENT_DATE)
       AND i.status = 'overdue'
       AND (CURRENT_DATE - i.due_date) > COALESCE(
             c.grace_days_override,
             b.default_grace_days,
             p_grace_days
           )
  )
  UPDATE public.services s
     SET status = 'suspended',
         suspended_at = now(),
         suspend_reason = COALESCE(s.suspend_reason, 'Corte automático por deuda')
    FROM to_susp WHERE s.id = to_susp.id;
  GET DIAGNOSTICS v_suspended = ROW_COUNT;

  RETURN jsonb_build_object('overdue', v_overdue, 'suspended', v_suspended);
END; $function$;

-- Cutoff dashboard: suspended clients with reason, days, debt
CREATE OR REPLACE FUNCTION public.cutoff_dashboard()
RETURNS TABLE (
  service_id uuid,
  client_id uuid,
  full_name text,
  document text,
  phone text,
  plan_name text,
  ip_address text,
  suspend_reason text,
  suspended_at timestamptz,
  days_cut integer,
  debt numeric,
  overdue_invoices integer,
  router_name text,
  dont_cut boolean,
  promise_until date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.id AS service_id,
    c.id AS client_id,
    c.full_name,
    c.document,
    c.phone,
    p.name AS plan_name,
    s.ip_address,
    s.suspend_reason,
    s.suspended_at,
    GREATEST(0, EXTRACT(DAY FROM (now() - s.suspended_at))::integer) AS days_cut,
    COALESCE((SELECT SUM(amount) FROM public.invoices i
              WHERE i.client_id = c.id AND i.status IN ('pending','overdue')), 0) AS debt,
    COALESCE((SELECT COUNT(*)::integer FROM public.invoices i
              WHERE i.client_id = c.id AND i.status = 'overdue'), 0) AS overdue_invoices,
    r.name AS router_name,
    c.dont_cut,
    c.payment_promise_until AS promise_until
  FROM public.services s
  JOIN public.clients c ON c.id = s.client_id
  JOIN public.plans p ON p.id = s.plan_id
  LEFT JOIN public.routers r ON r.id = s.router_id
  WHERE s.status = 'suspended'
  ORDER BY s.suspended_at DESC NULLS LAST;
$$;

-- Cutoff KPIs for main dashboard
CREATE OR REPLACE FUNCTION public.cutoff_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'total_cut', (SELECT COUNT(*) FROM public.services WHERE status = 'suspended'),
    'cut_today', (SELECT COUNT(*) FROM public.services
                   WHERE status = 'suspended'
                     AND suspended_at::date = CURRENT_DATE),
    'reactivated_today', (SELECT COUNT(*) FROM public.client_actions
                          WHERE action = 'reactivate'
                            AND created_at::date = CURRENT_DATE),
    'recovered_week', COALESCE((
      SELECT SUM(amount) FROM public.payments
      WHERE paid_at >= date_trunc('week', now())
        AND EXISTS (
          SELECT 1 FROM public.client_actions ca
          WHERE ca.client_id = payments.client_id
            AND ca.action = 'reactivate'
            AND ca.created_at >= date_trunc('week', now())
        )
    ), 0),
    'active_promises', (SELECT COUNT(*) FROM public.clients
                        WHERE payment_promise_until >= CURRENT_DATE),
    'vip_protected', (SELECT COUNT(*) FROM public.clients WHERE dont_cut = true)
  );
$$;

-- Expire promises that already passed (called by cron)
CREATE OR REPLACE FUNCTION public.expire_payment_promises()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE public.clients
     SET payment_promise_until = NULL
   WHERE payment_promise_until IS NOT NULL
     AND payment_promise_until < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $function$;

-- Grants
GRANT EXECUTE ON FUNCTION public.cutoff_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cutoff_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_payment_promises() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices(integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cutoff_dashboard() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cutoff_kpis() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.expire_payment_promises() FROM PUBLIC, anon, authenticated;
