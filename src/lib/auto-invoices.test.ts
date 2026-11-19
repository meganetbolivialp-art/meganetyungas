import { describe, expect, it } from "vitest";
import { shouldAutoGenerateInvoices, laPazToday } from "./auto-invoices";

const base = { auto_enabled: true, generate_day: 5, last_auto_run_month: null };

describe("facturación automática", () => {
  it("no genera si está desactivada", () => {
    expect(shouldAutoGenerateInvoices({ ...base, auto_enabled: false }, { year: 2026, month: 11, day: 10 })).toBe(false);
  });
  it("no genera antes del día elegido", () => {
    expect(shouldAutoGenerateInvoices(base, { year: 2026, month: 11, day: 4 })).toBe(false);
  });
  it("genera desde el día elegido", () => {
    expect(shouldAutoGenerateInvoices(base, { year: 2026, month: 11, day: 5 })).toBe(true);
  });
  it("genera una sola vez por mes", () => {
    expect(shouldAutoGenerateInvoices({ ...base, last_auto_run_month: "2026-11" }, { year: 2026, month: 11, day: 20 })).toBe(false);
    expect(shouldAutoGenerateInvoices({ ...base, last_auto_run_month: "2026-11" }, { year: 2026, month: 12, day: 5 })).toBe(true);
  });
  it("usa la hora de Bolivia", () => {
    expect(laPazToday(new Date("2026-12-01T03:00:00Z"))).toEqual({ year: 2026, month: 11, day: 30 });
  });
});
