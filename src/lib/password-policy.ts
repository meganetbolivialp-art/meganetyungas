import { secureString, secureShuffle } from "@/lib/secure-random";
const COMMON_PASSWORD_PARTS = [
  "123456",
  "12345678",
  "123456789",
  "password",
  "qwerty",
  "admin",
  "administrator",
  "operador",
  "operator",
  "meganet",
  "mikrotik",
  "internet",
  "contraseña",
  "contrasena",
];

const ASCENDING_SEQUENCES = ["0123456789", "abcdefghijklmnopqrstuvwxyz"];
const DESCENDING_SEQUENCES = ["9876543210", "zyxwvutsrqponmlkjihgfedcba"];

export const PASSWORD_POLICY_MESSAGE =
  "La contraseña debe tener al menos 6 caracteres.";

export function getPasswordPolicyError(password: string) {
  const value = password.trim();
  if (value.length < 6) return PASSWORD_POLICY_MESSAGE;
  return null;
}

export function normalizePasswordAuthError(message: string) {
  const lower = message.toLowerCase();
  if (
    lower.includes("password") ||
    lower.includes("weak") ||
    lower.includes("guess") ||
    lower.includes("6 characters") ||
    lower.includes("pwned") ||
    lower.includes("leaked")
  ) {
    return PASSWORD_POLICY_MESSAGE;
  }
  return message;
}

export function generateStrongPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?";
  const required = ["M", "g", "7", "#"];
  const randomPart = secureString(10, alphabet).split("");
  return secureShuffle([...required, ...randomPart]).join("");
}