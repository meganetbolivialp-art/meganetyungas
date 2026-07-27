ALTER TABLE public.vpn_servers
  ADD COLUMN IF NOT EXISTS vpn_type text NOT NULL DEFAULT 'wireguard' CHECK (vpn_type IN ('wireguard','l2tp')),
  ADD COLUMN IF NOT EXISTS ipsec_secret text;