import { useEffect, useRef } from "react";
import L from "leaflet";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// Fix default marker icons under bundlers
(L.Icon.Default as any).mergeOptions({ iconRetinaUrl: iconRetina, iconUrl, shadowUrl });

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind: "client" | "tower" | "nap" | "pole" | "olt";
  status?: string;
  popup?: string;
};

const COLORS: Record<string, string> = {
  client: "#3b82f6", tower: "#ef4444", nap: "#f59e0b", pole: "#10b981", olt: "#a855f7",
};
const GLYPHS: Record<string, string> = {
  client: "👤", tower: "📡", nap: "📦", pole: "🟢", olt: "🔌",
};

function iconFor(kind: string, status?: string) {
  const c = COLORS[kind] ?? "#64748b";
  const dim = status && status !== "active" ? 0.55 : 1;
  const glyph = GLYPHS[kind] ?? "•";
  const html = `<div style="position:relative;width:26px;height:26px;">
    <div style="position:absolute;inset:-6px;border-radius:50%;background:${c};opacity:.25;filter:blur(2px);"></div>
    <div style="position:relative;width:26px;height:26px;border-radius:50%;background:${c};opacity:${dim};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1;">${glyph}</div>
  </div>`;
  return L.divIcon({ html, className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
}


export type MapLine = {
  id: string;
  from: [number, number];
  to: [number, number];
  color?: string;
  label?: string;
};

export function LeafletMap({ points, lines = [], height = 560, center }: { points: MapPoint[]; lines?: MapLine[]; height?: number; center?: [number, number] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const initial: [number, number] = center ?? (points[0] ? [points[0].lat, points[0].lng] : [-16.5, -68.15]);
    const map = L.map(ref.current, { zoomControl: true }).setView(initial, 13);

    const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap", maxZoom: 19,
    });
    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Tiles © Esri", maxZoom: 20 }
    );
    const labels = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 20, opacity: 0.9 }
    );
    const hybrid = L.layerGroup([satellite, labels]);
    const dark = L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© CARTO © OSM", maxZoom: 20, subdomains: "abcd" }
    );

    hybrid.addTo(map);
    L.control.layers(
      { "Satélite": hybrid, "Calles": streets, "Oscuro": dark },
      undefined,
      { position: "topright", collapsed: false }
    ).addTo(map);
    L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
  }, []);


  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    for (const ln of lines) {
      const color = ln.color || "#f97316";
      // Casing (dark outline) + neon fiber line for satellite readability
      layer.addLayer(L.polyline([ln.from, ln.to], { color: "#0f172a", weight: 6, opacity: 0.55 }));
      const pl = L.polyline([ln.from, ln.to], { color, weight: 3, opacity: 0.95, dashArray: "8 6" });
      if (ln.label) pl.bindTooltip(ln.label);
      layer.addLayer(pl);
      bounds.push(ln.from, ln.to);
    }

    for (const p of points) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      const color = COLORS[p.kind] ?? "#64748b";
      const glyph = GLYPHS[p.kind] ?? "•";
      const kindLabel: Record<string, string> = { client: "Cliente", tower: "Torre", nap: "Caja NAP", pole: "Poste", olt: "OLT" };
      const statusTone: Record<string, string> = { active: "#10b981", suspended: "#f59e0b", overdue: "#ef4444", down: "#ef4444", maintenance: "#f59e0b" };
      const statusLabel: Record<string, string> = { active: "Activo", suspended: "Suspendido", overdue: "Moroso", down: "Caído", maintenance: "Mantenimiento" };
      const tone = p.status ? statusTone[p.status] || "#64748b" : "#64748b";
      const sLabel = p.status ? statusLabel[p.status] || p.status : "";
      const safe = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
      const html = `
        <div style="min-width:230px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto">
          <div style="display:flex;align-items:center;gap:10px;padding-bottom:9px;border-bottom:1px solid #e2e8f0;margin-bottom:9px">
            <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg, ${color}, ${color}cc);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;box-shadow:0 6px 14px -6px ${color}99;flex-shrink:0">${glyph}</div>
            <div style="min-width:0;flex:1">
              <div style="font-weight:600;color:#0f172a;font-size:13.5px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safe(p.label)}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
                <span style="font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;font-weight:600">${kindLabel[p.kind] || p.kind}</span>
                ${sLabel ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;color:${tone};font-weight:600"><span style="width:6px;height:6px;border-radius:50%;background:${tone};box-shadow:0 0 0 2px ${tone}22"></span>${sLabel}</span>` : ""}
              </div>
            </div>
          </div>
          ${p.popup ? `<div style="color:#475569;font-size:12px;line-height:1.5;margin-bottom:9px">${p.popup}</div>` : ""}
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding-top:8px;border-top:1px dashed #e2e8f0">
            <code style="font-size:10.5px;color:#0f172a;background:#f1f5f9;padding:3px 7px;border-radius:5px;font-family:ui-monospace,monospace">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</code>
            <div style="display:flex;gap:6px">
              <a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noreferrer" title="Ver en Google Maps" style="width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;background:#0f172a;color:#fff;border-radius:7px;text-decoration:none;transition:transform .15s" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
              </a>
              <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noreferrer" title="Cómo llegar" style="width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#2563eb,#0ea5e9);color:#fff;border-radius:7px;text-decoration:none;transition:transform .15s" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              </a>
            </div>
          </div>
        </div>`;
      const m = L.marker([p.lat, p.lng], { icon: iconFor(p.kind, p.status) })
        .bindPopup(html, { maxWidth: 320, className: "mn-popup" });
      layer.addLayer(m);
      bounds.push([p.lat, p.lng]);
    }
    if (bounds.length > 1) map.fitBounds(bounds as any, { padding: [30, 30] });
  }, [points, lines]);

  return (
    <>
      <style>{`
        .mn-popup .leaflet-popup-content-wrapper { border-radius: 14px; box-shadow: 0 20px 45px -15px rgba(15,23,42,.35), 0 4px 10px -4px rgba(15,23,42,.15); padding: 14px 16px; border: 1px solid rgba(226,232,240,.9); }
        .mn-popup .leaflet-popup-content { margin: 0; }
        .mn-popup .leaflet-popup-tip { box-shadow: 0 4px 10px -4px rgba(15,23,42,.3); }
        .mn-popup .leaflet-popup-close-button { color: #94a3b8 !important; font-size: 20px !important; padding: 6px 8px 0 0 !important; }
        .mn-popup .leaflet-popup-close-button:hover { color: #0f172a !important; }
      `}</style>
      <div ref={ref} style={{ height, width: "100%", borderRadius: 10, overflow: "hidden", border: "1px solid #e5e7eb" }} />
    </>
  );
}
