
CREATE TABLE IF NOT EXISTS public.router_ip_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  router_id uuid NOT NULL REFERENCES public.routers(id) ON DELETE CASCADE,
  name text NOT NULL,
  cidr text,
  ranges text,
  gateway text,
  is_default boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (router_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.router_ip_pools TO authenticated;
GRANT ALL ON public.router_ip_pools TO service_role;

ALTER TABLE public.router_ip_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read pools" ON public.router_ip_pools FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write pools" ON public.router_ip_pools FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_router_ip_pools_updated BEFORE UPDATE ON public.router_ip_pools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_router_ip_pools_router ON public.router_ip_pools(router_id);
