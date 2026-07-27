CREATE POLICY "operators can read clients by permission and router"
ON public.clients
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND e.status = 'active'
      AND (e.permissions -> 'clientes') ? 'view'
      AND (
        COALESCE(array_length(e.router_ids, 1), 0) = 0
        OR EXISTS (
          SELECT 1
          FROM public.services s
          WHERE s.client_id = clients.id
            AND s.router_id = ANY(e.router_ids)
        )
      )
  )
);

CREATE POLICY "operators can read services by permission and router"
ON public.services
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND e.status = 'active'
      AND (
        (e.permissions -> 'clientes') ? 'view'
        OR (e.permissions -> 'servicios') ? 'view'
      )
      AND (
        COALESCE(array_length(e.router_ids, 1), 0) = 0
        OR services.router_id = ANY(e.router_ids)
      )
  )
);

CREATE POLICY "operators can read plans for client screens"
ON public.plans
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND e.status = 'active'
      AND (
        (e.permissions -> 'clientes') ? 'view'
        OR (e.permissions -> 'servicios') ? 'view'
      )
  )
);

CREATE POLICY "operators can read assigned routers"
ON public.routers
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND e.status = 'active'
      AND (
        (e.permissions -> 'clientes') ? 'view'
        OR (e.permissions -> 'servicios') ? 'view'
        OR (e.permissions -> 'red') ? 'view'
      )
      AND (
        COALESCE(array_length(e.router_ids, 1), 0) = 0
        OR routers.id = ANY(e.router_ids)
      )
  )
);