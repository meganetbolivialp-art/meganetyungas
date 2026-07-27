import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const convertLeadToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: lead } = await context.supabase.from("leads").select("*").eq("id", data.leadId).single();
    if (!lead) throw new Error("Lead no encontrado");
    const { data: client, error } = await context.supabase.from("clients").insert({
      full_name: lead.full_name,
      email: lead.email,
      phone: lead.phone,
      address: lead.address,
      city: lead.city,
      status: "active",
    }).select().single();
    if (error) throw new Error(error.message);
    await context.supabase.from("leads").update({ status: "won", converted_client_id: client.id }).eq("id", data.leadId);
    return client;
  });
