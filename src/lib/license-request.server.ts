/**
 * Helpers compartidos para los endpoints públicos de licencias.
 *
 * Seguridad: la IP del cliente se toma exclusivamente de la cabecera que
 * inyecta la infraestructura del borde (`cf-connecting-ip`). Nunca se confía en
 * `x-forwarded-for`, `x-real-ip` ni en una IP enviada dentro del cuerpo, porque
 * cualquiera puede falsificarlas y con eso reutilizar una licencia desde otra
 * red o bloquear la de un cliente legítimo.
 */

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F:]{2,45}$/;

/** IP verificada por la infraestructura, o null si no está disponible. */
export function verifiedClientIp(req: Request): string | null {
  const raw = (req.headers.get("cf-connecting-ip") || "").trim();
  if (!raw || raw.length > 45) return null;
  if (!IPV4.test(raw) && !IPV6.test(raw)) return null;
  return raw;
}

/** Clave de licencia normalizada y validada, o null si el formato es inválido. */
export function parseLicenseKey(value: unknown): string | null {
  const key = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,64}$/.test(key)) return null;
  return key;
}

/** Hostname saneado (solo caracteres válidos de host) o cadena vacía. */
export function parseHostname(value: unknown): string {
  const host = String(value ?? "").trim().slice(0, 200);
  return /^[A-Za-z0-9._:-]{0,200}$/.test(host) ? host : "";
}
