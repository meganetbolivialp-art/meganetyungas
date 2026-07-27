
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON public.payments(created_by);

-- Backfill created_by desde cash_movements ya vinculados
UPDATE public.payments p
   SET created_by = m.created_by
  FROM public.cash_movements m
 WHERE m.payment_id = p.id AND p.created_by IS NULL AND m.created_by IS NOT NULL;

-- Default automático al insertar
CREATE OR REPLACE FUNCTION public.set_payment_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_set_payment_actor ON public.payments;
CREATE TRIGGER trg_set_payment_actor BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_payment_actor();

-- KPIs con filtros
CREATE OR REPLACE FUNCTION public.finance_kpis(
  p_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to date DEFAULT CURRENT_DATE,
  p_operator uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH filtered AS (
    SELECT amount, method, paid_at, client_id, created_by
      FROM public.payments
     WHERE paid_at::date BETWEEN p_from AND p_to
       AND (p_operator IS NULL OR created_by = p_operator)
  ),
  today_pays AS (SELECT amount, method FROM filtered WHERE paid_at::date = CURRENT_DATE),
  week_pays AS (SELECT amount FROM filtered WHERE paid_at >= date_trunc('week', now())),
  month_pays AS (SELECT amount, method FROM filtered WHERE paid_at >= date_trunc('month', now())),
  prev_month AS (
    SELECT amount FROM public.payments
     WHERE paid_at >= date_trunc('month', now() - INTERVAL '1 month')
       AND paid_at < date_trunc('month', now())
       AND (p_operator IS NULL OR created_by = p_operator)
  ),
  range_expenses AS (
    SELECT COALESCE(SUM(m.amount),0) AS total
      FROM public.cash_movements m
     WHERE m.kind = 'expense'
       AND m.created_at::date BETWEEN p_from AND p_to
       AND (p_operator IS NULL OR m.created_by = p_operator)
  )
  SELECT jsonb_build_object(
    'range_total',   COALESCE((SELECT SUM(amount) FROM filtered), 0),
    'range_count',   (SELECT COUNT(*) FROM filtered),
    'range_by_method', COALESCE((SELECT jsonb_object_agg(method, s)
                                   FROM (SELECT method, SUM(amount) AS s FROM filtered GROUP BY method) t), '{}'::jsonb),
    'today_total',   COALESCE((SELECT SUM(amount) FROM today_pays), 0),
    'today_count',   (SELECT COUNT(*) FROM today_pays),
    'week_total',    COALESCE((SELECT SUM(amount) FROM week_pays), 0),
    'month_total',   COALESCE((SELECT SUM(amount) FROM month_pays), 0),
    'month_count',   (SELECT COUNT(*) FROM month_pays),
    'month_by_method', COALESCE((SELECT jsonb_object_agg(method, s)
                                   FROM (SELECT method, SUM(amount) AS s FROM month_pays GROUP BY method) t), '{}'::jsonb),
    'prev_month_total', COALESCE((SELECT SUM(amount) FROM prev_month), 0),
    'range_expenses', (SELECT total FROM range_expenses),
    'range_net',      COALESCE((SELECT SUM(amount) FROM filtered),0) - (SELECT total FROM range_expenses),
    'pending_debt',  COALESCE((SELECT SUM(amount) FROM public.invoices WHERE status IN ('pending','overdue')), 0),
    'overdue_debt',  COALESCE((SELECT SUM(amount) FROM public.invoices WHERE status = 'overdue'), 0),
    'invoices_paid_month', (SELECT COUNT(*) FROM public.invoices WHERE status='paid' AND paid_at >= date_trunc('month', now()))
  );
$$;

CREATE OR REPLACE FUNCTION public.finance_daily_series(
  p_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to date DEFAULT CURRENT_DATE,
  p_operator uuid DEFAULT NULL
)
RETURNS TABLE(day date, income numeric, expense numeric, tx_count integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT d::date AS day,
    COALESCE((SELECT SUM(amount) FROM public.payments
                WHERE paid_at::date = d::date
                  AND (p_operator IS NULL OR created_by = p_operator)), 0) AS income,
    COALESCE((SELECT SUM(m.amount) FROM public.cash_movements m
                WHERE m.kind='expense' AND m.created_at::date = d::date
                  AND (p_operator IS NULL OR m.created_by = p_operator)), 0) AS expense,
    COALESCE((SELECT COUNT(*)::int FROM public.payments
                WHERE paid_at::date = d::date
                  AND (p_operator IS NULL OR created_by = p_operator)), 0) AS tx_count
  FROM generate_series(p_from, p_to, INTERVAL '1 day') AS d
  ORDER BY d;
$$;

CREATE OR REPLACE FUNCTION public.finance_top_clients(
  p_limit int DEFAULT 10,
  p_from date DEFAULT date_trunc('month', now())::date,
  p_to date DEFAULT CURRENT_DATE,
  p_operator uuid DEFAULT NULL
)
RETURNS TABLE(client_id uuid, full_name text, total numeric, payments integer, last_paid timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.id, c.full_name, SUM(p.amount), COUNT(p.id)::int, MAX(p.paid_at)
    FROM public.payments p JOIN public.clients c ON c.id = p.client_id
   WHERE p.paid_at::date BETWEEN p_from AND p_to
     AND (p_operator IS NULL OR p.created_by = p_operator)
   GROUP BY c.id, c.full_name
   ORDER BY SUM(p.amount) DESC LIMIT p_limit;
$$;

-- Vista de operadores que han cobrado (para el selector)
CREATE OR REPLACE FUNCTION public.finance_operators()
RETURNS TABLE(user_id uuid, full_name text, email text, total_payments integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.created_by, COALESCE(pr.full_name, pr.email, 'Operador'), pr.email, COUNT(*)::int
    FROM public.payments p
    LEFT JOIN public.profiles pr ON pr.id = p.created_by
   WHERE p.created_by IS NOT NULL
   GROUP BY p.created_by, pr.full_name, pr.email
   ORDER BY COUNT(*) DESC;
$$;
