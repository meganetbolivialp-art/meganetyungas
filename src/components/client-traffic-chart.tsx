import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getServicePppoeTraffic } from "@/lib/dashboard.functions";

type Sample = { at: number; rx: number; tx: number };

function fmt(bps: number) {
  if (bps > 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps > 1e6) return `${(bps / 1e6).toFixed(2)} Mbps`;
  if (bps > 1e3) return `${(bps / 1e3).toFixed(1)} Kbps`;
  return `${Math.round(bps)} bps`;
}

export function ClientTrafficChart({
  serviceId,
  intervalMs = 3000,
  max = 60,
}: {
  serviceId: string;
  intervalMs?: number;
  max?: number;
}) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [info, setInfo] = useState<{ online: boolean; iface?: string | null; address?: string | null; uptime?: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fetchSample = useServerFn(getServicePppoeTraffic);
  const alive = useRef(true);
  const prev = useRef<{ at: number; bin: number; bout: number } | null>(null);

  useEffect(() => {
    alive.current = true;
    prev.current = null;
    setSamples([]);
    let t: any;
    const tick = async () => {
      try {
        const r: any = await fetchSample({ data: { serviceId } });
        if (!alive.current) return;
        setErr(null);
        setInfo({ online: r.online, iface: r.iface, address: r.address, uptime: r.uptime });
        let rx = r.rx_bps || 0;
        let tx = r.tx_bps || 0;
        // Fallback: calcular bps por delta de bytes si el router no dio bps directos
        if ((!rx && !tx) && r.online && prev.current) {
          const dt = (r.at - prev.current.at) / 1000;
          if (dt > 0) {
            rx = Math.max(0, ((r.bytes_in - prev.current.bin) * 8) / dt);
            tx = Math.max(0, ((r.bytes_out - prev.current.bout) * 8) / dt);
          }
        }
        prev.current = { at: r.at, bin: r.bytes_in || 0, bout: r.bytes_out || 0 };
        setSamples((s) => [...s, { at: r.at, rx, tx }].slice(-max));
      } catch (e) {
        if (alive.current) setErr((e as Error).message);
      }
      t = setTimeout(tick, intervalMs);
    };
    tick();
    return () => { alive.current = false; clearTimeout(t); };
  }, [serviceId, intervalMs, max]);

  const w = 600, h = 200, padL = 55, padR = 10, padT = 10, padB = 20;
  const iw = w - padL - padR, ih = h - padT - padB;
  const peak = Math.max(1, ...samples.flatMap((s) => [s.rx, s.tx]));
  const path = (key: "rx" | "tx") =>
    samples
      .map((s, i) => {
        const x = padL + (samples.length <= 1 ? 0 : (i * iw) / (samples.length - 1));
        const y = padT + ih - (s[key] / peak) * ih;
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");

  const last = samples[samples.length - 1];

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div>
          <div className="text-sm font-semibold">Tráfico PPPoE del cliente</div>
          <div className="text-[11px] text-muted-foreground">
            {info?.online === false
              ? "Sesión offline"
              : info?.iface
              ? `Iface ${info.iface} · IP ${info.address ?? "—"} · Uptime ${info.uptime ?? "—"}`
              : `Actualiza cada ${intervalMs / 1000}s`}
          </div>
        </div>
        <div className="text-right text-xs">
          <div className="text-emerald-600">↓ RX: <b>{last ? fmt(last.rx) : "—"}</b></div>
          <div className="text-sky-600">↑ TX: <b>{last ? fmt(last.tx) : "—"}</b></div>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[200px]">
        {[0, 1, 2, 3, 4].map((i) => (
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
