import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, FormPanel, Field, inputCls, Badge, DeleteBtn } from "@/components/ui-kit";
import { MapPin, Radio, Antenna } from "lucide-react";

const LeafletMap = lazy(() => import("@/components/leaflet-map").then((m) => ({ default: m.LeafletMap })));
const LeafletPicker = lazy(() => import("@/components/leaflet-picker").then((m) => ({ default: m.LeafletPicker })));

export const Route = createFileRoute("/dashboard/network-map")({
  head: () => ({
    meta: [
      { title: "Mapa de red — MikroSystem ISP" },
      { name: "description", content: "Mapa real con clientes geolocalizados, torres, cajas NAP y postes." },
      { property: "og:title", content: "Mapa de red — MikroSystem ISP" },
      { property: "og:description", content: "Topología de red con OpenStreetMap." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NetworkMapPage,
});

function NetworkMapPage() {
  const [nodes, setNodes] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [filter, setFilter] = useState({ clients: true, tower: true, nap: true, pole: true, olt: true, fiber: true, active: true, suspended: true, overdue: true });
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", type: "tower", latitude: -16.5, longitude: -68.15, status: "active", notes: "" });
  const [lf, setLf] = useState({ from_node: "", to_node: "", cable_type: "aerial", fibers: 12, length_m: 0, notes: "" });
  const [mounted, setMounted] = useState(false);

  const load = async () => {
    const [n, c, l] = await Promise.all([
      supabase.from("network_nodes").select("*").order("name"),
      supabase.from("clients").select("id, full_name, latitude, longitude, status, phone, address, city").not("latitude", "is", null),
      supabase.from("fiber_links").select("*"),
    ]);
    setNodes(n.data ?? []); setClients(c.data ?? []); setLinks(l.data ?? []);
  };
  useEffect(() => { load(); setMounted(true); }, []);

  const points = useMemo(() => {
    const list: any[] = [];
    const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
    if (filter.clients) {
      for (const c of clients) {
        const st = (c.status || "active") as string;
        if (!(filter as any)[st]) continue;
        const rows: string[] = [];
        if (c.address) rows.push(`<div style="display:flex;gap:6px;font-size:11.5px;color:#475569"><span style="opacity:.7;min-width:54px">Dirección</span><span style="color:#0f172a">${esc(c.address)}</span></div>`);
        if (c.city) rows.push(`<div style="display:flex;gap:6px;font-size:11.5px;color:#475569"><span style="opacity:.7;min-width:54px">Ciudad</span><span style="color:#0f172a">${esc(c.city)}</span></div>`);
        if (c.phone) rows.push(`<div style="display:flex;gap:6px;font-size:11.5px;color:#475569"><span style="opacity:.7;min-width:54px">Tel</span><a href="tel:${esc(c.phone)}" style="color:#2563eb;text-decoration:none;font-weight:500">${esc(c.phone)}</a></div>`);
        const popup = rows.length ? `<div style="display:flex;flex-direction:column;gap:4px">${rows.join("")}</div>` : "";
        list.push({ id: `c-${c.id}`, lat: +c.latitude, lng: +c.longitude, kind: "client", label: c.full_name, status: st, popup });
      }
    }
    for (const n of nodes) {
      const kind = (n.type || "tower") as string;
      if (!(filter as any)[kind]) continue;
      list.push({ id: `n-${n.id}`, lat: +n.latitude, lng: +n.longitude, kind, label: n.name, status: n.status, popup: n.notes || "" });
    }
    return list;
  }, [nodes, clients, filter]);

  const mapLines = useMemo(() => {
    if (!filter.fiber) return [];
    const byId = new Map(nodes.map((n: any) => [n.id, n]));
    return links.flatMap((l: any) => {
      const a = byId.get(l.from_node), b = byId.get(l.to_node);
      if (!a || !b) return [];
      return [{ id: l.id, from: [+a.latitude, +a.longitude] as [number, number], to: [+b.latitude, +b.longitude] as [number, number], color: "#f97316", label: `Fibra ${l.fibers}h · ${l.length_m || "?"}m` }];
    });
  }, [links, nodes, filter.fiber]);

  const create = async () => {
    if (!f.name) return;
    await supabase.from("network_nodes").insert(f);
    setF({ name: "", type: "tower", latitude: -16.5, longitude: -68.15, status: "active", notes: "" });
    setShow(false); load();
  };
  const createLink = async () => {
    if (!lf.from_node || !lf.to_node || lf.from_node === lf.to_node) return;
    await supabase.from("fiber_links").insert(lf);
    setLf({ from_node: "", to_node: "", cable_type: "aerial", fibers: 12, length_m: 0, notes: "" });
    setShowLink(false); load();
  };
  const remove = async (id: string) => {
    if (!confirm("¿Eliminar nodo?")) return;
    await supabase.from("network_nodes").delete().eq("id", id); load();
  };
  const removeLink = async (id: string) => {
    if (!confirm("¿Eliminar tramo de fibra?")) return;
    await supabase.from("fiber_links").delete().eq("id", id); load();
  };

  const stats = useMemo(() => {
    const active = nodes.filter((n: any) => n.status === "active").length;
    const down = nodes.filter((n: any) => n.status === "down").length;
    const totalFiber = links.reduce((a: number, l: any) => a + (Number(l.length_m) || 0), 0);
    return { active, down, totalFiber };
  }, [nodes, links]);

  return (
    <AdminLayout>
      {/* Header profesional */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" /> Mapa de red
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Topología FTTH · torres · NAP · postes · fibra</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowLink(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold shadow-sm transition">
            <Radio className="w-3.5 h-3.5" /> Tramo de fibra
          </button>
          <button onClick={() => setShow(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-white text-xs font-semibold shadow-sm transition">
            <Antenna className="w-3.5 h-3.5" /> Nuevo nodo
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {[
          { l: "Clientes geo", v: clients.length, c: "from-blue-500 to-blue-600", i: "👤" },
          { l: "Nodos", v: nodes.length, c: "from-rose-500 to-rose-600", i: "📡" },
          { l: "Tramos fibra", v: links.length, c: "from-orange-500 to-orange-600", i: "🧵" },
          { l: "Metros de fibra", v: stats.totalFiber.toLocaleString(), c: "from-emerald-500 to-emerald-600", i: "📏" },
        ].map((k) => (
          <div key={k.l} className="relative overflow-hidden rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
            <div className={`absolute -right-3 -top-3 w-14 h-14 rounded-full bg-gradient-to-br ${k.c} opacity-10`} />
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{k.l}</div>
            <div className="text-xl font-bold text-slate-800 tabular-nums mt-0.5">{k.v}</div>
          </div>
        ))}
      </div>

      {show && (
        <FormPanel onCancel={() => setShow(false)} onSave={create}>
          <Field label="Nombre"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Tipo">
            <select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="tower">Torre / Antena</option>
              <option value="nap">Caja NAP</option>
              <option value="pole">Poste</option>
              <option value="olt">OLT</option>
            </select>
          </Field>
          <Field label="Estado">
            <select className={inputCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="active">Activo</option><option value="maintenance">Mantenimiento</option><option value="down">Caído</option>
            </select>
          </Field>
          <Field label="Notas"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6, display: "block" }}>Ubicación (click en el mapa)</label>
            <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Cargando mapa…</div>}>
              <LeafletPicker lat={f.latitude} lng={f.longitude} onChange={(la, ln) => setF({ ...f, latitude: la, longitude: ln })} height={300} />
            </Suspense>
          </div>
        </FormPanel>
      )}

      {showLink && (
        <FormPanel onCancel={() => setShowLink(false)} onSave={createLink}>
          <Field label="Nodo origen">
            <select className={inputCls} value={lf.from_node} onChange={(e) => setLf({ ...lf, from_node: e.target.value })}>
              <option value="">— seleccionar —</option>
              {nodes.map((n: any) => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
            </select>
          </Field>
          <Field label="Nodo destino">
            <select className={inputCls} value={lf.to_node} onChange={(e) => setLf({ ...lf, to_node: e.target.value })}>
              <option value="">— seleccionar —</option>
              {nodes.map((n: any) => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
            </select>
          </Field>
          <Field label="Tipo de cable">
            <select className={inputCls} value={lf.cable_type} onChange={(e) => setLf({ ...lf, cable_type: e.target.value })}>
              <option value="aerial">Aéreo</option><option value="underground">Subterráneo</option><option value="adss">ADSS</option>
            </select>
          </Field>
          <Field label="Hilos"><input type="number" className={inputCls} value={lf.fibers} onChange={(e) => setLf({ ...lf, fibers: +e.target.value })} /></Field>
          <Field label="Longitud (m)"><input type="number" className={inputCls} value={lf.length_m} onChange={(e) => setLf({ ...lf, length_m: +e.target.value })} /></Field>
          <Field label="Notas"><input className={inputCls} value={lf.notes} onChange={(e) => setLf({ ...lf, notes: e.target.value })} /></Field>
        </FormPanel>
      )}

      {/* Filtros compactos */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 bg-white rounded-lg border border-slate-200 mb-3 shadow-sm">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Capas</span>
        {[
          { k: "clients", c: "bg-blue-500", l: "Clientes" },
          { k: "tower", c: "bg-rose-500", l: "Torres" },
          { k: "nap", c: "bg-amber-500", l: "NAP" },
          { k: "pole", c: "bg-emerald-500", l: "Postes" },
          { k: "olt", c: "bg-purple-500", l: "OLT" },
          { k: "fiber", c: "bg-orange-500", l: "Fibra" },
        ].map((x) => (
          <label key={x.k} className="inline-flex items-center gap-1.5 text-[12px] text-slate-700 cursor-pointer select-none">
            <input type="checkbox" className="accent-primary" checked={(filter as any)[x.k]} onChange={(e) => setFilter({ ...filter, [x.k]: e.target.checked })} />
            <span className={`w-2.5 h-2.5 rounded-full ${x.c} ring-2 ring-white shadow-sm`} /> {x.l}
          </label>
        ))}
        <span className="h-4 w-px bg-slate-200" />
        <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Estado</span>
        {[{ k: "active", l: "Activos" }, { k: "suspended", l: "Suspendidos" }, { k: "overdue", l: "Morosos" }].map((x) => (
          <label key={x.k} className="inline-flex items-center gap-1.5 text-[12px] text-slate-700 cursor-pointer select-none">
            <input type="checkbox" className="accent-primary" checked={(filter as any)[x.k]} onChange={(e) => setFilter({ ...filter, [x.k]: e.target.checked })} /> {x.l}
          </label>
        ))}
      </div>

      {/* Mapa profesional con encabezado */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm mb-3 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
          <div className="text-xs font-semibold text-slate-700 flex items-center gap-2">
            <span className="inline-flex w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Vista en vivo · {points.length} elementos
          </div>
          <div className="text-[11px] text-muted-foreground">Cambia entre Satélite / Calles / Oscuro en la esquina superior derecha del mapa</div>
        </div>
        {mounted ? (
          <Suspense fallback={<div className="p-10 text-center text-muted-foreground">Cargando mapa…</div>}>
            <LeafletMap points={points} lines={mapLines} height={620} />
          </Suspense>
        ) : (
          <div className="p-10 text-center text-muted-foreground">Preparando…</div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 font-semibold text-sm text-slate-700 flex items-center gap-2">
            <Antenna className="w-4 h-4 text-rose-500" /> Nodos <span className="text-xs font-normal text-muted-foreground">({nodes.length})</span>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left bg-slate-50/50 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="px-3 py-1.5 font-semibold">Nombre</th>
                <th className="px-3 py-1.5 font-semibold">Tipo</th>
                <th className="px-3 py-1.5 font-semibold">Estado</th>
                <th className="px-3 py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((n, i) => (
                <tr key={n.id} className={`border-b border-slate-100 hover:bg-sky-50/50 ${i % 2 ? "bg-slate-50/40" : ""}`}>
                  <td className="px-3 py-1.5 font-medium text-slate-800">{n.name}</td>
                  <td className="px-3 py-1.5"><Badge>{n.type}</Badge></td>
                  <td className="px-3 py-1.5"><Badge tone={n.status === "active" ? "success" : n.status === "maintenance" ? "warning" : "danger"}>{n.status}</Badge></td>
                  <td className="px-3 py-1.5"><DeleteBtn onClick={() => remove(n.id)} /></td>
                </tr>
              ))}
              {!nodes.length && <tr><td colSpan={4} className="text-center text-slate-400 py-6"><Radio className="w-4 h-4 inline mr-1" /> Sin nodos aún</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 font-semibold text-sm text-slate-700 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-orange-500" /> Tramos de fibra <span className="text-xs font-normal text-muted-foreground">({links.length})</span>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left bg-slate-50/50 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="px-3 py-1.5 font-semibold">Origen → Destino</th>
                <th className="px-3 py-1.5 font-semibold">Tipo</th>
                <th className="px-3 py-1.5 font-semibold">Hilos</th>
                <th className="px-3 py-1.5 font-semibold">m</th>
                <th className="px-3 py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {links.map((l: any, i) => {
                const a = nodes.find((n: any) => n.id === l.from_node)?.name || "?";
                const b = nodes.find((n: any) => n.id === l.to_node)?.name || "?";
                return (
                  <tr key={l.id} className={`border-b border-slate-100 hover:bg-sky-50/50 ${i % 2 ? "bg-slate-50/40" : ""}`}>
                    <td className="px-3 py-1.5 text-slate-800">{a} <span className="text-slate-400">→</span> {b}</td>
                    <td className="px-3 py-1.5"><Badge>{l.cable_type}</Badge></td>
                    <td className="px-3 py-1.5 tabular-nums">{l.fibers}</td>
                    <td className="px-3 py-1.5 tabular-nums">{l.length_m || "-"}</td>
                    <td className="px-3 py-1.5"><DeleteBtn onClick={() => removeLink(l.id)} /></td>
                  </tr>
                );
              })}
              {!links.length && <tr><td colSpan={5} className="text-center text-slate-400 py-6">Sin tramos aún</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

