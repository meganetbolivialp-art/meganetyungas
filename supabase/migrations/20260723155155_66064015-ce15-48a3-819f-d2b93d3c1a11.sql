ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS client_pool_cidr text;
ALTER TABLE public.routers ADD COLUMN IF NOT EXISTS client_pool_gateway text;