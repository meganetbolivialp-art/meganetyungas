
-- Read functions run as invoker so admin RLS applies
ALTER FUNCTION public.cutoff_dashboard() SECURITY INVOKER;
ALTER FUNCTION public.cutoff_kpis() SECURITY INVOKER;

-- Restrict mark_overdue_invoices: only cron/admin server code calls it
REVOKE EXECUTE ON FUNCTION public.mark_overdue_invoices(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices(integer) TO service_role;
