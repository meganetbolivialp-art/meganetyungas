import { describe, expect, it } from "vitest";
import {
  buildRouterInstallScript,
  resolveVpnType,
  type OvpnProvisionFiles,
} from "./router-oneclick.server";

const provision: OvpnProvisionFiles = {
  ca: "CA_DE_PRUEBA",
  crt: "CERT_DE_PRUEBA",
  key: "KEY_DE_PRUEBA",
};

function buildOvpnScript() {
  return buildRouterInstallScript({
    name: "Router Prueba",
    slug: "routerprueba",
    assignedIp: "10.10.84.20",
    vpsHost: "vpn.example.com",
    apiUser: "panel",
    apiPass: "clave-de-prueba",
    provision,
    vpnType: "ovpn",
  });
}

describe("configuración OpenVPN del router", () => {
  it("usa OpenVPN como conexión predeterminada", () => {
    expect(resolveVpnType(undefined)).toBe("ovpn");
  });

  it("genera un cliente OpenVPN para RouterOS v7", () => {
    const script = buildOvpnScript();
    expect(script).toContain("/interface ovpn-client add name=ovpn-panel");
    expect(script).not.toContain("/interface l2tp-client add");
  });

  it("permite la API únicamente por la misma interfaz OpenVPN creada", () => {
    expect(buildOvpnScript()).toContain("dst-port=8728 in-interface=ovpn-panel");
  });
});
