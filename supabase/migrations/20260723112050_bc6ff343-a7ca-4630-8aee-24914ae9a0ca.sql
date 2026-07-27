
CREATE TABLE IF NOT EXISTS public.portal_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  title text NOT NULL DEFAULT 'Servicio suspendido',
  subtitle text NOT NULL DEFAULT 'Tu conexión está temporalmente inactiva',
  message text NOT NULL DEFAULT 'Hola, tu servicio de internet fue suspendido por falta de pago. Regularizá el saldo pendiente y lo reactivamos al instante.',
  whatsapp text NOT NULL DEFAULT '5959XXXXXXX',
  whatsapp_message text NOT NULL DEFAULT 'Hola, quiero pagar mi factura y reactivar el servicio',
  phone text NOT NULL DEFAULT '021-XXXXXX',
  company_name text NOT NULL DEFAULT 'Mi ISP',
  logo_url text,
  primary_color text NOT NULL DEFAULT '#dc2626',
  secondary_color text NOT NULL DEFAULT '#f97316',
  footer_note text NOT NULL DEFAULT 'Al confirmar tu pago, tu conexión se restablece en menos de 1 minuto.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portal_settings TO anon, authenticated;
GRANT ALL ON public.portal_settings TO service_role;
GRANT UPDATE, INSERT ON public.portal_settings TO authenticated;

ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_settings readable by all"
  ON public.portal_settings FOR SELECT
  USING (true);

CREATE POLICY "portal_settings admin write"
  ON public.portal_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.portal_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER portal_settings_updated_at
  BEFORE UPDATE ON public.portal_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
