import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";
import { ArrowLeft, Radio, DollarSign, Repeat, FileText, Mail, MessageSquare, User, Wifi, Receipt, ListChecks, Send, Copy, Pencil, Check as CheckIcon, X as XIcon, Trash2, Plus, ChevronRight, Home, Eye, EyeOff, Lock, Calendar, MailOpen, Monitor, MessagesSquare, Ban, Wallet, ReceiptText, LifeBuoy, BarChart3, FileStack, Wrench, Save, MapPin } from "lucide-react";
const LeafletPicker = lazy(() => import("@/components/leaflet-picker").then((m) => ({ default: m.LeafletPicker })));
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { useServerFn } from "@tanstack/react-start";
import { suspendService, reactivateService, changeServicePlan, provisionPPPoE, registerPayment, getServiceLive, getServicePppoeSecret, getNextAvailableIp, listRouterPools, poolIpUsage } from "@/lib/isp.functions";
import { RefreshCw, List as ListIcon, X as XClose } from "lucide-react";
import { sendClientMessage } from "@/lib/comms.functions";
import { toast } from "sonner";
import { ClientTrafficChart } from "@/components/client-traffic-chart";

function TrafficToggle({ serviceId }: { serviceId: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <button
        onClick={() => setShow((v) => !v)}
        className="mw-btn mw-btn-outline h-7 text-[11px]"
      >
        <BarChart3 className="w-3 h-3" /> {show ? "Ocultar tráfico" : "Ver tráfico en vivo"}
      </button>
      {show && (
        <div className="mt-2">
          <ClientTrafficChart serviceId={serviceId} />
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/dashboard/clients_/$clientId")({
  head: () => ({ meta: [{ title: "Cliente — ISP Admin" }, { name: "robots", content: "noindex" }] }),
  component: ClientDetail,
});

type Tab = "resumen" | "servicios" | "facturas" | "tickets" | "mensajes" | "documentos" | "estadisticas" | "bitacora";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "resumen", label: "Resumen", icon: User },
  { id: "servicios", label: "Servicios", icon: Wifi },
  { id: "facturas", label: "Facturación", icon: ReceiptText },
  { id: "tickets", label: "Tickets", icon: LifeBuoy },
  { id: "mensajes", label: "Email & SMS", icon: Mail },
  { id: "documentos", label: "Documentos", icon: FileStack },
  { id: "estadisticas", label: "Estadísticas", icon: BarChart3 },
  { id: "bitacora", label: "Log", icon: Wrench },
];


function ClientDetail() {
  const { clientId } = Route.useParams();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("resumen");
  const [client, setClient] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [routers, setRouters] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, any>>({});
  const [liveBusy, setLiveBusy] = useState<string | null>(null);
  const [editSvcId, setEditSvcId] = useState<string | null>(null);
  const [editSvcForm, setEditSvcForm] = useState<any>({});
  const [showPwd, setShowPwd] = useState(false);
  const [editInvId, setEditInvId] = useState<string | null>(null);
  const [editInvForm, setEditInvForm] = useState<{ concept: string; amount: string; due_date: string; status: string }>({ concept: "", amount: "", due_date: "", status: "pending" });
  const [showNewInv, setShowNewInv] = useState(false);
  const [newInv, setNewInv] = useState<{ concept: string; amount: string; due_date: string }>({ concept: "", amount: "", due_date: new Date().toISOString().slice(0,10) });

  const changePlan = useServerFn(changeServicePlan);
  const provision = useServerFn(provisionPPPoE);
  const payFn = useServerFn(registerPayment);
  const liveFn = useServerFn(getServiceLive);
  const secretFn = useServerFn(getServicePppoeSecret);
  const sendFn = useServerFn(sendClientMessage);

  const load = async () => {
    const [c, s, i, a, p, pl, m, r] = await Promise.all([
      supabase.from("clients").select("*").eq("id", clientId).single(),
      supabase.from("services").select("*, plans(name, price, download_mbps, upload_mbps), routers(name, ip_address)").eq("client_id", clientId),
      supabase.from("invoices").select("*").eq("client_id", clientId).order("due_date", { ascending: false }),
      supabase.from("client_actions").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(50),
      supabase.from("payments").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(30),
      supabase.from("plans").select("id, name, price").eq("active", true),
      supabase.from("messages").select("*").ilike("target", `client:${clientId}%`).order("created_at", { ascending: false }).limit(30),
      supabase.from("routers").select("id, name").order("name"),
    ]);
    setClient(c.data); setServices(s.data ?? []); setInvoices(i.data ?? []);
    setActions(a.data ?? []); setPayments(p.data ?? []); setPlans(pl.data ?? []); setMessages(m.data ?? []);
    setRouters(r.data ?? []);
  };
  useEffect(() => { load(); }, [clientId]);

  const loadLive = async (serviceId: string) => {
    setLiveBusy(serviceId);
    try {
      const r = await liveFn({ data: { serviceId } });
      setLive(prev => ({ ...prev, [serviceId]: r }));
    } catch (e: any) { setLive(prev => ({ ...prev, [serviceId]: { error: e.message } })); }
    finally { setLiveBusy(null); }
  };

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    const tId = toast.loading(label + "...");
    try { await fn(); toast.dismiss(tId); toast.success(label + " OK"); await load(); }
    catch (e: any) { toast.dismiss(tId); toast.error(`${label}: ${e.message}`); }
    finally { setBusy(null); }
  };

  const sendMsg = async (code: string, label: string) => {
    setBusy(code);
    const tId = toast.loading(`Enviando ${label}...`);
    try { await sendFn({ data: { clientId, templateCode: code } }); toast.dismiss(tId); toast.success(`${label} enviado`); await load(); }
    catch (e: any) { toast.dismiss(tId); toast.error(e.message); }
    finally { setBusy(null); }
  };

  const startEditSvc = async (s: any) => {
    setEditSvcId(s.id);
    setShowPwd(false);
    setEditSvcForm({
      id: s.id,
      plan_id: s.plan_id ?? "",
      router_id: s.router_id ?? "",
      service_type: s.service_type ?? "pppoe",
      status: s.status ?? "active",
      ip_address: s.ip_address ?? "",
      pppoe_user: s.pppoe_user ?? "",
      pppoe_password: s.pppoe_password ?? "",
      monthly_price: s.monthly_price ?? "",
      auto_suspend: s.auto_suspend ?? true,
    });
    if (!s.router_id || !s.pppoe_user) return;

    const tId = toast.loading("Leyendo contraseña real desde Mikrotik...");
    try {
      const secret = await secretFn({ data: { serviceId: s.id } });
      setEditSvcForm((current: any) => {
        if (current.id && current.id !== s.id) return current;
        return {
          ...current,
          pppoe_user: secret.name ?? current.pppoe_user,
          pppoe_password: secret.password ?? current.pppoe_password,
          ip_address: secret.remote_address ?? current.ip_address,
          status: secret.disabled ? "suspended" : "active",
        };
      });
      toast.dismiss(tId);
      toast.success(secret.password ? "Contraseña real cargada desde Mikrotik" : "Mikrotik no devolvió la contraseña; se mantiene la guardada");
      await load();
    } catch (e: any) {
      toast.dismiss(tId);
      toast.error("No pude leer Mikrotik: " + e.message);
    }
  };
  const saveEditSvc = async (id: string, prev: any) => {
    const f = editSvcForm;
    if (!f.plan_id) { toast.error("Seleccioná un plan"); return; }
    const payload = {
      plan_id: f.plan_id,
      router_id: f.router_id || null,
      service_type: f.service_type,
      status: f.status,
      ip_address: f.ip_address || null,
      pppoe_user: f.pppoe_user || null,
      pppoe_password: f.pppoe_password || null,
      monthly_price: f.monthly_price === "" || f.monthly_price === null ? null : Number(f.monthly_price),
      auto_suspend: !!f.auto_suspend,
    };
    const tId = toast.loading("Guardando servicio...");
    const { error } = await supabase.from("services").update(payload).eq("id", id);
    if (error) { toast.dismiss(tId); toast.error(error.message); return; }
    toast.dismiss(tId);
    setEditSvcId(null);
    // Re-provisionar en Mikrotik si cambió PPPoE/IP/router/plan y hay router asignado
    const changed = ["pppoe_user","pppoe_password","ip_address","router_id","plan_id"].some(k => (prev as any)[k] !== (payload as any)[k]);
    if (changed && payload.router_id && payload.pppoe_user) {
      const t2 = toast.loading("Aplicando en Mikrotik...");
      try { await provision({ data: { serviceId: id } }); toast.dismiss(t2); toast.success("Servicio actualizado y aplicado en Mikrotik"); }
      catch (e: any) { toast.dismiss(t2); toast.error("Guardado, falló push Mikrotik: " + e.message); }
    } else {
      toast.success("Servicio actualizado");
    }
    await load();
  };
  const deleteSvc = async (s: any) => {
    if (!confirm(`¿Eliminar servicio ${s.pppoe_user ?? s.plans?.name}? No se puede deshacer.`)) return;
    const { error } = await supabase.from("services").delete().eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Servicio eliminado"); await load();
  };

  const startEditInv = (i: any) => {
    setEditInvId(i.id);
    setEditInvForm({ concept: i.concept ?? "", amount: String(i.amount), due_date: String(i.due_date).slice(0,10), status: i.status });
  };
  const saveEditInv = async (id: string) => {
    const amt = Number(editInvForm.amount);
    if (!editInvForm.concept.trim() || !editInvForm.due_date || !(amt > 0)) { toast.error("Completá concepto, monto y vencimiento"); return; }
    const { error } = await supabase.from("invoices")
      .update({ concept: editInvForm.concept.trim(), amount: amt, due_date: editInvForm.due_date, status: editInvForm.status })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditInvId(null); await load(); toast.success("Factura actualizada");
  };
  const deleteInv = async (id: string) => {
    if (!confirm("¿Eliminar esta factura? No se puede deshacer.")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await load(); toast.success("Factura eliminada");
  };
  const createInv = async () => {
    const amt = Number(newInv.amount);
    if (!newInv.concept.trim() || !newInv.due_date || !(amt > 0)) { toast.error("Completá concepto, monto y vencimiento"); return; }
    const d = new Date(newInv.due_date);
    const { error } = await supabase.from("invoices").insert({
      client_id: clientId, concept: newInv.concept.trim(), amount: amt,
      due_date: newInv.due_date, status: "pending",
      period_month: d.getMonth() + 1, period_year: d.getFullYear(),
    });
    if (error) { toast.error(error.message); return; }
    setShowNewInv(false);
    setNewInv({ concept: "", amount: "", due_date: new Date().toISOString().slice(0,10) });
    await load(); toast.success("Factura creada");
  };

  if (!client) return <AdminLayout><div className="text-muted-foreground p-6">Cargando cliente...</div></AdminLayout>;

  const pending = invoices.filter(i => i.status !== "paid").reduce((s, r) => s + Number(r.amount), 0);
  const paidTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalSvcs = services.length;
  const activeSvcs = services.filter(s => s.status === "active").length;
  const suspendedSvcs = services.filter(s => s.status === "suspended").length;
  const effectiveStatus = client.status === "cancelled"
    ? "cancelled"
    : totalSvcs === 0 ? client.status : activeSvcs > 0 ? "active" : "suspended";
  const badgeClass = effectiveStatus === "active" ? "mw-badge-green" : effectiveStatus === "suspended" ? "mw-badge-yellow" : "mw-badge-red";

  return (
    <AdminLayout>
      {/* Header cliente estilo MikroWisp */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-full grid place-items-center text-white text-lg font-bold shrink-0 bg-slate-400">
            {client.full_name?.trim().charAt(0).toUpperCase() || "C"}
          </div>
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold text-slate-700 uppercase truncate leading-tight">
              {client.full_name} <span className="text-slate-400 text-[14px] font-normal normal-case">(#{String(client.id).slice(0,6).toUpperCase()})</span>
            </h1>
          </div>
        </div>
        <nav className="text-[13px] text-slate-500 flex items-center gap-1.5 pt-2">
          <button onClick={() => nav({ to: "/dashboard" })} className="hover:text-[#3498db]">Inicio</button>
          <span className="text-slate-300">/</span>
          <button onClick={() => nav({ to: "/dashboard/clients" })} className="hover:text-[#3498db]">Lista usuarios (Activos)</button>
          <span className="text-slate-300">/</span>
          <span className="text-[#3498db]">Editar usuario</span>
        </nav>
      </div>

      {/* Tabs MikroWisp — underline azul */}
      <div className="bg-white border border-slate-200 rounded-t">
        <div className="flex items-center border-b border-slate-200 overflow-x-auto">
          <div className="flex flex-1">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 px-4 h-11 text-[13px] whitespace-nowrap border-b-2 -mb-px transition-colors ${active ? "border-[#3498db] text-[#3498db] font-semibold bg-white" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
                  {active && <span className="w-1.5 h-1.5 rounded-full bg-[#3498db]" />}
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 pr-3 shrink-0">
            <button className="w-6 h-6 rounded-full border border-[#f39c12] text-[#f39c12] grid place-items-center hover:bg-[#f39c12] hover:text-white transition-colors">
              <ChevronRight className="w-3 h-3 rotate-180" />
            </button>
            <button className="w-6 h-6 rounded-full border border-[#f39c12] text-[#f39c12] grid place-items-center hover:bg-[#f39c12] hover:text-white transition-colors">
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {tab === "resumen" && <ResumenTab client={client} services={services} invoices={invoices} onSaved={load} />}

      {tab === "servicios" && (
        <>
          <Panel title="Servicios contratados">
            {/* Desktop: tabla compacta que cabe sin scroll */}
            <div className="hidden md:block">
              <table className="mw-table w-full text-[12px] table-fixed">
                <colgroup>
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "24%" }} />
                </colgroup>
                <thead><tr>
                  <th>Plan</th><th>Router</th><th>IP</th><th>PPPoE</th><th>Estado</th><th className="text-right">Acciones</th>
                </tr></thead>
                <tbody>
                  {services.map(s => {
                    const editing = editSvcId === s.id;
                    if (editing) {
                      const f = editSvcForm;
                      const upd = (k: string, v: any) => setEditSvcForm({ ...f, [k]: v });
                      return (
                        <tr key={s.id} className="bg-[#fff8e6]">
                          <td colSpan={6} className="p-3">
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                              <MwFieldSm label="Plan *">
                                <select value={f.plan_id} onChange={e => upd("plan_id", e.target.value)} className="mw-input h-8 w-full">
                                  <option value="">Seleccionar…</option>
                                  {plans.map(p => <option key={p.id} value={p.id}>{p.name} — Bs {p.price}</option>)}
                                </select>
                              </MwFieldSm>
                              <MwFieldSm label="Router / NAS">
                                <select value={f.router_id} onChange={e => upd("router_id", e.target.value)} className="mw-input h-8 w-full">
                                  <option value="">Sin asignar</option>
                                  {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                              </MwFieldSm>
                              <MwFieldSm label="Tipo">
                                <select value={f.service_type} onChange={e => upd("service_type", e.target.value)} className="mw-input h-8 w-full">
                                  <option value="pppoe">PPPoE</option>
                                  <option value="queue">Simple Queue</option>
                                  <option value="hotspot">Hotspot</option>
                                </select>
                              </MwFieldSm>
                              <MwFieldSm label="Usuario PPPoE">
                                <input value={f.pppoe_user} onChange={e => upd("pppoe_user", e.target.value)} className="mw-input h-8 font-mono w-full" />
                              </MwFieldSm>
                              <MwFieldSm label="Contraseña PPPoE">
                                <div className="relative">
                                  <input type={showPwd ? "text" : "password"} value={f.pppoe_password} onChange={e => upd("pppoe_password", e.target.value)} className="mw-input h-8 font-mono pr-8 w-full" />
                                  <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800" title={showPwd ? "Ocultar" : "Mostrar"}>
                                    {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </MwFieldSm>
                              <MwFieldSm label="IP fija">
                                <ServiceIpPicker routerId={f.router_id} value={f.ip_address} onChange={(v) => upd("ip_address", v)} />
                              </MwFieldSm>
                              <MwFieldSm label="Auto-suspender">
                                <label className="inline-flex items-center gap-2 text-[13px] h-8">
                                  <input type="checkbox" checked={!!f.auto_suspend} onChange={e => upd("auto_suspend", e.target.checked)} />
                                  <span className="text-slate-600">Al vencer facturas</span>
                                </label>
                              </MwFieldSm>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 justify-end">
                              <button onClick={() => setEditSvcId(null)} className="mw-btn mw-btn-outline"><XIcon className="w-3.5 h-3.5" />Cancelar</button>
                              <button onClick={() => saveEditSvc(s.id, s)} className="mw-btn mw-btn-green"><CheckIcon className="w-3.5 h-3.5" />Guardar y aplicar</button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={s.id}>
                        <td className="font-medium text-slate-800 truncate" title={s.plans?.name}>
                          <div className="truncate">{s.plans?.name}</div>
                          <div className="text-[10px] text-slate-500">{s.plans?.download_mbps}/{s.plans?.upload_mbps} Mbps</div>
                        </td>
                        <td className="truncate" title={s.routers?.name ?? ""}>{s.routers?.name ?? "—"}</td>
                        <td className="font-mono text-[11px] truncate" title={s.ip_address ?? ""}>{s.ip_address ?? "—"}</td>
                        <td className="font-mono text-[11px] truncate" title={s.pppoe_user ?? ""}>{s.pppoe_user ?? "—"}</td>
                        <td><span className={`mw-badge ${s.status === "active" ? "mw-badge-green" : s.status === "suspended" ? "mw-badge-yellow" : "mw-badge-red"}`}>{s.status}</span></td>
                        <td>
                          <div className="flex items-center gap-1 justify-end flex-nowrap">
                            <button onClick={() => startEditSvc(s)} className="mw-btn mw-btn-outline h-7 w-7 px-0 justify-center" title="Editar servicio"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => run("Push Mikrotik", () => provision({ data: { serviceId: s.id } }))} className="mw-btn mw-btn-outline h-7 w-7 px-0 justify-center" title="Reaplicar en Mikrotik"><Radio className="w-3 h-3" /></button>
                            {s.pppoe_user && s.pppoe_password && (
                              <button onClick={() => { navigator.clipboard.writeText(`Usuario: ${s.pppoe_user}\nClave: ${s.pppoe_password}`); toast.success("Credenciales copiadas"); }} className="mw-btn mw-btn-outline h-7 w-7 px-0 justify-center" title="Copiar credenciales PPPoE"><Copy className="w-3 h-3" /></button>
                            )}
                            <button onClick={() => deleteSvc(s)} className="p-1 rounded hover:bg-red-500/10 text-red-600" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {services.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Sin servicios</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards apiladas, sin scroll horizontal */}
            <div className="md:hidden divide-y">
              {services.map(s => {
                const editing = editSvcId === s.id;
                if (editing) {
                  const f = editSvcForm;
                  const upd = (k: string, v: any) => setEditSvcForm({ ...f, [k]: v });
                  return (
                    <div key={s.id} className="p-3 bg-[#fff8e6] space-y-2">
                      <MwFieldSm label="Plan *">
                        <select value={f.plan_id} onChange={e => upd("plan_id", e.target.value)} className="mw-input h-8 w-full">
                          <option value="">Seleccionar…</option>
                          {plans.map(p => <option key={p.id} value={p.id}>{p.name} — Bs {p.price}</option>)}
                        </select>
                      </MwFieldSm>
                      <MwFieldSm label="Router / NAS">
                        <select value={f.router_id} onChange={e => upd("router_id", e.target.value)} className="mw-input h-8 w-full">
                          <option value="">Sin asignar</option>
                          {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </MwFieldSm>
                      <MwFieldSm label="Usuario PPPoE">
                        <input value={f.pppoe_user} onChange={e => upd("pppoe_user", e.target.value)} className="mw-input h-8 font-mono w-full" />
                      </MwFieldSm>
                      <MwFieldSm label="Contraseña PPPoE">
                        <input type={showPwd ? "text" : "password"} value={f.pppoe_password} onChange={e => upd("pppoe_password", e.target.value)} className="mw-input h-8 font-mono w-full" />
                      </MwFieldSm>
                      <MwFieldSm label="IP fija">
                        <ServiceIpPicker routerId={f.router_id} value={f.ip_address} onChange={(v) => upd("ip_address", v)} />
                      </MwFieldSm>
                      <div className="flex gap-2 justify-end pt-1">
                        <button onClick={() => setEditSvcId(null)} className="mw-btn mw-btn-outline"><XIcon className="w-3.5 h-3.5" />Cancelar</button>
                        <button onClick={() => saveEditSvc(s.id, s)} className="mw-btn mw-btn-green"><CheckIcon className="w-3.5 h-3.5" />Guardar</button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={s.id} className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 truncate">{s.plans?.name}</div>
                        <div className="text-[11px] text-slate-500">{s.plans?.download_mbps}/{s.plans?.upload_mbps} Mbps · {s.routers?.name ?? "—"}</div>
                      </div>
                      <span className={`mw-badge shrink-0 ${s.status === "active" ? "mw-badge-green" : s.status === "suspended" ? "mw-badge-yellow" : "mw-badge-red"}`}>{s.status}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
                      <div className="text-slate-500">IP</div><div className="font-mono truncate">{s.ip_address ?? "—"}</div>
                      <div className="text-slate-500">PPPoE</div><div className="font-mono truncate">{s.pppoe_user ?? "—"}</div>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <button onClick={() => startEditSvc(s)} className="mw-btn mw-btn-outline h-7 text-[11px]"><Pencil className="w-3 h-3" />Editar</button>
                      <button onClick={() => run("Push Mikrotik", () => provision({ data: { serviceId: s.id } }))} className="mw-btn mw-btn-outline h-7 text-[11px]"><Radio className="w-3 h-3" />Push</button>
                      {s.pppoe_user && s.pppoe_password && (
                        <button onClick={() => { navigator.clipboard.writeText(`Usuario: ${s.pppoe_user}\nClave: ${s.pppoe_password}`); toast.success("Credenciales copiadas"); }} className="mw-btn mw-btn-outline h-7 w-7 px-0 justify-center"><Copy className="w-3 h-3" /></button>
                      )}
                      <button onClick={() => deleteSvc(s)} className="mw-btn mw-btn-outline h-7 w-7 px-0 justify-center text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
              {services.length === 0 && <div className="p-6 text-center text-slate-500 text-sm">Sin servicios</div>}
            </div>
          </Panel>



          <div className="mt-4">
            <Panel title="Estado en Mikrotik (en vivo)">
              <div className="p-3">
                {services.filter(s => s.pppoe_user && s.router_id).length === 0 && (
                  <div className="text-[13px] text-slate-500">Ningún servicio con usuario PPPoE aprovisionado.</div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {services.filter(s => s.pppoe_user && s.router_id).map(s => {
                    const l = live[s.id];
                    const online = !!l?.active;
                    return (
                      <div key={s.id} className="border rounded p-3 bg-[#fbfcfd]">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${online ? "bg-emerald-500 animate-pulse" : l?.error ? "bg-red-500" : "bg-slate-300"}`} />
                            <span className="font-mono text-[12px] font-semibold text-slate-800">{s.pppoe_user}</span>
                          </div>
                          <button onClick={() => loadLive(s.id)} disabled={liveBusy === s.id} className="mw-btn mw-btn-outline h-7 text-[11px] disabled:opacity-50">
                            <Repeat className={`w-3 h-3 ${liveBusy === s.id ? "animate-spin" : ""}`} /> {l ? "Actualizar" : "Consultar"}
                          </button>
                        </div>
                        {l && !l.error && (
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                            <div className="text-slate-500">Estado</div><div className={online ? "text-emerald-600 font-semibold" : "text-slate-500"}>{online ? "● En línea" : "○ Desconectado"}</div>
                            <div className="text-slate-500">Perfil</div><div className="font-mono">{l.secret?.profile ?? "—"}</div>
                            <div className="text-slate-500">IP asignada</div><div className="font-mono">{l.active?.address ?? l.secret?.["remote-address"] ?? "—"}</div>
                            {online && <><div className="text-slate-500">Uptime</div><div className="font-mono">{l.active?.uptime ?? "—"}</div></>}
                          </div>
                        )}
                        {l?.error && <div className="text-[12px] text-red-600">Error: {l.error}</div>}
                        {online && (
                          <div className="mt-3">
                            <TrafficToggle serviceId={s.id} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Panel>
          </div>
        </>
      )}

      {tab === "facturas" && (
        <FacturacionTab
          client={client}
          invoices={invoices}
          payments={payments}
          showNewInv={showNewInv}
          setShowNewInv={setShowNewInv}
          newInv={newInv}
          setNewInv={setNewInv}
          createInv={createInv}
          editInvId={editInvId}
          editInvForm={editInvForm}
          setEditInvForm={setEditInvForm}
          startEditInv={startEditInv}
          saveEditInv={saveEditInv}
          setEditInvId={setEditInvId}
          deleteInv={deleteInv}
          payFn={payFn}
          run={run}
          busy={busy}
          onSaved={load}
        />
      )}


      {tab === "tickets" && (
        <Panel title="Tickets del cliente">
          <div className="p-6 text-center text-slate-500 text-[13px]">Aún no hay tickets abiertos para este cliente.</div>
        </Panel>
      )}

      {tab === "documentos" && (
        <Panel title="Documentos">
          <div className="p-6 text-center text-slate-500 text-[13px]">No hay documentos adjuntos.</div>
        </Panel>
      )}

      {tab === "estadisticas" && (
        <Panel title="Estadísticas">
          <div className="p-6 text-center text-slate-500 text-[13px]">Sin datos suficientes todavía.</div>
        </Panel>
      )}


      {tab === "mensajes" && (
        <>
          <Panel title="Enviar mensaje">
            <div className="p-3 flex flex-wrap gap-2">
              <button onClick={() => sendMsg("welcome", "Bienvenida")} disabled={!!busy || !client.email} className="mw-btn mw-btn-outline"><Mail className="w-3.5 h-3.5" />Bienvenida (email)</button>
              <button onClick={() => sendMsg("invoice_reminder", "Recordatorio")} disabled={!!busy} className="mw-btn mw-btn-outline"><MessageSquare className="w-3.5 h-3.5" />Recordatorio factura</button>
              <button onClick={() => sendMsg("overdue_notice", "Aviso corte")} disabled={!!busy} className="mw-btn mw-btn-outline"><MessageSquare className="w-3.5 h-3.5" />Aviso de corte</button>
            </div>
          </Panel>
          <div className="mt-4">
            <Panel title="Historial">
              <ul className="p-3 space-y-2 text-[13px]">
                {messages.map(m => (
                  <li key={m.id} className="border-b pb-2 last:border-0">
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span className="uppercase font-semibold">{m.channel}</span>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    {m.subject && <div className="font-medium text-slate-800">{m.subject}</div>}
                    <div className="text-slate-600 whitespace-pre-line text-[12px]">{m.content}</div>
                  </li>
                ))}
                {messages.length === 0 && <div className="text-slate-500 text-[13px]">Sin mensajes enviados</div>}
              </ul>
            </Panel>
          </div>
        </>
      )}

      {tab === "bitacora" && (
        <Panel title="Bitácora completa">
          <ul className="p-3 space-y-2 text-[13px]">
            {actions.map(a => (
              <li key={a.id} className="flex gap-3 border-b pb-2 last:border-0">
                <div className="w-8 h-8 rounded-full bg-[#ff5722]/15 grid place-items-center text-[#ff5722] text-[10px] font-bold shrink-0">{a.action.slice(0, 2).toUpperCase()}</div>
                <div className="flex-1"><div className="font-medium capitalize text-slate-800">{a.action.replace(/_/g, " ")}</div><div className="text-[12px] text-slate-500">{a.detail}</div></div>
                <div className="text-[11px] text-slate-500 whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</div>
              </li>
            ))}
            {actions.length === 0 && <div className="text-slate-500 text-[13px]">Sin actividad registrada</div>}
          </ul>
        </Panel>
      )}
    </AdminLayout>
  );
}

function FacturacionTab(props: any) {
  const { client, invoices, payments, showNewInv, setShowNewInv, newInv, setNewInv, createInv,
    editInvId, editInvForm, setEditInvForm, startEditInv, saveEditInv, setEditInvId, deleteInv,
    payFn, run, busy, onSaved } = props;
  const [sub, setSub] = useState<"facturas" | "config" | "trans" | "saldos">("facturas");

  const subs = [
    { id: "facturas", label: "Facturas", icon: "📄" },
    { id: "config", label: "Configuración", icon: "⚙️" },
    { id: "trans", label: "Transacciones", icon: "Bs" },
    { id: "saldos", label: "Saldos", icon: "💰" },
  ] as const;

  const pending = invoices.filter((i: any) => i.status !== "paid" && i.status !== "cancelled").reduce((a: number, b: any) => a + Number(b.amount), 0);
  const paidTotal = payments.reduce((a: number, b: any) => a + Number(b.amount), 0);

  return (
    <div className="space-y-3">
      <div className="flex bg-white rounded shadow-sm border overflow-x-auto">
        {subs.map(s => {
          const active = sub === s.id;
          return (
            <button key={s.id} onClick={() => setSub(s.id as any)}
              className={`inline-flex items-center gap-1.5 px-4 h-9 text-[12.5px] font-semibold whitespace-nowrap border-b-2 ${active ? "border-[#ff5722] text-[#ff5722]" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
              <span>{s.icon}</span> {s.label}
            </button>
          );
        })}
      </div>

      {sub === "facturas" && (
        <Panel title="Historial de facturación" right={
          <button onClick={() => setShowNewInv((v: boolean) => !v)} className="mw-btn mw-btn-primary">
            <Plus className="w-3.5 h-3.5" />Nueva factura
          </button>
        }>
          {showNewInv && (
            <div className="p-3 bg-[#fff8e6] border-b border-[#f0d78c] flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] uppercase text-slate-500 font-semibold">Concepto</label>
                <input value={newInv.concept} onChange={e => setNewInv((f: any) => ({ ...f, concept: e.target.value }))}
                  placeholder="Ej: Servicio internet, Instalación, Recargo…" className="mw-input" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-slate-500 font-semibold">Monto</label>
                <input type="number" step="0.01" min="0" value={newInv.amount} onChange={e => setNewInv((f: any) => ({ ...f, amount: e.target.value }))} className="mw-input w-28 text-right" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-slate-500 font-semibold">Vencimiento</label>
                <input type="date" value={newInv.due_date} onChange={e => setNewInv((f: any) => ({ ...f, due_date: e.target.value }))} className="mw-input w-40" />
              </div>
              <button onClick={createInv} className="mw-btn mw-btn-green"><CheckIcon className="w-3.5 h-3.5" />Crear</button>
              <button onClick={() => setShowNewInv(false)} className="mw-btn mw-btn-outline">Cancelar</button>
            </div>
          )}
          <table className="mw-table">
            <thead><tr><th>Nº</th><th>Concepto</th><th>Vence</th><th className="text-right">Monto</th><th>Estado</th><th className="text-right">Acciones</th></tr></thead>
            <tbody>
              {invoices.map((i: any) => {
                const editing = editInvId === i.id;
                return (
                  <tr key={i.id}>
                    <td className="font-mono text-[11px] text-slate-600">#{i.id.slice(0,8).toUpperCase()}</td>
                    <td>{editing ? (
                      <input value={editInvForm.concept} onChange={e => setEditInvForm((f: any) => ({ ...f, concept: e.target.value }))} className="mw-input h-8" />
                    ) : (i.concept ?? "—")}</td>
                    <td className="text-[12px]">{editing ? (
                      <input type="date" value={editInvForm.due_date} onChange={e => setEditInvForm((f: any) => ({ ...f, due_date: e.target.value }))} className="mw-input h-8 w-36" />
                    ) : new Date(i.due_date).toLocaleDateString()}</td>
                    <td className="text-right font-semibold text-slate-800">{editing ? (
                      <input type="number" step="0.01" min="0" value={editInvForm.amount} onChange={e => setEditInvForm((f: any) => ({ ...f, amount: e.target.value }))} className="mw-input h-8 w-24 text-right" />
                    ) : `Bs ${Number(i.amount).toFixed(2)}`}</td>
                    <td>{editing ? (
                      <select value={editInvForm.status} onChange={e => setEditInvForm((f: any) => ({ ...f, status: e.target.value }))} className="mw-input h-8 w-32">
                        <option value="pending">pending</option><option value="overdue">overdue</option>
                        <option value="paid">paid</option><option value="cancelled">cancelled</option>
                      </select>
                    ) : (
                      <span className={`mw-badge ${i.status === "paid" ? "mw-badge-green" : i.status === "overdue" ? "mw-badge-red" : "mw-badge-yellow"}`}>{i.status}</span>
                    )}</td>
                    <td className="text-right whitespace-nowrap">
                      {editing ? (
                        <>
                          <button onClick={() => saveEditInv(i.id)} title="Guardar" className="p-1 rounded hover:bg-emerald-500/10 text-emerald-600 inline-block mr-1"><CheckIcon className="w-4 h-4" /></button>
                          <button onClick={() => setEditInvId(null)} title="Cancelar" className="p-1 rounded hover:bg-slate-200 text-slate-600 inline-block"><XIcon className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <>
                          <Link to="/dashboard/invoices/$invoiceId" params={{ invoiceId: i.id }} className="p-1 rounded hover:bg-[#ff5722]/10 text-[#ff5722] inline-block mr-1" title="Ver / Imprimir"><FileText className="w-4 h-4" /></Link>
                          <button onClick={() => startEditInv(i)} title="Editar" className="p-1 rounded hover:bg-[#3498db]/10 text-[#3498db] inline-block mr-1"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => deleteInv(i.id)} title="Eliminar" className="p-1 rounded hover:bg-red-500/10 text-red-600 inline-block mr-1"><Trash2 className="w-4 h-4" /></button>
                          {i.status !== "paid" && (
                            <button disabled={!!busy} onClick={() => run("Cobrar factura", () => payFn({ data: { invoiceId: i.id, method: "cash" } }))}
                              className="mw-btn mw-btn-green h-7 text-[11px]"><DollarSign className="w-3 h-3" />Cobrar</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {invoices.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Sin facturas</td></tr>}
            </tbody>
          </table>
        </Panel>
      )}

      {sub === "config" && <BillingConfigTab client={client} onSaved={onSaved} />}

      {sub === "trans" && (
        <Panel title="Transacciones">
          <table className="mw-table">
            <thead><tr><th>Fecha</th><th>Método</th><th>Referencia</th><th className="text-right">Monto</th></tr></thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id}>
                  <td className="text-[12px]">{new Date(p.paid_at ?? p.created_at).toLocaleString()}</td>
                  <td className="uppercase text-[11px] font-semibold text-slate-600">{p.method}</td>
                  <td className="font-mono text-[11px]">{p.reference ?? "—"}</td>
                  <td className="text-right font-semibold text-emerald-600">Bs {Number(p.amount).toFixed(2)}</td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Sin transacciones</td></tr>}
            </tbody>
          </table>
        </Panel>
      )}

      {sub === "saldos" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white border rounded p-4">
            <div className="text-[11px] uppercase text-slate-500 font-semibold">Deuda pendiente</div>
            <div className={`text-2xl font-bold mt-1 ${pending > 0 ? "text-red-600" : "text-emerald-600"}`}>Bs {pending.toFixed(2)}</div>
          </div>
          <div className="bg-white border rounded p-4">
            <div className="text-[11px] uppercase text-slate-500 font-semibold">Total pagado</div>
            <div className="text-2xl font-bold mt-1 text-blue-600">Bs {paidTotal.toFixed(2)}</div>
          </div>
          <div className="bg-white border rounded p-4">
            <div className="text-[11px] uppercase text-slate-500 font-semibold">Saldo a favor</div>
            <div className="text-2xl font-bold mt-1 text-slate-700">Bs {Math.max(0, Number(client.balance ?? 0)).toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const BILLING_DEFAULTS = {
  tipo: "prepago",
  dia_pago: 1,
  crear_factura: "3",
  tipo_impuesto: "ninguno",
  dias_gracia: 5,
  aplicar_corte: "1mes",
  bajar_velocidad: false,
  fecha_fija: "",
  corte_fijo: "",
  aplicar_mora: false,
  aplicar_reconexion: false,
  aviso_nueva_factura: false,
  aviso_pantalla: false,
  recordatorios_pago: false,
  recordatorio_1: false,
  recordatorio_2: false,
  recordatorio_3: false,
};

function BillingConfigTab({ client, onSaved }: { client: any; onSaved: () => any }) {
  const cfg = { ...BILLING_DEFAULTS, ...(client.billing_config ?? {}), dia_pago: client.billing_day ?? 1, dias_gracia: client.grace_days_override ?? 5 };
  const [f, setF] = useState<any>(cfg);
  const [saving, setSaving] = useState(false);
  const upd = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { dia_pago, dias_gracia, ...rest } = f;
    const { error } = await supabase.from("clients").update({
      billing_day: Number(dia_pago) || 1,
      grace_days_override: dias_gracia === "" || dias_gracia === null ? null : Number(dias_gracia),
      billing_config: rest,
    }).eq("id", client.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configuración guardada");
    await onSaved();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Panel title="💵 Facturación">
        <div className="p-4 space-y-3">
          <CfgRow label="Tipo">
            <select value={f.tipo} onChange={e => upd("tipo", e.target.value)} className="mw-input h-8">
              <option value="prepago">Prepago (Adelantado)</option>
              <option value="pospago">Pospago (Vencido)</option>
            </select>
          </CfgRow>
          <CfgRow label="Día pago">
            <select value={f.dia_pago} onChange={e => upd("dia_pago", Number(e.target.value))} className="mw-input h-8">
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{String(d).padStart(2, "0")}</option>)}
            </select>
          </CfgRow>
          <CfgRow label="Crear Factura">
            <select value={f.crear_factura} onChange={e => upd("crear_factura", e.target.value)} className="mw-input h-8">
              <option value="0">El mismo día</option>
              <option value="1">1 Día antes</option>
              <option value="3">3 Días antes</option>
              <option value="5">5 Días antes</option>
              <option value="7">7 Días antes</option>
              <option value="10">10 Días antes</option>
            </select>
          </CfgRow>
          <CfgRow label="Tipo impuesto">
            <select value={f.tipo_impuesto} onChange={e => upd("tipo_impuesto", e.target.value)} className="mw-input h-8">
              <option value="ninguno">Ninguno</option>
              <option value="iva">IVA</option>
              <option value="ret">Retención</option>
            </select>
          </CfgRow>
          <CfgRow label="Días de gracia" help="días tolerancia para aplicar corte">
            <select value={f.dias_gracia} onChange={e => upd("dias_gracia", Number(e.target.value))} className="mw-input h-8">
              {[0,1,2,3,4,5,6,7,10,15,20,30].map(d => <option key={d} value={d}>{d} Días</option>)}
            </select>
          </CfgRow>
          <CfgRow label="Aplicar Corte">
            <select value={f.aplicar_corte} onChange={e => upd("aplicar_corte", e.target.value)} className="mw-input h-8">
              <option value="nunca">Nunca</option>
              <option value="1fact">1 Factura vencida</option>
              <option value="1mes">1 Mes vencido</option>
              <option value="2mes">2 Meses vencidos</option>
              <option value="3mes">3 Meses vencidos</option>
            </select>
          </CfgRow>
          <CfgRow label="Bajar Velocidad" help="Limita la velocidad del cliente y no suspende. Se quita el límite Automáticamente cuando el cliente paga todas sus facturas.">
            <select value={f.bajar_velocidad ? "1" : "0"} onChange={e => upd("bajar_velocidad", e.target.value === "1")} className="mw-input h-8">
              <option value="0">Desactivado</option>
              <option value="1">Activado</option>
            </select>
          </CfgRow>
          <CfgRow label="Fecha Fija">
            <input type="date" value={f.fecha_fija} onChange={e => upd("fecha_fija", e.target.value)} placeholder="Automático" className="mw-input h-8" />
          </CfgRow>
          <CfgRow label="Corte Fijo Programado">
            <input type="date" value={f.corte_fijo} onChange={e => upd("corte_fijo", e.target.value)} placeholder="Automático" className="mw-input h-8" />
          </CfgRow>
          <CfgRow label="Aplicar Mora">
            <SwitchTiny checked={!!f.aplicar_mora} onChange={v => upd("aplicar_mora", v)} />
          </CfgRow>
          <CfgRow label="Aplicar Reconexión">
            <SwitchTiny checked={!!f.aplicar_reconexion} onChange={v => upd("aplicar_reconexion", v)} />
          </CfgRow>
        </div>
      </Panel>

      <Panel title="🔔 Notificaciones">
        <div className="p-4 space-y-3">
          <CfgRow label="Aviso nueva factura">
            <select value={f.aviso_nueva_factura ? "1" : "0"} onChange={e => upd("aviso_nueva_factura", e.target.value === "1")} className="mw-input h-8">
              <option value="0">Desactivado</option><option value="1">Activado</option>
            </select>
          </CfgRow>
          <CfgRow label="Aviso en Pantalla" help="Aviso solo en páginas HTTP">
            <select value={f.aviso_pantalla ? "1" : "0"} onChange={e => upd("aviso_pantalla", e.target.value === "1")} className="mw-input h-8">
              <option value="0">Desactivado</option><option value="1">Activado</option>
            </select>
          </CfgRow>
          <CfgRow label="Recordatorios de pago">
            <select value={f.recordatorios_pago ? "1" : "0"} onChange={e => upd("recordatorios_pago", e.target.value === "1")} className="mw-input h-8">
              <option value="0">Desactivado</option><option value="1">Activado</option>
            </select>
          </CfgRow>
          <CfgRow label="Recordatorio #1">
            <select value={f.recordatorio_1 ? "1" : "0"} onChange={e => upd("recordatorio_1", e.target.value === "1")} className="mw-input h-8">
              <option value="0">Desactivado</option><option value="1">Activado</option>
            </select>
          </CfgRow>
          <CfgRow label="Recordatorio #2">
            <select value={f.recordatorio_2 ? "1" : "0"} onChange={e => upd("recordatorio_2", e.target.value === "1")} className="mw-input h-8">
              <option value="0">Desactivado</option><option value="1">Activado</option>
            </select>
          </CfgRow>
          <CfgRow label="Recordatorio #3" help="Días antes/después del vencimiento de una factura">
            <select value={f.recordatorio_3 ? "1" : "0"} onChange={e => upd("recordatorio_3", e.target.value === "1")} className="mw-input h-8">
              <option value="0">Desactivado</option><option value="1">Activado</option>
            </select>
          </CfgRow>

          <div className="flex justify-end pt-2">
            <button onClick={save} disabled={saving} className="mw-btn mw-btn-primary">
              <CheckIcon className="w-3.5 h-3.5" />{saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function CfgRow({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 items-start">
      <label className="text-[12.5px] text-slate-600 pt-1.5 text-right">{label}</label>
      <div>
        {children}
        {help && <div className="text-[11px] text-red-500 mt-1 leading-tight">*{help}</div>}
      </div>
    </div>
  );
}

function SwitchTiny({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-10 items-center rounded-full transition ${checked ? "bg-[#ff5722]" : "bg-slate-300"}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}



function ResumenTab({ client, services, invoices, onSaved }: { client: any; services: any[]; invoices: any[]; onSaved: () => Promise<void> | void }) {
  const [form, setForm] = useState({
    full_name: client.full_name ?? "", document: client.document ?? "",
    address: client.address ?? "", phone: client.phone ?? "", email: client.email ?? "",
    city: client.city ?? "", billing_day: client.billing_day ?? 1,
    notes: client.notes ?? "", dont_cut: !!client.dont_cut,
    latitude: client.latitude != null ? Number(client.latitude) : null as number | null,
    longitude: client.longitude != null ? Number(client.longitude) : null as number | null,
  });
  const [saving, setSaving] = useState(false);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    setForm({
      full_name: client.full_name ?? "", document: client.document ?? "",
      address: client.address ?? "", phone: client.phone ?? "", email: client.email ?? "",
      city: client.city ?? "", billing_day: client.billing_day ?? 1,
      notes: client.notes ?? "", dont_cut: !!client.dont_cut,
      latitude: client.latitude != null ? Number(client.latitude) : null,
      longitude: client.longitude != null ? Number(client.longitude) : null,
    });
  }, [client.id]);

  const save = async () => {
    if (!form.full_name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    const tId = toast.loading("Guardando...");
    const { error } = await supabase.from("clients").update({
      full_name: form.full_name.trim(), document: form.document || null,
      address: form.address || null, phone: form.phone || null, email: form.email || null,
      city: form.city || null, billing_day: Number(form.billing_day) || 1,
      notes: form.notes || null, dont_cut: form.dont_cut,
      latitude: form.latitude, longitude: form.longitude,
    }).eq("id", client.id);
    toast.dismiss(tId);
    if (error) toast.error(error.message);
    else { toast.success("Datos guardados"); await onSaved(); }
    setSaving(false);
  };

  const routerNames = Array.from(new Set(services.map(s => s.routers?.name).filter(Boolean))).join(", ") || "—";
  const activeSvcs = services.filter(s => s.status === "active").length;
  const status = client.status === "cancelled" ? "cancelled" : services.length === 0 ? client.status : activeSvcs > 0 ? "active" : "suspended";
  const debt = invoices.filter(i => i.status !== "paid").reduce((s, r) => s + Number(r.amount), 0);
  const nextDue = invoices.filter(i => i.status !== "paid").sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const nextCut = new Date(); nextCut.setDate(nextCut.getDate() + 5);

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 bg-white border border-t-0 border-slate-200 rounded-b p-5">
      {/* Datos del cliente — MikroWisp style */}
      <div>
        <div className="text-[15px] font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <span className="text-[#3498db]">»</span> Datos del cliente
        </div>
        <div className="space-y-3">
          <MwField label="Estado">
            <span className={`inline-flex items-center px-3 py-1 rounded text-white text-[11px] font-bold uppercase tracking-wide ${status === "active" ? "bg-[#16a394]" : status === "suspended" ? "bg-[#f39c12]" : "bg-[#e74c3c]"}`}>
              {status === "active" ? "ACTIVO" : status === "suspended" ? "SUSPENDIDO" : "CANCELADO"}
            </span>
          </MwField>
          <MwField label="Conectado al Router(s)">
            <span className="text-[13px] font-semibold text-slate-800 uppercase">{routerNames}</span>
          </MwField>
          <MwField label="ID">
            <input readOnly value={String(client.id).slice(0, 8).toUpperCase()} className="mw-input bg-slate-50 font-mono" />
          </MwField>
          <MwField label={<span className="inline-flex items-center gap-1.5">Contraseña <Lock className="w-3 h-3 text-slate-500" /></span>}>
            <input readOnly value={String(client.id).slice(0,6).toLowerCase()} className="mw-input bg-slate-50 font-mono" />
          </MwField>
          <MwField label="Nº Identificación">
            <input value={form.document} onChange={e => setForm({ ...form, document: e.target.value })} className="mw-input" />
            <div className="text-[11px] text-slate-500 mt-1">CEDULA, DNI, RUC, CUIT, NIT, SAT, RUT, RTN, ETC.</div>
          </MwField>
          <MwField label="Cliente">
            <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="mw-input" />
          </MwField>
          <MwField label="Dirección Principal">
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="mw-input" />
          </MwField>
          <MwField label="Teléfono fijo">
            <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="mw-input" />
          </MwField>
          <MwField label="Teléfono Movil">
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="mw-input" />
          </MwField>
          <MwField label="E-mail">
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mw-input" />
          </MwField>
          <MwField label="Ubicación">
            <select className="mw-input">
              <option>Seleccionar...</option>
            </select>
          </MwField>
          <MwField label="Nº Código de pago">
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mw-input" />
            <div className="text-[11px] text-slate-500 mt-1">* Código generado para Cuentadigital, Cobro digital y Tarjetas Payu</div>
          </MwField>
          <MwField label="Día de pago">
            <input type="number" min={1} max={28} value={form.billing_day} onChange={e => setForm({ ...form, billing_day: Number(e.target.value) })} className="mw-input w-24" />
          </MwField>
          <MwField label="No cortar">
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={form.dont_cut} onChange={e => setForm({ ...form, dont_cut: e.target.checked })} />
              <span className="text-slate-600">Proteger cliente VIP contra cortes automáticos</span>
            </label>
          </MwField>

          <div className="pt-4 text-center">
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 h-9 px-5 rounded border-2 border-[#3498db] text-[#3498db] text-[13px] font-semibold hover:bg-[#3498db] hover:text-white transition-colors disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? "Guardando..." : "Guardar datos"}
            </button>
          </div>
        </div>
      </div>

      {/* Resumen Notificaciones — MikroWisp tiles */}
      <div>
        <div className="text-[15px] font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <span className="text-[#3498db]">»</span> Resumen Notificaciones
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <MwTile color="#16a394" icon={Calendar} title={nextDue ? new Date(nextDue.due_date).toLocaleDateString() : "—"} sub="Día de Pago" />
          <MwTile color="#f39c12" icon={MailOpen} title={nextDue ? new Date(nextDue.due_date).toLocaleDateString() + " 07:30:00 am" : "Sin pendiente"} sub="Crear & Enviar Factura" />
          <MwTile color={client.dont_cut ? "#16a394" : "#16a394"} icon={Monitor} title={client.dont_cut ? "Desactivado" : "Activado"} sub="Aviso en pantalla" />
          <MwTile color="#8e44ad" icon={MessagesSquare} title={client.phone ? "Activado 08:50:00 am" : "Desactivado"} sub="Aviso SMS" />
          <MwTile color="#e74c3c" icon={Ban} title={nextCut.toLocaleDateString() + " 06:00:00 am"} sub="Próximo Corte de Servicios" />
          <MwTile color="#3498db" icon={Wallet} title={`Bs ${debt.toFixed(2)}`} sub="Deuda Actual" />
          <MwTile color="#e91e63" icon={ReceiptText} title={`Bs ${Number(client.balance ?? 0).toFixed(2)}`} sub="Saldos" wide />
        </div>
      </div>
    </div>
  );
}


function MwField({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-4 items-start">
      <label className="text-[13px] text-slate-600 text-right pt-2">{label}</label>
      <div>{children}</div>

    </div>
  );
}

function MwFieldSm({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">{label}</div>
      {children}
    </label>
  );
}

function MwTile({ color, icon: Icon, title, sub, wide }: { color: string; icon: any; title: string; sub: string; wide?: boolean }) {
  return (
    <div className={`rounded text-white px-3 py-2.5 flex items-center gap-3 shadow-sm ${wide ? "col-span-2" : ""}`} style={{ background: color }}>
      <Icon className="w-7 h-7 opacity-90 shrink-0" strokeWidth={1.75} />
      <div className="min-w-0">
        <div className="font-bold text-[13px] leading-tight truncate">{title}</div>
        <div className="text-[11px] opacity-90 truncate">{sub}</div>
      </div>
    </div>
  );
}


function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mw-panel">
      <div className="mw-panel-header">
        <div className="mw-panel-title flex items-center gap-2"><span className="text-[#ff5722]">»</span> {title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function MiniKpi({ label, value, note, color }: { label: string; value: string; note?: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-[15px] font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}{note && <span className="normal-case text-amber-600"> · {note}</span>}</div>
    </div>
  );
}

function ServiceIpPicker({ routerId, value, onChange }: { routerId: string; value: string; onChange: (v: string) => void }) {
  const nextIpFn = useServerFn(getNextAvailableIp);
  const listPoolsFn = useServerFn(listRouterPools);
  const poolUsageFn = useServerFn(poolIpUsage);
  const [pools, setPools] = useState<any[]>([]);
  const [poolId, setPoolId] = useState<string>("");
  const [poolIps, setPoolIps] = useState<any[] | null>(null);
  const [stats, setStats] = useState<{ total: number; used: number; free: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [showPicker, setShowPicker] = useState(false);
  const [filter, setFilter] = useState<"free" | "all">("free");

  useEffect(() => {
    setPools([]); setPoolId(""); setPoolIps(null); setStats(null);
    if (!routerId) return;
    (async () => {
      try {
        const res: any = await listPoolsFn({ data: { routerId } });
        const list = res.pools ?? [];
        setPools(list);
        const def = list.find((p: any) => p.is_default) ?? list[0];
        if (def) setPoolId(def.id);
      } catch { /* ignore */ }
    })();
  }, [routerId]);

  const loadPool = async (pid: string) => {
    if (!pid) { setPoolIps(null); setStats(null); return; }
    setLoading(true);
    try {
      const res: any = await poolUsageFn({ data: { poolId: pid, scanRouter: true, limit: 512 } });
      if (res.ok) { setPoolIps(res.ips); setStats({ total: res.total, used: res.used, free: res.free }); }
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { if (poolId) loadPool(poolId); }, [poolId]);

  const assign = async () => {
    if (!routerId) { setStatus("Elegí router primero"); return; }
    setStatus("Buscando IP libre…");
    try {
      if (poolId && poolIps) {
        const free = poolIps.find((x: any) => x.status === "free");
        if (free) { onChange(free.ip); setStatus(`✓ ${free.ip} — pool`); return; }
      }
      const res: any = await nextIpFn({ data: { routerId } });
      if (res.ok) { onChange(res.ip); setStatus(`✓ ${res.ip} — Bs {res.cidr}`); }
      else setStatus("✗ " + res.error);
    } catch (e: any) { setStatus("✗ " + e.message); }
  };

  return (
    <div className="space-y-1">
      {pools.length > 0 && (
        <div className="flex gap-1 items-center">
          <select value={poolId} onChange={e => setPoolId(e.target.value)} className="mw-input h-7 text-[11px] flex-1">
            <option value="">— Auto /24 —</option>
            {pools.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}{p.is_default ? " ⭐" : ""}{p.cidr ? ` (${p.cidr})` : ""}</option>
            ))}
          </select>
          <button type="button" onClick={() => loadPool(poolId)} title="Refrescar" className="px-1.5 h-7 rounded border hover:bg-muted"><RefreshCw className={"w-3 h-3 " + (loading ? "animate-spin" : "")} /></button>
        </div>
      )}
      <div className="flex gap-1 items-center">
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="10.0.0.100" className="mw-input h-8 font-mono flex-1" />
        <button type="button" onClick={assign} title="Autoasignar IP libre" className="px-2 h-8 rounded border hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button>
        {poolId && poolIps && (
          <button type="button" onClick={() => { setFilter("free"); setShowPicker(true); }} title="Elegir del pool" className="px-2 h-8 rounded border hover:bg-muted"><ListIcon className="w-3.5 h-3.5" /></button>
        )}
      </div>
      {(status || stats) && (
        <div className="text-[10px] text-slate-500">{status}{stats ? ` · ${stats.free} libres / ${stats.used} usadas de ${stats.total}` : ""}</div>
      )}
      {showPicker && poolIps && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowPicker(false)}>
          <div className="bg-background rounded-lg shadow-xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between">
              <div className="text-sm font-medium">Elegir IP del pool</div>
              <button onClick={() => setShowPicker(false)} className="p-1 hover:bg-muted rounded"><XClose className="w-4 h-4" /></button>
            </div>
            <div className="p-2 border-b flex gap-2 text-xs">
              <button onClick={() => setFilter("free")} className={"px-2 py-1 rounded " + (filter === "free" ? "bg-primary text-primary-foreground" : "border")}>Libres ({stats?.free ?? 0})</button>
              <button onClick={() => setFilter("all")} className={"px-2 py-1 rounded " + (filter === "all" ? "bg-primary text-primary-foreground" : "border")}>Todas ({stats?.total ?? 0})</button>
              <button onClick={() => loadPool(poolId)} className="ml-auto px-2 py-1 rounded border inline-flex items-center gap-1"><RefreshCw className={"w-3 h-3 " + (loading ? "animate-spin" : "")} /> Refrescar</button>
            </div>
            <div className="overflow-auto flex-1 divide-y text-xs">
              {poolIps.filter((x: any) => filter === "all" || x.status === "free").map((x: any) => {
                const dis = x.status !== "free";
                const badge = x.status === "free" ? "text-emerald-600" : x.status === "used" ? "text-orange-600" : x.status === "live" ? "text-red-600" : "text-muted-foreground";
                return (
                  <button key={x.ip} disabled={dis} onClick={() => { onChange(x.ip); setShowPicker(false); setStatus(`✓ ${x.ip} — elegida`); }} className={"w-full text-left px-3 py-1.5 flex items-center justify-between " + (dis ? "opacity-60 cursor-not-allowed" : "hover:bg-muted")}>
                    <span className="font-mono">{x.ip}</span>
                    <span className={"text-[10px] uppercase " + badge}>{x.status}{x.clientName ? ` — Bs {x.clientName}` : ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
