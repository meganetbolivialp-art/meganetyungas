CREATE TABLE public.receipt_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  company_name TEXT NOT NULL DEFAULT 'MEGANET ISP',
  logo_url TEXT,
  nit TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  receipt_title TEXT NOT NULL DEFAULT 'RECIBO DE PAGO',
  footer_message TEXT NOT NULL DEFAULT '¡Gracias por su pago!',
  legal_note TEXT NOT NULL DEFAULT 'Documento generado electrónicamente',
  show_logo BOOLEAN NOT NULL DEFAULT TRUE,
  grayscale_logo BOOLEAN NOT NULL DEFAULT TRUE,
  show_client_document BOOLEAN NOT NULL DEFAULT TRUE,
  show_client_phone BOOLEAN NOT NULL DEFAULT TRUE,
  show_operator BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, UPDATE ON public.receipt_settings TO authenticated;
GRANT ALL ON public.receipt_settings TO service_role;

ALTER TABLE public.receipt_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff can read receipt settings"
ON public.receipt_settings FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY "Admins can update receipt settings"
ON public.receipt_settings FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.receipt_settings (id) VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;