import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + parseInt(o, 10), 0) >>> 0;
}
function longToIp(l: number): string {
  return [(l >>> 24) & 255, (l >>> 16) & 255, (l >>> 8) & 255, l & 255].join(".");
}
function cidrRange(cidr: string) {
  const [ip, bits] = cidr.split("/");
  const mask = parseInt(bits, 10);
  const long = ipToLong(ip);
  const hostBits = 32 - mask;
  const start = (long >>> hostBits) << hostBits;
  const end = start + (1 << hostBits) - 1;
  return { start, end, mask };
}
function nextIp(network: string, serverIp: string, used: string[]): string | null {
  const { start, end } = cidrRange(network);
  const serverLong = ipToLong(serverIp.split("/")[0]);
  const usedSet = new Set(used.map((ip) => ipToLong(ip.split("/")[0])));
  for (let i = start + 2; i < end; i++) {
    if (i === serverLong) continue;
    if (!usedSet.has(i)) return longToIp(i);
  }
  return null;
}

function randPass(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 16; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/**
 * Provisiona (o reutiliza) las credenciales SSTP del router contra el servidor VPN activo.
 * Devuelve el bloque de datos que el generador de .rsc necesita para armar el sstp-client.
 */
export const provisionRouterVpn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    // 1) Servidor VPN activo
    const { data: servers } = await context.supabase
      .from("vpn_servers")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1);
    const server = (servers ?? [])[0] as any;
    if (!server) return { hasVpn: false as const };

    const vpnType = (server.vpn_type ?? "sstp").toLowerCase();

    // 2) Nombre del router (para user/comment)
    const { data: r } = await context.supabase
      .from("routers")
      .select("name")
      .eq("id", data.routerId)
      .single();
    const routerName = (r?.name ?? "router").toString();
    const slug = routerName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "router";

    // 3) Peer existente
    const { data: existingPeers } = await context.supabase
      .from("vpn_peers")
      .select("*")
      .eq("server_id", server.id)
      .eq("router_id", data.routerId)
      .limit(1);
    let peer = (existingPeers ?? [])[0] as any;

    // 4) Crear peer si no existe
    if (!peer) {
      const { data: allPeers } = await context.supabase
        .from("vpn_peers")
        .select("assigned_ip")
        .eq("server_id", server.id);
      const usedIps = ((allPeers ?? []) as any[]).map((p) => String(p.assigned_ip));
      const ip = nextIp(String(server.network ?? "10.10.0.0/24"), String(server.server_ip ?? "10.10.0.1"), usedIps);
      if (!ip) throw new Error("Sin IPs libres en la VPN");

      const sstpUser = `ms_${slug}`;
      const sstpPassword = randPass();

      const { data: inserted, error } = await context.supabase
        .from("vpn_peers")
        .insert({
          server_id: server.id,
          router_id: data.routerId,
          name: routerName,
          assigned_ip: ip,
          allowed_ips: "0.0.0.0/0",
          private_key: "",
          public_key: "",
          sstp_user: sstpUser,
          sstp_password: sstpPassword,
        })
        .select()
        .single();
      if (error || !inserted) throw new Error(error?.message ?? "No se pudo crear peer");
      peer = inserted;
    }

    // 5) Backfill de credenciales SSTP si el peer viejo no las tenía
    if (!peer.sstp_user || !peer.sstp_password) {
      const sstpUser = peer.sstp_user ?? `ms_${slug}`;
      const sstpPassword = peer.sstp_password ?? randPass();
      await context.supabase
        .from("vpn_peers")
        .update({ sstp_user: sstpUser, sstp_password: sstpPassword })
        .eq("id", peer.id);
      peer.sstp_user = sstpUser;
      peer.sstp_password = sstpPassword;
    }

    return {
      hasVpn: true as const,
      vpnType,
      assignedIp: String(peer.assigned_ip),
      endpoint: String(server.endpoint),
      port: Number(server.port ?? 443),
      sstpUser: String(peer.sstp_user),
      sstpPassword: String(peer.sstp_password),
    };
  });
