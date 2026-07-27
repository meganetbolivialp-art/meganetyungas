import { createHmac, timingSafeEqual } from "node:crypto";

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

function secret(): string {
  const s = process.env.LICENSE_SIGNING_SECRET;
  if (!s) throw new Error("LICENSE_SIGNING_SECRET not set");
  return s;
}

export type LicensePayload = {
  key: string;
  plan: string;
  max_clients: number;
  max_routers: number;
  expires_at: string | null;
  bound_ip: string | null;
  iat: number; // issued
  exp: number; // token expiry (seconds unix)
};

export function signLicenseToken(payload: LicensePayload): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "MKS" })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(
    createHmac("sha256", secret()).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${sig}`;
}

export function verifyLicenseToken(token: string): LicensePayload | null {
  const [h, b, s] = token.split(".");
  if (!h || !b || !s) return null;
  const expected = createHmac("sha256", secret()).update(`${h}.${b}`).digest();
  const got = b64urlDecode(s);
  if (expected.length !== got.length) return null;
  if (!timingSafeEqual(expected, got)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(b).toString("utf8")) as LicensePayload;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
