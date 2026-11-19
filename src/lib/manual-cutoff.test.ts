import { describe, expect, it } from "vitest";
import { addDaysToDate, canSelectManualCutoff, isManualCutoffDue, manualCutoffException } from "./manual-cutoff";

const dueInput = {
  serviceStatus: "active",
  serviceAutoSuspend: true,
  policyActive: true,
  policyAutoSuspend: true,
  dueDate: "2026-11-10",
  today: "2026-11-19",
  graceDays: 5,
};

describe("corte manual por deuda", () => {
  it("permite adelantar un corte vencido sin comprobar la hora programada", () => {
    expect(isManualCutoffDue(dueInput)).toBe(true);
  });

  it("no corta antes de terminar los días de gracia", () => {
    expect(isManualCutoffDue({ ...dueInput, dueDate: "2026-11-14" })).toBe(false);
  });

  it("no incluye servicios que ya están suspendidos", () => {
    expect(isManualCutoffDue({ ...dueInput, serviceStatus: "suspended" })).toBe(false);
  });

  it("calcula la fecha de corte después de los días de gracia", () => {
    expect(addDaysToDate("2026-11-10", 6)).toBe("2026-11-16");
  });
});

describe("excepciones del corte manual", () => {
  it("protege al cliente marcado como no cortar", () => {
    const exception = manualCutoffException({ dontCut: true, paymentPromiseUntil: null, today: "2026-11-19" });
    expect(exception).toBe("dont_cut");
    expect(canSelectManualCutoff(exception, false)).toBe(false);
    expect(canSelectManualCutoff(exception, true)).toBe(true);
  });

  it("protege una promesa vigente y permite forzarla explícitamente", () => {
    const exception = manualCutoffException({ dontCut: false, paymentPromiseUntil: "2026-11-19", today: "2026-11-19" });
    expect(exception).toBe("promise");
    expect(canSelectManualCutoff(exception, false)).toBe(false);
    expect(canSelectManualCutoff(exception, true)).toBe(true);
  });

  it("no bloquea una promesa que ya venció", () => {
    expect(manualCutoffException({ dontCut: false, paymentPromiseUntil: "2026-11-18", today: "2026-11-19" })).toBeNull();
  });
});
