export type ClientPolicySchedule = {
  name: string;
  invoice_day: number | null;
  due_day: number | null;
  cut_day: number | null;
  cut_hour: number;
  grace_days: number;
  auto_suspend: boolean;
  is_active: boolean;
  cut_mode: string;
  notify_sms: boolean;
};

export function clientPolicySchedule(policy: ClientPolicySchedule, billingDay: number) {
  const hour = `${String(policy.cut_hour).padStart(2, "0")}:00`;
  return {
    payment: `Día ${policy.due_day ?? billingDay} de cada mes`,
    invoice: policy.is_active && policy.invoice_day ? `Día ${policy.invoice_day} de cada mes` : "Generación manual",
    cutoff: !policy.is_active || !policy.auto_suspend ? "Corte automático desactivado"
      : policy.cut_day ? `Día ${policy.cut_day} · ${hour}`
        : `${policy.grace_days} días de gracia · ${hour}`,
  };
}