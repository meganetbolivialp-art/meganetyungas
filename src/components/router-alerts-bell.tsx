import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bell, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pingAllRouters } from "@/lib/isp.functions";
import { diffRouterStatus, type RouterState } from "@/lib/router-alerts";

const READ_MS = 60_000;
const PING_MS = 3 * 60_000;

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.15, ctx.currentTime); o.start(); o.stop(ctx.currentTime + 0.35);
  } catch {}
}

export function RouterAlertsBell({ canPing }: { canPing: boolean }) {
  const ping = useServerFn(pingAllRouters);
  const [routers, setRouters] = useState<(RouterState & { last_sync_at: string | null })[]>([]);
  const [open, setOpen] = useState(false);
  const prev = useRef<RouterState[] | null>(null);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      const { data } = await supabase.from("routers").select("id,name,status,last_sync_at").order("name");
      if (!alive || !data) return;
      for (const c of diffRouterStatus(prev.current, data as any)) {
        if (c.kind === "down") { toast.error(`Nodo caído: ${c.name}`, { description: "El router MikroTik no responde.", duration: 15000 }); beep(); }
        else toast.success(`Nodo recuperado: ${c.name}`);
      }
      prev.current = data as any;
      setRouters(data as any);
    };
    const doPing = async () => {
      if (!canPing || document.visibilityState !== "visible") return;
      try { await ping(); } catch {}
      read();
    };
    read();
    const t1 = setInterval(read, READ_MS);
    const t2 = setInterval(doPing, PING_MS);
    return () => { alive = false; clearInterval(t1); clearInterval(t2); };
  }, [canPing, ping]);

  const down = routers.filter((r) => r.status === "offline");

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Alertas de nodos" aria-label="Alertas de nodos"
        className="w-8 h-8 grid place-items-center rounded-full hover:bg-card text-muted-foreground relative">
        <Bell className="w-4 h-4" />
        {down.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full ring-2 ring-card animate-pulse bg-destructive text-[9px] font-bold text-destructive-foreground grid place-items-center">{down.length}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-[min(18rem,calc(100vw-1rem))] bg-card border shadow-lg rounded-md z-30">
          <div className="px-3 py-2 border-b text-sm font-semibold">Estado de nodos</div>
          {down.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">Todos los nodos están en línea ({routers.length}).</div>
          ) : (
            <ul className="max-h-72 overflow-auto">
              {down.map((r) => (
                <li key={r.id} className="px-3 py-2 flex items-start gap-2 text-sm border-b last:border-0">
                  <WifiOff className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Caído{r.last_sync_at ? ` · último contacto ${new Date(r.last_sync_at).toLocaleString("es-BO")}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/dashboard/routers" onClick={() => setOpen(false)} className="block px-3 py-2 text-xs text-primary border-t hover:bg-muted">Ver routers</Link>
        </div>
      )}
    </div>
  );
}
