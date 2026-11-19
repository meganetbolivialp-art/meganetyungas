import { describe, it, expect } from "vitest";
import { diffRouterStatus } from "./router-alerts";
const r = (id: string, status: string) => ({ id, name: "R" + id, status });
describe("alertas de nodos", () => {
  it("la primera lectura no avisa", () => { expect(diffRouterStatus(null, [r("1", "offline")])).toEqual([]); });
  it("avisa cuando un router pasa de online a offline", () => {
    expect(diffRouterStatus([r("1", "online")], [r("1", "offline")])).toEqual([{ id: "1", name: "R1", kind: "down" }]);
  });
  it("avisa cuando vuelve a online", () => {
    expect(diffRouterStatus([r("1", "offline")], [r("1", "online")])).toEqual([{ id: "1", name: "R1", kind: "up" }]);
  });
  it("no repite si sigue caído", () => { expect(diffRouterStatus([r("1", "offline")], [r("1", "offline")])).toEqual([]); });
});
