REVOKE ALL ON FUNCTION public.check_app_license() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_app_license() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finance_operators()
RETURNS TABLE(user_id uuid, full_name text, email text, total_payments integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.created_by,
         COALESCE(pr.full_name, pr.email, 'Operador'),
         pr.email,
         COUNT(*)::integer
    FROM public.payments p
    LEFT JOIN public.profiles pr ON pr.id = p.created_by
   WHERE p.created_by IS NOT NULL
   GROUP BY p.created_by, pr.full_name, pr.email
   ORDER BY COUNT(*) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_operators() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_operators() TO authenticated, service_role;