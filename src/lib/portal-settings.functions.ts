import { createServerFn } from "@tanstack/react-start";

// Public, read-only fetch of the suspended-page branding.
// Returns only safe, non-sensitive display fields.
export const getSuspendedPortalSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("portal_settings")
    .select("title, subtitle, message, whatsapp, whatsapp_message, phone, company_name, logo_url, primary_color, secondary_color, footer_note, custom_html, use_custom_html, template_base_url")
    .eq("id", true)
    .maybeSingle();
  return data ?? null;
});
