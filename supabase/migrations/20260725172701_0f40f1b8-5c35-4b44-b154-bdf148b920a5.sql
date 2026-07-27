
CREATE TABLE public.bulk_change_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  action TEXT NOT NULL CHECK (action IN ('billing_day','plan_change','status_change','grace_days','dont_cut','payment_promise')),
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_change_templates TO authenticated;
GRANT ALL ON public.bulk_change_templates TO service_role;
ALTER TABLE public.bulk_change_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage bulk templates" ON public.bulk_change_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_bulk_change_templates_updated BEFORE UPDATE ON public.bulk_change_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.bulk_change_templates (name, description, action, params) VALUES
('Día de pago 5', 'Cambia el día de facturación al 5 de cada mes', 'billing_day', '{"day":5}'::jsonb),
('Día de pago 10', 'Cambia el día de facturación al 10', 'billing_day', '{"day":10}'::jsonb),
('Día de pago 15', 'Cambia el día de facturación al 15', 'billing_day', '{"day":15}'::jsonb),
('Gracia 5 días', 'Establece 5 días de gracia antes del corte', 'grace_days', '{"days":5}'::jsonb),
('Proteger de corte (VIP)', 'Marca clientes como no cortar', 'dont_cut', '{"value":true}'::jsonb),
('Quitar protección de corte', 'Permite corte automático', 'dont_cut', '{"value":false}'::jsonb),
('Promesa de pago 7 días', 'Otorga promesa de pago por 7 días', 'payment_promise', '{"days":7}'::jsonb);
