import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { FormPanel, Field, inputCls } from "@/components/ui-kit";
import { Wallet, TrendingUp, CreditCard, Filter, RotateCcw, Download, Plus, Trash2, Search, Printer, Users, CalendarDays, UserCog } from "lucide-react";
import { recordPayment } from "@/lib/isp.functions";
import { getFinanceOperators } from "@/lib/finance.functions";
import { printReceipt } from "@/lib/print-receipt";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/payments")({
  head: () => ({
    meta: [
      { title: "Pagos recibidos — MikroSystem ISP" },
      { name: "description", content: "Historial de pagos y cobranza del ISP." },
      { property: "og:title", content: "Pagos — MikroSystem ISP" },
      { property: "og:description", content: "Registro de pagos recibidos." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentsPage,
});

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo", transfer: "Transferencia", qr: "QR", card: "Tarjeta", other: "Otro",
};
const METHOD_COLOR: Record<string, string> = {
  cash: "#10b981", transfer: "#3b82f6", qr: "#8b5cf6", card: "#f59e0b", other: "#64748b",
};
const bs = (n: number | string | null | undefined) =>
  `Bs ${Number(n ?? 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

const PAGE_SIZE = 50;

function PaymentsPage() {
  const [from, setFrom] = useState(iso(monthStart));
  const [to, setTo] = useState(iso(today));
  const [operator, setOperator] = useState("");
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ client_id: "", invoice_id: "", amount: 0, method: "cash", reference: "" });

  const opsFn = useServerFn(getFinanceOperators);
  const { data: operators = [] } = useQuery({ queryKey: ["finance-ops"], queryFn: () => opsFn() });

  const loadFormData = async () => {
    const [c, i] = await Promise.all([
      supabase.from("clients").select("id, full_name").order("full_name"),
      supabase.from("invoices").select("id, concept, amount, client_id").neq("status", "paid"),
    ]);
    setClients(c.data ?? []); setInvoices(i.data ?? []);
  };
  useEffect(() => { loadFormData(); }, []);

  const filters = useMemo(() => ({ from, to, operator, method, search, page }), [from, to, operator, method, search, page]);

  const { data: result, refetch, isFetching } = useQuery({
    queryKey: ["payments-list", filters],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("id, amount, method, reference, paid_at, created_by, clients(full_name, document, phone), invoices(concept), profiles:created_by(full_name, email)", { count: "exact" })
        .gte("paid_at", `${from}T00:00:00`)
        .lte("paid_at", `${to}T23:59:59`)
        .order("paid_at", { ascending: false });
      if (operator) q = q.eq("created_by", operator);
      if (method) q = q.eq("method", method);
      q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, count, error } = await q;
      if (error) throw new Error(error.message);
      let rows = data ?? [];
      if (search.trim()) {
        const s = search.toLowerCase();
        rows = rows.filter((r: any) =>
          (r.clients?.full_name ?? "").toLowerCase().includes(s) ||
          (r.clients?.document ?? "").toLowerCase().includes(s) ||
          (r.clients?.phone ?? "").toLowerCase().includes(s) ||
          (r.reference ?? "").toLowerCase().includes(s)
        );
      }
      return { rows, count: count ?? 0 };
    },
    refetchInterval: 15000,
  });

  // Agregado diario en todo el rango (no solo página): clientes únicos, # pagos, total
  const { data: dailyAgg } = useQuery({
    queryKey: ["payments-daily", from, to, operator, method, search],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("amount, paid_at, client_id, method, reference, created_by, clients(full_name), profiles:created_by(full_name, email)")
        .gte("paid_at", `${from}T00:00:00`)
        .lte("paid_at", `${to}T23:59:59`)
        .order("paid_at", { ascending: false })
        .limit(10000);
      if (operator) q = q.eq("created_by", operator);
      if (method) q = q.eq("method", method);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      let all = (data ?? []) as any[];
      if (search.trim()) {
        const s = search.toLowerCase();
        all = all.filter((r: any) =>
          (r.clients?.full_name ?? "").toLowerCase().includes(s) ||
          (r.reference ?? "").toLowerCase().includes(s));
      }
      const byDay = new Map<string, { day: string; clients: Set<string>; count: number; total: number }>();
      const byOp = new Map<string, { user_id: string; name: string; clients: Set<string>; days: Set<string>; count: number; total: number; byMethod: Record<string, number> }>();
      const allClients = new Set<string>();
      let grandTotal = 0;
      for (const p of all) {
        const day = String(p.paid_at).slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, { day, clients: new Set(), count: 0, total: 0 });
        const b = byDay.get(day)!;
        if (p.client_id) { b.clients.add(p.client_id); allClients.add(p.client_id); }
        b.count += 1;
        b.total += Number(p.amount);
        grandTotal += Number(p.amount);

        const opId = p.created_by ?? "__none__";
        const opName = p.profiles?.full_name ?? p.profiles?.email ?? (p.created_by ? "—" : "Sin operador");
        if (!byOp.has(opId)) byOp.set(opId, { user_id: opId, name: opName, clients: new Set(), days: new Set(), count: 0, total: 0, byMethod: {} });
        const o = byOp.get(opId)!;
        if (p.client_id) o.clients.add(p.client_id);
        o.days.add(day);
        o.count += 1;
        o.total += Number(p.amount);
        o.byMethod[p.method] = (o.byMethod[p.method] ?? 0) + Number(p.amount);
      }
      const days = Array.from(byDay.values())
        .map(d => ({ day: d.day, clients: d.clients.size, count: d.count, total: d.total }))
        .sort((a, b) => b.day.localeCompare(a.day));
      const ops = Array.from(byOp.values())
        .map(o => ({ user_id: o.user_id, name: o.name, clients: o.clients.size, days: o.days.size, count: o.count, total: o.total, byMethod: o.byMethod }))
        .sort((a, b) => b.total - a.total);
      return { days, ops, uniqueClients: allClients.size, grandTotal, txCount: all.length };
    },
    refetchInterval: 30000,
  });

  const rows = result?.rows ?? [];
  const total = result?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageTotal = rows.reduce((s: number, r: any) => s + Number(r.amount), 0);
  const byMethod = rows.reduce((acc: Record<string, number>, r: any) => {
    acc[r.method] = (acc[r.method] ?? 0) + Number(r.amount); return acc;
  }, {});

  const recordPay = useServerFn(recordPayment);
  const create = async () => {
    if (!f.client_id || !f.amount) return;
    const client = clients.find(c => c.id === f.client_id);
    const invoice = invoices.find(i => i.id === f.invoice_id);
    try {
      const res = await recordPay({ data: { client_id: f.client_id, invoice_id: f.invoice_id || undefined, amount: f.amount, method: f.method, reference: f.reference } });
      if (res.reactivated.length > 0) toast.success(`Pago registrado. ${res.reactivated.length} servicio(s) reactivado(s) ✅`);
      else toast.success("Pago registrado");
      if (confirm("¿Imprimir recibo?")) {
        printReceipt({
          id: (res as any)?.payment_id,
          paid_at: new Date(),
          client_name: client?.full_name,
          concept: invoice?.concept ?? "Pago directo",
          method: f.method,
          reference: f.reference,
          amount: f.amount,
        });
      }
    } catch (e) { toast.error((e as Error).message); return; }
    setF({ client_id: "", invoice_id: "", amount: 0, method: "cash", reference: "" });
    setShow(false); refetch();
  };
  const remove = async (id: string) => {
    if (!confirm("¿Eliminar pago?")) return;
    await supabase.from("payments").delete().eq("id", id); refetch();
  };

  const setPreset = (kind: "today" | "week" | "month" | "prev_month" | "90d") => {
    const now = new Date();
    if (kind === "today") { setFrom(iso(now)); setTo(iso(now)); }
    else if (kind === "week") { const s = new Date(now); s.setDate(now.getDate() - now.getDay()); setFrom(iso(s)); setTo(iso(now)); }
    else if (kind === "month") { setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1))); setTo(iso(now)); }
    else if (kind === "prev_month") {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      setFrom(iso(s)); setTo(iso(e));
    } else { setFrom(iso(new Date(Date.now() - 90 * 86400_000))); setTo(iso(now)); }
    setPage(0);
  };
  const reset = () => { setFrom(iso(monthStart)); setTo(iso(today)); setOperator(""); setMethod(""); setSearch(""); setPage(0); };

  const exportCsv = async () => {
    let q = supabase
      .from("payments")
      .select("amount, method, reference, paid_at, clients(full_name, document), invoices(concept), profiles:created_by(full_name, email)")
      .gte("paid_at", `${from}T00:00:00`)
      .lte("paid_at", `${to}T23:59:59`)
      .order("paid_at", { ascending: false })
      .limit(5000);
    if (operator) q = q.eq("created_by", operator);
    if (method) q = q.eq("method", method);
    const { data } = await q;
    let all = data ?? [];
    if (search.trim()) {
      const s = search.toLowerCase();
      all = all.filter((r: any) =>
        (r.clients?.full_name ?? "").toLowerCase().includes(s) ||
        (r.reference ?? "").toLowerCase().includes(s));
    }
    const header = [["Fecha","Cliente","Documento","Concepto","Método","Referencia","Monto","Operador"]];
    const body = all.map((p: any) => [
      new Date(p.paid_at).toLocaleString("es-BO"),
      p.clients?.full_name ?? "",
      p.clients?.document ?? "",
      p.invoices?.concept ?? "Pago directo",
      METHOD_LABEL[p.method] ?? p.method,
      p.reference ?? "",
      Number(p.amount).toFixed(2),
      p.profiles?.full_name ?? p.profiles?.email ?? "",
    ]);
    const csv = [...header, ...body].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `pagos_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout title="Pagos recibidos" subtitle={`${total} transacciones en el rango`} breadcrumb={["Finanzas", "Pagos"]}>
      {/* Filtros */}
      <div className="bg-card border rounded-lg p-3 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Filter className="w-3.5 h-3.5" /> Filtros
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Desde</label>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0); }} className="px-2 py-1.5 rounded border bg-background text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="block text-[11px] text-muted-foreground mb-1">Hasta</label>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0); }} className="px-2 py-1.5 rounded border bg-background text-sm outline-none focus:border-primary" />
        </div>
        <div className="min-w-[170px]">
          <label className="block text-[11px] text-muted-foreground mb-1">Operador</label>
          <select value={operator} onChange={e => { setOperator(e.target.value); setPage(0); }} className="w-full px-2 py-1.5 rounded border bg-background text-sm outline-none focus:border-primary">
            <option value="">Todos</option>
            {(operators as any[]).map(o => <option key={o.user_id} value={o.user_id}>{o.full_name}</option>)}
          </select>
        </div>
        <div className="min-w-[140px]">
          <label className="block text-[11px] text-muted-foreground mb-1">Método</label>
          <select value={method} onChange={e => { setMethod(e.target.value); setPage(0); }} className="w-full px-2 py-1.5 rounded border bg-background text-sm outline-none focus:border-primary">
            <option value="">Todos</option>
            {Object.entries(METHOD_LABEL).map(([k,l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="block text-[11px] text-muted-foreground mb-1">Buscar</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cliente, documento, referencia…" className="w-full pl-7 pr-2 py-1.5 rounded border bg-background text-sm outline-none focus:border-primary" />
          </div>
        </div>
        <div className="flex gap-1 flex-wrap">
          {[["today","Hoy"],["week","Semana"],["month","Mes"],["prev_month","Mes ant."],["90d","90d"]].map(([k,l]) => (
            <button key={k} onClick={() => setPreset(k as any)} className="px-2.5 py-1.5 rounded border text-xs hover:bg-muted">{l}</button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <button onClick={reset} className="px-2.5 py-1.5 rounded border text-xs hover:bg-muted flex items-center gap-1"><RotateCcw className="w-3 h-3" />Reset</button>
          <button onClick={exportCsv} className="px-2.5 py-1.5 rounded border text-xs hover:bg-muted flex items-center gap-1"><Download className="w-3 h-3" />CSV</button>
          <button onClick={() => setShow(s => !s)} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 flex items-center gap-1"><Plus className="w-3 h-3" />Registrar pago</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <KpiCard label="Cobrado (rango)" value={bs(dailyAgg?.grandTotal ?? 0)} sub={`${dailyAgg?.txCount ?? 0} pagos`} icon={Wallet} tone="emerald" />
        <KpiCard label="Clientes que pagaron" value={dailyAgg?.uniqueClients ?? 0} sub={`en ${dailyAgg?.days.length ?? 0} día(s)`} icon={Users} tone="amber" />
        <KpiCard label="Transacciones (total)" value={total} sub={`${totalPages} página(s)`} icon={CreditCard} tone="cyan" />
        <KpiCard label="Ticket promedio" value={bs(dailyAgg && dailyAgg.txCount ? dailyAgg.grandTotal / dailyAgg.txCount : 0)} sub="Rango completo" icon={TrendingUp} tone="indigo" />
        <div className="bg-card border rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Por método (página)</div>
          {Object.keys(byMethod).length === 0 ? (
            <div className="text-xs text-muted-foreground">Sin datos</div>
          ) : (
            <div className="space-y-1">
              {Object.entries(byMethod).sort((a,b) => b[1]-a[1]).map(([m,v]) => (
                <div key={m} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: METHOD_COLOR[m] ?? "#64748b" }} />
                    {METHOD_LABEL[m] ?? m}
                  </span>
                  <span className="font-semibold">{bs(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Clientes pagados por fecha */}
      <div className="bg-card border rounded-lg overflow-hidden mb-4">
        <div className="px-3 py-2 border-b bg-muted/40 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">Clientes pagados por fecha</div>
          <div className="text-xs text-muted-foreground ml-auto">{dailyAgg?.days.length ?? 0} día(s) con cobros</div>
        </div>
        <div className="overflow-auto max-h-80">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-right">Clientes únicos</th>
                <th className="px-3 py-2 text-right">Pagos</th>
                <th className="px-3 py-2 text-right">Total cobrado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(dailyAgg?.days ?? []).length === 0 ? (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">Sin cobros en el rango</td></tr>
              ) : (dailyAgg!.days).map(d => (
                <tr key={d.day} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{new Date(d.day + "T12:00:00").toLocaleDateString("es-BO", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td className="px-3 py-2 text-right font-semibold text-amber-600">{d.clients}</td>
                  <td className="px-3 py-2 text-right">{d.count}</td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-600">{bs(d.total)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => { setFrom(d.day); setTo(d.day); setPage(0); }}
                      className="text-xs px-2 py-1 rounded border hover:bg-muted"
                      title="Ver pagos de este día"
                    >Ver día</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {(dailyAgg?.days.length ?? 0) > 0 && (
              <tfoot className="bg-muted/40 text-xs font-semibold">
                <tr className="border-t">
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right text-amber-700">{dailyAgg!.uniqueClients} únicos</td>
                  <td className="px-3 py-2 text-right">{dailyAgg!.txCount}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{bs(dailyAgg!.grandTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>



        </div>
      </div>

      {/* Cobros por operador */}
      <div className="bg-card border rounded-lg overflow-hidden mb-4">
        <div className="px-3 py-2 border-b bg-muted/40 flex items-center gap-2">
          <UserCog className="w-4 h-4 text-primary" />
          <div className="font-semibold text-sm">Cobros por operador</div>
          <div className="text-xs text-muted-foreground ml-auto">{dailyAgg?.ops.length ?? 0} operador(es) con cobros</div>
        </div>
        <div className="overflow-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Operador</th>
                <th className="px-3 py-2 text-right">Días activos</th>
                <th className="px-3 py-2 text-right">Clientes únicos</th>
                <th className="px-3 py-2 text-right">Pagos</th>
                <th className="px-3 py-2 text-left">Por método</th>
                <th className="px-3 py-2 text-right">Total cobrado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(dailyAgg?.ops ?? []).length === 0 ? (
                <tr><td colSpan={7} className="text-center py-6 text-muted-foreground text-xs">Sin cobros en el rango</td></tr>
              ) : (dailyAgg!.ops).map(o => (
                <tr key={o.user_id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium truncate max-w-[200px]">{o.name}</td>
                  <td className="px-3 py-2 text-right">{o.days}</td>
                  <td className="px-3 py-2 text-right font-semibold text-amber-600">{o.clients}</td>
                  <td className="px-3 py-2 text-right">{o.count}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(o.byMethod).sort((a,b) => b[1]-a[1]).map(([m,v]) => (
                        <span key={m} className="text-[10px] px-1.5 py-0.5 rounded text-white whitespace-nowrap" style={{ background: METHOD_COLOR[m] ?? "#64748b" }}>
                          {METHOD_LABEL[m] ?? m}: {bs(v)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-600 whitespace-nowrap">{bs(o.total)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => { if (o.user_id !== "__none__") { setOperator(o.user_id); setPage(0); } }}
                      disabled={o.user_id === "__none__"}
                      className="text-xs px-2 py-1 rounded border hover:bg-muted disabled:opacity-40"
                      title="Filtrar por este operador"
                    >Filtrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {(dailyAgg?.ops.length ?? 0) > 0 && (
              <tfoot className="bg-muted/40 text-xs font-semibold">
                <tr className="border-t">
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-right text-amber-700">{dailyAgg!.uniqueClients} únicos</td>
                  <td className="px-3 py-2 text-right">{dailyAgg!.txCount}</td>
                  <td></td>
                  <td className="px-3 py-2 text-right text-emerald-700">{bs(dailyAgg!.grandTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {show && (
        <FormPanel onCancel={() => setShow(false)} onSave={create}>
          <Field label="Cliente *"><select value={f.client_id} onChange={e => setF({ ...f, client_id: e.target.value, invoice_id: "" })} className={inputCls}><option value="">Seleccionar</option>{clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></Field>
          <Field label="Factura (opcional)"><select value={f.invoice_id} onChange={e => { const inv = invoices.find(i => i.id === e.target.value); setF({ ...f, invoice_id: e.target.value, amount: inv?.amount ?? f.amount }); }} className={inputCls}><option value="">Sin factura</option>{invoices.filter(i => !f.client_id || i.client_id === f.client_id).map(i => <option key={i.id} value={i.id}>{i.concept} - Bs {i.amount}</option>)}</select></Field>
          <Field label="Monto *"><input type="number" step="0.01" value={f.amount} onChange={e => setF({ ...f, amount: +e.target.value })} className={inputCls} /></Field>
          <Field label="Método"><select value={f.method} onChange={e => setF({ ...f, method: e.target.value })} className={inputCls}>{Object.entries(METHOD_LABEL).map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Referencia"><input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} className={inputCls} /></Field>
        </FormPanel>
      )}

      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Concepto</th>
                <th className="px-3 py-2 text-left">Método</th>
                <th className="px-3 py-2 text-left">Referencia</th>
                <th className="px-3 py-2 text-left">Operador</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">{isFetching ? "Cargando…" : "Sin pagos en el rango"}</td></tr>
              ) : rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.paid_at).toLocaleString("es-BO", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-3 py-2 font-medium truncate max-w-[180px]">{r.clients?.full_name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[180px]">{r.invoices?.concept ?? "Pago directo"}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: METHOD_COLOR[r.method] ?? "#64748b" }}>
                      {METHOD_LABEL[r.method] ?? r.method}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.reference ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[140px]">{r.profiles?.full_name ?? r.profiles?.email ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-600 whitespace-nowrap">{bs(r.amount)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => printReceipt({
                        id: r.id,
                        paid_at: r.paid_at,
                        client_name: r.clients?.full_name,
                        client_document: r.clients?.document,
                        client_phone: r.clients?.phone,
                        concept: r.invoices?.concept ?? "Pago directo",
                        method: r.method,
                        reference: r.reference,
                        amount: Number(r.amount),
                        operator: r.profiles?.full_name ?? r.profiles?.email,
                      })}
                      className="text-cyan-600 hover:text-cyan-800 p-1 mr-1" title="Imprimir recibo"><Printer className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(r.id)} className="text-red-500 hover:text-red-700 p-1" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Paginación */}
        <div className="flex items-center justify-between px-3 py-2 border-t text-xs">
          <div className="text-muted-foreground">Página {page + 1} de {totalPages} • {total} pago(s)</div>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(0)} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-muted">« Primero</button>
            <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-muted">‹ Anterior</button>
            <button disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-muted">Siguiente ›</button>
            <button disabled={page + 1 >= totalPages} onClick={() => setPage(totalPages - 1)} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-muted">Último »</button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function KpiCard({ label, value, sub, icon: Icon, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: any; tone: string }) {
  const tones: Record<string, string> = {
    emerald: "from-emerald-500 to-emerald-600",
    cyan: "from-cyan-500 to-cyan-600",
    indigo: "from-indigo-500 to-indigo-600",
    amber: "from-amber-500 to-amber-600",
  };
  return (
    <div className={`relative overflow-hidden rounded-lg p-3 text-white bg-gradient-to-br ${tones[tone]} shadow-sm`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">{label}</div>
          <div className="text-xl font-bold mt-1 leading-tight truncate">{value}</div>
          {sub && <div className="text-[11px] opacity-90 mt-0.5">{sub}</div>}
        </div>
        <Icon className="w-7 h-7 opacity-40" />
      </div>
    </div>
  );
}
