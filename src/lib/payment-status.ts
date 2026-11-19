export function clientStatusAfterReactivation(remainingSuspended: number): "active" | "suspended" {
  return remainingSuspended === 0 ? "active" : "suspended";
}
