import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildManualProvisionGuide,
  buildRouterInstallScript,
  describeProvisionError,
  getAgentHost,
  getNextVpnIp,
  isL2tpProvision,
  normalizeProvisionAgentUrl,
  randPass,
  requestProvisionFiles,
  slugifyRouterName,
  type ProvisionFiles,
} from "./router-oneclick.server";

/**
 * Asistente 1-clic:
 *   1. Reserva próxima IP libre en la VPN (10.8.0.12+)
 *   2. Llama al agente del VPS /provision para generar credenciales L2TP/IPsec (más estable que OVPN)
 *   3. Crea el router en la base aunque el VPS todavía no responda
 *   4. Devuelve el .rsc + credenciales, o una guía si falta el endpoint del VPS
 */
export const oneClickProvisionRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; location?: string; vpnType?: "ovpn" | "l2tp" }) => d)
  .handler(async ({ data, context }) => {
    // Acepta las variables nuevas (MEGANET_AGENT_*) o las ya configuradas del puente VPN (MIKROTIK_AGENT_*)
    const rawUrl = process.env['MEGANET_AGENT_URL'] || process.env['MIKROTIK_AGENT_HOST'];
    const agentToken = process.env['MEGANET_AGENT_TOKEN'] || process.env['MIKROTIK_AGENT_TOKEN'];
    if (!rawUrl || !agentToken) {
      throw new Error("Falta configurar el agente del VPS (URL o token) en los secretos del panel.");
    }
    const agentUrl = normalizeProvisionAgentUrl(rawUrl);

    const name = data.name.trim();
    if (!name) throw new Error("Nombre requerido");
    const slug = slugifyRouterName(name);

    // Por defecto L2TP/IPsec (más estable estilo MikroWisp), se puede forzar ovpn
    const vpnType = data.vpnType || "l2tp";

    // 1) Próxima IP libre en 10.8.0.0/24 (empezando en .12; .1 servidor, .11 primer router)
    const { data: existing } = await context.supabase
      .from("routers")
      .select("name, ip_address");
    const assigned = getNextVpnIp((existing ?? []) as Array<{ name?: string | null; ip_address?: string | null }>, name);

    // 2) Llamar al agente en VPS para provisionar credenciales VPN
    const provisionUrl = `${agentUrl}/provision`;
    let provision: ProvisionFiles | null = null;
    let provisionError: string | null = null;
    try {
      provision = await requestProvisionFiles({ provisionUrl, agentToken, slug, assignedIp: assigned, vpnType });
    } catch (error) {
      provisionError = describeProvisionError(error);
    }

    // 3) Crear router en base
    const apiUser = "panel";
    const apiPass = randPass(16);
    const { data: inserted, error } = await context.supabase
      .from("routers")
      .insert({
        name,
        ip_address: assigned,
        type: "mikrotik",
        location: data.location || null,
        api_port: 8728,
        api_user: apiUser,
        api_password: apiPass,
        simulated: false,
        status: "offline",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // 4) Construir archivos de instalación o guía manual si el VPS todavía no responde
    const vpsHost = getAgentHost(agentUrl);
    const rsc = buildRouterInstallScript({
      name,
      slug,
      assignedIp: assigned,
      vpsHost,
      apiUser,
      apiPass,
      provision,
      vpnType,
    });

    const files = provision
      ? vpnType === "l2tp" && isL2tpProvision(provision)
        ? {
            [`${slug}-l2tp.txt`]: [
              `Usuario L2TP: ${provision.l2tpUser}`,
              `Password L2TP: ${provision.l2tpPassword}`,
              `IP fija VPN: ${provision.ip}`,
              `Servidor IPsec: ${provision.endpoint}`,
              `IPsec PSK: ${provision.ipsecSecret}`,
            ].join("\n"),
            [`${slug}.rsc`]: rsc,
          }
        : isL2tpProvision(provision)
        ? {}
        : {
            [`${slug}-ca.crt`]: provision.ca,
            [`${slug}.crt`]: provision.crt,
            [`${slug}.key`]: provision.key,
            [`${slug}.rsc`]: rsc,
          }
      : {
          [`${slug}-pendiente-vps.txt`]: buildManualProvisionGuide({
            name,
            slug,
            assignedIp: assigned,
            provisionUrl,
            provisionError: provisionError ?? "VPS no disponible",
            vpnType,
          }),
        };

    return {
      ok: true,
      provisioned: !!provision,
      provisionError,
      router: inserted,
      ip: assigned,
      apiUser,
      apiPass,
      vpnType,
      files,
    };
  });
