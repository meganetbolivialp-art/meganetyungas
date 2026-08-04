import { secureString } from "@/lib/secure-random";

export type OvpnProvisionFiles = { ca: string; crt: string; key: string };
export type L2tpProvisionFiles = {
  l2tpUser: string;
  l2tpPassword: string;
  ip: string;
  ipsecSecret: string;
  endpoint: string;
};
export type ProvisionFiles = OvpnProvisionFiles | L2tpProvisionFiles;
export type VpnType = "ovpn" | "l2tp";

export function isL2tpProvision(value: ProvisionFiles): value is L2tpProvisionFiles {
  return "l2tpUser" in value && "l2tpPassword" in value;
}

export function ipToLong(ip: string): number {
  return ip.split(".").reduce((a, o) => (a << 8) + parseInt(o, 10), 0) >>> 0;
}

export function longToIp(l: number): string {
  return [(l >>> 24) & 255, (l >>> 16) & 255, (l >>> 8) & 255, l & 255].join(".");
}

export function randPass(len = 14): string {
  return secureString(len);
}

export function slugifyRouterName(value: string): string {
  return (value || "router").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 15) || "router";
}

export function normalizeProvisionAgentUrl(rawUrl: string): string {
  let agentUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(agentUrl)) agentUrl = `http://${agentUrl}`;
  if (!/:\d+/.test(agentUrl.replace(/^https?:\/\//, ""))) {
    agentUrl = `${agentUrl.replace(/\/$/, "")}:3940`;
  }
  return agentUrl.replace(/\/$/, "");
}

export function getAgentHost(agentUrl: string): string {
  return agentUrl.replace(/^https?:\/\//, "").replace(/:\d+.*$/, "").replace(/\/.*$/, "");
}

export function getNextVpnIp(
  existingRouters: Array<{ name?: string | null; ip_address?: string | null }>,
  name: string,
): string {
  const used = new Set<number>();
  used.add(ipToLong("10.8.0.1"));

  for (const router of existingRouters) {
    const ip = String(router.ip_address || "").trim();
    if (/^10\.8\.0\.\d+$/.test(ip)) used.add(ipToLong(ip));
    if (String(router.name || "").toLowerCase() === name.toLowerCase()) {
      throw new Error(`Ya existe un router con nombre "${name}"`);
    }
  }

  const base = ipToLong("10.8.0.0");
  for (let i = 12; i < 254; i++) {
    if (!used.has(base + i)) return longToIp(base + i);
  }
  throw new Error("Sin IPs libres en 10.8.0.0/24");
}

export async function requestProvisionFiles(params: {
  provisionUrl: string;
  agentToken: string;
  slug: string;
  assignedIp: string;
  vpnType: VpnType;
}): Promise<ProvisionFiles> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(params.provisionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.agentToken}`,
      },
      body: JSON.stringify({ name: params.slug, ip: params.assignedIp, type: params.vpnType }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const provision = (await res.json()) as Partial<OvpnProvisionFiles & L2tpProvisionFiles>;

    if (params.vpnType === "l2tp") {
      if (!provision.l2tpUser || !provision.l2tpPassword || !provision.ip || !provision.ipsecSecret || !provision.endpoint) {
        throw new Error("Respuesta del agente L2TP incompleta");
      }
      return {
        l2tpUser: provision.l2tpUser,
        l2tpPassword: provision.l2tpPassword,
        ip: provision.ip,
        ipsecSecret: provision.ipsecSecret,
        endpoint: provision.endpoint,
      };
    }

    if (!provision.ca || !provision.crt || !provision.key) {
      throw new Error("Respuesta del agente incompleta (falta ca/crt/key)");
    }
    return { ca: provision.ca, crt: provision.crt, key: provision.key };
  } finally {
    clearTimeout(timeout);
  }
}

export function describeProvisionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError") return "timeout (15s) — el VPS no respondió";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(message)) {
    return "no se pudo conectar. Verificá que el agente HTTP escuche en puerto 3940 y que el firewall del VPS lo permita";
  }
  return message;
}

export function buildRouterInstallScript(params: {
  name: string;
  slug: string;
  assignedIp: string;
  vpsHost: string;
  apiUser: string;
  apiPass: string;
  provision: ProvisionFiles | null;
  vpnType: VpnType;
}) {
  const caFile = `${params.slug}-ca.crt`;
  const crtFile = `${params.slug}.crt`;
  const keyFile = `${params.slug}.key`;

  const vpnCommands =
    params.vpnType === "l2tp" && params.provision && isL2tpProvision(params.provision)
      ? [
          `# 1) L2TP/IPsec client → VPS`,
          `/interface l2tp-client remove [find name="vpn-panel"]`,
          `/interface l2tp-client add name=vpn-panel connect-to=${params.provision.endpoint} user=${params.provision.l2tpUser} password="${params.provision.l2tpPassword}" profile=default-encryption use-ipsec=yes ipsec-secret="${params.provision.ipsecSecret}" add-default-route=no disabled=no`,
          `# 1.1) Asegurar perfil PPP con local/remote-address`,
          `/ppp profile add name=default-encryption local-address=10.8.0.1 remote-address=10.8.0.0/24 comment="VPN panel" 2>/dev/null`,
          `/ppp profile set [find name="default-encryption"] local-address=10.8.0.1 remote-address=10.8.0.0/24`,
          `/interface l2tp-client set [find name="vpn-panel"] profile=default-encryption`,
        ]
      : [
          `# 1) Importar certificados`,
          `/certificate import file-name=${caFile} passphrase=""`,
          `/certificate import file-name=${crtFile} passphrase=""`,
          `/certificate import file-name=${keyFile} passphrase=""`,
          "",
          `# 2) OVPN client → VPS`,
          `/interface ovpn-client remove [find name="ovpn-panel"]`,
          `/interface ovpn-client add name=ovpn-panel connect-to=${params.vpsHost} port=1194 mode=ip protocol=tcp user=${params.slug} password="" certificate=${params.slug}.crt_0 auth=sha1 cipher=aes256 add-default-route=no disabled=no`,
        ];

  return [
    `# ============================================================`,
    `# MikroSystem — auto-provision para router: ${params.name}`,
    `# IP VPN asignada: ${params.assignedIp}   ·   VPS: ${params.vpsHost}`,
    `# VPN: ${params.vpnType.toUpperCase()}`,
    `# ============================================================`,
    "",
    ...vpnCommands,
    "",
    `# 3) Usuario API para el panel`,
    `/user group add name=panel-api policy=api,read,write,policy,test,sensitive,romon 2>/dev/null`,
    `/user remove [find name="${params.apiUser}"]`,
    `/user add name=${params.apiUser} password="${params.apiPass}" group=panel-api comment="MikroSystem panel"`,
    "",
    `# 4) Habilitar API`,
    `/ip service set api disabled=no port=8728`,
    "",
    `# 5) Firewall: permitir API sólo desde el túnel VPN`,
    `/ip firewall filter remove [find comment="mikrosystem-api"]`,
    `/ip firewall filter add chain=input action=accept protocol=tcp dst-port=8728 in-interface=vpn-panel comment="mikrosystem-api" place-before=0`,
    "",
    `:log info "MikroSystem: provisión completa. VPN=${params.assignedIp}"`,
    `:put "Listo. Verificá /interface l2tp-client print o /interface ovpn-client print"`,
    "",
  ].join("\n");
}

export function buildManualProvisionGuide(params: {
  name: string;
  slug: string;
  assignedIp: string;
  provisionUrl: string;
  provisionError: string;
  vpnType: VpnType;
}) {
  return [
    `ROUTER GUARDADO: ${params.name}`,
    `IP VPN reservada: ${params.assignedIp}`,
    `VPN: ${params.vpnType.toUpperCase()}`,
    "",
    `El router ya quedó agregado en el panel, pero NO se generaron las credenciales VPN porque el VPS no respondió:`,
    `${params.provisionUrl}`,
    "",
    `Error: ${params.provisionError}`,
    "",
    `En el VPS verificá:`,
    `sudo ss -ltnp | grep 3940`,
    `curl -i http://127.0.0.1:3940/provision -X POST -H 'Authorization: Bearer TU_TOKEN' -H 'Content-Type: application/json' -d '{"name":"${params.slug}","ip":"${params.assignedIp}","type":"${params.vpnType}"}'`,
    "",
    `Cuando /provision responda, abrí de nuevo el asistente para generar el script del siguiente router.`,
  ].join("\n");
}
