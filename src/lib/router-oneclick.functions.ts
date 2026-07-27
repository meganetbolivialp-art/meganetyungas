import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildManualProvisionGuide,
  buildRouterInstallScript,
  describeProvisionError,
  getAgentHost,
  getNextVpnIp,
  normalizeProvisionAgentUrl,
  randPass,
  requestProvisionFiles,
  slugifyRouterName,
  type ProvisionFiles,
} from "./router-oneclick.server";

/**
 * Asistente 1-clic:
 *   1. Reserva próxima IP libre en la VPN (10.8.0.12+)
 *   2. Intenta llamar al VPS meganet-agent `/provision` → genera certs con easy-rsa y CCD
 *   3. Crea el router en la base aunque el VPS todavía no responda
 *   4. Devuelve el `.rsc` + certs, o una guía si falta el endpoint del VPS
 */
export const oneClickProvisionRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; location?: string }) => d)
  .handler(async ({ data, context }) => {
    const rawUrl = process.env.MEGANET_AGENT_URL;
    const agentToken = process.env.MEGANET_AGENT_TOKEN;
    if (!rawUrl || !agentToken) {
      throw new Error("Faltan MEGANET_AGENT_URL o MEGANET_AGENT_TOKEN en secretos del panel.");
    }
    const agentUrl = normalizeProvisionAgentUrl(rawUrl);

    const name = data.name.trim();
    if (!name) throw new Error("Nombre requerido");
    const slug = slugifyRouterName(name);

    // 1) Próxima IP libre en 10.8.0.0/24 (empezando en .12; .1 servidor, .11 primer router)
    const { data: existing } = await context.supabase
      .from("routers")
      .select("name, ip_address");
    const assigned = getNextVpnIp((existing ?? []) as Array<{ name?: string | null; ip_address?: string | null }>, name);

    // 2) Llamar al agente en VPS para provisionar certs + CCD
    const provisionUrl = `${agentUrl}/provision`;
    let provision: ProvisionFiles | null = null;
    let provisionError: string | null = null;
    try {
      provision = await requestProvisionFiles({ provisionUrl, agentToken, slug, assignedIp: assigned });
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
    const caFile = `${slug}-ca.crt`;
    const crtFile = `${slug}.crt`;
    const keyFile = `${slug}.key`;

    const legacyRsc = [
      `# ============================================================`,
      `# MikroSystem — auto-provision para router: ${name}`,
      `# IP VPN asignada: ${assigned}   ·   VPS: ${vpsHost}`,
      `# Subí primero los 3 archivos ${caFile}, ${crtFile}, ${keyFile}`,
      `# y luego importá este .rsc con:  /import file-name=${slug}.rsc`,
      `# ============================================================`,
      ``,
      `# 1) Importar certificados`,
      `/certificate import file-name=${caFile} passphrase=""`,
      `/certificate import file-name=${crtFile} passphrase=""`,
      `/certificate import file-name=${keyFile} passphrase=""`,
      ``,
      `# 2) OVPN client → VPS`,
      `/interface ovpn-client remove [find name="ovpn-panel"]`,
      `/interface ovpn-client add name=ovpn-panel connect-to=${vpsHost} port=1194 \\`,
      `  mode=ip protocol=tcp user=${slug} password="" \\`,
      `  certificate=${slug}.crt_0 auth=sha1 cipher=aes256 \\`,
      `  add-default-route=no disabled=no`,
      ``,
      `# 3) Usuario API para el panel`,
      `/user group add name=panel-api policy=api,read,write,policy,test,sensitive,romon 2>/dev/null`,
      `/user remove [find name="${apiUser}"]`,
      `/user add name=${apiUser} password="${apiPass}" group=panel-api comment="MikroSystem panel"`,
      ``,
      `# 4) Habilitar API`,
      `/ip service set api disabled=no port=8728`,
      ``,
      `# 5) Firewall: permitir API sólo desde el túnel VPN`,
      `/ip firewall filter remove [find comment="mikrosystem-api"]`,
      `/ip firewall filter add chain=input action=accept protocol=tcp dst-port=8728 \\`,
      `  in-interface=ovpn-panel comment="mikrosystem-api" place-before=0`,
      ``,
      `:log info "MikroSystem: provisión completa. VPN=${assigned}"`,
      `:put "Listo. Verificá /interface ovpn-client print y /user print"`,
      ``,
    ].join("\n");
    void legacyRsc;
    const rsc = buildRouterInstallScript({ name, slug, assignedIp: assigned, vpsHost, apiUser, apiPass });
    const files = provision
      ? { [caFile]: provision.ca, [crtFile]: provision.crt, [keyFile]: provision.key, [`${slug}.rsc`]: rsc }
      : {
          [`${slug}-pendiente-vps.txt`]: buildManualProvisionGuide({
            name,
            slug,
            assignedIp: assigned,
            provisionUrl,
            provisionError: provisionError ?? "VPS no disponible",
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
      files,
    };
  });
