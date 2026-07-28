import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Lock, Phone, KeyRound, Unlock, X } from "lucide-react";

type LicenseState = {
  valid: boolean;
  expires_at: string | null;
  active: boolean;
  days_left: number;
};

export function LicenseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LicenseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  const loadLicense = async () => {
    const { data, error } = await supabase.rpc("check_app_license");
    if (error || !data) {
      setState({ valid: false, expires_at: null, active: false, days_left: 0 });
    } else {
      setState(data as unknown as LicenseState);
    }
  };

  const loadAdmin = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return setIsAdmin(false);
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    setIsAdmin(!!data);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await Promise.all([loadLicense(), loadAdmin()]);
      if (mounted) setLoading(false);
    })();
    const t = setInterval(loadLicense, 60 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  if (loading) return <>{children}</>;
  if (state?.valid) {
    if (state.days_left <= 7) {
      return (
        <>
          <div className="bg-amber-500 text-white px-4 py-2 text-sm text-center font-medium">
            <AlertTriangle className="inline w-4 h-4 mr-1" />
            Tu licencia vence en {state.days_left} día{state.days_left === 1 ? "" : "s"}. Contacta al proveedor: +591 60000159
          </div>
          {children}
        </>
      );
    }
    return <>{children}</>;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  // Secret tap on the padlock icon (5 taps) reveals admin panel — for admins only
  const handleLockTap = () => {
    const next = tapCount + 1;
    setTapCount(next);
    if (next >= 5 && isAdmin) {
      setShowAdmin(true);
      setTapCount(0);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-red-950 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center relative">
        <div
          onClick={handleLockTap}
          className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center cursor-pointer select-none"
          title="Sistema bloqueado"
        >
          <Lock className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Sistema bloqueado</h1>
        <p className="text-slate-600 mb-6">
          Tu licencia de uso ha vencido. Para reactivar el sistema, por favor
          contacta al proveedor y renueva tu suscripción.
        </p>
        {state?.expires_at && (
          <div className="bg-slate-100 rounded-lg p-3 mb-6 text-sm text-slate-700">
            <div className="font-semibold">Fecha de vencimiento:</div>
            <div>{new Date(state.expires_at).toLocaleString("es-BO")}</div>
          </div>
        )}
        <a
          href="https://wa.me/59160000159"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg mb-3 transition"
        >
          <Phone className="w-4 h-4" /> Contactar por WhatsApp: +591 60000159
        </a>

        {/* Admin-only rescue button */}
        {isAdmin && (
          <button
            onClick={() => setShowAdmin(true)}
            className="flex items-center justify-center gap-2 w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg mb-3 transition"
          >
            <KeyRound className="w-4 h-4" /> Administrar licencia (admin)
          </button>
        )}

        <button
          onClick={handleSignOut}
          className="w-full bg-slate-200 hover:bg-slate-300 text-slate-800 font-medium py-2 rounded-lg transition"
        >
          Cerrar sesión
        </button>

        {/* Hint if tapping the padlock as non-admin */}
        {tapCount > 0 && !isAdmin && (
          <div className="mt-3 text-xs text-slate-400">
            Solo administradores pueden gestionar la licencia.
          </div>
        )}
      </div>

      {showAdmin && isAdmin && (
        <AdminRescueModal
          state={state}
          onClose={() => setShowAdmin(false)}
          onSaved={async () => {
            await loadLicense();
            setShowAdmin(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

function AdminRescueModal({
  state,
  onClose,
  onSaved,
}: {
  state: LicenseState | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = async (patch: { active?: boolean; days?: number }) => {
    setSaving(true);
    setError(null);
    const { data: rows, error: readErr } = await supabase
      .from("app_license")
      .select("id, expires_at")
      .order("created_at", { ascending: false })
      .limit(1);
    if (readErr || !rows || rows.length === 0) {
      setError(readErr?.message ?? "No se encontró licencia");
      setSaving(false);
      return;
    }
    const row = rows[0];
    const updates: {
      active?: boolean;
      expires_at?: string;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };
    if (patch.active !== undefined) updates.active = patch.active;
    if (patch.days !== undefined) {
      const base = new Date(row.expires_at);
      const now = new Date();
      const from = base > now ? base : now;
      updates.expires_at = new Date(from.getTime() + patch.days * 86400000).toISOString();
      updates.active = true;
    }
    const { error: upErr } = await supabase.from("app_license").update(updates).eq("id", row.id);
    if (upErr) {
      setError(upErr.message);
      setSaving(false);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-slate-100"
        >
          <X className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">Rescate de licencia</h2>
            <p className="text-xs text-slate-500">Solo administradores</p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Estado:</span>
            <span className="font-medium">{state?.active ? "Activa" : "Desactivada"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Vencimiento:</span>
            <span className="font-medium">
              {state?.expires_at ? new Date(state.expires_at).toLocaleDateString("es-BO") : "-"}
            </span>
          </div>
        </div>

        <p className="text-sm text-slate-700 mb-3 font-medium">Reactivar ahora:</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            disabled={saving}
            onClick={() => update({ days: 7 })}
            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium"
          >
            +7 días
          </button>
          <button
            disabled={saving}
            onClick={() => update({ days: 30 })}
            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium"
          >
            +30 días
          </button>
          <button
            disabled={saving}
            onClick={() => update({ days: 90 })}
            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium"
          >
            +90 días
          </button>
          <button
            disabled={saving}
            onClick={() => update({ days: 365 })}
            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium"
          >
            +1 año
          </button>
        </div>

        {state?.active === false && (
          <button
            disabled={saving}
            onClick={() => update({ active: true })}
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 mb-2"
          >
            <Unlock className="w-4 h-4" /> Activar sin cambiar fecha
          </button>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2 mt-2">{error}</div>
        )}
        {saving && <div className="text-xs text-slate-500 text-center mt-2">Guardando...</div>}
      </div>
    </div>
  );
}
