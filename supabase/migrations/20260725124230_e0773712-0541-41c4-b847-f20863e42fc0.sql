CREATE TABLE public.vpn_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  port integer NOT NULL DEFAULT 51820,
  network cidr NOT NULL DEFAULT '10.10.0.0/24',
  server_ip inet NOT NULL DEFAULT '10.10.0.1',
  dns text,
  server_private_key text NOT NULL,
  server_public_key text NOT NULL,
  post_up text,
  post_down text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vpn_servers TO authenticated;
GRANT ALL ON public.vpn_servers TO service_role;

ALTER TABLE public.vpn_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage vpn_servers"
ON public.vpn_servers
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.vpn_peers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.vpn_servers(id) ON DELETE CASCADE,
  router_id uuid REFERENCES public.routers(id) ON DELETE SET NULL,
  name text NOT NULL,
  private_key text NOT NULL,
  public_key text NOT NULL,
  assigned_ip inet NOT NULL,
  allowed_ips cidr NOT NULL DEFAULT '0.0.0.0/0',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vpn_peers TO authenticated;
GRANT ALL ON public.vpn_peers TO service_role;

ALTER TABLE public.vpn_peers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage vpn_peers"
ON public.vpn_peers
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER vpn_servers_updated_at BEFORE UPDATE ON public.vpn_servers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER vpn_peers_updated_at BEFORE UPDATE ON public.vpn_peers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();