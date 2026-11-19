// Decide si hoy toca generar automáticamente las facturas del mes.
export type AutoInvoiceSettings = { auto_enabled: boolean; generate_day: number; last_auto_run_month: string | null };

export function monthTag(date: { year: number; month: number }) {
  return `${date.year}-${String(date.month).padStart(2, "0")}`;
}

export function shouldAutoGenerateInvoices(s: AutoInvoiceSettings, today: { year: number; month: number; day: number }) {
  if (!s.auto_enabled) return false;
  if (today.day < s.generate_day) return false;
  return s.last_auto_run_month !== monthTag(today);
}

export function laPazToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}
