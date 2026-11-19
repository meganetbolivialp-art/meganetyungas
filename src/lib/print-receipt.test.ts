import { describe, expect, it } from "vitest";
import { buildReceiptHtml } from "./print-receipt";

describe("recibo térmico de pago", () => {
  it("usa papel térmico de 80 mm y abre la impresión automáticamente", () => {
    const html = buildReceiptHtml({ amount: 150, client_name: "Cliente de prueba" });
    expect(html).toContain("@page { size: 80mm auto;");
    expect(html).toContain("window.print()");
  });

  it("detalla todas las facturas y conserva el total cobrado", () => {
    const html = buildReceiptHtml({
      amount: 250,
      items: [
        { concept: "Internet octubre", amount: 150 },
        { concept: "Internet noviembre", amount: 100 },
      ],
      client_name: "María Pérez",
      method: "cash",
    });
    expect(html).toContain("Internet octubre");
    expect(html).toContain("Internet noviembre");
    expect(html).toContain("TOTAL PAGADO");
    expect(html).toContain("250,00");
    expect(html).toContain("Efectivo");
  });
});
