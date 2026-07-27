
DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
DROP FUNCTION IF EXISTS public.assign_default_admin();

-- Corregir: quitar rol admin de quienes NO son operator_type='admin'
DELETE FROM public.user_roles ur
 WHERE ur.role = 'admin'
   AND EXISTS (
     SELECT 1 FROM public.employees e
      WHERE e.user_id = ur.user_id
        AND e.operator_type <> 'admin'
   );

-- Asegurar rol correcto para empleados no-admin
INSERT INTO public.user_roles (user_id, role)
SELECT e.user_id,
  CASE e.operator_type
    WHEN 'technician' THEN 'tecnico'::app_role
    WHEN 'cashier'    THEN 'cajero'::app_role
    WHEN 'seller'     THEN 'vendedor'::app_role
    ELSE 'user'::app_role
  END
FROM public.employees e
WHERE e.user_id IS NOT NULL AND e.operator_type <> 'admin'
ON CONFLICT (user_id, role) DO NOTHING;
