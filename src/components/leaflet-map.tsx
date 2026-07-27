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
      const m = L.marker([p.lat, p.lng], { icon: iconFor(p.kind, p.status) })
        .bindPopup(`<b>${p.label}</b><br/><span style="color:#64748b">${p.kind}${p.status ? " · " + p.status : ""}</span>${p.popup ? "<br/>" + p.popup : ""}`);
      layer.addLayer(m);
      bounds.push([p.lat, p.lng]);
    }
    if (bounds.length > 1) map.fitBounds(bounds as any, { padding: [30, 30] });
  }, [points, lines]);

  return <div ref={ref} style={{ height, width: "100%", borderRadius: 10, overflow: "hidden", border: "1px solid #e5e7eb" }} />;
}
