/**
 * Generadores de aleatoriedad criptográfica.
 * Nunca usar Math.random() para secretos (contraseñas, vouchers, códigos 2FA).
 */

const DEFAULT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Cadena aleatoria segura sobre un alfabeto dado (rechazo de sesgo por módulo). */
export function secureString(length: number, alphabet: string = DEFAULT_ALPHABET): string {
  const max = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = "";
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b >= max) continue;
      out += alphabet[b % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Entero aleatorio seguro en [min, max]. */
export function secureInt(min: number, max: number): number {
  const range = max - min + 1;
  const limit = Math.floor(0xffffffff / range) * range;
  const buf = new Uint32Array(1);
  let v: number;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limit);
  return min + (v % range);
}

/** Mezcla segura (Fisher-Yates con crypto). */
export function secureShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
