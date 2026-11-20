import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, ArrowDown, ArrowUp } from "lucide-react";
import { getRouterTrafficSample } from "@/lib/dashboard.functions";

type Sample = { at: number; rx: number; tx: number };

function fmt(bps: number) {
  if (bps > 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps > 1e6) return `${(bps / 1e6).toFixed(2)} Mbps`;
  if (bps > 1e3) return `${(bps / 1e3).toFixed(1)} Kbps`;
  return `${bps} bps`;
}

export function TrafficChart({ routerId, iface = "ether1", intervalMs = 3000, max = 60 }: {
  routerId: string;
  iface?: string;
  intervalMs?: number;
  max?: number;
}) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const fetchSample = useServerFn(getRouterTrafficSample);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let t: any;
    const tick = async () => {
      try {
        const r = await fetchSample({ data: { routerId, iface } });
        if (!alive.current) return;
        setErr(null);
        setSamples((s) => [...s, { at: r.at, rx: r.rx_bps, tx: r.tx_bps }].slice(-max));
      } catch (e) {
        if (alive.current) setErr((e as Error).message);
      }
      t = setTimeout(tick, intervalMs);
    };
    tick();
    return () => { alive.current = false; clearTimeout(t); };
  }, [routerId, iface, intervalMs, max]);

  const w = 900;
  const h = 260;
  const padL = 68;
  const padR = 24;
  const padT = 22;
  const padB = 36;
  const iw = w - padL - padR;
  const ih = h - padT - padB;
  const peak = Math.max(1, ...samples.flatMap((s) => [s.rx, s.tx]));
  const points = (key: "rx" | "tx") => samples.map((s, i) => {
    const x = padL + (samples.length <= 1 ? 0 : (i * iw) / (samples.length - 1));
    const y = padT + ih - (s[key] / peak) * ih;
    return { x, y, value: s[key], at: s.at };
  });
  const rxPoints = points("rx");
  const txPoints = points("tx");
  const path = (items: { x: number; y: number }[]) => items.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = (items: { x: number; y: number }[]) => items.length
    ? `${path(items)} L${items[items.length - 1].x},${padT + ih} L${items[0].x},${padT + ih} Z`
    : "";
  const last = samples[samples.length - 1];

  return (
    <section className="traffic-card">
      <div className="traffic-card__header">
        <div className="traffic-card__title-wrap">
          <span className="traffic-card__icon"><Activity className="h-5 w-5" /></span>
          <div>
            <h2>Tráfico del nodo · {iface}</h2>
            <p>Descarga y subida en vivo · actualiza cada {intervalMs / 1000} segundos</p>
          </div>
        </div>
        <div className="traffic-card__stats">
          <div className="traffic-card__stat traffic-card__stat--rx">
            <span><ArrowDown className="h-4 w-4" /> Descarga</span>
            <strong>{last ? fmt(last.rx) : "—"}</strong>
          </div>
          <div className="traffic-card__stat traffic-card__stat--tx">
            <span><ArrowUp className="h-4 w-4" /> Subida</span>
            <strong>{last ? fmt(last.tx) : "—"}</strong>
          </div>
        </div>
      </div>
      <div className="traffic-card__chart">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" role="img" aria-label={`Tráfico en vivo de ${iface}`}>
          <defs>
            <linearGradient id="trafficRxArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="traffic-rx-area-start" />
              <stop offset="100%" className="traffic-area-end" />
            </linearGradient>
            <linearGradient id="trafficTxArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="traffic-tx-area-start" />
              <stop offset="100%" className="traffic-area-end" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={padL} y1={padT + (i * ih) / 4} x2={w - padR} y2={padT + (i * ih) / 4} className="traffic-grid" />
          ))}
          {[4, 3, 2, 1, 0].map((i, idx) => (
            <text key={i} x="4" y={padT + (idx * ih) / 4 + 4} className="traffic-axis">
              {fmt((peak * i) / 4)}
            </text>
          ))}
          {rxPoints.length > 0 && <path d={area(rxPoints)} fill="url(#trafficRxArea)" />}
          {txPoints.length > 0 && <path d={area(txPoints)} fill="url(#trafficTxArea)" />}
          <path d={path(rxPoints)} className="traffic-line traffic-line--rx" />
          <path d={path(txPoints)} className="traffic-line traffic-line--tx" />
          {rxPoints.map((p) => <circle key={`rx-${p.at}`} cx={p.x} cy={p.y} r="3.5" className="traffic-point traffic-point--rx"><title>Descarga: {fmt(p.value)}</title></circle>)}
          {txPoints.map((p) => <circle key={`tx-${p.at}`} cx={p.x} cy={p.y} r="3.5" className="traffic-point traffic-point--tx"><title>Subida: {fmt(p.value)}</title></circle>)}
        </svg>
        {samples.length === 0 && !err && <div className="traffic-card__empty">Esperando las primeras muestras del router…</div>}
      </div>
      {err && <div className="traffic-card__error">{err}</div>}
    </section>
  );
}
