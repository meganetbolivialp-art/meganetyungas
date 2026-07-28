import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { MapPin, Search, LocateFixed, Copy, ExternalLink, Navigation } from "lucide-react";

(L.Icon.Default as any).mergeOptions({ iconRetinaUrl: iconRetina, iconUrl, shadowUrl });

type ClientInfo = {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  code?: string | null;
};

type Props = {
  lat?: number | null;
  lng?: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: number;
  defaultCenter?: [number, number];
  info?: ClientInfo;
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function popupHtml(la: number, ln: number, info?: ClientInfo, addressLookup?: string) {
  const name = info?.name ? escapeHtml(info.name) : "Ubicación del cliente";
  const rows: string[] = [];
  if (info?.code) rows.push(`<div style="display:flex;gap:6px;align-items:center;color:#475569;font-size:12px"><span style="opacity:.7">Código</span><b style="color:#0f172a">${escapeHtml(info.code)}</b></div>`);
  if (info?.address) rows.push(`<div style="display:flex;gap:6px;align-items:flex-start;color:#475569;font-size:12px"><span style="opacity:.7;min-width:52px">Dirección</span><span style="color:#0f172a">${escapeHtml(info.address)}</span></div>`);
  if (addressLookup && addressLookup !== info?.address) rows.push(`<div style="display:flex;gap:6px;align-items:flex-start;color:#475569;font-size:12px"><span style="opacity:.7;min-width:52px">Cerca de</span><span style="color:#0f172a">${escapeHtml(addressLookup)}</span></div>`);
  if (info?.phone) rows.push(`<div style="display:flex;gap:6px;align-items:center;color:#475569;font-size:12px"><span style="opacity:.7">Tel</span><a href="tel:${escapeHtml(info.phone)}" style="color:#2563eb;text-decoration:none">${escapeHtml(info.phone)}</a></div>`);

  return `
    <div style="min-width:220px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto">
      <div style="display:flex;align-items:center;gap:8px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;margin-bottom:8px">
        <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#0ea5e9);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 4px 10px -4px rgba(59,130,246,.6)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <div style="font-weight:600;color:#0f172a;font-size:13px;line-height:1.2">${name}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px">${rows.join("")}</div>
      <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:8px">
        <code style="font-size:11px;color:#0f172a;background:#f1f5f9;padding:3px 6px;border-radius:4px">${la.toFixed(6)}, ${ln.toFixed(6)}</code>
        <div style="display:flex;gap:6px">
          <a href="https://www.google.com/maps?q=${la},${ln}" target="_blank" rel="noreferrer" title="Google Maps" style="width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
          </a>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${la},${ln}" target="_blank" rel="noreferrer" title="Cómo llegar" style="width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          </a>
        </div>
      </div>
    </div>`;
}

export function LeafletPicker({ lat, lng, onChange, height = 320, defaultCenter = [-16.5, -68.15], info }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [nearby, setNearby] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const reverseGeocode = async (la: number, ln: number) => {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${ln}&zoom=18`);
      const d = await r.json();
      const name = d?.display_name || "";
      setNearby(name);
      return name;
    } catch { return ""; }
  };

  const openPopup = async (la: number, ln: number) => {
    if (!markerRef.current) return;
    markerRef.current.bindPopup(popupHtml(la, ln, info, nearby), { maxWidth: 300, className: "mw-popup" }).openPopup();
    const name = await reverseGeocode(la, ln);
    if (name && markerRef.current) {
      markerRef.current.setPopupContent(popupHtml(la, ln, info, name));
    }
  };

  const ensureMarker = (ll: L.LatLngExpression) => {
    if (!mapRef.current) return;
    if (markerRef.current) { markerRef.current.setLatLng(ll); return; }
    markerRef.current = L.marker(ll, { draggable: true }).addTo(mapRef.current);
    markerRef.current.on("dragend", () => {
      const p = markerRef.current!.getLatLng();
      onChange(+p.lat.toFixed(6), +p.lng.toFixed(6));
      openPopup(p.lat, p.lng);
    });
    markerRef.current.on("click", () => {
      const p = markerRef.current!.getLatLng();
      openPopup(p.lat, p.lng);
    });
  };

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const has = Number.isFinite(lat as any) && Number.isFinite(lng as any);
    const c: [number, number] = has ? [lat as number, lng as number] : defaultCenter;
    const map = L.map(ref.current, { zoomControl: true }).setView(c, has ? 16 : 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    if (has) {
      ensureMarker(c);
      setTimeout(() => openPopup(c[0], c[1]), 300);
    }
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: la, lng: ln } = e.latlng;
      ensureMarker(e.latlng);
      onChange(+la.toFixed(6), +ln.toFixed(6));
      openPopup(la, ln);
    });
    setTimeout(() => map.invalidateSize(), 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (Number.isFinite(lat as any) && Number.isFinite(lng as any)) {
      const ll: [number, number] = [lat as number, lng as number];
      ensureMarker(ll);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  const doSearch = async () => {
    if (!search.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(search)}`);
      const data = await r.json();
      if (data?.[0]) {
        const la = +data[0].lat, ln = +data[0].lon;
        mapRef.current?.setView([la, ln], 17);
        ensureMarker([la, ln]);
        onChange(+la.toFixed(6), +ln.toFixed(6));
        setNearby(data[0].display_name || "");
        openPopup(la, ln);
      } else alert("Sin resultados");
    } finally { setBusy(false); }
  };

  const useMine = () => {
    if (!navigator.geolocation) return alert("Geolocalización no disponible");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude, ln = pos.coords.longitude;
        mapRef.current?.setView([la, ln], 17);
        ensureMarker([la, ln]);
        onChange(+la.toFixed(6), +ln.toFixed(6));
        openPopup(la, ln);
        setBusy(false);
      },
      (err) => { alert("Error: " + err.message); setBusy(false); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const copyCoords = async () => {
    if (!Number.isFinite(lat as any) || !Number.isFinite(lng as any)) return;
    try {
      await navigator.clipboard.writeText(`${(lat as number).toFixed(6)}, ${(lng as number).toFixed(6)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const has = Number.isFinite(lat as any) && Number.isFinite(lng as any);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <style>{`
        .mw-popup .leaflet-popup-content-wrapper { border-radius: 12px; box-shadow: 0 20px 40px -12px rgba(15,23,42,.25); padding: 12px 14px; }
        .mw-popup .leaflet-popup-content { margin: 0; }
        .mw-popup .leaflet-popup-tip { box-shadow: 0 4px 8px -4px rgba(15,23,42,.25); }
      `}</style>
      <div className="flex items-center gap-2 p-2.5 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), doSearch())}
            placeholder="Buscar dirección o lugar…"
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
        </div>
        <button type="button" onClick={doSearch} disabled={busy} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-[12px] font-medium hover:bg-slate-800 disabled:opacity-60 transition">
          <Search className="w-3.5 h-3.5" />{busy ? "…" : "Buscar"}
        </button>
        <button type="button" onClick={useMine} disabled={busy} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white text-[12px] font-medium hover:bg-blue-700 disabled:opacity-60 transition" title="Usar mi ubicación">
          <LocateFixed className="w-3.5 h-3.5" /><span className="hidden sm:inline">Mi ubicación</span>
        </button>
      </div>
      <div ref={ref} style={{ height, width: "100%" }} />
      <div className="flex items-center justify-between gap-3 flex-wrap px-3 py-2 bg-slate-50 border-t border-slate-100 text-[11.5px] text-slate-600">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-blue-600" />
          <span>Click en el mapa · arrastrá el marcador para ajustar</span>
        </div>
        {has && (
          <div className="flex items-center gap-2">
            <code className="font-mono text-slate-800 bg-white border border-slate-200 rounded px-1.5 py-0.5">{(lat as number).toFixed(6)}, {(lng as number).toFixed(6)}</code>
            <button type="button" onClick={copyCoords} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900" title="Copiar">
              <Copy className="w-3 h-3" />{copied ? "Copiado" : "Copiar"}
            </button>
            <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              <ExternalLink className="w-3 h-3" />Maps
            </a>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
              <Navigation className="w-3 h-3" />Ir
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
