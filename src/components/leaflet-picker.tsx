import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

(L.Icon.Default as any).mergeOptions({ iconRetinaUrl: iconRetina, iconUrl, shadowUrl });

type Props = {
  lat?: number | null;
  lng?: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: number;
  defaultCenter?: [number, number];
};

export function LeafletPicker({ lat, lng, onChange, height = 320, defaultCenter = [-16.5, -68.15] }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const c: [number, number] = Number.isFinite(lat as any) && Number.isFinite(lng as any) ? [lat as number, lng as number] : defaultCenter;
    const map = L.map(ref.current).setView(c, 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    if (Number.isFinite(lat as any) && Number.isFinite(lng as any)) {
      markerRef.current = L.marker(c, { draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const p = markerRef.current!.getLatLng();
        onChange(+p.lat.toFixed(6), +p.lng.toFixed(6));
      });
    }
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: la, lng: ln } = e.latlng;
      if (markerRef.current) markerRef.current.setLatLng(e.latlng);
      else {
        markerRef.current = L.marker(e.latlng, { draggable: true }).addTo(map);
        markerRef.current.on("dragend", () => {
          const p = markerRef.current!.getLatLng();
          onChange(+p.lat.toFixed(6), +p.lng.toFixed(6));
        });
      }
      onChange(+la.toFixed(6), +ln.toFixed(6));
    });
    setTimeout(() => map.invalidateSize(), 100);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (Number.isFinite(lat as any) && Number.isFinite(lng as any)) {
      const ll: [number, number] = [lat as number, lng as number];
      if (markerRef.current) markerRef.current.setLatLng(ll);
      else {
        markerRef.current = L.marker(ll, { draggable: true }).addTo(map);
        markerRef.current.on("dragend", () => {
          const p = markerRef.current!.getLatLng();
          onChange(+p.lat.toFixed(6), +p.lng.toFixed(6));
        });
      }
    }
  }, [lat, lng]);

  const doSearch = async () => {
    if (!search.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(search)}`);
      const data = await r.json();
      if (data?.[0]) {
        const la = +data[0].lat, ln = +data[0].lon;
        mapRef.current?.setView([la, ln], 16);
        onChange(+la.toFixed(6), +ln.toFixed(6));
      } else alert("Sin resultados");
    } finally { setBusy(false); }
  };

  const useMine = () => {
    if (!navigator.geolocation) return alert("Geolocalización no disponible");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude, ln = pos.coords.longitude;
        mapRef.current?.setView([la, ln], 16);
        onChange(+la.toFixed(6), +ln.toFixed(6));
      },
      (err) => alert("Error: " + err.message),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), doSearch())}
          placeholder="Buscar dirección (ej: Av. 6 de Agosto, La Paz)"
          style={{ flex: 1, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }}
        />
        <button type="button" onClick={doSearch} disabled={busy} style={{ padding: "8px 12px", background: "#0f766e", color: "#fff", borderRadius: 6, fontSize: 13, border: 0 }}>{busy ? "…" : "Buscar"}</button>
        <button type="button" onClick={useMine} style={{ padding: "8px 12px", background: "#334155", color: "#fff", borderRadius: 6, fontSize: 13, border: 0 }}>Mi ubicación</button>
      </div>
      <div ref={ref} style={{ height, width: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb" }} />
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
        Click en el mapa para fijar · Arrastrá el marcador para ajustar
        {Number.isFinite(lat as any) && Number.isFinite(lng as any) && <> · <b style={{ fontFamily: "monospace" }}>{(lat as number).toFixed(6)}, {(lng as number).toFixed(6)}</b></>}
      </div>
    </div>
  );
}
