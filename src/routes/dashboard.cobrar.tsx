import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { recordPayment } from "@/lib/isp.functions";
import { toast } from "sonner";
import { Search, User, CheckCircle2, AlertTriangle, DollarSign, Receipt, Wallet, X } from "lucide-react";

export const Route = createFileRoute("/dashboard/cobrar")({
  validateSearch: (s: Record<string, unknown>) => ({
    clientId: typeof s.clientId === "string" ? s.clientId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Cobrar — MikroSystem ISP" },
      { name: "description", content: "Cobro rápido: buscá al cliente, mirá su deuda y registrá el pago." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CobrarPage,
});


type ClientRow = {
  id: string; full_name: string; document: string | null; phone: string | null; status: string;
};
type Invoice = {
  id: string; concept: string; amount: number; due_date: string; status: string; days_overdue: number | null;
};

function CobrarPage() {
  const { clientId: preselectId } = Route.useSearch();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ClientRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ClientRow | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [extra, setExtra] = useState<string>(""); // pago libre sin factura
  const [saving, setSaving] = useState(false);
  const [promiseUntil, setPromiseUntil] = useState<string>("");
  const [promiseSaving, setPromiseSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const doPay = useServerFn(recordPayment);

  useEffect(() => { if (!preselectId) inputRef.current?.focus(); }, [preselectId]);

  // Auto-cargar cliente si viene por URL (?clientId=...)
  useEffect(() => {
    if (!preselectId) return;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, full_name, document, phone, status")
        .eq("id", preselectId)
        .maybeSingle();
      if (data) await pickClient(data as ClientRow);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectId]);


  // Búsqueda debounced
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setResults([]); return; }
    setSearching(true);
    const h = setTimeout(async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, full_name, document, phone, status")
        .or(`full_name.ilike.%${t}%,document.ilike.%${t}%,phone.ilike.%${t}%`)
        .order("full_name")
        .limit(20);
      setResults(data ?? []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(h);
  }, [q]);

  const loadClientData = async (c: ClientRow) => {
    const [inv, svc, cli] = await Promise.all([
      supabase.from("invoices")
        .select("id, concept, amount, due_date, status, days_overdue")
        .eq("client_id", c.id)
        .in("status", ["pending", "overdue"])
        .order("due_date", { ascending: true }),
      supabase.from("services")
        .select("id, status, monthly_price, last_billed_month, plan_id, plans(name, price)")
        .eq("client_id", c.id),
      supabase.from("clients").select("billing_day, payment_promise_until, dont_cut").eq("id", c.id).maybeSingle(),
    ]);
    return {
      invoices: (inv.data ?? []) as Invoice[],
      services: svc.data ?? [],
      billingDay: (cli.data?.billing_day as number | undefined) ?? 1,
      promiseUntil: (cli.data?.payment_promise_until as string | null) ?? null,
      dontCut: !!cli.data?.dont_cut,
    };
  };

  const pickClient = async (c: ClientRow) => {
    setSelected(c);
    setResults([]);
    setQ(c.full_name);
    setLoading(true);
    let { invoices: rows, services: svcs, billingDay, promiseUntil: promise } = await loadClientData(c);

    // Auto-generar factura del mes según el plan si no hay pendientes
    if (rows.length === 0) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const tag = `${y}-${String(m).padStart(2, "0")}`;
      const activeToBill = svcs.filter(
        (s: any) => s.status === "active" && s.last_billed_month !== tag,
      );
      if (activeToBill.length > 0) {
        const day = Math.min(Math.max(Number(billingDay) || 1, 1), 28);
        const dueDate = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const inserts = activeToBill.map((s: any) => ({
          client_id: c.id,
          service_id: s.id,
          amount: Number(s.monthly_price ?? s.plans?.price ?? 0),
          due_date: dueDate,
          status: "pending",
          concept: `Servicio de internet ${tag}${s.plans?.name ? ` — ${s.plans.name}` : ""}`,
          period_month: m,
          period_year: y,
        })).filter(x => x.amount > 0);
        if (inserts.length > 0) {
          const { error } = await supabase.from("invoices").insert(inserts);
          if (!error) {
            await Promise.all(
              activeToBill.map((s: any) =>
                supabase.from("services").update({ last_billed_month: tag }).eq("id", s.id),
              ),
            );
            toast.success(`Factura del mes generada automáticamente (${tag})`);
            const reload = await loadClientData(c);
            rows = reload.invoices;
            svcs = reload.services;
            promise = reload.promiseUntil;
          }
        }
      }
    }

    setInvoices(rows);
    setServices(svcs);
    setPickedIds(new Set(rows.map(r => r.id))); // por defecto cobrar todo
    setPromiseUntil(promise ?? "");
    setLoading(false);
  };

  const clear = () => {
    setSelected(null); setInvoices([]); setServices([]); setPickedIds(new Set());
    setQ(""); setReference(""); setExtra(""); setMethod("cash"); setPromiseUntil("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const savePromise = async (value: string | null) => {
    if (!selected) return;
    setPromiseSaving(true);
    const { error } = await supabase.from("clients")
      .update({ payment_promise_until: value })
      .eq("id", selected.id);
    setPromiseSaving(false);
    if (error) { toast.error(error.message); return; }
    setPromiseUntil(value ?? "");
    toast.success(value ? `Promesa de pago hasta ${value} ✅` : "Promesa de pago cancelada");
  };

  const totalDebt = useMemo(() => invoices.reduce((s, i) => s + Number(i.amount), 0), [invoices]);
  const pickedInvoices = useMemo(() => invoices.filter(i => pickedIds.has(i.id)), [invoices, pickedIds]);
  const pickedTotal = useMemo(() => pickedInvoices.reduce((s, i) => s + Number(i.amount), 0), [pickedInvoices]);
  const extraNum = Number(extra) || 0;
  const grandTotal = pickedTotal + extraNum;

  const togglePick = (id: string) => {
    const n = new Set(pickedIds);
    if (n.has(id)) n.delete(id); else n.add(id);
    setPickedIds(n);
  };




  const suspended = services.some(s => s.status === "suspended");

  const charge = async () => {
    if (!selected) return;
    if (grandTotal <= 0) { toast.error("Nada para cobrar"); return; }
    setSaving(true);
    try {
      let reactivatedTotal = 0;
      // Cobrar factura por factura (para marcar cada una como pagada)
      for (const inv of pickedInvoices) {
        const res = await doPay({
          data: {
            client_id: selected.id,
            invoice_id: inv.id,
            amount: Number(inv.amount),
            method,
            reference: reference || undefined,
          },
        });
        reactivatedTotal += res.reactivated?.length ?? 0;
      }
      // Pago libre extra sin factura
      if (extraNum > 0) {
        const res = await doPay({
          data: {
            client_id: selected.id,
            amount: extraNum,
            method,
            reference: reference || undefined,
          },
        });
        reactivatedTotal += res.reactivated?.length ?? 0;
      }
      toast.success(
        `✅ Pago Bs ${grandTotal.toFixed(2)} registrado` +
        (reactivatedTotal > 0 ? ` · ${reactivatedTotal} servicio(s) reactivado(s)` : "")
      );
      clear();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Cobrar</h1>
        <p className="text-sm text-muted-foreground">Buscá al cliente, revisá su deuda y registrá el pago al toque.</p>
      </div>

      {/* Buscador */}
      <div className="bg-card border rounded-md p-4 mb-4 relative">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          Buscar cliente (nombre, CI o teléfono)
        </label>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); if (selected) setSelected(null); }}
            placeholder="Ej: PEREZ, 12345678, 71234567…"
            className="w-full pl-9 pr-9 py-3 rounded border bg-background text-base"
          />
          {q && (
            <button onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdown resultados */}
        {!selected && results.length > 0 && (
          <div className="absolute left-4 right-4 mt-1 bg-card border rounded-md shadow-lg max-h-80 overflow-auto z-10">
            {results.map(c => (
              <button
                key={c.id}
                onClick={() => pickClient(c)}
                className="w-full text-left px-4 py-2 hover:bg-muted/50 border-b last:border-0 flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-[#2e9cd6]/10 text-[#2e9cd6] grid place-items-center">
                  <User className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm uppercase">{c.full_name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.document ?? "sin CI"} · {c.phone ?? "sin tel"}
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                  c.status === "active" ? "bg-emerald-100 text-emerald-800" :
                  c.status === "suspended" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-800"
                }`}>{c.status}</span>
              </button>
            ))}
          </div>
        )}
        {!selected && !searching && q.trim().length >= 2 && results.length === 0 && (
          <div className="mt-3 text-sm text-muted-foreground">Sin resultados.</div>
        )}
      </div>

      {/* Vista del cliente */}
      {selected && (
        <>
          {loading ? (
            <div className="bg-card border rounded-md p-8 text-center text-muted-foreground">Cargando…</div>
          ) : invoices.length === 0 ? (
            /* Sin deuda */
            <div className="bg-card border rounded-md p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center mx-auto mb-3">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-semibold text-emerald-700">Cliente sin deuda</h2>
              <p className="text-sm text-muted-foreground mb-1 uppercase font-semibold mt-2">{selected.full_name}</p>
              <p className="text-xs text-muted-foreground">{selected.document ?? ""} · {selected.phone ?? ""}</p>
              <p className="mt-4 text-sm">Este cliente no tiene facturas pendientes ni vencidas. 🎉</p>

              {/* Opción: pago libre igual */}
              <div className="mt-6 max-w-sm mx-auto border-t pt-4">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  ¿Registrar pago adelantado / saldo a favor?
                </label>
                <div className="flex gap-2 mt-2">
                  <input
                    type="number" step="0.01" min="0"
                    value={extra} onChange={e => setExtra(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 border rounded px-3 py-2 text-sm bg-background"
                  />
                  <button
                    onClick={charge}
                    disabled={extraNum <= 0 || saving}
                    className="bg-[#16a394] hover:bg-[#128677] disabled:opacity-40 text-white px-4 py-2 rounded text-sm font-semibold"
                  >{saving ? "..." : "Cobrar"}</button>
                </div>
              </div>
              <button onClick={clear} className="mt-6 text-sm text-primary hover:underline">Buscar otro cliente →</button>
            </div>
          ) : (
            /* Con deuda */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Izq: facturas */}
              <div className="lg:col-span-2 bg-card border rounded-md">
                <div className="p-4 border-b flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground font-semibold">Cliente</div>
                    <Link to="/dashboard/clients/$clientId" params={{ clientId: selected.id }} className="text-base font-semibold uppercase hover:text-primary">
                      {selected.full_name}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">
                      {selected.document ?? "sin CI"} · {selected.phone ?? "sin tel"}
                    </div>
                  </div>
                  {suspended && (
                    <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 text-[11px] px-2 py-1 rounded font-bold uppercase">
                      <AlertTriangle className="w-3 h-3" /> Servicio suspendido — se reactiva al pagar
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#1e2a38] text-white text-[11px] uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left w-8">
                          <input
                            type="checkbox"
                            checked={invoices.length > 0 && pickedIds.size === invoices.length}
                            onChange={e => setPickedIds(e.target.checked ? new Set(invoices.map(i => i.id)) : new Set())}
                            title="Seleccionar todas"
                          />
                        </th>
                        <th className="px-3 py-2 text-left">Concepto</th>
                        <th className="px-3 py-2 text-left">Vencimiento</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(i => {
                        const overdue = i.status === "overdue" || (i.days_overdue ?? 0) > 0;
                        return (
                          <tr key={i.id} className="border-t">
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={pickedIds.has(i.id)} onChange={() => togglePick(i.id)} />
                            </td>
                            <td className="px-3 py-2">{i.concept}</td>
                            <td className="px-3 py-2 text-[12px]">{i.due_date}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                overdue ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                              }`}>
                                {overdue ? `Vencida ${i.days_overdue ?? ""}d` : "Pendiente"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">Bs {Number(i.amount).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/30">
                      <tr className="border-t">
                        <td colSpan={4} className="px-3 py-2 text-right font-semibold">Deuda total</td>
                        <td className="px-3 py-2 text-right font-bold text-[#ef4444]">Bs {totalDebt.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Der: promesa + registrar pago */}
              <div className="space-y-4 h-fit sticky top-4">
                {/* Promesa de pago */}
                <div className="bg-card border rounded-md p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <h3 className="font-semibold text-sm">Promesa de pago</h3>
                  </div>
                  {promiseUntil ? (
                    <div className="text-xs text-muted-foreground mb-2">
                      Activa hasta <span className="font-semibold text-amber-700">{promiseUntil}</span>. No se cortará hasta esa fecha.
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mb-2">Postergá el corte por X días. El cliente no será suspendido hasta la fecha elegida.</p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={promiseUntil}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={e => setPromiseUntil(e.target.value)}
                      className="flex-1 border rounded px-2 py-1.5 text-sm bg-background"
                    />
                    <button
                      onClick={() => savePromise(promiseUntil || null)}
                      disabled={promiseSaving || !promiseUntil}
                      className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white px-3 py-1.5 rounded text-xs font-semibold"
                    >{promiseSaving ? "..." : "Guardar"}</button>
                  </div>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {[3, 5, 7, 10].map(d => {
                      const dt = new Date(); dt.setDate(dt.getDate() + d);
                      const v = dt.toISOString().slice(0, 10);
                      return (
                        <button key={d} onClick={() => savePromise(v)} disabled={promiseSaving}
                          className="text-[11px] px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200">
                          +{d} días
                        </button>
                      );
                    })}
                    {promiseUntil && (
                      <button onClick={() => savePromise(null)} disabled={promiseSaving}
                        className="text-[11px] px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border">
                        Cancelar promesa
                      </button>
                    )}
                  </div>
                </div>

                {/* Registrar pago */}
                <div className="bg-card border rounded-md p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Wallet className="w-5 h-5 text-[#16a394]" />
                    <h3 className="font-semibold">Registrar pago</h3>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Facturas ({pickedInvoices.length})</span>
                      <span className="font-semibold">Bs {pickedTotal.toFixed(2)}</span>
                  </div>

                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Extra (opcional)</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={extra} onChange={e => setExtra(e.target.value)}
                      placeholder="0.00"
                      className="w-full border rounded px-2 py-1.5 text-sm bg-background mt-1"
                    />
                  </div>

                  <div className="flex justify-between border-t pt-2">
                    <span className="font-semibold">Total a cobrar</span>
                    <span className="font-bold text-lg text-[#16a394]">Bs {grandTotal.toFixed(2)}</span>
                  </div>

                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Método</label>
                    <select value={method} onChange={e => setMethod(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm bg-background mt-1">
                      <option value="cash">Efectivo</option>
                      <option value="transfer">Transferencia</option>
                      <option value="qr">QR</option>
                      <option value="card">Tarjeta</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Referencia</label>
                    <input
                      value={reference} onChange={e => setReference(e.target.value)}
                      placeholder="Nº comprobante / notas"
                      className="w-full border rounded px-2 py-1.5 text-sm bg-background mt-1"
                    />
                  </div>

                  <button
                    onClick={charge}
                    disabled={saving || grandTotal <= 0}
                    className="w-full bg-[#16a394] hover:bg-[#128677] disabled:opacity-40 text-white py-2.5 rounded font-semibold inline-flex items-center justify-center gap-2 mt-2"
                  >
                    <DollarSign className="w-4 h-4" />
                    {saving ? "Procesando…" : `Cobrar Bs ${grandTotal.toFixed(2)}`}
                  </button>

                  <button onClick={clear} className="w-full text-xs text-muted-foreground hover:text-foreground py-1">
                    Cancelar / buscar otro
                  </button>

                  <Link
                    to="/dashboard/invoices"
                    className="w-full inline-flex items-center justify-center gap-1 text-xs text-primary hover:underline py-1"
                  >
                    <Receipt className="w-3 h-3" /> Ver todas las facturas
                  </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
