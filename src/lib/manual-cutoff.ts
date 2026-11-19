export type ManualCutoffException = "dont_cut" | "promise" | null;

export function isManualCutoffDue(input: {
  serviceStatus: string;
  serviceAutoSuspend: boolean;
  policyActive: boolean;
  policyAutoSuspend: boolean;
  dueDate: string;
  today: string;
  graceDays: number;
}) {
  if (input.serviceStatus !== "active" || !input.serviceAutoSuspend) return false;
  if (!input.policyActive || !input.policyAutoSuspend) return false;
  const due = Date.parse(`${input.dueDate}T00:00:00Z`);
  const today = Date.parse(`${input.today}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(today)) return false;
  const daysPastDue = Math.floor((today - due) / 86_400_000);
  return daysPastDue > input.graceDays;
}

export function manualCutoffException(input: {
  dontCut: boolean;
  paymentPromiseUntil: string | null;
  today: string;
}): ManualCutoffException {
  if (input.dontCut) return "dont_cut";
  if (input.paymentPromiseUntil && input.paymentPromiseUntil >= input.today) return "promise";
  return null;
}

export function canSelectManualCutoff(exception: ManualCutoffException, forceExceptions: boolean) {
  return exception === null || forceExceptions;
}

export function addDaysToDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
