import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getRouterTrafficSample } from "@/lib/dashboard.functions";

type Sample = { at: number; rx: number; tx: number };

function fmt(bps: number) {
  if (bps > 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps > 1e6) return `${(bps / 1e6).toFixed(2)} Mbps`;
  if (bps > 1e3) return `${(bps / 1e3).toFixed(1)} Kbps`;
  return `${bps} bps`;
}

export function TrafficChart({ routerId, iface = "ether1", intervalMs = 3000, max = 60 }: {
  routerId: string; iface?: string; intervalMs?: number; max?: number;
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
        setSamples(s => [...s, { at: r.at, rx: r.rx_bps, tx: r.tx_bps }].slice(-max));
      } catch (e) {
        if (alive.current) setErr((e as Error).message);
      }
      t = setTimeout(tick, intervalMs);
    };
    tick();
    return () => { alive.current = false; clearTimeout(t); };
  }, [routerId, iface, intervalMs, max]);

  const w = 600, h = 200, padL = 50, padR = 10, padT = 10, padB = 20;
  const iw = w - padL - padR, ih = h - padT - padB;
  const peak = Math.max(1, ...samples.flatMap(s => [s.rx, s.tx]));
  const path = (key: "rx" | "tx") =>
    samples.map((s, i) => {
      const x = padL + (samples.length <= 1 ? 0 : (i * iw) / (samples.length - 1));
      const y = padT + ih - (s[key] / peak) * ih;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    }).join(" ");

  const last = samples[samples.length - 1];

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div>
          <div className="text-sm font-semibold">Tráfico {iface}</div>
          <div className="text-[11px] text-muted-foreground">Actualiza cada {intervalMs / 1000}s</div>
        </div>
        <div className="text-right text-xs">
          <div className="text-emerald-600">↓ RX: <b>{last ? fmt(last.rx) : "—"}</b></div>
          <div className="text-sky-600">↑ TX: <b>{last ? fmt(last.tx) : "—"}</b></div>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[200px]">
        {[0, 1, 2, 3, 4].map(i => (
          <line key={i} x1={padL} y1={padT + (i * ih) / 4} x2={w - padR} y2={padT + (i * ih) / 4}
            stroke="currentColor" strokeOpacity="0.08" />
        ))}
        {[4, 3, 2, 1, 0].map((i, idx) => (
          <text key={i} x="4" y={padT + (idx * ih) / 4 + 4} fontSize="9" fill="currentColor" opacity="0.6">
            {fmt((peak * i) / 4)}
          </text>
        ))}
        <path d={path("rx")} fill="none" stroke="#10b981" strokeWidth="2" />
        <path d={path("tx")} fill="none" stroke="#0ea5e9" strokeWidth="2" />
      </svg>
      {err && <div className="px-4 py-1 text-[11px] text-destructive border-t bg-destructive/5">{err}</div>}
    </div>
  );
}
