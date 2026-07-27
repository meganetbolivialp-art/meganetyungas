
CREATE TABLE public.fiber_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node uuid NOT NULL REFERENCES public.network_nodes(id) ON DELETE CASCADE,
  to_node uuid NOT NULL REFERENCES public.network_nodes(id) ON DELETE CASCADE,
  cable_type text DEFAULT 'aerial',
  fibers int DEFAULT 12,
  length_m int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiber_links TO authenticated;
GRANT ALL ON public.fiber_links TO service_role;
ALTER TABLE public.fiber_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manages fiber links" ON public.fiber_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER fiber_links_updated BEFORE UPDATE ON public.fiber_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
