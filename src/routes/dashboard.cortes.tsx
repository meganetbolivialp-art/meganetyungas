import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { ShieldOff, Activity, ShieldCheck, BarChart3 } from "lucide-react";
import { CutoffsPageContent } from "./dashboard.cutoffs";
import { MonitorPageContent } from "./dashboard.cortes-monitor";
import { CutoffPoliciesPageContent } from "./dashboard.cutoff-policies";
import { ReportsPageContent } from "./dashboard.reportes-cortes";

export const Route = createFileRoute("/dashboard/cortes")({
  head: () => ({
    meta: [
      { title: "Cortes — MikroSystem" },
      { name: "description", content: "Panel unificado de cortes: morosos, monitor en vivo, plantillas y reportes." },
      { property: "og:title", content: "Cortes — MikroSystem" },
      { property: "og:description", content: "Panel unificado de cortes: morosos, monitor en vivo, plantillas y reportes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CortesUnified,
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (s.tab as string) ?? "morosos",
  }),
});

type TabKey = "morosos" | "monitor" | "plantillas" | "reportes";

const TABS: { key: TabKey; label: string; short: string; Icon: any; color: string }[] = [
  { key: "morosos",    label: "Cortes / Morosos",  short: "Morosos",   Icon: ShieldOff,    color: "text-red-500" },
  { key: "monitor",    label: "Monitor en vivo",   short: "Monitor",   Icon: Activity,     color: "text-emerald-500" },
  { key: "plantillas", label: "Plantillas",        short: "Plantillas",Icon: ShieldCheck,  color: "text-indigo-500" },
  { key: "reportes",   label: "Reportes",          short: "Reportes",  Icon: BarChart3,    color: "text-amber-500" },
];

function CortesUnified() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [tab, setTab] = useState<TabKey>((search.tab as TabKey) || "morosos");

  const change = (k: TabKey) => {
    setTab(k);
    navigate({ search: { tab: k }, replace: true });
  };

  return (
    <AdminLayout>
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="px-4 md:px-6 pt-4">
          <h1 className="text-lg md:text-2xl font-bold">Cortes</h1>
          <p className="text-xs md:text-sm text-muted-foreground mb-3">
            Gestión unificada de cortes automáticos, monitor en tiempo real, plantillas y reportes.
          </p>
          <div className="flex gap-1 overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 pb-2 scrollbar-hide">
            {TABS.map(({ key, label, short, Icon, color }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
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

      <div>
        {tab === "morosos"    && <CutoffsPageContent />}
        {tab === "monitor"    && <MonitorPageContent />}
        {tab === "plantillas" && <CutoffPoliciesPageContent />}
        {tab === "reportes"   && <ReportsPageContent />}
      </div>
    </AdminLayout>
  );
}
