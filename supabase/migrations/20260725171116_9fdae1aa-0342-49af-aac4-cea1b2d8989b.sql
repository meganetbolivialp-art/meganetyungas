
-- Ticket messages (thread) table
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_messages TO authenticated;
GRANT ALL ON public.ticket_messages TO service_role;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticket_messages_all_auth" ON public.ticket_messages;
CREATE POLICY "ticket_messages_all_auth" ON public.ticket_messages FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.ticket_messages(ticket_id, created_at);

-- Add ticket_number and last_reply_at to tickets if missing
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS ticket_number bigserial;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;

-- Trigger: update last_reply_at when a message is inserted
CREATE OR REPLACE FUNCTION public.touch_ticket_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.tickets SET last_reply_at = now(), updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_touch_ticket ON public.ticket_messages;
CREATE TRIGGER trg_touch_ticket AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_ticket_on_message();
