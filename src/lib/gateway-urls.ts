// Validación de URLs de retorno de pasarelas de pago (evita redirección abierta).
export type CheckoutInput = { invoiceId: string; successUrl: string; cancelUrl: string };

function parseUrl(raw: string, label: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`URL de ${label} inválida`);
  }
  if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
    throw new Error(`URL de ${label} debe usar https`);
  }
  return u.toString();
}

export function safeReturnUrls(d: CheckoutInput): CheckoutInput {
  if (!d?.invoiceId) throw new Error("Factura requerida");
  return {
    invoiceId: d.invoiceId,
    successUrl: parseUrl(d.successUrl, "éxito"),
    cancelUrl: parseUrl(d.cancelUrl, "cancelación"),
  };
}

// Se ejecuta solo en el servidor: exige que el retorno apunte al propio sitio.
export function assertSameSite(urls: string[], allowedOrigin?: string) {
  const allowed = (allowedOrigin ?? "").trim();
  if (!allowed) return;
  let allowedHost: string;
  try {
    allowedHost = new URL(allowed).host;
  } catch {
    return;
  }
  for (const raw of urls) {
    if (new URL(raw).host !== allowedHost) {
      throw new Error("URL de retorno fuera del dominio permitido");
    }
  }
}
