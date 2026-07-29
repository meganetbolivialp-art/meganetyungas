import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, User, Receipt, Wifi, Router as RouterIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Result =
  | { type: "client"; id: string; label: string; sub: string }
  | { type: "invoice"; id: string; label: string; sub: string; clientId: string }
  | { type: "service"; id: string; label: string; sub: string; clientId: string }
  | { type: "router"; id: string; label: string; sub: string };

export function InlineSearch() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const [c, s, r, inv] = await Promise.all([
        supabase.from("clients").select("id, full_name, document, email, phone").or(`full_name.ilike.%${term}%,document.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`).limit(8),
        supabase.from("services").select("id, client_id, pppoe_user, ip_address, clients(full_name)").or(`pppoe_user.ilike.%${term}%,ip_address.ilike.%${term}%`).limit(6),
        supabase.from("routers").select("id, name, ip_address").or(`name.ilike.%${term}%,ip_address.ilike.%${term}%`).limit(4),
        /^\d+$/.test(term)
          ? supabase.from("invoices").select("id, amount, status, client_id, clients(full_name)").eq("id", term).limit(1)
          : supabase.from("invoices").select("id, amount, status, client_id, clients(full_name)").ilike("concept", `%${term}%`).limit(5),
      ]);
      const list: Result[] = [];
      (c.data ?? []).forEach((x: any) => list.push({ type: "client", id: x.id, label: x.full_name, sub: [x.document, x.email, x.phone].filter(Boolean).join(" · ") }));
      (s.data ?? []).forEach((x: any) => list.push({ type: "service", id: x.id, label: x.pppoe_user ?? x.ip_address ?? "servicio", sub: `${x.clients?.full_name ?? ""} · ${x.ip_address ?? ""}`, clientId: x.client_id }));
      (inv.data ?? []).forEach((x: any) => list.push({ type: "invoice", id: x.id, label: `Factura #${String(x.id).slice(0, 8)}`, sub: `${x.clients?.full_name ?? ""} · Bs ${Number(x.amount).toFixed(2)} · ${x.status}`, clientId: x.client_id }));
      (r.data ?? []).forEach((x: any) => list.push({ type: "router", id: x.id, label: x.name, sub: x.ip_address }));
      setResults(list);
      setActive(0);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (r: Result) => {
    setOpen(false);
    setQ("");
    if (r.type === "client" || r.type === "service") nav({ to: "/dashboard/clients/$clientId", params: { clientId: (r as any).clientId ?? r.id } });
    else if (r.type === "invoice") nav({ to: "/dashboard/invoices_/$invoiceId", params: { invoiceId: r.id } } as any);
    else if (r.type === "router") nav({ to: "/dashboard/routers" });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]); }
    else if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
  };

  const icon = (t: Result["type"]) => t === "client" ? User : t === "invoice" ? Receipt : t === "service" ? Wifi : t === "router" ? RouterIcon : Search;

  return (
    <div ref={boxRef} className="relative w-full">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Buscar clientes, PPPoE, IP, facturas..."
        className="w-full h-9 rounded-md bg-muted/60 border border-transparent hover:border-primary/40 focus:border-primary/60 outline-none pl-9 pr-3 text-sm"
      />
      {open && q.trim() !== "" && (
        <div className="absolute left-0 right-0 top-11 bg-card rounded-md shadow-2xl border overflow-hidden z-50 max-h-[60vh] overflow-y-auto">
          {loading && <div className="px-4 py-3 text-xs text-muted-foreground">Buscando...</div>}
          {!loading && results.length === 0 && <div className="px-4 py-4 text-center text-sm text-muted-foreground">Sin resultados</div>}
          {results.map((r, i) => {
            const Icon = icon(r.type);
            return (
              <button key={`${r.type}-${r.id}`} onClick={() => go(r)} onMouseEnter={() => setActive(i)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2 border-b last:border-0 ${i === active ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                <div className="w-8 h-8 rounded grid place-items-center bg-muted"><Icon className="w-4 h-4 text-muted-foreground" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{r.sub}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.type}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
