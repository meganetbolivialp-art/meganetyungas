import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Pencil, Zap, Loader2, Search, Maximize2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { syncPlanToRouters } from "@/lib/isp.functions";
import { deletePlan } from "@/lib/plans.functions";

export const Route = createFileRoute("/dashboard/plans")({
  head: () => ({
    meta: [
      { title: "Servicios de Internet — MikroSystem ISP" },
      { name: "description", content: "Catálogo de perfiles PPP y planes de internet." },
      { property: "og:title", content: "Servicios de Internet" },
      { property: "og:description", content: "Gestión de perfiles PPP." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlansPage,
});

type Plan = {
  id: string; name: string; download_mbps: number; upload_mbps: number; price: number;
  description: string | null; active: boolean;
  mikrotik_profile_name: string | null; burst_enabled: boolean; synced_at: string | null;
};

type PlanUsage = { active: number; suspended: number; total: number; leads: number; subscriptions: number };

type SortKey = "id" | "name" | "download_mbps" | "upload_mbps" | "price";

function PlansPage() {
  const [rows, setRows] = useState<Plan[]>([]);
  const [counts, setCounts] = useState<Record<string, PlanUsage>>({});
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(15);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editing, setEditing] = useState<Plan | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const syncFn = useServerFn(syncPlanToRouters);
  const deletePlanFn = useServerFn(deletePlan);

  const load = async () => {
    const [{ data: plansData }, { data: svcData }, { data: leadsData }, { data: subsData }] = await Promise.all([
      supabase.from("plans").select("*").order("name"),
      supabase.from("services").select("plan_id,status"),
      supabase.from("leads").select("interested_plan_id"),
      supabase.from("subscriptions").select("plan_id"),
    ]);
    setRows((plansData as Plan[]) ?? []);
    const blank = (): PlanUsage => ({ active: 0, suspended: 0, total: 0, leads: 0, subscriptions: 0 });
    const map: Record<string, PlanUsage> = {};
    (svcData ?? []).forEach((s: any) => {
      if (!s.plan_id) return;
      const c = map[s.plan_id] ?? blank();
      c.total++;
      if (s.status === "active") c.active++;
      else if (s.status === "suspended") c.suspended++;
      map[s.plan_id] = c;
    });
    (leadsData ?? []).forEach((l: any) => {
      if (!l.interested_plan_id) return;
      const c = map[l.interested_plan_id] ?? blank();
      c.leads++;
      map[l.interested_plan_id] = c;
    });
    (subsData ?? []).forEach((s: any) => {
      if (!s.plan_id) return;
      const c = map[s.plan_id] ?? blank();
      c.subscriptions++;
      map[s.plan_id] = c;
    });
    setCounts(map);
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    const c = counts[id];
    if (c && (c.total > 0 || c.subscriptions > 0)) {
      const parts = [];
      if (c.total > 0) parts.push(`${c.total} servicio(s)`);
      if (c.subscriptions > 0) parts.push(`${c.subscriptions} suscripción(es)`);
      toast.error(`No se puede eliminar: tiene ${parts.join(" y ")} asignado(s). Reasigná esos clientes primero.`);
      return;
    }
    const note = c && c.leads > 0 ? `\n\nTiene ${c.leads} lead(s) interesado(s); se quitará ese enlace y el plan se eliminará igual.` : "";
    if (!confirm(`¿Eliminar plan?${note}`)) return;
    try {
      const res = await deletePlanFn({ data: { planId: id } });
      const cleared = res.clearedLeads > 0 ? ` (${res.clearedLeads} lead(s) liberado(s))` : "";
      toast.success(`Plan eliminado${cleared}`);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el plan");
    }
  };

  const doSync = async (p: Plan) => {
    setSyncing(s => ({ ...s, [p.id]: true }));
    try {
      const res: any = await syncFn({ data: { planId: p.id } });
      const ok = res.results.filter((r: any) => r.ok).length;
      toast.success(`"${res.profileName}" sync en ${ok}/${res.results.length} routers`);
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSyncing(s => ({ ...s, [p.id]: false })); }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = rows.filter(p =>
      !s || p.name.toLowerCase().includes(s) || (p.mikrotik_profile_name ?? "").toLowerCase().includes(s)
    );
    list = [...list].sort((a, b) => {
      const av = a[sortKey] as any, bv = b[sortKey] as any;
      const cmp = typeof av === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rows, q, sortKey, sortDir]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  return (
    <AdminLayout title="" subtitle="">
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-sky-500 text-white">
          <h2 className="font-semibold text-sm">Servicios de internet</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => document.documentElement.requestFullscreen?.()} className="p-1 rounded hover:bg-white/10" title="Pantalla completa">
              <Maximize2 className="w-4 h-4" />
            </button>
            <button onClick={load} className="p-1 rounded hover:bg-white/10" title="Recargar">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(+e.target.value); setPage(1); }}
              className="px-2 py-1.5 rounded border bg-background text-sm"
            >
              {[10, 15, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-500 hover:bg-sky-600 text-white text-sm"
            >
              <Plus className="w-4 h-4" /> Nuevo
            </button>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Buscar..."
              className="w-full pl-8 pr-3 py-1.5 rounded border bg-background text-sm"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <Th onClick={() => toggleSort("id")} active={sortKey === "id"} dir={sortDir}>ID</Th>
                <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>Nombre</Th>
                <Th onClick={() => toggleSort("download_mbps")} active={sortKey === "download_mbps"} dir={sortDir} align="right">Descarga Kbps</Th>
                <Th onClick={() => toggleSort("upload_mbps")} active={sortKey === "upload_mbps"} dir={sortDir} align="right">Subida Kbps</Th>
                <Th onClick={() => toggleSort("price")} active={sortKey === "price"} dir={sortDir} align="right">Precio</Th>
                <th className="text-center px-3 py-2.5 font-medium">Activos</th>
                <th className="text-center px-3 py-2.5 font-medium">Suspendidos</th>
                <th className="text-right px-3 py-2.5 font-medium w-24"></th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">Sin resultados</td></tr>
              ) : paged.map((p, i) => (
                <tr key={p.id} className={`border-b hover:bg-muted/30 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                  <td className="px-3 py-2.5 text-muted-foreground">{start + i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{p.name}</span>
                      {!p.active && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-500 text-white">
                          Desactivado
                        </span>
                      )}
                      {p.burst_enabled && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-sky-500 text-white">
                          Burst
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">{p.mikrotik_profile_name ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{(p.download_mbps * 1000).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{(p.upload_mbps * 1000).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">Bs {Number(p.price).toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex items-center justify-center min-w-7 px-2 py-0.5 rounded-full bg-teal-500 text-white text-xs font-semibold">{counts[p.id]?.active ?? 0}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex items-center justify-center min-w-7 px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-semibold">{counts[p.id]?.suspended ?? 0}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => doSync(p)}
                        disabled={syncing[p.id]}
                        className="p-1.5 rounded hover:bg-sky-500/10 text-sky-600 disabled:opacity-50"
                        title="Sync routers"
                      >
                        {syncing[p.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => { setEditing(p); setShowForm(true); }}
                        className="p-1.5 rounded hover:bg-muted"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => remove(p.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t text-sm">
          <div className="text-muted-foreground">
            Mostrando de {total === 0 ? 0 : start + 1} al {Math.min(start + pageSize, total)} de un total de {total}
          </div>
          <Pager page={currentPage} totalPages={totalPages} onChange={setPage} />
        </div>
      </div>

      {showForm && (
        <PlanForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}
    </AdminLayout>
  );
}

function Th({ children, onClick, active, dir, align = "left" }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: "asc" | "desc"; align?: "left" | "right" }) {
  return (
    <th className={`px-3 py-2.5 font-medium cursor-pointer select-none ${align === "right" ? "text-right" : "text-left"}`} onClick={onClick}>
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={`text-[9px] ${active ? "opacity-100" : "opacity-30"}`}>{active && dir === "desc" ? "▼" : "▲"}</span>
      </span>
    </th>
  );
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).slice(
    Math.max(0, page - 3),
    Math.max(0, page - 3) + 5
  );
  return (
    <div className="flex items-center gap-1">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-muted">←</button>
      {pages.map(n => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`min-w-8 px-2 py-1 rounded border ${n === page ? "bg-sky-500 text-white border-sky-500" : "hover:bg-muted"}`}
        >
          {n}
        </button>
      ))}
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-muted">→</button>
    </div>
  );
}

function PlanForm({ initial, onClose, onSaved }: { initial: Plan | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    download_mbps: initial?.download_mbps ?? 50,
    upload_mbps: initial?.upload_mbps ?? 15,
    price: initial?.price ?? 40,
    description: initial?.description ?? "",
    burst_enabled: initial?.burst_enabled ?? false,
    active: initial?.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!f.name.trim()) { toast.error("Nombre requerido"); return; }
    setSaving(true);
    const profile = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (initial) {
      await supabase.from("plans").update({ ...f }).eq("id", initial.id);
    } else {
      await supabase.from("plans").insert({ ...f, mikrotik_profile_name: profile });
    }
    setSaving(false);
    toast.success(initial ? "Plan actualizado" : "Plan creado");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-card border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-sky-500 text-white rounded-t-lg">
          <h3 className="font-semibold text-sm">{initial ? "Editar plan" : "Nuevo plan"}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 grid sm:grid-cols-2 gap-4">
          <L label="Nombre" full>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="w-full px-3 py-2 rounded border bg-background text-sm" />
          </L>
          <L label="Descarga (Mbps)">
            <input type="number" value={f.download_mbps} onChange={(e) => setF({ ...f, download_mbps: +e.target.value })} className="w-full px-3 py-2 rounded border bg-background text-sm" />
          </L>
          <L label="Subida (Mbps)">
            <input type="number" value={f.upload_mbps} onChange={(e) => setF({ ...f, upload_mbps: +e.target.value })} className="w-full px-3 py-2 rounded border bg-background text-sm" />
          </L>
          <L label="Precio (Bs)">
            <input type="number" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: +e.target.value })} className="w-full px-3 py-2 rounded border bg-background text-sm" />
          </L>
          <L label="Estado">
            <div className="flex items-center gap-4 h-[38px]">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.burst_enabled} onChange={(e) => setF({ ...f, burst_enabled: e.target.checked })} /> Burst</label>
            </div>
          </L>
          <L label="Descripción" full>
            <input value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} className="w-full px-3 py-2 rounded border bg-background text-sm" />
          </L>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t bg-muted/30 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 rounded border text-sm hover:bg-muted">Cancelar</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded bg-sky-500 hover:bg-sky-600 text-white text-sm disabled:opacity-60">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function L({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}
