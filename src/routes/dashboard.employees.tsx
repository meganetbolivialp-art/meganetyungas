import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { MODULES } from "@/hooks/use-permissions";
import { generateStrongPassword, getPasswordPolicyError, PASSWORD_POLICY_MESSAGE } from "@/lib/password-policy";
import {
  listOperators, createOperator, updateOperator, toggleOperator, deleteOperator,
} from "@/lib/operators.functions";
import { toast } from "sonner";
import {
  UserPlus, Pencil, Trash2, Key, Search, X, ChevronDown, ChevronRight, Check, Shield,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/employees")({
  head: () => ({
    meta: [
      { title: "Operadores — Meganet" },
      { name: "description", content: "Gestión de operadores, permisos y accesos." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OperatorsPage,
});

type Op = {
  id: string; full_name: string; username: string | null; email: string | null;
  phone: string | null; operator_type: string; status: string; role: string;
  commission_pct: number; permissions: Record<string, string[]>;
  router_ids: string[]; branch_id: string | null; user_id: string | null;
};

const OP_TYPES = [
  { v: "admin",      l: "Administrador" },
  { v: "operator",   l: "Operador" },
  { v: "cashier",    l: "Cajero / Cobrador" },
  { v: "technician", l: "Técnico" },
  { v: "seller",     l: "Vendedor" },
];

function OperatorsPage() {
  const [rows, setRows] = useState<Op[]>([]);
  const [routers, setRouters] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Op | null>(null);
  const [showForm, setShowForm] = useState(false);

  const listFn = useServerFn(listOperators);
  const toggleFn = useServerFn(toggleOperator);
  const delFn = useServerFn(deleteOperator);

  const load = async () => {
    setLoading(true);
    try {
      const [ops, rs] = await Promise.all([
        listFn() as any,
        supabase.from("routers").select("id,name").order("name"),
      ]);
      setRows(ops ?? []);
      setRouters((rs.data as any) ?? []);
    } catch (e) { toast.error((e as Error).message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter(r =>
    !q || [r.full_name, r.username, r.email].filter(Boolean).some(v => v!.toLowerCase().includes(q.toLowerCase()))
  ), [rows, q]);

  const onToggle = async (op: Op) => {
    try {
      await toggleFn({ data: { id: op.id, enabled: op.status !== "active" } });
      toast.success(op.status === "active" ? "Deshabilitado" : "Habilitado");
      load();
    } catch (e) { toast.error((e as Error).message); }
  };
  const onDelete = async (op: Op) => {
    if (!confirm(`¿Eliminar al operador ${op.full_name}? También se eliminará su cuenta de acceso.`)) return;
    try { await delFn({ data: { id: op.id } }); toast.success("Eliminado"); load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Operadores</h1>
            <p className="text-sm text-slate-500">Personal con acceso al panel administrativo.</p>
          </div>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow"
          >
            <UserPlus className="w-4 h-4" /> Nuevo operador
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, usuario o email..."
            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm" />
        </div>

        {/* Table */}
        <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Operador</th>
                  <th className="text-left px-4 py-3">Usuario</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-left px-4 py-3">Comisión</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-right px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Cargando…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Sin operadores.</td></tr>
                ) : filtered.map(op => (
                  <tr key={op.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 grid place-items-center text-white font-bold text-sm">
                          {op.full_name.slice(0,1).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800">{op.full_name}</div>
                          <div className="text-xs text-slate-500">{op.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{op.username ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        {op.operator_type === "admin" && <Shield className="w-3 h-3" />}
                        {OP_TYPES.find(t => t.v === op.operator_type)?.l ?? op.operator_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{Number(op.commission_pct ?? 0).toFixed(2)}%</td>
                    <td className="px-4 py-3">
                      <button onClick={() => onToggle(op)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${op.status === "active" ? "bg-emerald-500" : "bg-slate-300"}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${op.status === "active" ? "translate-x-4" : "translate-x-1"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditing(op); setShowForm(true); }} title="Editar"
                          className="p-2 rounded hover:bg-blue-50 text-slate-500 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => { setEditing(op); setShowForm(true); }} title="Cambiar contraseña"
                          className="p-2 rounded hover:bg-amber-50 text-slate-500 hover:text-amber-600"><Key className="w-4 h-4" /></button>
                        <button onClick={() => onDelete(op)} title="Eliminar"
                          className="p-2 rounded hover:bg-red-50 text-slate-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showForm && (
        <OperatorForm
          initial={editing}
          routers={routers}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </AdminLayout>
  );
}

/* ---------- FORM ---------- */

function OperatorForm({ initial, routers, onClose, onSaved }:
  { initial: Op | null; routers: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!initial;
  const createFn = useServerFn(createOperator);
  const updateFn = useServerFn(updateOperator);

  const [f, setF] = useState({
    full_name: initial?.full_name ?? "",
    username: initial?.username ?? "",
    email: initial?.email ?? "",
    password: "",
    phone: initial?.phone ?? "",
    operator_type: initial?.operator_type ?? "operator",
    status: initial?.status ?? "active",
    commission_pct: Number(initial?.commission_pct ?? 0),
  });
  const [perms, setPerms] = useState<Record<string, string[]>>(initial?.permissions ?? {});
  const [routerIds, setRouterIds] = useState<string[]>(initial?.router_ids ?? []);
  const [saving, setSaving] = useState(false);
  const [openMod, setOpenMod] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);


  const isAdmin = f.operator_type === "admin";

  const totalActive = useMemo(() =>
    Object.values(perms).reduce((s, a) => s + (a?.length ?? 0), 0), [perms]);
  const totalPossible = useMemo(() =>
    MODULES.reduce((s, m) => s + m.actions.length, 0), []);

  const toggleAction = (mod: string, act: string) => {
    setPerms(p => {
      const cur = new Set(p[mod] ?? []);
      if (cur.has(act)) cur.delete(act); else cur.add(act);
      return { ...p, [mod]: Array.from(cur) };
    });
  };
  const toggleAll = (mod: string, all: string[]) => {
    setPerms(p => {
      const cur = p[mod] ?? [];
      return { ...p, [mod]: cur.length === all.length ? [] : all };
    });
  };
  const toggleRouter = (id: string) => {
    setRouterIds(r => r.includes(id) ? r.filter(x => x !== id) : [...r, id]);
  };

  const save = async () => {
    setFormError(null);
    setPwdError(null);
    if (!f.full_name || !f.username) { setFormError("Nombre y usuario requeridos"); toast.error("Nombre y usuario requeridos"); return; }
    if (!isEdit && (!f.email || !f.password)) { setFormError("Email y contraseña requeridos"); toast.error("Email y contraseña requeridos"); return; }
    if (isEdit && !initial?.user_id && !f.password) { setFormError("Este operador todavía no tiene acceso. Ingresá una contraseña y guardá."); toast.error("Ingresá una contraseña para activar el acceso"); return; }
    if (f.password) {
      const passwordError = getPasswordPolicyError(f.password);
      if (passwordError) { setPwdError(passwordError); toast.error(passwordError); return; }
    }
    setSaving(true);
    try {
      if (isEdit) {
        const patch: any = {
          full_name: f.full_name, username: f.username, phone: f.phone || null,
          operator_type: f.operator_type, status: f.status,
          commission_pct: f.commission_pct, permissions: isAdmin ? {} : perms,
          router_ids: isAdmin ? [] : routerIds,
        };
        if (f.password) patch.password = f.password;
        if (!initial?.user_id && f.email) patch.email = f.email;
        await updateFn({ data: { id: initial!.id, patch } });
        toast.success("Operador actualizado");
      } else {
        await createFn({ data: {
          full_name: f.full_name, username: f.username, email: f.email, password: f.password,
          phone: f.phone || null, operator_type: f.operator_type, status: f.status,
          commission_pct: f.commission_pct, permissions: isAdmin ? {} : perms,
          router_ids: isAdmin ? [] : routerIds,
        }});
        toast.success("Operador creado");
      }
      onSaved();
    } catch (e) {
      const msg = (e as Error).message;
      setFormError(msg);
      toast.error(msg);
    }
    setSaving(false);
  };


  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-6" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-sky-500 text-white px-5 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-lg">{isEdit ? "Editar Operador" : "Nuevo Operador"}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/20"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Left column: Data + Config */}
            <div className="p-6 border-r space-y-5">
              <section>
                <h3 className="font-semibold text-slate-700 mb-3">Datos</h3>
                <div className="space-y-3">
                  <FieldRow label="Nombre"><input value={f.full_name} onChange={e => setF({...f, full_name: e.target.value})} className={inpCls} /></FieldRow>
                  <FieldRow label="Usuario"><input value={f.username} onChange={e => setF({...f, username: e.target.value})} className={inpCls} /></FieldRow>
                  <FieldRow label="Email">
                    <input type="email" value={f.email} disabled={isEdit}
                      onChange={e => setF({...f, email: e.target.value})}
                      className={`${inpCls} ${isEdit ? "bg-slate-100 text-slate-500" : ""}`} />
                  </FieldRow>
                  <FieldRow label="Contraseña">
                    <div className="flex gap-2">
                      <input type="password" value={f.password}
                        onChange={e => { setF({...f, password: e.target.value}); setPwdError(null); }}
                        placeholder={isEdit ? "Dejar vacío para no cambiar" : "Clave segura requerida"} className={inpCls} />
                      <button type="button" onClick={() => { setF({...f, password: generateStrongPassword()}); setPwdError(null); }}
                        className="shrink-0 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100">
                        Generar
                      </button>
                    </div>
                    {pwdError
                      ? <p className="text-xs text-red-600 mt-1 font-medium">{pwdError}</p>
                      : <p className="text-xs text-slate-500 mt-1">{PASSWORD_POLICY_MESSAGE}</p>}
                    {isEdit && !initial?.user_id && (
                      <p className="text-xs text-amber-600 mt-1">Este operador aún no tiene acceso. Escribí una contraseña y guardá para activarlo.</p>
                    )}
                  </FieldRow>

                  <FieldRow label="Teléfono"><input value={f.phone ?? ""} onChange={e => setF({...f, phone: e.target.value})} className={inpCls} /></FieldRow>
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-slate-700 mb-3">Configuración</h3>
                <div className="space-y-3">
                  <FieldRow label="Tipo de operador">
                    <select value={f.operator_type} onChange={e => setF({...f, operator_type: e.target.value})} className={inpCls}>
                      {OP_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                    </select>
                  </FieldRow>
                  <FieldRow label="Estado">
                    <select value={f.status} onChange={e => setF({...f, status: e.target.value})} className={inpCls}>
                      <option value="active">Habilitado</option>
                      <option value="disabled">Deshabilitado</option>
                    </select>
                  </FieldRow>
                  <FieldRow label="Comisión (%)">
                    <input type="number" step="0.01" value={f.commission_pct}
                      onChange={e => setF({...f, commission_pct: parseFloat(e.target.value) || 0})} className={inpCls} />
                    <p className="text-xs text-slate-500 mt-1">Comisión por cada cobro registrado.</p>
                  </FieldRow>

                  {!isAdmin && (
                    <FieldRow label="Routers permitidos">
                      <div className="border rounded-md p-2 min-h-[80px] flex flex-wrap gap-1.5 bg-white">
                        {routers.length === 0 && <span className="text-xs text-slate-400 px-1 py-1">Sin routers registrados.</span>}
                        {routers.map(r => {
                          const on = routerIds.includes(r.id);
                          return (
                            <button key={r.id} type="button" onClick={() => toggleRouter(r.id)}
                              className={`text-xs px-2 py-1 rounded border transition ${on ? "bg-sky-500 border-sky-500 text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"}`}>
                              {r.name} {on && <X className="inline w-3 h-3 ml-1" />}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Vacío = todos los routers.</p>
                    </FieldRow>
                  )}
                </div>
              </section>
            </div>

            {/* Right column: Permissions */}
            <div className="p-6 bg-slate-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700">Permisos</h3>
                <span className="text-xs text-slate-500">
                  Total: <b>{isAdmin ? totalPossible : totalActive}</b> / {totalPossible}
                </span>
              </div>

              {isAdmin ? (
                <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800 flex items-start gap-2">
                  <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>Los administradores tienen acceso total a todos los módulos y routers. No requieren configuración de permisos.</div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {MODULES.map(m => {
                    const active = perms[m.key]?.length ?? 0;
                    const total = m.actions.length;
                    const open = openMod === m.key;
                    return (
                      <div key={m.key} className="bg-slate-800 text-white rounded">
                        <button type="button" onClick={() => setOpenMod(open ? null : m.key)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-slate-700 rounded-t">
                          <span className="flex items-center gap-2">
                            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <span className="font-medium">{m.label}</span>
                          </span>
                          <span className="text-xs text-slate-300">
                            Activos <b className={active === total ? "text-emerald-400" : active > 0 ? "text-amber-300" : "text-slate-400"}>{active}</b> de {total}
                          </span>
                        </button>
                        {open && (
                          <div className="bg-white text-slate-700 border border-slate-800 p-3 rounded-b">
                            <label className="flex items-center gap-2 pb-2 mb-2 border-b text-xs font-medium text-slate-600 cursor-pointer">
                              <input type="checkbox" checked={active === total}
                                onChange={() => toggleAll(m.key, m.actions.map(a => a.key))} />
                              Seleccionar todo
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              {m.actions.map(a => {
                                const on = perms[m.key]?.includes(a.key);
                                return (
                                  <label key={a.key} className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded cursor-pointer border ${on ? "bg-emerald-50 border-emerald-200" : "border-transparent hover:bg-slate-50"}`}>
                                    <input type="checkbox" checked={!!on} onChange={() => toggleAction(m.key, a.key)} />
                                    <span>{a.label}</span>
                                    {on && <Check className="w-3.5 h-3.5 ml-auto text-emerald-600" />}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t bg-white px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
          {formError && (
            <div className="flex-1 text-xs text-red-600 font-medium sm:mr-2">{formError}</div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded border text-sm hover:bg-slate-50">Cancelar</button>
            <button onClick={save} disabled={saving}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
              {saving ? "Guardando…" : (isEdit ? "Guardar cambios" : "Crear operador")}
            </button>
          </div>
        </div>
      </div>
    </div>

  );
}

const inpCls = "w-full border rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400";

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-3 sm:items-start">
      <label className="text-sm text-slate-600 sm:pt-2">{label}</label>
      <div>{children}</div>
    </div>
  );
}
