import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Search, Eye, Check, KeyRound, HelpCircle, MapPin, Calendar, User, Lock, ChevronLeft, X, Loader2, CheckCircle2, XCircle, Pencil, Power, UserX, Wrench, Filter, List, Save, RefreshCw, Send, DollarSign, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin-layout";
import { provisionNewClient, suspendService, reactivateService, getNextAvailableIp, listRouterPools, poolIpUsage, deleteClientCascade } from "@/lib/isp.functions";
import { listClientsData } from "@/lib/clients.functions";
import { listCutoffPolicies, type CutoffPolicy } from "@/lib/cutoff-policies.functions";
import { toast } from "sonner";
const LeafletPicker = lazy(() => import("@/components/leaflet-picker").then((m) => ({ default: m.LeafletPicker })));

export const Route = createFileRoute("/dashboard/clients")({
  head: () => ({
    meta: [
      { title: "Clientes — MikroSystem ISP" },
      { name: "description", content: "Alta y gestión de clientes con provisión PPPoE." },
      { property: "og:title", content: "Clientes — MikroSystem ISP" },
      { property: "og:description", content: "Alta y gestión de clientes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientsPage,
});

type Client = { id: string; full_name: string; document: string | null; email: string | null; phone: string | null; city: string | null; status: string; created_at: string; balance?: number | null; services?: { id: string; ip_address: string | null; pppoe_user: string | null; status: string; plans: { name: string } | null }[] };
type Plan = { id: string; name: string; price: number; download_mbps: number; upload_mbps: number };
type Router = { id: string; name: string; ip_address: string | null };

const randomStr = (n: number) => {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const ROUTER_BADGE_PALETTE = [
  "bg-sky-100 text-sky-700 border-sky-300",
  "bg-emerald-100 text-emerald-700 border-emerald-300",
  "bg-violet-100 text-violet-700 border-violet-300",
  "bg-amber-100 text-amber-800 border-amber-300",
  "bg-rose-100 text-rose-700 border-rose-300",
  "bg-teal-100 text-teal-700 border-teal-300",
  "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300",
  "bg-indigo-100 text-indigo-700 border-indigo-300",
  "bg-lime-100 text-lime-800 border-lime-300",
  "bg-orange-100 text-orange-700 border-orange-300",
];
const routerBadgeClass = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ROUTER_BADGE_PALETTE[h % ROUTER_BADGE_PALETTE.length];
};


const initialForm = {
  // Paso 1 - Datos personales
  id_cliente: "", portal_password: "", document: "", full_name: "",
  address: "", city: "", phone_fixed: "", phone: "", email: "",
  // Paso 2 - Facturación y Notificaciones
  billing_type: "prepago", billing_day: 1, invoice_offset: 5,
  tax_mode: "included", grace_days: 5, cutoff: "1mes", fixed_date: "",
  apply_late_fee: false, apply_reconnect_fee: false,
  tax1: 0, tax2: 0, tax3: 0,
  notify_new_invoice: "off", notify_screen: "off", reminders: "email",
  reminder1: "2d", reminder2: "off", reminder3: "off",
  // Paso 3 - Servicios / PPPoE
  router_id: "", exclude_firewall: false, plan_id: "", description_svc: "",
  cost: "", ip_type: "", mac_address: "", pppoe_user: "", pppoe_password: "",
  routes: "", caja_nap: "", puerto_nap: "",
  install_address: "", coordinates: "", install_date: new Date().toISOString().slice(0, 10),
  connected_to: "", admin_ip: "", antenna_type: "otro",
  cutoff_policy_id: "",
  provision: true,
};

function ClientsPage() {
  const nav = useNavigate();
  const provision = useServerFn(provisionNewClient);
  const doSuspend = useServerFn(suspendService);
  const doReactivate = useServerFn(reactivateService);
  const doDelete = useServerFn(deleteClientCascade);
  const loadClientData = useServerFn(listClientsData);
  const [rows, setRows] = useState<Client[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [routers, setRouters] = useState<Router[]>([]);
  const [policies, setPolicies] = useState<CutoffPolicy[]>([]);
  const loadPolicies = useServerFn(listCutoffPolicies);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pageSize, setPageSize] = useState<number>(15);
  const [page, setPage] = useState<number>(1);
  const [showFilters, setShowFilters] = useState(false);
  const [fIp, setFIp] = useState("");
  const [fPppoe, setFPppoe] = useState("");
  const [fPlan, setFPlan] = useState<string>("all");
  const [fRouter, setFRouter] = useState<string>("all");
  const [fCity, setFCity] = useState("");
  const [fDebt, setFDebt] = useState<string>("all"); // all | with | without | promise | vip
  const [fBillDay, setFBillDay] = useState<string>("");
  const clearFilters = () => { setFIp(""); setFPppoe(""); setFPlan("all"); setFRouter("all"); setFCity(""); setFDebt("all"); setFBillDay(""); setQ(""); setStatusFilter("all"); };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [steps, setSteps] = useState<{ key: string; ok: boolean; detail?: string }[] | null>(null);
  const [form, setForm] = useState(initialForm);
  const setBusy = (id: string, on: boolean) => setBusyIds(prev => {
    const s = new Set(prev); on ? s.add(id) : s.delete(id); return s;
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await loadClientData() as any;
      setRows((data?.clients as Client[]) ?? []);
      setPlans((data?.plans as Plan[]) ?? []);
      setRouters((data?.routers as Router[]) ?? []);
    } catch (e) {
      toast.error((e as Error).message);
      setRows([]);
      setPlans([]);
      setRouters([]);
    }
    setLoading(false);
  };
  useEffect(() => { load(); loadPolicies({}).then(setPolicies).catch(() => {}); }, []);

  const genCreds = () => {
    const base = (form.full_name || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "user";
    setForm(f => ({ ...f, pppoe_user: `${base}${Math.floor(Math.random() * 900 + 100)}`, pppoe_password: randomStr(10) }));
  };

  const openForm = () => { setForm({ ...initialForm, portal_password: randomStr(7) }); setStep(1); setSteps(null); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setSteps(null); };
  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  const canNext1 = form.full_name.trim().length > 0;
  const canRegister = form.plan_id && form.router_id && form.pppoe_user && form.pppoe_password;

  const submit = async () => {
    if (!canRegister) { toast.error("Seleccioná router, plan y credenciales PPPoE"); return; }
    setSaving(true); setSteps(null);
    try {
      const notes = [
        `Facturación: ${form.billing_type} · día ${form.billing_day} · corte ${form.cutoff}`,
        `Impuestos: ${form.tax_mode} · gracia ${form.grace_days}d${form.apply_late_fee ? " · mora" : ""}${form.apply_reconnect_fee ? " · reconexión" : ""}`,
        form.description_svc ? `Servicio: ${form.description_svc}` : "",
        form.coordinates ? `GPS: ${form.coordinates}` : "",
        form.connected_to ? `Conectado a: ${form.connected_to}` : "",
        form.antenna_type ? `Antena: ${form.antenna_type}` : "",
      ].filter(Boolean).join(" | ");

      const res = await provision({
        data: {
          client: {
            full_name: form.full_name, document: form.document || undefined, email: form.email || undefined,
            phone: form.phone || form.phone_fixed || undefined, address: form.address || undefined,
            city: form.city || undefined, billing_day: Number(form.billing_day) || 1,
          },
          service: {
            plan_id: form.plan_id, router_id: form.router_id,
            pppoe_user: form.pppoe_user, pppoe_password: form.pppoe_password,
            ip_address: form.admin_ip || undefined,
            installation_address: form.install_address || form.address || undefined,
          },
          provision: form.provision,
        },
      });
      // Guardar notas y mac en el servicio recién creado
      if (res.serviceId) {
        await supabase.from("services").update({
          mac_address: form.mac_address || null,
          notes: notes || null,
          installation_date: form.install_date || null,
        }).eq("id", res.serviceId);
      }
      if (res.clientId && form.coordinates) {
        const [lat, lng] = form.coordinates.split(",").map(s => Number(s.trim()));
        if (!isNaN(lat) && !isNaN(lng)) {
          await supabase.from("clients").update({ latitude: lat, longitude: lng }).eq("id", res.clientId);
        }
      }
      if (res.clientId && form.cutoff_policy_id) {
        const pol = policies.find(p => p.id === form.cutoff_policy_id);
        await supabase.from("clients").update({
          cutoff_policy_id: form.cutoff_policy_id,
          grace_days_override: pol?.grace_days ?? null,
        }).eq("id", res.clientId);
      }
      setSteps(res.steps);
      await load();
      setTimeout(() => { closeForm(); nav({ to: "/dashboard/clients/$clientId", params: { clientId: res.clientId } }); }, 900);
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar definitivamente a ${name}?\n\nEsto también eliminará la cuenta PPPoE del Mikrotik.`)) return;
    setBusy(id, true);
    const tId = toast.loading(`Eliminando ${name} y limpiando Mikrotik...`);
    try {
      const res: any = await doDelete({ data: { clientId: id } });
      toast.dismiss(tId);
      const okCount = (res.mikrotik ?? []).filter((r: any) => r.ok).length;
      const failCount = (res.mikrotik ?? []).length - okCount;
      if (failCount > 0) toast.warning(`Cliente eliminado. Mikrotik: ${okCount} ok, ${failCount} con error`);
      else toast.success(`Cliente eliminado (${okCount} cuenta(s) PPPoE removida(s))`);
    } catch (e) {
      toast.dismiss(tId);
      toast.error("Error: " + (e as Error).message);
    } finally {
      setBusy(id, false);
      load();
    }
  };

  // ------- Edición inline (modal) -------
  const [editing, setEditing] = useState<any | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const openEdit = async (c: Client) => {
    const { data } = await supabase.from("clients").select("*").eq("id", c.id).maybeSingle();
    setEditing({ ...(data ?? c), billing_day: (data as any)?.billing_day ?? 1, balance: (data as any)?.balance ?? 0 });
  };
  const saveEdit = async () => {
    if (!editing) return;
    if (!editing.full_name?.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSavingEdit(true);
    const { error } = await supabase.from("clients").update({
      full_name: editing.full_name, document: editing.document, email: editing.email,
      phone: editing.phone, address: editing.address, city: editing.city,
      status: editing.status, billing_day: Number(editing.billing_day) || 1,
      balance: Number(editing.balance) || 0,
      latitude: editing.latitude != null && editing.latitude !== "" ? Number(editing.latitude) : null,
      longitude: editing.longitude != null && editing.longitude !== "" ? Number(editing.longitude) : null,
    }).eq("id", editing.id);
    setSavingEdit(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cambios guardados");
    setEditing(null);
    load();
  };


  const filtered = useMemo(() => rows.filter(r => {
    const ql = q.toLowerCase();
    const matchesQ = !q || r.full_name.toLowerCase().includes(ql) ||
      r.document?.toLowerCase().includes(ql) ||
      r.email?.toLowerCase().includes(ql) ||
      r.phone?.toLowerCase().includes(ql) ||
      r.services?.some((s: any) => s.pppoe_user?.toLowerCase().includes(ql) || s.ip_address?.toLowerCase().includes(ql));
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    const matchesIp = !fIp || r.services?.some((s: any) => s.ip_address?.includes(fIp));
    const matchesPppoe = !fPppoe || r.services?.some((s: any) => s.pppoe_user?.toLowerCase().includes(fPppoe.toLowerCase()));
    const matchesPlan = fPlan === "all" || r.services?.some((s: any) => s.plan_id === fPlan);
    const matchesRouter = fRouter === "all" || r.services?.some((s: any) => s.router_id === fRouter);
    const matchesCity = !fCity || r.city?.toLowerCase().includes(fCity.toLowerCase());
    const bal = Number((r as any).balance ?? 0);
    const promiseUntil = (r as any).payment_promise_until;
    const hasPromise = promiseUntil && new Date(promiseUntil) >= new Date();
    const matchesDebt = fDebt === "all"
      || (fDebt === "with" && bal > 0)
      || (fDebt === "without" && bal <= 0)
      || (fDebt === "promise" && hasPromise)
      || (fDebt === "vip" && (r as any).dont_cut === true);
    const matchesBillDay = !fBillDay || String((r as any).billing_day ?? "") === fBillDay;
    return matchesQ && matchesStatus && matchesIp && matchesPppoe && matchesPlan && matchesRouter && matchesCity && matchesDebt && matchesBillDay;
  }), [rows, q, statusFilter, fIp, fPppoe, fPlan, fRouter, fCity, fDebt, fBillDay]);
  const [sortKey, setSortKey] = useState<"id" | "name" | "plan" | "ip" | "status" | "balance" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };
  const ipNum = (ip?: string) => {
    if (!ip) return 0;
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some(isNaN)) return 0;
    return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  };
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a: any, b: any) => {
      let va: any, vb: any;
      switch (sortKey) {
        case "id": va = a.id; vb = b.id; break;
        case "name": va = (a.full_name || "").toLowerCase(); vb = (b.full_name || "").toLowerCase(); break;
        case "plan": va = (a.services?.[0]?.plans?.name || "").toLowerCase(); vb = (b.services?.[0]?.plans?.name || "").toLowerCase(); break;
        case "ip": va = ipNum(a.services?.[0]?.ip_address); vb = ipNum(b.services?.[0]?.ip_address); break;
        case "status": va = a.status || ""; vb = b.status || ""; break;
        case "balance": va = Number(a.balance ?? 0); vb = Number(b.balance ?? 0); break;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const curPage = Math.min(page, totalPages);
  const paged = useMemo(() => sorted.slice((curPage - 1) * pageSize, curPage * pageSize), [sorted, pageSize, curPage]);
  useEffect(() => { setPage(1); }, [q, statusFilter, pageSize, fIp, fPppoe, fPlan, fRouter, fCity, fDebt, fBillDay, sortKey, sortDir]);
  const activeFilterCount = [fIp, fPppoe, fCity, fBillDay].filter(Boolean).length + [fPlan, fRouter, fDebt].filter(x => x !== "all").length;
  const sortIcon = (k: typeof sortKey) => sortKey !== k ? "↕" : sortDir === "asc" ? "▲" : "▼";

  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map(r => r.id)));
  };
  const toggleOne = (id: string) => {
    const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s);
  };

  const suspendClient = async (clientId: string, name: string, silent = false) => {
    if (!silent && !confirm(`¿Suspender servicios de ${name}?`)) return;
    setBusy(clientId, true);
    try {
      const { data: svcs } = await supabase.from("services").select("id").eq("client_id", clientId).eq("status", "active");
      if (!svcs?.length) { if (!silent) toast.info(`${name}: sin servicios activos`); return; }
      const tId = toast.loading(`Suspendiendo ${svcs.length} servicio(s) de ${name}...`);
      const res = await Promise.allSettled(svcs.map(s => doSuspend({ data: { serviceId: s.id, reason: "Suspensión manual" } })));
      const ok = res.filter(r => r.status === "fulfilled").length;
      const fail = res.length - ok;
      toast.dismiss(tId);
      if (ok > 0) await supabase.from("clients").update({ status: "suspended" }).eq("id", clientId);
      fail ? toast.error(`${name}: ${ok} ok · ${fail} fallaron`) : toast.success(`${name}: ${ok} servicio(s) suspendido(s)`);
    } finally { setBusy(clientId, false); load(); }
  };
  const reactivateClient = async (clientId: string, name: string, silent = false) => {
    setBusy(clientId, true);
    try {
      // Reactivar cliente cancelado también
      await supabase.from("clients").update({ status: "active" }).eq("id", clientId).eq("status", "cancelled");
      const { data: svcs } = await supabase.from("services").select("id").eq("client_id", clientId).in("status", ["suspended", "cancelled"]);
      if (!svcs?.length) { if (!silent) toast.info(`${name}: sin servicios para reactivar`); load(); return; }
      const tId = toast.loading(`Reactivando ${svcs.length} servicio(s) de ${name}...`);
      const res = await Promise.allSettled(svcs.map(s => doReactivate({ data: { serviceId: s.id } })));
      const ok = res.filter(r => r.status === "fulfilled").length;
      const fail = res.length - ok;
      toast.dismiss(tId);
      if (ok > 0) await supabase.from("clients").update({ status: "active" }).eq("id", clientId);
      fail ? toast.error(`${name}: ${ok} ok · ${fail} fallaron`) : toast.success(`${name}: ${ok} servicio(s) reactivado(s)`);
    } finally { setBusy(clientId, false); load(); }
  };
  const cancelClient = async (clientId: string, name: string) => {
    if (!confirm(`¿Retirar/cancelar a ${name}? Se suspenden sus servicios.`)) return;
    setBusy(clientId, true);
    const tId = toast.loading(`Cancelando ${name}...`);
    try {
      const { data: svcs } = await supabase.from("services").select("id").eq("client_id", clientId).neq("status", "cancelled");
      if (svcs?.length) await Promise.allSettled(svcs.map(s => doSuspend({ data: { serviceId: s.id, reason: "Cliente cancelado" } })));
      const { error } = await supabase.from("clients").update({ status: "cancelled" }).eq("id", clientId);
      toast.dismiss(tId);
      error ? toast.error(error.message) : toast.success(`${name} retirado`);
    } finally { setBusy(clientId, false); load(); }
  };

  const bulkAction = async (action: "suspend" | "reactivate" | "delete") => {
    if (selected.size === 0) { toast.info("Seleccioná clientes primero"); return; }
    const labels = { suspend: "suspender", reactivate: "reactivar", delete: "eliminar" };
    if (!confirm(`¿${labels[action][0].toUpperCase() + labels[action].slice(1)} ${selected.size} cliente(s)?`)) return;
    const ids = Array.from(selected);
    const tId = toast.loading(`Procesando ${ids.length} cliente(s)...`);
    if (action === "delete") {
      const res = await Promise.allSettled(ids.map(id => doDelete({ data: { clientId: id } })));
      const fail = res.filter(r => r.status === "rejected").length;
      toast.dismiss(tId);
      fail ? toast.error(`${ids.length - fail} eliminados · ${fail} fallaron`) : toast.success(`${ids.length} eliminados (Mikrotik incluido)`);
    } else {
      const fn = action === "suspend" ? suspendClient : reactivateClient;
      await Promise.allSettled(ids.map(id => { const r = rows.find(x => x.id === id); return fn(id, r?.full_name ?? "cliente", true); }));
      toast.dismiss(tId);
      toast.success(`${ids.length} cliente(s) procesado(s)`);
    }
    setSelected(new Set()); load();
  };

  return (
    <AdminLayout>
      {/* Header cyan estilo Mikrowisp */}
      <div className="rounded-t-md bg-cyan-500 text-white px-4 py-2 text-sm font-medium flex items-center justify-between">
        <span>Lista Usuarios</span>
        <div className="flex gap-2">
          <button onClick={() => load()} className="p-1 hover:bg-white/20 rounded" title="Actualizar"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-card border border-t-0 px-2 md:px-3 py-2 flex flex-wrap items-center gap-2">
        {/* Mobile: search primero, full width */}
        <div className="relative w-full md:hidden order-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, PPPoE, IP..." className="w-full h-11 pl-9 pr-3 rounded-md border bg-background outline-none focus:border-primary" />
        </div>

        <button onClick={openForm} className="order-2 md:order-none inline-flex items-center justify-center gap-1 h-10 px-3 rounded-md border border-emerald-500 text-emerald-600 hover:bg-emerald-50 text-sm font-semibold active:scale-[.98] transition">
          <Plus className="w-4 h-4" /> Nuevo
        </button>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="order-3 md:order-none h-10 border rounded-md px-2 text-sm bg-background flex-1 md:flex-none min-w-[140px]">
          <option value="all">Todos</option>
          <option value="active">ACTIVOS</option>
          <option value="suspended">SUSPENDIDOS</option>
          <option value="cancelled">RETIRADOS</option>
          <option value="pending">PENDIENTES</option>
        </select>

        <button onClick={() => setShowFilters(v => !v)} className={`order-4 md:order-none tap h-10 px-2 border rounded-md hover:bg-muted relative inline-flex items-center justify-center ${showFilters ? "bg-cyan-50 border-cyan-400 text-cyan-700" : ""}`} title="Filtros avanzados">
          <Filter className="w-4 h-4" />
          {activeFilterCount > 0 && <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>}
        </button>

        {/* Bulk actions solo cuando hay selección o en desktop */}
        <div className={`order-5 md:order-none flex items-center gap-1 ${selected.size === 0 ? "hidden md:flex" : "flex"}`}>
          <button onClick={() => bulkAction("suspend")} className="tap h-10 px-2 border rounded-md hover:bg-amber-50 text-amber-600 inline-flex items-center justify-center" title="Suspender"><Power className="w-4 h-4" /></button>
          <button onClick={() => bulkAction("reactivate")} className="tap h-10 px-2 border rounded-md hover:bg-emerald-50 text-emerald-600 inline-flex items-center justify-center" title="Reactivar"><UserCheck className="w-4 h-4" /></button>
          <button onClick={() => bulkAction("delete")} className="tap h-10 px-2 border rounded-md hover:bg-destructive/10 text-destructive inline-flex items-center justify-center" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
        </div>

        {/* Desktop-only extras */}
        <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="hidden md:block border rounded px-2 py-1.5 text-sm">
          {[15, 25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="hidden md:block relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, documento o email..." className="w-full pl-8 pr-3 py-1.5 rounded border bg-background text-sm outline-none focus:border-primary" />
        </div>

        <div className="order-6 md:order-none w-full md:w-auto text-xs text-muted-foreground md:ml-auto flex items-center justify-between">
          {selected.size > 0 && <span className="font-semibold text-primary">{selected.size} seleccionado(s)</span>}
          <span>{filtered.length} resultado(s)</span>
        </div>
      </div>


      {/* Panel de filtros avanzados */}
      {showFilters && (
        <div className="bg-slate-50 border border-t-0 px-3 py-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <div>
            <label className="text-[11px] text-muted-foreground uppercase font-semibold">IP</label>
            <input value={fIp} onChange={e => setFIp(e.target.value)} placeholder="192.168..." className="w-full border rounded px-2 py-1.5 bg-background" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase font-semibold">PPPoE</label>
            <input value={fPppoe} onChange={e => setFPppoe(e.target.value)} placeholder="usuario" className="w-full border rounded px-2 py-1.5 bg-background" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase font-semibold">Ciudad</label>
            <input value={fCity} onChange={e => setFCity(e.target.value)} placeholder="Ciudad..." className="w-full border rounded px-2 py-1.5 bg-background" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase font-semibold">Día facturación</label>
            <input value={fBillDay} onChange={e => setFBillDay(e.target.value.replace(/\D/g, ""))} placeholder="1-28" className="w-full border rounded px-2 py-1.5 bg-background" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase font-semibold">Plan</label>
            <select value={fPlan} onChange={e => setFPlan(e.target.value)} className="w-full border rounded px-2 py-1.5 bg-background">
              <option value="all">Todos</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase font-semibold">Router</label>
            <select value={fRouter} onChange={e => setFRouter(e.target.value)} className="w-full border rounded px-2 py-1.5 bg-background">
              <option value="all">Todos</option>
              {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase font-semibold">Deuda</label>
            <select value={fDebt} onChange={e => setFDebt(e.target.value)} className="w-full border rounded px-2 py-1.5 bg-background">
              <option value="all">Todos</option>
              <option value="with">Con deuda</option>
              <option value="without">Sin deuda</option>
              <option value="promise">Con promesa de pago</option>
              <option value="vip">VIP (no cortar)</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={clearFilters} className="w-full px-3 py-1.5 border rounded hover:bg-muted text-sm inline-flex items-center justify-center gap-1">
              <X className="w-4 h-4" /> Limpiar filtros
            </button>
          </div>
        </div>
      )}

      <div className="border border-t-0 bg-card rounded-b-md">
        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-slate-200/70">
          {loading && <div className="px-4 py-8 text-center text-muted-foreground text-sm">Cargando...</div>}
          {!loading && paged.length === 0 && <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin resultados</div>}
          {paged.map((r, i) => {
            const busy = busyIds.has(r.id);
            const st = r.status;
            const stripe = st === "active" ? "bg-emerald-500"
              : st === "suspended" ? "bg-amber-500"
              : st === "cancelled" ? "bg-rose-500"
              : "bg-slate-400";
            const avatarBg = st === "active" ? "bg-gradient-to-br from-emerald-500 to-teal-600"
              : st === "suspended" ? "bg-gradient-to-br from-amber-500 to-orange-600"
              : st === "cancelled" ? "bg-gradient-to-br from-rose-500 to-red-600"
              : "bg-gradient-to-br from-slate-400 to-slate-600";
            const badge = st === "active" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : st === "suspended" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
              : st === "cancelled" ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
              : "bg-slate-50 text-slate-700 ring-1 ring-slate-200";
            const stLabel = st === "active" ? "Activo" : st === "suspended" ? "Suspendido" : st === "cancelled" ? "Cancelado" : st;
            const svc = r.services?.[0];
            const planName = svc?.plans?.name ?? "Sin plan";
            const bal = Number(r.balance ?? 0);
            const initials = (r.full_name || "?").split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
            return (
              <div key={r.id} className={`relative bg-card active:bg-muted/40 transition ${busy ? "opacity-60" : ""}`}>
                <span className={`absolute left-0 top-0 bottom-0 w-1 ${stripe}`} />
                <Link
                  to="/dashboard/clients/$clientId"
                  params={{ clientId: r.id }}
                  aria-label={`Abrir ${r.full_name}`}
                  className="absolute inset-0 z-0"
                />
                <div className="relative z-10 flex items-start gap-3 pl-4 pr-3 py-3 pointer-events-none">
                  <label className="tap flex items-center justify-center -m-2 p-2 shrink-0 pointer-events-auto self-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="w-4 h-4 accent-primary" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} disabled={busy} />
                  </label>
                  <div className={`shrink-0 w-11 h-11 rounded-full ${avatarBg} text-white font-bold text-sm flex items-center justify-center shadow-sm ring-2 ring-white`}>
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[14px] text-slate-800 truncate leading-tight">{r.full_name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="font-mono text-slate-400">#{String((curPage - 1) * pageSize + i + 1).padStart(4, "0")}</span>
                          <span className="text-slate-300">•</span>
                          <span className="truncate">{r.document || r.email || r.phone || "—"}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-[15px] font-bold tabular-nums leading-tight ${bal > 0 ? "text-rose-600" : bal < 0 ? "text-emerald-600" : "text-slate-400"}`}>
                          Bs {bal.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Saldo</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${badge}`}>{stLabel}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 truncate max-w-[180px] font-medium">{planName}</span>
                    </div>
                    <div className="mt-2.5 -mr-1 flex items-center justify-end gap-0.5 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                      {busy && <Loader2 className="w-4 h-4 animate-spin text-primary mx-1" />}
                      <button disabled={busy} onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="tap w-9 h-9 rounded-full hover:bg-blue-500/10 text-blue-600 disabled:opacity-40 inline-flex items-center justify-center" title="Editar"><Pencil className="w-4 h-4" /></button>
                      {(st === "suspended" || st === "cancelled") ? (
                        <button disabled={busy} onClick={(e) => { e.stopPropagation(); reactivateClient(r.id, r.full_name); }} className="tap w-9 h-9 rounded-full hover:bg-emerald-500/10 text-emerald-600 disabled:opacity-40 inline-flex items-center justify-center" title="Reactivar"><UserCheck className="w-4 h-4" /></button>
                      ) : (
                        <button disabled={busy} onClick={(e) => { e.stopPropagation(); suspendClient(r.id, r.full_name); }} className="tap w-9 h-9 rounded-full hover:bg-amber-500/10 text-amber-600 disabled:opacity-40 inline-flex items-center justify-center" title="Suspender"><Power className="w-4 h-4" /></button>
                      )}
                      <button disabled={busy} onClick={(e) => { e.stopPropagation(); remove(r.id, r.full_name); }} className="tap w-9 h-9 rounded-full hover:bg-destructive/10 text-destructive disabled:opacity-40 inline-flex items-center justify-center" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>



        {/* Desktop table estilo MikroWisp - compacto */}
        <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[900px] border-collapse">
          <thead>
            <tr className="text-left bg-slate-100 text-slate-600 border-b border-slate-300 text-[11px] uppercase tracking-wide">
              <th className="px-2 py-1.5 w-8 text-center">
                <input type="checkbox" className="accent-primary" checked={paged.length > 0 && selected.size === paged.length} onChange={toggleAll} />
              </th>
              <th className="px-2 py-1.5 w-8"></th>
              <th className="px-2 py-1.5 font-semibold w-20 cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("id")}>ID <span className="text-xs">{sortIcon("id")}</span></th>
              <th className="px-2 py-1.5 font-semibold cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("name")}>Nombre <span className="text-xs">{sortIcon("name")}</span></th>
              <th className="px-2 py-1.5 font-semibold w-[170px] cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("plan")}>Router <span className="text-xs">{sortIcon("plan")}</span></th>
              <th className="px-2 py-1.5 font-semibold w-[120px]">IP</th>
              <th className="px-2 py-1.5 font-semibold w-[90px] text-right cursor-pointer select-none hover:text-slate-900" onClick={() => toggleSort("balance")}>Saldo <span className="text-xs">{sortIcon("balance")}</span></th>
              <th className="px-2 py-1.5 font-semibold w-[170px] text-center">Acciones</th>
            </tr>
            <tr className="bg-white border-b border-slate-200">
              <th className="px-1 py-1"></th>
              <th className="px-1 py-1"></th>
              <th className="px-1 py-1"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-primary" /></th>
              <th className="px-1 py-1"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-primary" /></th>
              <th className="px-1 py-1">
                <select value={fRouter} onChange={(e) => setFRouter(e.target.value)} className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-primary bg-white">
                  <option value="all">Todos</option>
                  {routers.map((rt) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
                </select>
              </th>
              <th className="px-1 py-1"><input value={fIp} onChange={(e) => setFIp(e.target.value)} placeholder="Buscar" className="w-full px-1.5 py-0.5 border border-slate-200 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-primary" /></th>
              <th className="px-1 py-1"></th>
              <th className="px-1 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Cargando...</td></tr>}
            {!loading && paged.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Sin resultados</td></tr>}
            {paged.map((r, i) => {
              const busy = busyIds.has(r.id);
              const st = r.status;
              const zebra = i % 2 === 0 ? "bg-white" : "bg-slate-50/60";
              const rowTint = st === "suspended" ? "!bg-amber-50/70"
                : st === "cancelled" ? "!bg-rose-50/60"
                : "";
              const stripe = st === "active" ? "bg-emerald-500"
                : st === "suspended" ? "bg-amber-500"
                : st === "cancelled" ? "bg-rose-500"
                : "bg-slate-300";
              const svc = r.services?.[0];
              const routerObj = routers.find((rt) => rt.id === (svc as any)?.router_id);
              const routerName = routerObj?.name ?? "—";
              const ip = svc?.ip_address ?? "—";
              const bal = Number(r.balance ?? 0);
              return (
              <tr key={r.id} className={`border-b border-slate-100 hover:bg-sky-50 transition-colors ${zebra} ${rowTint} ${busy ? "opacity-60" : ""}`}>
                <td className="px-2 py-1 text-center relative">
                  <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${stripe}`} />
                  <input type="checkbox" className="accent-primary" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} disabled={busy} />
                </td>
                <td className="px-1 py-1 text-center">
                  <Link to="/dashboard/clients/$clientId" params={{ clientId: r.id }} className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition" title="Ver detalle">
                    <Plus className="w-3 h-3" strokeWidth={2.75} />
                  </Link>
                </td>
                <td className="px-2 py-1 text-slate-500 font-mono text-[11px] tabular-nums">{String((curPage - 1) * pageSize + i + 1).padStart(6, "0")}</td>
                <td className="px-2 py-1">
                  <div className="font-semibold uppercase text-slate-800 truncate leading-tight text-[12.5px]">{r.full_name}</div>
                </td>
                <td className="px-2 py-1 text-[11px]">
                  {routerName !== "—" ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide border ${routerBadgeClass(routerName)}`}>
                      {routerName}
                    </span>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-2 py-1 font-mono text-[11.5px] text-slate-700 tabular-nums">{ip}</td>
                <td className={`px-2 py-1 text-right font-semibold tabular-nums ${bal > 0 ? "text-rose-600" : bal < 0 ? "text-emerald-600" : "text-slate-400"}`}>{bal.toFixed(2)}</td>
                <td className="px-2 py-1">
                  <div className="flex items-center justify-center gap-0">
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary mr-1" />}
                    <button disabled={busy} onClick={() => openEdit(r)} className="w-6 h-6 rounded inline-flex items-center justify-center text-blue-600 hover:bg-blue-500 hover:text-white disabled:opacity-40 transition" title="Editar"><Pencil className="w-3.5 h-3.5" strokeWidth={2} /></button>
                    <button disabled={busy} onClick={() => remove(r.id, r.full_name)} className="w-6 h-6 rounded inline-flex items-center justify-center text-rose-600 hover:bg-rose-500 hover:text-white disabled:opacity-40 transition" title="Eliminar"><Trash2 className="w-3.5 h-3.5" strokeWidth={2} /></button>
                    {(st === "suspended" || st === "cancelled") ? (
                      <button disabled={busy} onClick={() => reactivateClient(r.id, r.full_name)} className="w-6 h-6 rounded inline-flex items-center justify-center text-emerald-600 hover:bg-emerald-500 hover:text-white disabled:opacity-40 transition" title="Reactivar"><UserCheck className="w-3.5 h-3.5" strokeWidth={2} /></button>
                    ) : (
                      <button disabled={busy} onClick={() => suspendClient(r.id, r.full_name)} className="w-6 h-6 rounded inline-flex items-center justify-center text-amber-600 hover:bg-amber-500 hover:text-white disabled:opacity-40 transition" title="Suspender"><Power className="w-3.5 h-3.5" strokeWidth={2} /></button>
                    )}
                    {st !== "cancelled" && (
                      <button disabled={busy} onClick={() => cancelClient(r.id, r.full_name)} className="w-6 h-6 rounded inline-flex items-center justify-center text-slate-600 hover:bg-slate-600 hover:text-white disabled:opacity-40 transition" title="Retirar"><UserX className="w-3.5 h-3.5" strokeWidth={2} /></button>
                    )}
                    <Link to="/dashboard/clients/$clientId" params={{ clientId: r.id }} className="w-6 h-6 rounded inline-flex items-center justify-center text-slate-600 hover:bg-slate-700 hover:text-white transition" title="Herramientas"><Wrench className="w-3.5 h-3.5" strokeWidth={2} /></Link>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>


        {totalPages > 1 && (
          <div className="border-t px-3 py-2 flex items-center justify-between text-xs bg-muted/20">
            <span className="text-muted-foreground truncate">Pág {curPage}/{totalPages} · {filtered.length}</span>
            <div className="flex gap-1 shrink-0">
              <button disabled={curPage <= 1} onClick={() => setPage(1)} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-muted">«</button>
              <button disabled={curPage <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-muted">‹</button>
              <button disabled={curPage >= totalPages} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-muted">›</button>
              <button disabled={curPage >= totalPages} onClick={() => setPage(totalPages)} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-muted">»</button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL WIZARD 3 pasos estilo Mikrowisp */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4">
            <div className="w-full max-w-6xl bg-card rounded-lg shadow-2xl border">
              {/* Header modal */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div>
                  <h2 className="text-xl font-semibold">Nuevo Cliente</h2>
                  <div className="text-xs text-muted-foreground mt-0.5">Inicio / Usuarios / <span className="text-primary">Nuevo cliente</span></div>
                </div>
                <button onClick={closeForm} className="p-2 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
              </div>

              {/* Stepper */}
              <div className="grid grid-cols-3 border-b">
                {[
                  { n: 1, t: "Datos personales", s: "Nombre, dirección, teléfonos" },
                  { n: 2, t: "Facturación y Notificaciones", s: "Día de pago, Corte, aviso" },
                  { n: 3, t: "Servicios", s: "Queues, PPPoE, Hotspot, etc." },
                ].map(s => {
                  const done = step > s.n;
                  const active = step === s.n;
                  return (
                    <div key={s.n} className={`flex items-center gap-3 px-5 py-4 border-r last:border-r-0 ${active ? "text-primary-foreground" : done ? "text-foreground" : "text-muted-foreground"}`}
                      style={active ? { background: "hsl(207 90% 54%)" } : undefined}>
                      <div className={`w-8 h-8 rounded-full grid place-items-center text-xs font-bold shrink-0
                        ${active ? "bg-white/25" : done ? "bg-emerald-500 text-white" : "bg-muted"}`}>
                        {done ? <Check className="w-4 h-4" /> : s.n}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{s.t}</div>
                        <div className={`text-[11px] ${active ? "text-white/80" : "text-muted-foreground"} truncate`}>{s.s}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Body */}
              <div className="p-6 max-h-[calc(100vh-260px)] overflow-y-auto">
                {step === 1 && <Step1 form={form} set={set} />}
                {step === 2 && <Step2 form={form} set={set} policies={policies} />}
                {step === 3 && <Step3 form={form} set={set} plans={plans} routers={routers} genCreds={genCreds} />}

                {steps && (
                  <div className="mt-4 rounded border bg-muted/30 p-4">
                    <div className="text-xs font-semibold mb-2">Progreso de alta</div>
                    <ul className="space-y-1 text-sm">
                      {steps.map(s => (
                        <li key={s.key} className="flex items-center gap-2">
                          {s.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-destructive" />}
                          <span className="font-medium capitalize">{s.key}</span>
                          {s.detail && <span className="text-xs text-muted-foreground">— {s.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t flex items-center justify-end gap-2 bg-muted/20">
                {step > 1 && (
                  <button onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} className="px-5 py-2 rounded-md border text-sm inline-flex items-center gap-1">
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                )}
                {step < 3 && (
                  <button
                    onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                    disabled={step === 1 && !canNext1}
                    className="px-6 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                )}
                {step === 3 && (
                  <button onClick={submit} disabled={saving || !canRegister}
                    className="px-6 py-2 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center gap-2 disabled:opacity-60">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                    {saving ? "Registrando..." : "Registrar Cliente"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR CLIENTE */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto" onClick={() => setEditing(null)}>
          <div className="min-h-full flex items-start justify-center p-4">
            <div className="w-full max-w-2xl bg-card rounded-lg shadow-2xl border" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b">
                <h3 className="font-semibold">Editar cliente</h3>
                <button onClick={() => setEditing(null)} className="p-2 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-5 grid md:grid-cols-2 gap-3 text-sm">
                <Field label="Nombre completo"><input className="input" value={editing.full_name ?? ""} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></Field>
                <Field label="Documento"><input className="input" value={editing.document ?? ""} onChange={(e) => setEditing({ ...editing, document: e.target.value })} /></Field>
                <Field label="Email"><input className="input" type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
                <Field label="Teléfono"><input className="input" value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
                <Field label="Dirección" className="md:col-span-2"><input className="input" value={editing.address ?? ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
                <Field label="Ciudad"><input className="input" value={editing.city ?? ""} onChange={(e) => setEditing({ ...editing, city: e.target.value })} /></Field>
                <Field label="Día de pago"><input className="input" type="number" min={1} max={28} value={editing.billing_day ?? 1} onChange={(e) => setEditing({ ...editing, billing_day: e.target.value })} /></Field>
                <Field label="Estado">
                  <select className="input" value={editing.status ?? "active"} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                    <option value="active">Activo</option>
                    <option value="suspended">Suspendido</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </Field>
                <Field label="Saldo"><input className="input" type="number" step="0.01" value={editing.balance ?? 0} onChange={(e) => setEditing({ ...editing, balance: e.target.value })} /></Field>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Ubicación en el mapa</label>
                  <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Cargando mapa…</div>}>
                    <LeafletPicker
                      lat={editing.latitude != null ? +editing.latitude : undefined}
                      lng={editing.longitude != null ? +editing.longitude : undefined}
                      onChange={(la, ln) => setEditing({ ...editing, latitude: la, longitude: ln })}
                      height={280}
                    />
                  </Suspense>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-3 border-t bg-muted/30">
                <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-md border text-sm">Cancelar</button>
                <button onClick={saveEdit} disabled={savingEdit} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center gap-2 disabled:opacity-60">
                  {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />} Guardar cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>

  );
}

/* ============ Sub-componentes de pasos ============ */

const inp = "w-full h-9 px-3 rounded-md border bg-background text-sm outline-none focus:border-primary";
const sel = inp + " pr-8 appearance-none";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, children, hint, req }: { label: string; children: React.ReactNode; hint?: string; req?: boolean }) {
  return (
    <div className="grid grid-cols-12 gap-3 items-start mb-3">
      <label className="col-span-4 text-right text-sm text-muted-foreground pt-2">
        {label} {req && <span className="text-destructive">*</span>}
      </label>
      <div className="col-span-8">
        {children}
        {hint && <div className="text-[11px] text-amber-600 mt-1">{hint}</div>}
      </div>
    </div>
  );
}

function Step1({ form, set }: any) {
  return (
    <div className="max-w-3xl mx-auto">
      <Row label="ID cliente" hint="Dejar en blanco para que sea automático.">
        <input value={form.id_cliente} onChange={(e) => set("id_cliente", e.target.value)} placeholder="100" className={inp} />
      </Row>
      <Row label="Contraseña Portal" hint="Dejar en blanco para que sea automático.">
        <input value={form.portal_password} onChange={(e) => set("portal_password", e.target.value)} placeholder="4243Tdp" className={inp} />
      </Row>
      <Row label="Nº Identificación" hint="CEDULA, DNI, RUC, CUIT, NIT, SAT, RUT, RTN, ETC.">
        <input value={form.document} onChange={(e) => set("document", e.target.value)} placeholder="223456634" className={inp} />
      </Row>
      <Row label="Nombre Completo" req>
        <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Carlos Miguel Santana Castro" className={inp} />
      </Row>
      <Row label="Dirección principal">
        <input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Av. Unios 4453" className={inp} />
      </Row>
      <Row label="Ubicación">
        <select value={form.city} onChange={(e) => set("city", e.target.value)} className={sel}>
          <option value="">Seleccionar Ubicación</option>
          <option>La Paz</option><option>Santa Cruz</option><option>Cochabamba</option>
          <option>Sucre</option><option>Oruro</option><option>Potosí</option><option>Tarija</option>
        </select>
      </Row>
      <Row label="Teléfono fijo">
        <input value={form.phone_fixed} onChange={(e) => set("phone_fixed", e.target.value)} placeholder="564567" className={inp} />
      </Row>
      <Row label="Teléfono Móvil">
        <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="9876526478" className={inp} />
      </Row>
      <Row label="E-mail">
        <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jorge@correo.com" className={inp} />
      </Row>
    </div>
  );
}

function Step2({ form, set, policies }: any) {
  const applyPolicy = (id: string) => {
    set("cutoff_policy_id", id);
    if (!id) return;
    const p = (policies ?? []).find((x: any) => x.id === id);
    if (!p) return;
    set("grace_days", p.grace_days ?? 5);
    set("apply_late_fee", Number(p.late_fee) > 0);
    set("apply_reconnect_fee", Number(p.reconnect_fee) > 0);
    set("cutoff", p.auto_suspend ? "1mes" : "no");
  };
  return (
    <div>
      <Row label="Cargar desde plantilla" hint="Las plantillas se administran en Clientes → Plantillas de corte.">
        <select className={sel} value={form.cutoff_policy_id || ""} onChange={(e) => applyPolicy(e.target.value)}>
          <option value="">Seleccionar plantilla</option>
          {(policies ?? []).map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}{p.is_default ? " (por defecto)" : ""}</option>
          ))}
        </select>
      </Row>


      <div className="grid lg:grid-cols-2 gap-6 mt-4">
        {/* Facturación */}
        <div className="rounded-lg border">
          <div className="px-4 py-2.5 border-b bg-muted/40 text-sm font-semibold">📄 Facturación</div>
          <div className="p-4">
            <Row label="Tipo">
              <select value={form.billing_type} onChange={(e) => set("billing_type", e.target.value)} className={sel}>
                <option value="prepago">Prepago (Adelantado)</option>
                <option value="postpago">Postpago (Vencido)</option>
              </select>
            </Row>
            <Row label="Día pago">
              <select value={form.billing_day} onChange={(e) => set("billing_day", Number(e.target.value))} className={sel}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{String(d).padStart(2, "0")}</option>)}
              </select>
            </Row>
            <Row label="Crear Factura">
              <select value={form.invoice_offset} onChange={(e) => set("invoice_offset", Number(e.target.value))} className={sel}>
                <option value={0}>El día de pago</option>
                <option value={3}>3 Días antes</option>
                <option value={5}>5 Días antes</option>
                <option value={7}>7 Días antes</option>
              </select>
            </Row>
            <Row label="Tipo impuesto">
              <select value={form.tax_mode} onChange={(e) => set("tax_mode", e.target.value)} className={sel}>
                <option value="included">Impuestos incluido</option>
                <option value="added">Impuestos agregados</option>
              </select>
            </Row>
            <Row label="Días de gracia" hint="*días tolerancia para aplicar corte">
              <select value={form.grace_days} onChange={(e) => set("grace_days", Number(e.target.value))} className={sel}>
                {[0, 1, 3, 5, 7, 10, 15].map(d => <option key={d} value={d}>{d} Días</option>)}
              </select>
            </Row>
            <Row label="Aplicar Corte">
              <select value={form.cutoff} onChange={(e) => set("cutoff", e.target.value)} className={sel}>
                <option value="1mes">1 Mes vencido</option>
                <option value="2mes">2 Meses vencido</option>
                <option value="no">No aplicar</option>
              </select>
            </Row>
            <Row label={<span className="inline-flex items-center gap-1">Fecha Fija <HelpCircle className="w-3 h-3" /></span> as any}>
              <div className="flex gap-1">
                <input value={form.fixed_date} onChange={(e) => set("fixed_date", e.target.value)} placeholder="Automático" className={inp} />
                <button className="px-2 rounded-md border hover:bg-muted"><Trash2 className="w-4 h-4" /></button>
              </div>
            </Row>
            <Row label="Aplicar Mora">
              <Toggle on={form.apply_late_fee} onChange={(v) => set("apply_late_fee", v)} />
            </Row>
            <Row label="Aplicar Reconexión">
              <Toggle on={form.apply_reconnect_fee} onChange={(v) => set("apply_reconnect_fee", v)} />
            </Row>

            <div className="text-center font-semibold text-sm mt-4 mb-1">Otros Impuestos</div>
            <div className="text-center text-[11px] text-muted-foreground mb-3">Estos Impuestos serán agregados al total de la factura</div>
            {[1, 2, 3].map(n => (
              <Row key={n} label={`Impuesto #${n} (%)`} hint="* Dejar en 0 (cero) para quedar deshabilitado">
                <input type="number" value={(form as any)[`tax${n}`]} onChange={(e) => set(`tax${n}` as any, Number(e.target.value))} placeholder="10" className={inp} />
              </Row>
            ))}
          </div>
        </div>

        {/* Notificaciones */}
        <div className="rounded-lg border self-start">
          <div className="px-4 py-2.5 border-b bg-muted/40 text-sm font-semibold">🔔 Notificaciones</div>
          <div className="p-4">
            <Row label="Aviso nueva factura">
              <select value={form.notify_new_invoice} onChange={(e) => set("notify_new_invoice", e.target.value)} className={sel}>
                <option value="off">Desactivado</option><option value="email">Correo</option>
                <option value="sms">SMS</option><option value="wa">WhatsApp</option>
              </select>
            </Row>
            <Row label="Aviso en Pantalla" hint="* Aviso solo en páginas HTTP">
              <select value={form.notify_screen} onChange={(e) => set("notify_screen", e.target.value)} className={sel}>
                <option value="off">Desactivado</option><option value="on">Activado</option>
              </select>
            </Row>
            <Row label="Recordatorios de pago">
              <select value={form.reminders} onChange={(e) => set("reminders", e.target.value)} className={sel}>
                <option value="email">Correo</option><option value="sms">SMS</option>
                <option value="wa">WhatsApp</option><option value="off">Desactivado</option>
              </select>
            </Row>
            {[1, 2, 3].map(n => (
              <Row key={n} label={`Recordatorio #${n}`} hint={n === 3 ? "* Días antes/después del vencimiento de una factura" : undefined}>
                <select value={(form as any)[`reminder${n}`]} onChange={(e) => set(`reminder${n}` as any, e.target.value)} className={sel}>
                  <option value="off">Desactivado</option>
                  <option value="1d">1 Día Antes</option><option value="2d">2 Días Antes</option>
                  <option value="3d">3 Días Antes</option><option value="5d">5 Días Antes</option>
                  <option value="1d_after">1 Día Después</option><option value="3d_after">3 Días Después</option>
                </select>
              </Row>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Step3({ form, set, plans, routers, genCreds }: any) {
  const nextIpFn = useServerFn(getNextAvailableIp);
  const listPoolsFn = useServerFn(listRouterPools);
  const poolUsageFn = useServerFn(poolIpUsage);
  const [autoIp, setAutoIp] = useState(true);
  const [ipStatus, setIpStatus] = useState<string>("");
  const [directCidr, setDirectCidr] = useState<string>("");
  const [pools, setPools] = useState<any[]>([]);
  const [poolId, setPoolId] = useState<string>("");
  const [poolIps, setPoolIps] = useState<any[] | null>(null);
  const [poolStats, setPoolStats] = useState<{ total: number; used: number; free: number } | null>(null);
  const [loadingPool, setLoadingPool] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerFilter, setPickerFilter] = useState<"free" | "all">("free");

  // Cargar pools cuando cambia router
  useEffect(() => {
    setPools([]); setPoolId(""); setPoolIps(null); setPoolStats(null);
    if (!form.router_id) return;
    (async () => {
      try {
        const res: any = await listPoolsFn({ data: { routerId: form.router_id } });
        const list = res.pools ?? [];
        setPools(list);
        const def = list.find((p: any) => p.is_default) ?? list[0];
        if (def) setPoolId(def.id);
      } catch { /* ignore */ }
    })();
  }, [form.router_id]);

  // Cargar IPs del pool seleccionado
  const loadPoolIps = async (pid: string) => {
    if (!pid) { setPoolIps(null); setPoolStats(null); return; }
    setLoadingPool(true);
    try {
      const res: any = await poolUsageFn({ data: { poolId: pid, scanRouter: true, limit: 512 } });
      if (res.ok) {
        setPoolIps(res.ips);
        setPoolStats({ total: res.total, used: res.used, free: res.free });
      }
    } catch { /* ignore */ }
    setLoadingPool(false);
  };
  useEffect(() => { if (poolId) loadPoolIps(poolId); }, [poolId]);

  const assignIp = async () => {
    if (!form.router_id) { setIpStatus("Elegí un router primero"); return; }
    setIpStatus(directCidr ? `Escaneando ${directCidr}…` : poolId ? "Buscando IP libre en pool…" : "Buscando IP libre…");
    try {
      // Si hay pool seleccionado y IPs cargadas, tomar la primera libre local
      if (poolId && poolIps && !directCidr) {
        const free = poolIps.find((x: any) => x.status === "free");
        if (free) { set("admin_ip", free.ip); setIpStatus(`✓ ${free.ip} — pool`); return; }
      }
      const res: any = await nextIpFn({ data: { routerId: form.router_id, cidr: directCidr || undefined } });
      if (res.ok) { set("admin_ip", res.ip); setIpStatus(`✓ ${res.ip} — Bs {res.cidr}`); }
      else { setIpStatus("✗ " + res.error); }
    } catch (e) { setIpStatus("✗ " + (e as Error).message); }
  };

  // Autoasignar cuando el usuario elige "IP fija" o "DHCP" y hay router seleccionado
  useEffect(() => {
    if (!autoIp) return;
    if (!form.router_id) return;
    if (form.ip_type !== "static" && form.ip_type !== "dhcp") return;
    if (form.admin_ip) return;
    if (poolId && !poolIps) return; // esperar carga del pool
    assignIp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.router_id, form.ip_type, autoIp, directCidr, poolId, poolIps]);

  const pickIp = (ip: string) => { set("admin_ip", ip); setAutoIp(false); setShowPicker(false); setIpStatus(`✓ ${ip} — elegida`); };

  return (
    <div className="grid lg:grid-cols-2 gap-x-8">
      <div>
        <Row label="Router">
          <select value={form.router_id} onChange={(e) => { set("router_id", e.target.value); set("admin_ip", ""); }} className={sel}>
            <option value="">Seleccionar router</option>
            {routers.map((r: Router) => <option key={r.id} value={r.id}>{r.name}{r.ip_address ? ` (${r.ip_address})` : ""}</option>)}
          </select>
        </Row>
        <Row label="Excluir Firewall">
          <Toggle on={form.exclude_firewall} onChange={(v) => set("exclude_firewall", v)} />
        </Row>
        <Row label="Perfil Internet">
          <select value={form.plan_id} onChange={(e) => { const id = e.target.value; set("plan_id", id); const p = plans.find((x: Plan) => x.id === id); if (p) set("cost", Number(p.price).toFixed(2)); }} className={sel}>
            <option value="">Seleccionar perfil</option>
            {plans.map((p: Plan) => <option key={p.id} value={p.id}>{p.name} — {p.download_mbps}/{p.upload_mbps} Mbps — Bs {Number(p.price).toFixed(2)}</option>)}
          </select>
        </Row>
        <Row label="Descripción" hint="* Texto para facturación">
          <textarea value={form.description_svc} onChange={(e) => set("description_svc", e.target.value)} className={inp + " h-16 py-2"} />
        </Row>
        <Row label="Costo">
          <input value={form.cost} onChange={(e) => set("cost", e.target.value)} className={inp} />
        </Row>
        <Row label="Tipo IPv4">
          <select value={form.ip_type} onChange={(e) => { set("ip_type", e.target.value); if (e.target.value === "pppoe") set("admin_ip", ""); }} className={sel}>
            <option value="">Seleccionar tipo de IP</option>
            <option value="dhcp">DHCP dinámica</option>
            <option value="static">IP fija</option>
            <option value="pppoe">Asignada por PPPoE</option>
          </select>
        </Row>
        {(form.ip_type === "static" || form.ip_type === "dhcp") && (
          <>
            {pools.length > 0 && (
              <Row label="Pool de IPs" hint={poolStats ? `${poolStats.free} libres / ${poolStats.used} usadas de ${poolStats.total}` : (loadingPool ? "Cargando…" : "* Elegí el pool del router")}>
                <div className="flex gap-1 items-center">
                  <select value={poolId} onChange={(e) => { setPoolId(e.target.value); set("admin_ip", ""); }} className={sel}>
                    <option value="">— Ninguno (auto /24) —</option>
                    {pools.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.is_default ? " ⭐" : ""}{p.cidr ? ` (${p.cidr})` : p.ranges ? ` (${p.ranges})` : ""}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => loadPoolIps(poolId)} title="Refrescar pool" className="px-2 rounded-md border hover:bg-muted"><RefreshCw className={"w-4 h-4 " + (loadingPool ? "animate-spin" : "")} /></button>
                </div>
              </Row>
            )}
            <Row label="Subred directa" hint="* Opcional. Ej: 192.168.24.0/24 — ignora el pool">
              <input value={directCidr} onChange={(e) => { setDirectCidr(e.target.value); set("admin_ip", ""); }} placeholder="192.168.24.0/24" className={inp} />
            </Row>
            <Row label="IPv4" hint={ipStatus || (directCidr ? "* Se escanea la subred directa" : poolId ? "* Se toma del pool seleccionado" : "* Se autoasigna del router")}>
              <div className="flex gap-1 items-center">
                <input value={form.admin_ip} onChange={(e) => { set("admin_ip", e.target.value); setAutoIp(false); }} placeholder="10.0.0.100" className={inp} />
                <button type="button" onClick={assignIp} title="Autoasignar IP libre" className="px-2 rounded-md border hover:bg-muted"><RefreshCw className="w-4 h-4" /></button>
                {poolId && poolIps && (
                  <button type="button" onClick={() => { setPickerFilter("free"); setShowPicker(true); }} title="Elegir IP del pool" className="px-2 rounded-md border hover:bg-muted"><List className="w-4 h-4" /></button>
                )}
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap select-none">
                  <input type="checkbox" checked={autoIp} onChange={(e) => setAutoIp(e.target.checked)} /> auto
                </label>
              </div>
            </Row>
            {showPicker && poolIps && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowPicker(false)}>
                <div className="bg-background rounded-lg shadow-xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                  <div className="p-3 border-b flex items-center justify-between">
                    <div className="text-sm font-medium">Elegir IP del pool</div>
                    <button onClick={() => setShowPicker(false)} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="p-2 border-b flex gap-2 text-xs">
                    <button onClick={() => setPickerFilter("free")} className={"px-2 py-1 rounded " + (pickerFilter === "free" ? "bg-primary text-primary-foreground" : "border")}>Libres ({poolStats?.free ?? 0})</button>
                    <button onClick={() => setPickerFilter("all")} className={"px-2 py-1 rounded " + (pickerFilter === "all" ? "bg-primary text-primary-foreground" : "border")}>Todas ({poolStats?.total ?? 0})</button>
                    <button onClick={() => loadPoolIps(poolId)} className="ml-auto px-2 py-1 rounded border inline-flex items-center gap-1"><RefreshCw className={"w-3 h-3 " + (loadingPool ? "animate-spin" : "")} /> Refrescar</button>
                  </div>
                  <div className="overflow-auto flex-1 divide-y text-xs">
                    {poolIps.filter((x: any) => pickerFilter === "all" || x.status === "free").map((x: any) => {
                      const dis = x.status !== "free";
                      const badge = x.status === "free" ? "text-emerald-600" : x.status === "used" ? "text-orange-600" : x.status === "live" ? "text-red-600" : "text-muted-foreground";
                      return (
                        <button key={x.ip} disabled={dis} onClick={() => pickIp(x.ip)} className={"w-full text-left px-3 py-1.5 flex items-center justify-between " + (dis ? "opacity-60 cursor-not-allowed" : "hover:bg-muted")}>
                          <span className="font-mono">{x.ip}</span>
                          <span className={"text-[10px] uppercase " + badge}>
                            {x.status}{x.clientName ? ` — Bs {x.clientName}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <Row label={<span className="inline-flex items-center gap-1">Mac <HelpCircle className="w-3 h-3" /></span> as any}>
          <input value={form.mac_address} onChange={(e) => set("mac_address", e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" className={inp} />
        </Row>
        <Row label={<span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> User PPP/HS</span> as any} req>
          <input value={form.pppoe_user} onChange={(e) => set("pppoe_user", e.target.value)} placeholder="0000007664" className={inp} />
        </Row>
        <Row label={<span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> password PPP/HS</span> as any} req>
          <div className="flex gap-1">
            <input value={form.pppoe_password} onChange={(e) => set("pppoe_password", e.target.value)} placeholder="g7yhCnqTUMlddIn" className={inp} />
            <button type="button" onClick={genCreds} title="Generar" className="px-2 rounded-md border hover:bg-muted"><KeyRound className="w-4 h-4" /></button>
          </div>
        </Row>
        <Row label="Routes" hint="* Dato Opcional">
          <input value={form.routes} onChange={(e) => set("routes", e.target.value)} placeholder="Ejm: 192.168.10.0/24" className={inp} />
        </Row>
        <Row label="Caja Nap">
          <select value={form.caja_nap} onChange={(e) => set("caja_nap", e.target.value)} className={sel}>
            <option value="">Ninguno</option>
          </select>
        </Row>
        <Row label="Puerto Nap">
          <select value={form.puerto_nap} onChange={(e) => set("puerto_nap", e.target.value)} className={sel}>
            <option value="">Ninguno</option>
          </select>
        </Row>
      </div>

      <div>
        <Row label={<span className="inline-flex items-center gap-1">Dirección <MapPin className="w-3 h-3" /></span> as any}>
          <input value={form.install_address} onChange={(e) => set("install_address", e.target.value)} className={inp} />
        </Row>
        <Row label={<span className="inline-flex items-center gap-1">Coordenadas <MapPin className="w-3 h-3" /></span> as any} hint="* Click en el mapa para fijar">
          <input value={form.coordinates} onChange={(e) => set("coordinates", e.target.value)} placeholder="-16.5000,-68.1500" className={inp} />
        </Row>
        <div style={{ margin: "8px 0 12px" }}>
          <Suspense fallback={<div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Cargando mapa…</div>}>
            <LeafletPicker
              lat={form.coordinates ? +form.coordinates.split(",")[0] : undefined}
              lng={form.coordinates ? +form.coordinates.split(",")[1] : undefined}
              onChange={(la, ln) => set("coordinates", `${la},${ln}`)}
              height={260}
            />
          </Suspense>
        </div>
        <Row label={<span className="inline-flex items-center gap-1">Fecha Instalación <Calendar className="w-3 h-3" /></span> as any}>
          <input type="date" value={form.install_date} onChange={(e) => set("install_date", e.target.value)} className={inp} />
        </Row>

        <div className="text-center font-semibold text-sm mt-6 mb-2">OTROS DATOS</div>
        <div className="text-center font-semibold text-sm mb-3">EQUIPO RECEPTOR</div>

        <Row label="Conectado A">
          <select value={form.connected_to} onChange={(e) => set("connected_to", e.target.value)} className={sel}>
            <option value="">Seleccionar</option>
            {routers.map((r: Router) => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
        </Row>
        <Row label="IP administración" hint="* Ip antena del cliente">
          <input value={form.admin_ip} onChange={(e) => set("admin_ip", e.target.value)} placeholder="10.0.0.100" className={inp} />
        </Row>
        <Row label="Tipo antena">
          <select value={form.antenna_type} onChange={(e) => set("antenna_type", e.target.value)} className={sel}>
            <option value="otro">Otro</option>
            <option value="ubiquiti">Ubiquiti</option>
            <option value="mikrotik">Mikrotik</option>
            <option value="tplink">TP-Link</option>
            <option value="cambium">Cambium</option>
          </select>
        </Row>

        <label className="flex items-center gap-2 text-sm mt-4 ml-4">
          <input type="checkbox" checked={form.provision} onChange={(e) => set("provision", e.target.checked)} />
          Enviar automáticamente al router (Mikrotik push)
        </label>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={`w-11 h-6 rounded-full relative transition ${on ? "bg-primary" : "bg-muted"}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
