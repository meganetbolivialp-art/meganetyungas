import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Lock, Unlock, Calendar, Save, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/system-license")({
  component: SystemLicensePage,
});

type LicenseRow = {
  id: string;
  expires_at: string;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function SystemLicensePage() {
  const [row, setRow] = useState<LicenseRow | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [active, setActive] = useState(true);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!roleData);
    }

    const { data } = await supabase
      .from("app_license")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setRow(data as LicenseRow);
      // convert to datetime-local
      const d = new Date(data.expires_at);
      const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setExpiresAt(iso);
      setActive(data.active);
      setNote(data.note ?? "");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!row) return;
    setSaving(true);
    const iso = new Date(expiresAt).toISOString();
    const { error } = await supabase
      .from("app_license")
      .update({ expires_at: iso, active, note, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    setSaving(false);
    if (error) {
      toast.error("Error al guardar: " + error.message);
      return;
    }
    toast.success("Licencia actualizada");
    load();
  };

  const extend = async (days: number) => {
    if (!row) return;
    setSaving(true);
    const base = new Date(row.expires_at);
    const now = new Date();
    const from = base > now ? base : now;
    const newDate = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
    const { error } = await supabase
      .from("app_license")
      .update({ expires_at: newDate.toISOString(), active: true, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Licencia extendida ${days} días`);
    load();
  };

  const toggleActive = async () => {
    if (!row) return;
    setSaving(true);
    const { error } = await supabase
      .from("app_license")
      .update({ active: !row.active, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(row.active ? "Sistema DESACTIVADO" : "Sistema ACTIVADO");
    load();
  };

  const now = new Date();
  const exp = row ? new Date(row.expires_at) : null;
  const isValid = row?.active && exp && exp > now;
  const daysLeft = exp ? Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;

  if (loading) {
    return (
      <AdminLayout title="Licencia del sistema">
        <div className="p-6">Cargando...</div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AdminLayout title="Licencia del sistema">
        <div className="p-6">
          <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <Lock className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-red-900">Acceso denegado</h2>
            <p className="text-sm text-red-700 mt-2">
              Solo administradores pueden gestionar la licencia del sistema.
            </p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Licencia del sistema" subtitle="Control de activación y vencimiento">
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
        {/* Estado actual */}
        <div className={`rounded-2xl p-5 md:p-6 border-2 ${
          isValid ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"
        }`}>
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
              isValid ? "bg-green-500" : "bg-red-500"
            }`}>
              {isValid ? <ShieldCheck className="w-8 h-8 text-white" /> : <ShieldOff className="w-8 h-8 text-white" />}
            </div>
            <div className="flex-1">
              <h2 className={`text-xl font-bold ${isValid ? "text-green-900" : "text-red-900"}`}>
                {isValid ? "Sistema ACTIVO" : row?.active === false ? "Sistema DESACTIVADO manualmente" : "Licencia VENCIDA"}
              </h2>
              <p className={`text-sm mt-1 ${isValid ? "text-green-700" : "text-red-700"}`}>
                {isValid
                  ? `Faltan ${daysLeft} día${daysLeft === 1 ? "" : "s"} para el vencimiento`
                  : "Los usuarios no pueden acceder al panel"}
              </p>
              <p className="text-xs mt-2 opacity-75">
                Vence: {exp?.toLocaleString("es-BO")}
              </p>
            </div>
          </div>
        </div>

        {/* Acciones rápidas */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Acciones rápidas</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button onClick={() => extend(7)} disabled={saving}
              className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
              +7 días
            </button>
            <button onClick={() => extend(30)} disabled={saving}
              className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
              +30 días
            </button>
            <button onClick={() => extend(90)} disabled={saving}
              className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
              +90 días
            </button>
            <button onClick={() => extend(365)} disabled={saving}
              className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
              +1 año
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <button
              onClick={toggleActive}
              disabled={saving}
              className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition ${
                row?.active
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              {row?.active ? (
                <><Lock className="w-5 h-5" /> Desactivar sistema ahora</>
              ) : (
                <><Unlock className="w-5 h-5" /> Activar sistema ahora</>
              )}
            </button>
            <p className="text-xs text-slate-500 mt-2 text-center">
              {row?.active
                ? "Al desactivar, todos los usuarios (incluido tú) serán bloqueados al recargar."
                : "Reactiva inmediatamente sin cambiar la fecha de vencimiento."}
            </p>
          </div>
        </div>

        {/* Edición manual */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Editar manualmente</h3>

          <label className="block text-sm font-medium text-slate-700 mb-1">
            <Calendar className="inline w-4 h-4 mr-1" /> Fecha de vencimiento
          </label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4"
          />

          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-slate-700">Licencia activa</span>
          </label>

          <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Ej: Cliente Juan Pérez, plan 3 meses..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-4"
          />

          <button
            onClick={save}
            disabled={saving}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>

        <div className="text-xs text-slate-500 text-center">
          Última actualización: {row ? new Date(row.updated_at).toLocaleString("es-BO") : "-"}
        </div>
      </div>
    </AdminLayout>
  );
}
