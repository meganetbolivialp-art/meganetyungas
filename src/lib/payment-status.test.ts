import { describe, expect, it } from "vitest";
import { clientStatusAfterReactivation, shouldReactivateAfterPayment } from "./payment-status";

describe("estado del cliente después de reactivar servicios", () => {
  it("queda activo cuando ya no tiene servicios suspendidos", () => {
    expect(clientStatusAfterReactivation(0)).toBe("active");
  });

  it("sigue suspendido mientras otro servicio permanezca suspendido", () => {
    expect(clientStatusAfterReactivation(2)).toBe("suspended");
  });
});

describe("reactivación automática por pago", () => {
  it("reactiva cuando el pago cancela la última factura vencida", () => {
    expect(shouldReactivateAfterPayment(0)).toBe(true);
  });

  it("mantiene el corte cuando todavía queda otra factura vencida", () => {
    expect(shouldReactivateAfterPayment(1)).toBe(false);
  });
});
