
-- 1) Defaults SSTP en vpn_servers
ALTER TABLE public.vpn_servers
  ALTER COLUMN vpn_type SET DEFAULT 'sstp',
  ALTER COLUMN port SET DEFAULT 443;

UPDATE public.vpn_servers
   SET vpn_type = COALESCE(NULLIF(vpn_type, ''), 'sstp'),
       port = CASE WHEN port IN (0, 51820) THEN 443 ELSE port END;

-- 2) Campos SSTP en vpn_peers
ALTER TABLE public.vpn_peers
  ADD COLUMN IF NOT EXISTS sstp_user text,
  ADD COLUMN IF NOT EXISTS sstp_password text;

-- 3) Si hay un servidor VPN existente sin endpoint, apuntarlo al VPS
UPDATE public.vpn_servers
   SET endpoint = COALESCE(NULLIF(endpoint, ''), '157.173.118.181')
 WHERE is_active = true;
