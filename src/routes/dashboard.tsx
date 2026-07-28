import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LicenseGate } from "@/components/license-gate";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <LicenseGate>
      <Outlet />
    </LicenseGate>
  ),
});
