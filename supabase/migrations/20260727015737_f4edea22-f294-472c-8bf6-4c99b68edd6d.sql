
CREATE OR REPLACE VIEW public.client_cutoff_history WITH (security_invoker = true) AS
SELECT c.id AS client_id, c.full_name,
  count(ca.id) FILTER (WHERE ca.action = 'suspend') AS total_cuts,
  count(ca.id) FILTER (WHERE ca.action = 'reactivate') AS total_reactivations,
  max(ca.created_at) FILTER (WHERE ca.action = 'suspend') AS last_cut_at,
  max(ca.created_at) FILTER (WHERE ca.action = 'reactivate') AS last_reactivation_at,
  CASE WHEN count(ca.id) FILTER (WHERE ca.action = 'suspend') >= 6 THEN 'cronico'
       WHEN count(ca.id) FILTER (WHERE ca.action = 'suspend') >= 3 THEN 'reincidente'
       WHEN count(ca.id) FILTER (WHERE ca.action = 'suspend') >= 1 THEN 'ocasional'
       ELSE 'nuevo' END AS classification
FROM public.clients c
LEFT JOIN public.client_actions ca ON ca.client_id = c.id
GROUP BY c.id, c.full_name;
GRANT SELECT ON public.client_cutoff_history TO authenticated;
