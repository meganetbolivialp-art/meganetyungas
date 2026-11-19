// Mensaje seguro para cualquier valor lanzado (Error, string, null, undefined...).
// Usarlo dentro de `catch` evita que el propio manejo del error falle y
// convierta un fallo de un router en un 500 que deja la pantalla vacía.
export function errorMessage(e: unknown): string {
  if (e instanceof Error && typeof e.message === "string" && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  if (typeof e === "number" || typeof e === "bigint" || typeof e === "boolean") return String(e);
  if (e && typeof e === "object") {
    const any = e as { message?: unknown; error?: unknown };
    if (typeof any.message === "string" && any.message) return any.message;
    if (typeof any.error === "string" && any.error) return any.error;
    try {
      const j = JSON.stringify(e);
      if (j && j !== "{}") return j;
    } catch {
      /* objeto circular */
    }
  }
  return "error desconocido";
}
