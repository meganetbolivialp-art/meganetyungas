
-- Cutoff leaks table
CREATE TABLE public.cutoff_leaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  detected_at timestamptz NOT NULL DEFAULT now(),
  traffic_bytes bigint NOT NULL DEFAULT 0,
  connections integer NOT NULL DEFAULT 0,
  sample jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cutoff_leaks TO authenticated;
GRANT ALL ON public.cutoff_leaks TO service_role;

ALTER TABLE public.cutoff_leaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can view leaks" ON public.cutoff_leaks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can update leaks" ON public.cutoff_leaks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages leaks" ON public.cutoff_leaks FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_cutoff_leaks_service ON public.cutoff_leaks(service_id, detected_at DESC);
CREATE INDEX idx_cutoff_leaks_unresolved ON public.cutoff_leaks(resolved, detected_at DESC) WHERE resolved = false;

-- View: reincidence per client
CREATE OR REPLACE VIEW public.client_cutoff_history AS
SELECT
  c.id AS client_id,
  c.full_name,
  COUNT(ca.id) FILTER (WHERE ca.action = 'suspend') AS total_cuts,
  COUNT(ca.id) FILTER (WHERE ca.action = 'reactivate') AS total_reactivations,
  MAX(ca.created_at) FILTER (WHERE ca.action = 'suspend') AS last_cut_at,
  MAX(ca.created_at) FILTER (WHERE ca.action = 'reactivate') AS last_reactivation_at,
  CASE
    WHEN COUNT(ca.id) FILTER (WHERE ca.action = 'suspend') >= 6 THEN 'cronico'
    WHEN COUNT(ca.id) FILTER (WHERE ca.action = 'suspend') >= 3 THEN 'reincidente'
    WHEN COUNT(ca.id) FILTER (WHERE ca.action = 'suspend') >= 1 THEN 'ocasional'
    ELSE 'nuevo'
  END AS classification
FROM public.clients c
LEFT JOIN public.client_actions ca ON ca.client_id = c.id
GROUP BY c.id, c.full_name;

GRANT SELECT ON public.client_cutoff_history TO authenticated;
GRANT ALL ON public.client_cutoff_history TO service_role;

-- Function: reincidence report (top N reincident clients + counts)
CREATE OR REPLACE FUNCTION public.cutoff_reincidence_report(p_from date DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date, p_to date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  client_id uuid,
  full_name text,
  phone text,
  cuts integer,
  reactivations integer,
  last_cut_at timestamptz,
  classification text
)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    c.id,
    c.full_name,
    c.phone,
    COUNT(ca.id) FILTER (WHERE ca.action = 'suspend')::integer AS cuts,
    COUNT(ca.id) FILTER (WHERE ca.action = 'reactivate')::integer AS reactivations,
    MAX(ca.created_at) FILTER (WHERE ca.action = 'suspend') AS last_cut_at,
    CASE
      WHEN COUNT(ca.id) FILTER (WHERE ca.action = 'suspend') >= 6 THEN 'cronico'
      WHEN COUNT(ca.id) FILTER (WHERE ca.action = 'suspend') >= 3 THEN 'reincidente'
      WHEN COUNT(ca.id) FILTER (WHERE ca.action = 'suspend') >= 1 THEN 'ocasional'
      ELSE 'nuevo'
    END AS classification
  FROM public.clients c
  JOIN public.client_actions ca ON ca.client_id = c.id
  WHERE ca.created_at::date BETWEEN p_from AND p_to
    AND ca.action IN ('suspend','reactivate')
  GROUP BY c.id, c.full_name, c.phone
  HAVING COUNT(ca.id) FILTER (WHERE ca.action = 'suspend') > 0
  ORDER BY cuts DESC, last_cut_at DESC
  LIMIT 100;
$$;

-- Function: daily cuts series
CREATE OR REPLACE FUNCTION public.cutoff_daily_series(p_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date, p_to date DEFAULT CURRENT_DATE)
RETURNS TABLE(day date, cuts integer, reactivations integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    d::date AS day,
    COALESCE((SELECT COUNT(*)::integer FROM public.client_actions
              WHERE action = 'suspend' AND created_at::date = d::date), 0) AS cuts,
    COALESCE((SELECT COUNT(*)::integer FROM public.client_actions
              WHERE action = 'reactivate' AND created_at::date = d::date), 0) AS reactivations
  FROM generate_series(p_from, p_to, INTERVAL '1 day') AS d
  ORDER BY d;
$$;

-- Function: recovery stats (avg hours between suspend and next reactivate per client)
CREATE OR REPLACE FUNCTION public.cutoff_recovery_stats(p_from date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date, p_to date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH pairs AS (
    SELECT
      s.client_id,
      s.created_at AS suspended_at,
      (SELECT MIN(r.created_at) FROM public.client_actions r
        WHERE r.client_id = s.client_id AND r.action = 'reactivate' AND r.created_at > s.created_at) AS reactivated_at
    FROM public.client_actions s
    WHERE s.action = 'suspend' AND s.created_at::date BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'total_cuts', (SELECT COUNT(*) FROM pairs),
    'total_recovered', (SELECT COUNT(*) FROM pairs WHERE reactivated_at IS NOT NULL),
    'avg_recovery_hours', COALESCE((SELECT ROUND(AVG(EXTRACT(EPOCH FROM (reactivated_at - suspended_at))/3600)::numeric, 2)
                                    FROM pairs WHERE reactivated_at IS NOT NULL), 0),
    'still_cut', (SELECT COUNT(*) FROM pairs WHERE reactivated_at IS NULL),
    'recovered_amount', COALESCE((SELECT SUM(amount) FROM public.payments
                                  WHERE paid_at::date BETWEEN p_from AND p_to), 0),
    'pending_debt', COALESCE((SELECT SUM(amount) FROM public.invoices
                              WHERE status IN ('pending','overdue')), 0)
  );
$$;

-- Enable realtime on services (safe if already published)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.services;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
