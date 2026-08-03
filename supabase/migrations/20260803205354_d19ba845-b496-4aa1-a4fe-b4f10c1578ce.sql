-- 1) app_license: lectura para todo usuario autenticado del panel (fail-closed antes
-- impedía que operadores no admin verificaran la licencia). Escritura sigue admin-only.
CREATE POLICY "authenticated read license status"
  ON public.app_license FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- 2) services: cobertura explícita de roles de staff vía has_permission.
-- has_permission() ya devuelve true para admin, así que no se pierde acceso.
CREATE POLICY "staff read services"
  ON public.services FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'servicios', 'view'));

CREATE POLICY "staff create services"
  ON public.services FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'servicios', 'create'));

CREATE POLICY "staff update services"
  ON public.services FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), 'servicios', 'edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'servicios', 'edit'));

-- 3) tickets: staff con permiso de tickets, no solo admin.
CREATE POLICY "staff read tickets"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'tickets', 'view'));

CREATE POLICY "staff create tickets"
  ON public.tickets FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'tickets', 'reply'));

CREATE POLICY "staff update tickets"
  ON public.tickets FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), 'tickets', 'close'))
  WITH CHECK (public.has_permission(auth.uid(), 'tickets', 'close'));

-- 4) ticket_messages: lectura/escritura de staff autorizado. Las notas internas
-- (is_internal) siguen restringidas al rol authenticated del panel; los clientes
-- usan client_portal_* y no tienen acceso a esta tabla.
DROP POLICY IF EXISTS "staff read ticket messages" ON public.ticket_messages;
CREATE POLICY "staff read ticket messages"
  ON public.ticket_messages FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'tickets', 'view'));

DROP POLICY IF EXISTS "staff write ticket messages" ON public.ticket_messages;
CREATE POLICY "staff write ticket messages"
  ON public.ticket_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'tickets', 'reply'));

-- Grants explícitos (PostgREST no los otorga por defecto en public).
GRANT SELECT ON public.app_license TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_messages TO authenticated;
GRANT ALL ON public.app_license TO service_role;
GRANT ALL ON public.services TO service_role;
GRANT ALL ON public.tickets TO service_role;
GRANT ALL ON public.ticket_messages TO service_role;