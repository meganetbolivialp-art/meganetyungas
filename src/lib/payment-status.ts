export function clientStatusAfterReactivation(remainingSuspended: number): "active" | "suspended" {
  return remainingSuspended === 0 ? "active" : "suspended";
}

export function shouldReactivateAfterPayment(remainingOverdue: number): boolean {
  return remainingOverdue === 0;
}
