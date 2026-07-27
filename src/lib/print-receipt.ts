// Simple thermal-style receipt printer (opens new window and triggers print)
export interface ReceiptData {
  id?: string;
  paid_at?: string | Date;
  client_name?: string;
  client_document?: string;
  client_phone?: string;
  concept?: string;
  method?: string;
  reference?: string;
  amount: number;
  operator?: string;
  company?: { name?: string; nit?: string; address?: string; phone?: string };
}

const METHOD: Record<string, string> = {
  cash: "Efectivo", transfer: "Transferencia", qr: "QR", card: "Tarjeta", other: "Otro",
};

const bs = (n: number) =>
  `Bs ${Number(n ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function printReceipt(r: ReceiptData) {
  const company = r.company ?? {
    name: "MEGANET ISP",
    nit: "",
    address: "",
    phone: "",
  };
  const date = r.paid_at ? new Date(r.paid_at) : new Date();
  const dateStr = date.toLocaleString("es-BO", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Recibo ${r.id ?? ""}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; margin: 0; padding: 8px; width: 72mm; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .lg { font-size: 15px; }
  .xl { font-size: 18px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 2px 0; vertical-align: top; }
  .label { color: #333; }
  .total { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 6px 0; margin-top: 6px; font-size: 16px; font-weight: bold; }
  .footer { margin-top: 10px; font-size: 10px; text-align: center; }
  @media print { body { padding: 0; } .noprint { display: none; } }
  .btnbar { position: fixed; top: 8px; right: 8px; display: flex; gap: 6px; }
  .btnbar button { padding: 6px 12px; font-family: inherit; cursor: pointer; border: 1px solid #333; background: #fff; border-radius: 4px; }
</style></head><body>
<div class="btnbar noprint">
  <button onclick="window.print()">Imprimir</button>
  <button onclick="window.close()">Cerrar</button>
</div>
<div class="center bold xl">${escapeHtml(company.name ?? "")}</div>
${company.nit ? `<div class="center">NIT: ${escapeHtml(company.nit)}</div>` : ""}
${company.address ? `<div class="center">${escapeHtml(company.address)}</div>` : ""}
${company.phone ? `<div class="center">Tel: ${escapeHtml(company.phone)}</div>` : ""}
<hr>
<div class="center bold lg">RECIBO DE PAGO</div>
${r.id ? `<div class="center">Nº ${escapeHtml(String(r.id).slice(0, 8).toUpperCase())}</div>` : ""}
<div class="center">${dateStr}</div>
<hr>
<table>
  <tr><td class="label">Cliente:</td><td class="right bold">${escapeHtml(r.client_name ?? "—")}</td></tr>
  ${r.client_document ? `<tr><td class="label">Documento:</td><td class="right">${escapeHtml(r.client_document)}</td></tr>` : ""}
  ${r.client_phone ? `<tr><td class="label">Teléfono:</td><td class="right">${escapeHtml(r.client_phone)}</td></tr>` : ""}
</table>
<hr>
<table>
  <tr><td class="label">Concepto:</td><td class="right">${escapeHtml(r.concept ?? "Pago de servicio")}</td></tr>
  <tr><td class="label">Método:</td><td class="right">${escapeHtml(METHOD[r.method ?? ""] ?? r.method ?? "—")}</td></tr>
  ${r.reference ? `<tr><td class="label">Referencia:</td><td class="right">${escapeHtml(r.reference)}</td></tr>` : ""}
</table>
<div class="total">
  <table><tr><td>TOTAL PAGADO</td><td class="right">${bs(r.amount)}</td></tr></table>
</div>
${r.operator ? `<div style="margin-top:8px;font-size:11px">Atendido por: ${escapeHtml(r.operator)}</div>` : ""}
<div class="footer">
  ¡Gracias por su pago!<br>
  ${dateStr}
</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body></html>`;
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
