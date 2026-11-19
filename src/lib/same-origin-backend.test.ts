import { describe, it, expect } from "vitest";
import { rewriteBackendUrl } from "./same-origin-backend";
describe("rewriteBackendUrl", () => {
  it("VPN access uses current address", () => {
    expect(rewriteBackendUrl("http://192.168.100.10/auth/v1/token", "http://192.168.100.10", "http://159.89.50.108:9999"))
      .toBe("http://159.89.50.108:9999/auth/v1/token");
  });
  it("LAN access unchanged", () => {
    expect(rewriteBackendUrl("http://192.168.100.10/auth/v1/token", "http://192.168.100.10", "http://192.168.100.10"))
      .toBe("http://192.168.100.10/auth/v1/token");
  });
  it("public backend unchanged", () => {
    expect(rewriteBackendUrl("https://x.supabase.co/rest", "https://x.supabase.co", "http://1.2.3.4")).toBe("https://x.supabase.co/rest");
  });
});
