import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";
import {
  Users, Mail, CreditCard, Code2, User, LifeBuoy, Upload, Repeat,
  LayoutTemplate, Signpost, MessageSquare, Cloud, Package, Building2,
  ClipboardList, Users2, Wallet, RefreshCw, Route as RouteIcon, Wifi,
  Server, ScissorsSquare,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Ajustes | Meganet" },
      { name: "description", content: "Panel de configuración del sistema Meganet." },
    ],
  }),
});

type Tile = { to: string; label: string; icon: any; color?: string };

// Solo módulos realmente implementados en el sistema.
const TILES: Tile[] = [
  { to: "/dashboard/plans", label: "Planes de internet", icon: Wifi },
  { to: "/dashboard/employees", label: "Empleados", icon: Users },
  { to: "/dashboard/messaging", label: "Mensajería", icon: MessageSquare },
  { to: "/dashboard/gateways", label: "Pasarelas de pago", icon: CreditCard },
  { to: "/dashboard/templates", label: "Plantillas de mensajes", icon: Code2 },

  { to: "/dashboard/cutoff-policies", label: "Plantillas de corte", icon: ScissorsSquare },
  { to: "/dashboard/bulk-templates", label: "Plantillas de cambios", icon: LayoutTemplate },
  { to: "/dashboard/bulk-router", label: "Cambios Masivos", icon: Repeat },
  { to: "/dashboard/router-sync", label: "Sincronizar PPP", icon: RefreshCw },
  { to: "/dashboard/settings-portal", label: "Portal de corte", icon: Signpost },

  { to: "/dashboard/portal-users", label: "Cuentas Portal", icon: User },
  { to: "/dashboard/tickets", label: "Tickets", icon: LifeBuoy },
  { to: "/dashboard/branches", label: "Sucursales", icon: Building2 },
  { to: "/dashboard/inventory", label: "Inventario", icon: Package },
  { to: "/dashboard/work-orders", label: "Órdenes de trabajo", icon: ClipboardList },

  { to: "/dashboard/leads", label: "Leads / CRM", icon: Users2 },
  { to: "/dashboard/payroll", label: "Nómina", icon: Wallet },
  { to: "/dashboard/vouchers", label: "Hotspot", icon: Wifi },
  { to: "/dashboard/routers", label: "Routers", icon: Server },
  

  { to: "/dashboard/jobs", label: "Tareas automáticas", icon: RouteIcon },
  { to: "/dashboard/clients", label: "Importar clientes", icon: Upload },
];

function SettingsPage() {
  return (
    <AdminLayout>
      <div className="p-4 md:p-8">
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Ajustes</h1>
          <p className="text-sm text-muted-foreground">Configuración general del sistema Meganet.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-8">
          {TILES.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.label}
                to={t.to}
                className="group flex flex-col items-center text-center"
              >
                <div className="relative w-[110px] h-[110px] md:w-[120px] md:h-[120px] rounded-full bg-white shadow-[0_4px_18px_-4px_rgba(15,23,42,0.15)] ring-1 ring-slate-200/70 flex items-center justify-center transition-all duration-200 group-hover:shadow-[0_10px_28px_-6px_rgba(15,23,42,0.25)] group-hover:-translate-y-0.5 group-hover:ring-primary/40">
                  <Icon className={`w-12 h-12 md:w-14 md:h-14 ${t.color ?? "text-slate-700"}`} strokeWidth={1.4} />
                </div>
                <div className="mt-3 text-[13px] md:text-sm font-medium text-slate-700 leading-tight max-w-[130px]">
                  {t.label}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}

