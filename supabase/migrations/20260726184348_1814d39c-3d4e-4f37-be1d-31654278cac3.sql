
ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL;
ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS method text;
CREATE INDEX IF NOT EXISTS idx_cash_mov_reg ON public.cash_movements(register_id);
CREATE INDEX IF NOT EXISTS idx_cash_mov_created ON public.cash_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_method ON public.payments(method);

CREATE OR REPLACE FUNCTION public.link_payment_to_cash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_register uuid; v_actor uuid;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_register FROM public.cash_registers
    WHERE opened_by = v_actor AND status = 'open'
    ORDER BY opened_at DESC LIMIT 1;
  IF v_register IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.cash_movements (register_id, kind, category, amount, method, description, reference_id, payment_id, created_by)
    VALUES (v_register, 'income', 'pago_cliente', NEW.amount, NEW.method,
            'Pago cliente ' || COALESCE(NEW.reference, ''),
            NEW.invoice_id, NEW.id, v_actor);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_link_payment_cash ON public.payments;
CREATE TRIGGER trg_link_payment_cash AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.link_payment_to_cash();

-- KPIs financieros
CREATE OR REPLACE FUNCTION public.finance_kpis(p_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
                                                p_to date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  WITH pays AS (
    SELECT amount, method, paid_at::date AS d, client_id
      FROM public.payments
     WHERE paid_at::date BETWEEN p_from AND p_to
  ),
  today_pays AS (SELECT amount, method FROM public.payments WHERE paid_at::date = CURRENT_DATE),
  month_pays AS (SELECT amount, method FROM public.payments
                  WHERE paid_at >= date_trunc('month', now())),
  prev_month AS (SELECT amount FROM public.payments
                  WHERE paid_at >= date_trunc('month', now() - INTERVAL '1 month')
                    AND paid_at < date_trunc('month', now())),
  expenses AS (SELECT COALESCE(SUM(m.amount),0) AS total
                 FROM public.cash_movements m
                 JOIN public.cash_registers r ON r.id = m.register_id
                WHERE m.kind = 'expense'
                  AND m.created_at >= date_trunc('month', now()))
  SELECT jsonb_build_object(
    'today_total',   COALESCE((SELECT SUM(amount) FROM today_pays), 0),
    'today_count',   (SELECT COUNT(*) FROM today_pays),
    'today_by_method', COALESCE((SELECT jsonb_object_agg(method, s)
                                   FROM (SELECT method, SUM(amount) AS s FROM today_pays GROUP BY method) t), '{}'::jsonb),
    'week_total',    COALESCE((SELECT SUM(amount) FROM public.payments
                                WHERE paid_at >= date_trunc('week', now())), 0),
    'month_total',   COALESCE((SELECT SUM(amount) FROM month_pays), 0),
    'month_count',   (SELECT COUNT(*) FROM month_pays),
    'month_by_method', COALESCE((SELECT jsonb_object_agg(method, s)
                                   FROM (SELECT method, SUM(amount) AS s FROM month_pays GROUP BY method) t), '{}'::jsonb),
    'prev_month_total', COALESCE((SELECT SUM(amount) FROM prev_month), 0),
    'month_expenses',  (SELECT total FROM expenses),
    'month_net',       COALESCE((SELECT SUM(amount) FROM month_pays),0) - (SELECT total FROM expenses),
    'pending_debt',  COALESCE((SELECT SUM(amount) FROM public.invoices WHERE status IN ('pending','overdue')), 0),
    'overdue_debt',  COALESCE((SELECT SUM(amount) FROM public.invoices WHERE status = 'overdue'), 0),
    'invoices_paid_month', (SELECT COUNT(*) FROM public.invoices WHERE status='paid' AND paid_at >= date_trunc('month', now()))
  );
$$;

CREATE OR REPLACE FUNCTION public.finance_daily_series(p_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
                                                       p_to date DEFAULT CURRENT_DATE)
RETURNS TABLE(day date, income numeric, expense numeric, tx_count integer) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT d::date AS day,
    COALESCE((SELECT SUM(amount) FROM public.payments WHERE paid_at::date = d::date), 0) AS income,
    COALESCE((SELECT SUM(m.amount) FROM public.cash_movements m
                WHERE m.kind='expense' AND m.created_at::date = d::date), 0) AS expense,
    COALESCE((SELECT COUNT(*)::int FROM public.payments WHERE paid_at::date = d::date), 0) AS tx_count
  FROM generate_series(p_from, p_to, INTERVAL '1 day') AS d
  ORDER BY d;
$$;

CREATE OR REPLACE FUNCTION public.finance_top_clients(p_limit int DEFAULT 10)
RETURNS TABLE(client_id uuid, full_name text, total numeric, payments integer, last_paid timestamptz)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.id, c.full_name, SUM(p.amount), COUNT(p.id)::int, MAX(p.paid_at)
    FROM public.payments p JOIN public.clients c ON c.id = p.client_id
   WHERE p.paid_at >= date_trunc('month', now())
   GROUP BY c.id, c.full_name
   ORDER BY SUM(p.amount) DESC LIMIT p_limit;
$$;
