import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin-layout";
import { listAudit } from "@/lib/audit.functions";
import { Search, Download } from "lucide-react";

export const Route = createFileRoute("/dashboard/audit")({
  head: () => ({ meta: [{ title: "Auditoría — MegaNet Admin" }, { name: "robots", content: "noindex" }] }),
  component: AuditPage,
});

const ACTION_COLORS: Record<string, string> = {
  login: "#16a394", logout: "#94a3b8",
  create: "#2e9cd6", update: "#f59e0b", delete: "#ef4444",
  suspend: "#ef4444", reactivate: "#16a394",
  payment: "#8b5cf6", invoice: "#0891b2",
};

function tone(a: string) {
  for (const k of Object.keys(ACTION_COLORS)) if (a.toLowerCase().includes(k)) return ACTION_COLORS[k];
  return "#64748b";
}

function AuditPage() {
  const fetchLogs = useServerFn(listAudit);
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchLogs({ data: { limit: 200, q: q || undefined } })
      .then((r: any) => setRows(r))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const exportCsv = () => {
    const header = "fecha,usuario,accion,entidad,entidad_id,detalle\n";
    const body = rows.map(r =>
      [r.created_at, r.user_email ?? "", r.action, r.entity ?? "", r.entity_id ?? "", JSON.stringify(r.detail ?? {})]
        .map(x => `"${String(x).replaceAll('"', '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `auditoria-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Registro de auditoría</h1>
          <p className="text-sm text-muted-foreground">Acciones importantes realizadas por operadores.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && load()}
              placeholder="Buscar usuario, acción, entidad..."
              className="pl-8 pr-3 py-1.5 text-sm border rounded bg-background w-72" />
          </div>
          <button onClick={load} className="mw-btn mw-btn-primary h-8 text-xs">Buscar</button>
          <button onClick={exportCsv} className="mw-btn mw-btn-outline h-8 text-xs"><Download className="w-3 h-3" />CSV</button>
        </div>
      </div>

      <div className="bg-card border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Usuario</th>
              <th className="px-3 py-2 font-medium">Acción</th>
              <th className="px-3 py-2 font-medium">Entidad</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Cargando...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Sin registros</td></tr>}
            {rows.map(r => (
              <tr key={r.id} className="border-t hover:bg-muted/30 align-top">
                <td className="px-3 py-2 text-[12px] text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString("es-BO")}</td>
                <td className="px-3 py-2 text-[12px]">{r.user_email ?? "—"}</td>
                <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-[11px] text-white font-semibold" style={{ background: tone(r.action) }}>{r.action}</span></td>
                <td className="px-3 py-2 text-[12px]">{r.entity ?? "—"}{r.entity_id ? <span className="text-muted-foreground"> · {r.entity_id.slice(0, 8)}</span> : null}</td>
                <td className="px-3 py-2 text-[11px] text-muted-foreground max-w-md truncate">{r.detail ? JSON.stringify(r.detail) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
