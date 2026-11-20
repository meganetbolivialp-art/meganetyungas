CREATE OR REPLACE FUNCTION public.save_cutoff_policy_with_nodes(p_policy jsonb, p_router_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_policy public.cutoff_policies;
  v_id uuid := NULLIF(p_policy->>'id', '')::uuid;
  v_client_ids uuid[] := ARRAY[]::uuid[];
  v_count integer := 0;
  v_router_count integer;
BEGIN
  IF NULLIF(trim(p_policy->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'Nombre requerido';
  END IF;
  IF v_id IS NOT NULL THEN
    SELECT * INTO v_policy FROM public.cutoff_policies WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plantilla no encontrada o sin permiso'; END IF;
  END IF;
  v_policy := jsonb_populate_record(v_policy, p_policy);
  v_policy.id := COALESCE(v_id, gen_random_uuid());
  v_policy.name := trim(v_policy.name);
  v_policy.grace_days := COALESCE(v_policy.grace_days, 5);
  v_policy.cut_hour := COALESCE(v_policy.cut_hour, 9);
  v_policy.cut_mode := COALESCE(v_policy.cut_mode, 'ip');
  v_policy.prior_notice_hours := COALESCE(v_policy.prior_notice_hours, 24);
  v_policy.notify_sms := COALESCE(v_policy.notify_sms, false);
  v_policy.notify_email := COALESCE(v_policy.notify_email, false);
  v_policy.notify_whatsapp := COALESCE(v_policy.notify_whatsapp, false);
  v_policy.reconnect_fee := COALESCE(v_policy.reconnect_fee, 0);
  v_policy.late_fee := COALESCE(v_policy.late_fee, 0);
  v_policy.auto_suspend := COALESCE(v_policy.auto_suspend, true);
  v_policy.is_default := COALESCE(v_policy.is_default, false);
  v_policy.is_active := COALESCE(v_policy.is_active, true);
  IF v_policy.cut_hour NOT BETWEEN 0 AND 23 OR v_policy.grace_days < 0 THEN
    RAISE EXCEPTION 'Hora de corte o días de gracia inválidos';
  END IF;
  IF (v_policy.invoice_day IS NOT NULL AND v_policy.invoice_day NOT BETWEEN 1 AND 28)
     OR (v_policy.due_day IS NOT NULL AND v_policy.due_day NOT BETWEEN 1 AND 28)
     OR (v_policy.cut_day IS NOT NULL AND v_policy.cut_day NOT BETWEEN 1 AND 28) THEN
    RAISE EXCEPTION 'Los días de factura, pago y corte deben estar entre 1 y 28';
  END IF;
  IF p_router_ids IS NOT NULL THEN
    PERFORM id FROM public.routers WHERE id = ANY(p_router_ids) ORDER BY id FOR UPDATE;
    SELECT count(*) INTO v_router_count FROM public.routers WHERE id = ANY(p_router_ids);
    IF v_router_count <> (SELECT count(DISTINCT x) FROM unnest(p_router_ids) AS x) THEN
      RAISE EXCEPTION 'Algún nodo no existe o no tienes permiso';
    END IF;
  END IF;
  IF v_policy.is_default THEN
    UPDATE public.cutoff_policies SET is_default = false WHERE id <> v_policy.id AND is_default;
  END IF;
  INSERT INTO public.cutoff_policies (id, name, description, grace_days, cut_hour, cut_day, invoice_day, due_day, cut_mode, speed_reduced_kbps, prior_notice_hours, notify_sms, notify_email, notify_whatsapp, reconnect_fee, late_fee, auto_suspend, is_default, is_active)
  VALUES (v_policy.id, v_policy.name, v_policy.description, v_policy.grace_days, v_policy.cut_hour, v_policy.cut_day, v_policy.invoice_day, v_policy.due_day, v_policy.cut_mode, v_policy.speed_reduced_kbps, v_policy.prior_notice_hours, v_policy.notify_sms, v_policy.notify_email, v_policy.notify_whatsapp, v_policy.reconnect_fee, v_policy.late_fee, v_policy.auto_suspend, v_policy.is_default, v_policy.is_active)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, grace_days = EXCLUDED.grace_days,
    cut_hour = EXCLUDED.cut_hour, cut_day = EXCLUDED.cut_day, invoice_day = EXCLUDED.invoice_day,
    due_day = EXCLUDED.due_day, cut_mode = EXCLUDED.cut_mode, speed_reduced_kbps = EXCLUDED.speed_reduced_kbps,
    prior_notice_hours = EXCLUDED.prior_notice_hours, notify_sms = EXCLUDED.notify_sms,
    notify_email = EXCLUDED.notify_email, notify_whatsapp = EXCLUDED.notify_whatsapp,
    reconnect_fee = EXCLUDED.reconnect_fee, late_fee = EXCLUDED.late_fee,
    auto_suspend = EXCLUDED.auto_suspend, is_default = EXCLUDED.is_default, is_active = EXCLUDED.is_active;
  IF p_router_ids IS NOT NULL THEN
    UPDATE public.routers SET cutoff_policy_id = NULL
      WHERE cutoff_policy_id = v_policy.id AND NOT (id = ANY(p_router_ids));
    UPDATE public.routers SET cutoff_policy_id = v_policy.id WHERE id = ANY(p_router_ids);
  END IF;
  SELECT COALESCE(array_agg(DISTINCT s.client_id), ARRAY[]::uuid[]) INTO v_client_ids
    FROM public.services s JOIN public.routers r ON r.id = s.router_id
    WHERE r.cutoff_policy_id = v_policy.id;
  UPDATE public.clients SET cutoff_policy_id = v_policy.id,
    grace_days_override = v_policy.grace_days,
    billing_day = COALESCE(v_policy.due_day, billing_day)
    WHERE id = ANY(v_client_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.services s SET auto_suspend = v_policy.auto_suspend
    FROM public.routers r WHERE r.id = s.router_id AND r.cutoff_policy_id = v_policy.id;
  INSERT INTO public.client_actions (client_id, action, detail, performed_by)
    SELECT c.id, 'config', 'Plantilla por nodo: ' || v_policy.name, auth.uid()
    FROM public.clients c WHERE c.id = ANY(v_client_ids);
  RETURN jsonb_build_object('ok', true, 'id', v_policy.id, 'updated_clients', v_count);
END; $$;
REVOKE ALL ON FUNCTION public.save_cutoff_policy_with_nodes(jsonb, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cutoff_policy_with_nodes(jsonb, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inherit_service_node_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_policy public.cutoff_policies;
BEGIN
  SELECT cp.* INTO v_policy FROM public.routers r JOIN public.cutoff_policies cp ON cp.id = r.cutoff_policy_id
    WHERE r.id = NEW.router_id;
  IF FOUND THEN
    UPDATE public.clients SET cutoff_policy_id = v_policy.id,
      grace_days_override = v_policy.grace_days,
      billing_day = COALESCE(v_policy.due_day, billing_day)
      WHERE id = NEW.client_id;
    NEW.auto_suspend := v_policy.auto_suspend;
  END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER services_inherit_node_policy
BEFORE INSERT OR UPDATE OF router_id, client_id ON public.services
FOR EACH ROW EXECUTE FUNCTION public.inherit_service_node_policy();
REVOKE ALL ON FUNCTION public.inherit_service_node_policy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inherit_service_node_policy() TO authenticated, service_role;