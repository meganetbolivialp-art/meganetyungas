CREATE TABLE public.mikrotik_pending_ops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  op text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz
);

CREATE INDEX idx_mto_pending_router_status ON public.mikrotik_pending_ops(router_id, status, created_at);
CREATE INDEX idx_mto_pending_service ON public.mikrotik_pending_ops(service_id) WHERE service_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mikrotik_pending_ops TO authenticated;
GRANT ALL ON public.mikrotik_pending_ops TO service_role;

ALTER TABLE public.mikrotik_pending_ops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage pending ops"
  ON public.mikrotik_pending_ops
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER set_mto_pending_updated_at
  BEFORE UPDATE ON public.mikrotik_pending_ops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();