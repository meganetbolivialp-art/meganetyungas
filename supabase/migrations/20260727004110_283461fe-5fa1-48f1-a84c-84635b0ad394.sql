
-- 1) bulk_change_templates: only admin/supervisor
DROP POLICY IF EXISTS "auth manage bulk templates" ON public.bulk_change_templates;
CREATE POLICY "admin manage bulk templates"
  ON public.bulk_change_templates
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

-- 2) cutoff_leaks: only admin/supervisor/soporte can view; only admin/supervisor can update
DROP POLICY IF EXISTS "Auth can view leaks" ON public.cutoff_leaks;
DROP POLICY IF EXISTS "Auth can update leaks" ON public.cutoff_leaks;
CREATE POLICY "Staff can view leaks"
  ON public.cutoff_leaks
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'soporte'));
CREATE POLICY "Admins can update leaks"
  ON public.cutoff_leaks
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

-- 3) router_ip_pools: restrict SELECT to admin/tecnico/supervisor
DROP POLICY IF EXISTS "auth read pools" ON public.router_ip_pools;
CREATE POLICY "staff read pools"
  ON public.router_ip_pools
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'tecnico'));

-- 4) ticket_messages: only admin/supervisor/soporte
DROP POLICY IF EXISTS "ticket_messages_all_auth" ON public.ticket_messages;
CREATE POLICY "staff read ticket messages"
  ON public.ticket_messages
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'soporte'));
CREATE POLICY "staff write ticket messages"
  ON public.ticket_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'soporte'));
CREATE POLICY "admin update ticket messages"
  ON public.ticket_messages
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "admin delete ticket messages"
  ON public.ticket_messages
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

-- 5) Recreate view with security_invoker so it uses the querying user's RLS
DROP VIEW IF EXISTS public.client_cutoff_history;
CREATE VIEW public.client_cutoff_history
  WITH (security_invoker = true) AS
SELECT c.id AS client_id,
       c.full_name,
       count(ca.id) FILTER (WHERE ca.action = 'suspend') AS total_cuts,
       count(ca.id) FILTER (WHERE ca.action = 'reactivate') AS total_reactivations,
       max(ca.created_at) FILTER (WHERE ca.action = 'suspend') AS last_cut_at,
       max(ca.created_at) FILTER (WHERE ca.action = 'reactivate') AS last_reactivation_at,
       CASE
         WHEN count(ca.id) FILTER (WHERE ca.action = 'suspend') >= 6 THEN 'cronico'
         WHEN count(ca.id) FILTER (WHERE ca.action = 'suspend') >= 3 THEN 'reincidente'
         WHEN count(ca.id) FILTER (WHERE ca.action = 'suspend') >= 1 THEN 'ocasional'
         ELSE 'nuevo'
       END AS classification
FROM public.clients c
LEFT JOIN public.client_actions ca ON ca.client_id = c.id
GROUP BY c.id, c.full_name;
GRANT SELECT ON public.client_cutoff_history TO authenticated;

-- 6) Revoke EXECUTE on trigger-only SECURITY DEFINER functions from PUBLIC/anon/authenticated
REVOKE ALL ON FUNCTION public.link_payment_to_cash() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_payment_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_ticket_on_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_service_change() FROM PUBLIC, anon, authenticated;

-- has_permission: keep for authenticated (used inside server fns) but revoke from anon/PUBLIC
REVOKE ALL ON FUNCTION public.has_permission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated;

-- has_role already restricted to authenticated/service_role — reaffirm no anon
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Business RPCs invoked from server fns: keep out of anon
REVOKE ALL ON FUNCTION public.generate_monthly_invoices(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_payment_promises() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_overdue_invoices(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_operators() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_operators() TO authenticated;
