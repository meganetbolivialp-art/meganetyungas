import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin-layout";
import { ShieldOff, Activity, ShieldCheck, BarChart3, DollarSign, CalendarClock } from "lucide-react";
import { CutoffsPageContent } from "./dashboard.cutoffs";
import { MonitorPageContent } from "./dashboard.cortes-monitor";
import { CutoffPoliciesPageContent } from "./dashboard.cutoff-policies";
import { ReportsPageContent } from "./dashboard.reportes-cortes";
import { CobrarPageContent } from "./dashboard.cobrar";
import { PromisesPageContent } from "./dashboard.promises";

export const Route = createFileRoute("/dashboard/cortes")({
  head: () => ({
    meta: [
      { title: "Cobros y cortes — MikroSystem" },
      { name: "description", content: "Cobros, suspensiones, reactivaciones y promesas de pago en un solo lugar." },
      { property: "og:title", content: "Cobros y cortes — MikroSystem" },
      { property: "og:description", content: "Gestiona la deuda y el estado del servicio de cada cliente." },
      { name: "robots", content: "noindex" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CortesUnified,
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
    clientId: typeof s.clientId === "string" ? s.clientId : undefined,
  }),
});

type TabKey = "cobrar" | "morosos" | "promesas" | "monitor" | "plantillas" | "reportes";

const TABS: { key: TabKey; label: string; short: string; Icon: any; color: string }[] = [
  { key: "cobrar", label: "Cobrar", short: "Cobrar", Icon: DollarSign, color: "text-primary" },
  { key: "morosos", label: "Cortes / Morosos", short: "Cortes", Icon: ShieldOff, color: "text-destructive" },
  { key: "promesas", label: "Promesas de pago", short: "Promesas", Icon: CalendarClock, color: "text-amber-500" },
  { key: "monitor", label: "Monitor en vivo", short: "Monitor", Icon: Activity, color: "text-emerald-500" },
  { key: "plantillas", label: "Plantillas", short: "Plantillas", Icon: ShieldCheck, color: "text-primary" },
  { key: "reportes", label: "Reportes", short: "Reportes", Icon: BarChart3, color: "text-amber-500" },
];

function CortesUnified() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: TabKey = TABS.some((t) => t.key === search.tab) ? search.tab as TabKey : "cobrar";

  const change = (key: TabKey) => {
    navigate({
      search: (prev) => ({ ...prev, tab: key, clientId: key === "cobrar" ? prev.clientId : undefined }),
      replace: true,
    });
  };

  return (
    <AdminLayout>
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b mb-4">
        <div className="px-1 md:px-2 pt-1">
          <h1 className="text-lg md:text-2xl font-bold">Cobros y cortes</h1>
          <p className="text-xs md:text-sm text-muted-foreground mb-3">
            Busca un cliente, registra su pago y reactiva su servicio desde el mismo lugar.
          </p>
          <div role="tablist" aria-label="Cobros y cortes" className="flex gap-1 overflow-x-auto -mx-1 md:mx-0 px-1 md:px-0 pb-2 scrollbar-hide">
            {TABS.map(({ key, label, short, Icon, color }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => change(key)}
                  className={
                    "shrink-0 flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-all border " +
                    (active
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card hover:bg-muted border-border text-foreground/80")
                  }
                >
                  <Icon className={"w-4 h-4 " + (active ? "text-primary-foreground" : color)} />
                  <span className="md:hidden">{short}</span>
                  <span className="hidden md:inline">{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div role="tabpanel">
        {tab === "cobrar" && <CobrarPageContent preselectId={search.clientId} />}
        {tab === "morosos" && <CutoffsPageContent />}
        {tab === "promesas" && <PromisesPageContent />}
        {tab === "monitor" && <MonitorPageContent />}
        {tab === "plantillas" && <CutoffPoliciesPageContent />}
        {tab === "reportes" && <ReportsPageContent />}
      </div>
    </AdminLayout>
  );
}
