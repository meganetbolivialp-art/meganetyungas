import { describe, it, expect } from "vitest";
import { errorMessage } from "./error-message";

// Regla: el manejo de un fallo de router nunca puede volver a fallar.
describe("errorMessage", () => {
  it("devuelve el texto de un Error", () => {
    expect(errorMessage(new Error("circuit open"))).toBe("circuit open");
  });

  it("no falla cuando se lanza undefined o null", () => {
    expect(typeof errorMessage(undefined)).toBe("string");
    expect(errorMessage(undefined).length).toBeGreaterThan(0);
    expect(typeof errorMessage(null)).toBe("string");
    expect(errorMessage(null).length).toBeGreaterThan(0);
  });

  it("devuelve el texto cuando se lanza un string", () => {
    expect(errorMessage("sin respuesta")).toBe("sin respuesta");
  });

  it("lee .message en objetos que no son Error", () => {
    expect(errorMessage({ message: "timeout" })).toBe("timeout");
  });
});
