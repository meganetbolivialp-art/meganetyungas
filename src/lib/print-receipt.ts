export interface ReceiptItem {
  concept: string;
  amount: number;
}

export interface ReceiptTemplate {
  company_name: string;
  logo_url: string | null;
  nit: string;
  address: string;
  phone: string;
  receipt_title: string;
  footer_message: string;
  legal_note: string;
  show_logo: boolean;
  grayscale_logo: boolean;
  show_client_document: boolean;
  show_client_phone: boolean;
  show_operator: boolean;
}

export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplate = {
  company_name: "MEGANET ISP",
  logo_url: null,
  nit: "",
  address: "",
  phone: "",
  receipt_title: "RECIBO DE PAGO",
  footer_message: "¡Gracias por su pago!",
  legal_note: "Documento generado electrónicamente",
  show_logo: true,
  grayscale_logo: true,
  show_client_document: true,
  show_client_phone: true,
  show_operator: true,
};

export interface ReceiptData {
  id?: string;
  paid_at?: string | Date;
  client_name?: string;
  client_document?: string;
  client_phone?: string;
  concept?: string;
  items?: ReceiptItem[];
  method?: string;
  reference?: string;
  amount: number;
  operator?: string;
  company?: { name?: string; nit?: string; address?: string; phone?: string };
  template?: ReceiptTemplate;
}

const METHOD: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  qr: "QR",
  card: "Tarjeta",
  other: "Otro",
};

const bs = (n: number) =>
  `Bs ${Number(n ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function buildReceiptHtml(r: ReceiptData, autoPrint = true) {
  const template: ReceiptTemplate = r.template
    ? { ...DEFAULT_RECEIPT_TEMPLATE, ...r.template }
    : {
        ...DEFAULT_RECEIPT_TEMPLATE,
        company_name: r.company?.name ?? DEFAULT_RECEIPT_TEMPLATE.company_name,
        nit: r.company?.nit ?? "",
        address: r.company?.address ?? "",
        phone: r.company?.phone ?? "",
      };
  const date = r.paid_at ? new Date(r.paid_at) : new Date();
  const dateStr = date.toLocaleString("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const items = r.items?.length
    ? r.items
    : [{ concept: r.concept ?? "Pago de servicio", amount: r.amount }];
  const logoUrl = template.show_logo ? safeImageUrl(template.logo_url) : null;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Recibo ${escapeHtml(r.id ?? "")}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.35; color: #000; background: #fff; margin: 0; padding: 8px; width: 72mm; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .logo { display: block; width: auto; max-width: 58mm; max-height: 22mm; object-fit: contain; margin: 0 auto 3mm; }
  .grayscale { filter: grayscale(1) contrast(1.2); }
  .brand { text-align: center; font-size: 19px; line-height: 1.15; font-weight: 800; letter-spacing: .4px; overflow-wrap: anywhere; }
  .company { margin-top: 2px; text-align: center; font-size: 10px; overflow-wrap: anywhere; }
  .rule { border: 0; border-top: 1px dashed #000; margin: 7px 0; }
  .receipt-title { border: 2px solid #000; padding: 5px 3px; margin: 7px 0; text-align: center; font-size: 15px; font-weight: 800; letter-spacing: .7px; }
  .number { text-align: center; font-family: 'Courier New', monospace; font-size: 12px; font-weight: 700; }
  .date { text-align: center; font-size: 10px; }
  .section { margin: 5px 0 2px; font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  td { padding: 2px 0; vertical-align: top; }
  .concept { padding-right: 7px; overflow-wrap: anywhere; }
  .amount { white-space: nowrap; font-family: 'Courier New', monospace; font-size: 11px; }
  .label { color: #222; }
  .value { overflow-wrap: anywhere; }
  .item td { border-bottom: 1px dotted #777; padding: 4px 0; }
  .total { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 6px 0; margin-top: 7px; font-size: 15px; font-weight: 800; }
  .operator { margin-top: 7px; font-size: 10px; }
  .footer { margin-top: 9px; padding-top: 7px; border-top: 1px dashed #000; text-align: center; }
  .thanks { font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
  .legal { margin-top: 4px; font-size: 9px; overflow-wrap: anywhere; }
  @media print { body { padding: 0; } .noprint { display: none; } }
  .btnbar { position: fixed; top: 8px; right: 8px; display: flex; gap: 6px; }
  .btnbar button { padding: 6px 12px; font-family: inherit; cursor: pointer; border: 1px solid #333; background: #fff; border-radius: 4px; }
</style></head><body>
${autoPrint ? `<div class="btnbar noprint">
  <button onclick="window.print()">Imprimir</button>
  <button onclick="window.close()">Cerrar</button>
</div>` : ""}
${logoUrl ? `<img class="logo${template.grayscale_logo ? " grayscale" : ""}" src="${escapeHtml(logoUrl)}" alt="Logo">` : ""}
<div class="brand">${escapeHtml(template.company_name)}</div>
${template.nit ? `<div class="company">NIT: ${escapeHtml(template.nit)}</div>` : ""}
${template.address ? `<div class="company">${multiline(template.address)}</div>` : ""}
${template.phone ? `<div class="company">Tel: ${escapeHtml(template.phone)}</div>` : ""}
<div class="receipt-title">${escapeHtml(template.receipt_title)}</div>
${r.id ? `<div class="number">Nº ${escapeHtml(String(r.id).slice(0, 8).toUpperCase())}</div>` : ""}
<div class="date">${dateStr}</div>
<hr class="rule">
<div class="section">Datos del cliente</div>
<table>
  <tr><td class="label">Nombre:</td><td class="right bold value">${escapeHtml(r.client_name ?? "—")}</td></tr>
  ${template.show_client_document && r.client_document ? `<tr><td class="label">Documento:</td><td class="right value">${escapeHtml(r.client_document)}</td></tr>` : ""}
  ${template.show_client_phone && r.client_phone ? `<tr><td class="label">Teléfono:</td><td class="right value">${escapeHtml(r.client_phone)}</td></tr>` : ""}
</table>
<hr class="rule">
<div class="section">Detalle del pago</div>
<table>
  ${items.map((item) => `<tr class="item"><td class="concept">${escapeHtml(item.concept)}</td><td class="right amount">${bs(item.amount)}</td></tr>`).join("")}
</table>
<table>
  <tr><td class="label">Método:</td><td class="right value">${escapeHtml(METHOD[r.method ?? ""] ?? r.method ?? "—")}</td></tr>
  ${r.reference ? `<tr><td class="label">Referencia:</td><td class="right value">${escapeHtml(r.reference)}</td></tr>` : ""}
</table>
<div class="total">
  <table><tr><td>TOTAL PAGADO</td><td class="right amount">Bs ${Number(r.amount).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr></table>
</div>
${template.show_operator && r.operator ? `<div class="operator">Atendido por: <strong>${escapeHtml(r.operator)}</strong></div>` : ""}
<div class="footer">
  <div class="thanks">${multiline(template.footer_message)}</div>
  ${template.legal_note ? `<div class="legal">${multiline(template.legal_note)}</div>` : ""}
  <div class="legal">${dateStr}</div>
</div>
${autoPrint ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>` : ""}
</body></html>`;
}

// Reimpresión desde el historial o prueba del diseño: abre una ventana e inicia la impresión.
export function printReceipt(r: ReceiptData) {
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return false;
  w.document.open();
  w.document.write(buildReceiptHtml(r));
  w.document.close();
  return true;
}

function safeImageUrl(value: string | null) {
  const url = value?.trim() ?? "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
  return null;
}

function multiline(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
