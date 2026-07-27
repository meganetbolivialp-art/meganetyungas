import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const addTicketMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string; body: string; is_internal?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
    const author_name = prof?.full_name || prof?.email || "Operador";
    const { data: msg, error } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: data.ticket_id,
        author_id: userId,
        author_name,
        body: data.body,
        is_internal: !!data.is_internal,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return msg;
  });

export const setTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticket_id: string; status: string }) => d)
  .handler(async ({ data, context }) => {
    const patch: any = { status: data.status };
    if (data.status === "resolved" || data.status === "closed") patch.resolved_at = new Date().toISOString();
    const { error } = await context.supabase.from("tickets").update(patch).eq("id", data.ticket_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
