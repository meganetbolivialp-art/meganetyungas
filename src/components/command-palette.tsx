import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, User, Receipt, Wifi, Router as RouterIcon, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Result =
  | { type: "client"; id: string; label: string; sub: string }
  | { type: "invoice"; id: string; label: string; sub: string; clientId: string }
  | { type: "service"; id: string; label: string; sub: string; clientId: string }
  | { type: "router"; id: string; label: string; sub: string }
  | { type: "nav"; id: string; label: string; sub: string; to: string };

const NAV_ITEMS: Result[] = [
  { type: "nav", id: "n-home", label: "Inicio", sub: "Dashboard", to: "/dashboard" },
  { type: "nav", id: "n-clients", label: "Usuarios / Clientes", sub: "Lista de clientes", to: "/dashboard/clients" },
  { type: "nav", id: "n-invoices", label: "Facturas", sub: "Facturación", to: "/dashboard/invoices" },
  { type: "nav", id: "n-payments", label: "Pagos recibidos", sub: "Cobranza", to: "/dashboard/payments" },
  { type: "nav", id: "n-cash", label: "Caja diaria", sub: "Arqueo", to: "/dashboard/cash" },
  { type: "nav", id: "n-tickets", label: "Tickets", sub: "Soporte", to: "/dashboard/tickets" },
  { type: "nav", id: "n-wo", label: "Órdenes de trabajo", sub: "Tareas", to: "/dashboard/work-orders" },
  { type: "nav", id: "n-plans", label: "Planes de internet", sub: "Servicios", to: "/dashboard/plans" },
  { type: "nav", id: "n-routers", label: "Routers", sub: "Red", to: "/dashboard/routers" },
  { type: "nav", id: "n-map", label: "Mapa de red", sub: "Red", to: "/dashboard/network-map" },
  { type: "nav", id: "n-vouchers", label: "Vouchers Hotspot", sub: "Fichas", to: "/dashboard/vouchers" },
  { type: "nav", id: "n-leads", label: "CRM Leads", sub: "Ventas", to: "/dashboard/leads" },
  { type: "nav", id: "n-kpis", label: "KPIs del negocio", sub: "Reportes", to: "/dashboard/kpis" },
  { type: "nav", id: "n-audit", label: "Auditoría", sub: "Reportes", to: "/dashboard/audit" },
  
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) { setQ(""); setResults([]); setActive(0); } }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
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
      NAV_ITEMS.filter(n => n.label.toLowerCase().includes(term.toLowerCase())).forEach(n => list.push(n));
      setResults(list);
      setActive(0);
      setLoading(false);
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = (r: Result) => {
    onClose();
    if (r.type === "client" || r.type === "service") nav({ to: "/dashboard/clients/$clientId", params: { clientId: (r as any).clientId ?? r.id } });
    else if (r.type === "invoice") nav({ to: "/dashboard/invoices_/$invoiceId", params: { invoiceId: r.id } } as any);
    else if (r.type === "router") nav({ to: "/dashboard/routers" });
    else if (r.type === "nav") nav({ to: r.to as any });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]); }
    else if (e.key === "Escape") onClose();
  };

  const icon = (t: Result["type"]) => t === "client" ? User : t === "invoice" ? Receipt : t === "service" ? Wifi : t === "router" ? RouterIcon : Search;

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      <div className="w-full max-w-xl bg-card rounded-lg shadow-2xl border overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Buscar clientes, PPPoE, IP, facturas, secciones..."
            className="flex-1 bg-transparent outline-none text-sm py-1.5" />
          <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">ESC</span>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {loading && <div className="px-4 py-3 text-xs text-muted-foreground">Buscando...</div>}
          {!loading && q.trim() === "" && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Escribe para buscar clientes, PPPoE, IP, facturas...</div>}
          {!loading && q.trim() !== "" && results.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Sin resultados</div>}
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
        <div className="px-3 py-2 border-t text-[10px] text-muted-foreground flex justify-between">
          <span>↑↓ navegar · ↵ abrir</span>
          <span>Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
