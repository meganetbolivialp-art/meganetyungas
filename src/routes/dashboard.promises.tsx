import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin-layout";
import { listPaymentPromises, setPaymentPromise } from "@/lib/cutoffs.functions";
import { CalendarClock, CheckCircle2, XCircle, Search, DollarSign, ShieldCheck, Clock } from "lucide-react";

export const Route = createFileRoute("/dashboard/promises")({
  head: () => ({
    meta: [
      { title: "Promesas de pago — MikroSystem" },
      { name: "description", content: "Listado de clientes con promesa de pago activa o vencida." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PromisesPage,
});

function Kpi({ label, value, color, Icon }: { label: string; value: string | number; color: string; Icon: any }) {
  return (
    <div className="rounded-md border bg-card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-md grid place-items-center text-white" style={{ background: color }}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function PromisesPage() {
  const list = useServerFn(listPaymentPromises);
  const savePromise = useServerFn(setPaymentPromise);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["payment-promises"],
    queryFn: () => list(),
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.filter((r) => {
      if (filter === "active" && r.expired) return false;
      if (filter === "expired" && !r.expired) return false;
      if (!term) return true;
      return (
        r.full_name?.toLowerCase().includes(term) ||
        r.document?.toLowerCase().includes(term) ||
        r.phone?.toLowerCase().includes(term) ||
        r.city?.toLowerCase().includes(term)
      );
    });
  }, [data, q, filter]);

  const totals = useMemo(() => {
    const active = data.filter((r) => !r.expired).length;
    const expired = data.filter((r) => r.expired).length;
    const debt = data.reduce((a, r) => a + (Number(r.debt) || 0), 0);
    return { active, expired, debt, total: data.length };
  }, [data]);

  async function cancelPromise(clientId: string, name: string) {
    if (!confirm(`¿Cancelar la promesa de pago de ${name}?`)) return;
    try {
      await savePromise({ data: { clientId, until: null } });
      toast.success("Promesa cancelada");
      qc.invalidateQueries({ queryKey: ["payment-promises"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  async function extendPromise(clientId: string, days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const until = d.toISOString().slice(0, 10);
    try {
      await savePromise({ data: { clientId, until } });
      toast.success(`Promesa extendida hasta ${until}`);
      qc.invalidateQueries({ queryKey: ["payment-promises"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CalendarClock className="w-6 h-6 text-amber-600" />
          <div>
            <h1 className="text-2xl font-bold">Promesas de pago</h1>
            <p className="text-sm text-muted-foreground">
              Clientes con compromiso de pago registrado — protegidos temporalmente del corte automático.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total registradas" value={totals.total} color="#334155" Icon={CalendarClock} />
          <Kpi label="Activas" value={totals.active} color="#0ea5e9" Icon={ShieldCheck} />
          <Kpi label="Vencidas" value={totals.expired} color="#dc2626" Icon={Clock} />
          <Kpi label="Deuda involucrada" value={`Bs ${totals.debt.toFixed(2)}`} color="#f59e0b" Icon={DollarSign} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-2 rounded-md border bg-background text-sm"
              placeholder="Buscar por nombre, documento, teléfono o ciudad…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex rounded-md border overflow-hidden text-sm">
            {(["all", "active", "expired"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 ${filter === f ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {f === "all" ? "Todas" : f === "active" ? "Activas" : "Vencidas"}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-md border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Contacto</th>
                <th className="text-left px-3 py-2">Ciudad</th>
                <th className="text-right px-3 py-2">Deuda</th>
                <th className="text-center px-3 py-2">Vence</th>
                <th className="text-center px-3 py-2">Días</th>
                <th className="text-center px-3 py-2">Estado</th>
                <th className="text-right px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="text-center text-muted-foreground py-6">Cargando…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted-foreground py-6">Sin promesas registradas.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.client_id} className="border-t hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <Link to="/dashboard/clients/$clientId" params={{ clientId: r.client_id }} className="font-medium text-primary hover:underline">
                      {r.full_name}
                    </Link>
                    {r.document && <div className="text-xs text-muted-foreground">{r.document}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.phone ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.email ?? ""}</div>
                  </td>
                  <td className="px-3 py-2">{r.city ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    Bs {Number(r.debt).toFixed(2)}
                    {r.overdue_invoices > 0 && (
                      <div className="text-[11px] text-red-600">{r.overdue_invoices} vencida(s)</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center font-mono">{r.promise_until}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      r.expired ? "bg-red-100 text-red-700" :
                      r.days_left <= 2 ? "bg-amber-100 text-amber-700" :
                      "bg-emerald-100 text-emerald-700"
                    }`}>
                      {r.expired ? `-${Math.abs(r.days_left)}d` : `+${r.days_left}d`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.expired ? (
                      <span className="inline-flex items-center gap-1 text-red-600 text-xs font-semibold">
                        <XCircle className="w-3.5 h-3.5" /> Vencida
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Activa
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Link
                        to="/dashboard/cobrar" search={{}}
                        className="px-2 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700"
                        title="Cobrar"
                      >Cobrar</Link>
                      <button
                        onClick={() => extendPromise(r.client_id, 3)}
                        className="px-2 py-1 text-xs rounded border hover:bg-muted"
                        title="Extender 3 días"
                      >+3d</button>
                      <button
                        onClick={() => extendPromise(r.client_id, 7)}
                        className="px-2 py-1 text-xs rounded border hover:bg-muted"
                        title="Extender 7 días"
                      >+7d</button>
                      <button
                        onClick={() => cancelPromise(r.client_id, r.full_name)}
                        className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                        title="Cancelar promesa"
                      >Cancelar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
