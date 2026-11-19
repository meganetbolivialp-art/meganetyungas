import { describe, expect, it } from "vitest";
import { clientStatusAfterReactivation } from "./payment-status";

describe("estado del cliente después de reactivar servicios", () => {
  it("queda activo cuando ya no tiene servicios suspendidos", () => {
    expect(clientStatusAfterReactivation(0)).toBe("active");
  });

  it("sigue suspendido mientras otro servicio permanezca suspendido", () => {
    expect(clientStatusAfterReactivation(2)).toBe("suspended");
  });
});
