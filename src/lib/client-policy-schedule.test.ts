import { describe, expect, it } from "vitest";
import { clientPolicySchedule } from "./client-policy-schedule";

const policy = { name: "TOTORA", invoice_day: 18, due_day: 20, cut_day: 20, cut_hour: 12, grace_days: 0, auto_suspend: true, is_active: true, cut_mode: "ip", notify_sms: false };

describe("ciclo real de la plantilla en la ficha", () => {
  it("refleja factura 18, pago 20 y corte 20 a las 12 aunque el cliente antes pagara el 5", () => {
    expect(clientPolicySchedule(policy, 5)).toEqual({ payment: "Día 20 de cada mes", invoice: "Día 18 de cada mes", cutoff: "Día 20 · 12:00" });
  });
  it("mantiene el día del cliente si la plantilla no define vencimiento", () => {
    expect(clientPolicySchedule({ ...policy, due_day: null }, 7).payment).toBe("Día 7 de cada mes");
  });
  it("no anuncia un corte cuando la plantilla desactiva el corte automático", () => {
    expect(clientPolicySchedule({ ...policy, auto_suspend: false }, 5).cutoff).toBe("Corte automático desactivado");
  });
});