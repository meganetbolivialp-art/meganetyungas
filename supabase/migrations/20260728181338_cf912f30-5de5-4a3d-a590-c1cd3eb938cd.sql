
-- Revoke public execute on all SECURITY DEFINER functions, then grant narrowly.

-- Trigger functions: no direct callers needed
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_default_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_service_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_ticket_on_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_payment_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_payment_to_cash() FROM PUBLIC, anon, authenticated;

-- Admin/backend-only business functions
REVOKE ALL ON FUNCTION public.mark_overdue_invoices(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_payment_promises() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_monthly_invoices(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_operators() FROM PUBLIC, anon, authenticated;

-- Role-check helpers used by RLS policies: authenticated needs EXECUTE for policy evaluation
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated;
