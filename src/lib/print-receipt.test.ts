import { describe, expect, it } from "vitest";
import { buildReceiptHtml, DEFAULT_RECEIPT_TEMPLATE } from "./print-receipt";

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

  it("aplica el logo, los datos y los textos personalizados", () => {
    const html = buildReceiptHtml({
      amount: 200,
      client_name: "María Pérez",
      template: {
        ...DEFAULT_RECEIPT_TEMPLATE,
        company_name: "MEGANET LA PAZ",
        logo_url: "data:image/png;base64,AAAA",
        nit: "123456789",
        address: "Av. Principal 123",
        phone: "70000000",
        receipt_title: "COMPROBANTE DE CAJA",
        footer_message: "Gracias por confiar en nosotros",
        legal_note: "Conserve este comprobante",
      },
    }, false);
    expect(html).toContain('class="logo grayscale"');
    expect(html).toContain("MEGANET LA PAZ");
    expect(html).toContain("NIT: 123456789");
    expect(html).toContain("COMPROBANTE DE CAJA");
    expect(html).toContain("Gracias por confiar en nosotros");
    expect(html).toContain("Conserve este comprobante");
  });

  it("permite ocultar documento, teléfono y operador", () => {
    const html = buildReceiptHtml({
      amount: 100,
      client_document: "998877",
      client_phone: "71112222",
      operator: "Cajero prueba",
      template: {
        ...DEFAULT_RECEIPT_TEMPLATE,
        show_client_document: false,
        show_client_phone: false,
        show_operator: false,
      },
    }, false);
    expect(html).not.toContain("998877");
    expect(html).not.toContain("71112222");
    expect(html).not.toContain("Cajero prueba");
  });
});
