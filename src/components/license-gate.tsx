import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Lock, Phone } from "lucide-react";

type LicenseState = {
  valid: boolean;
  expires_at: string | null;
  active: boolean;
  days_left: number;
};

export function LicenseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LicenseState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase.rpc("check_app_license");
      if (!mounted) return;
      if (error || !data) {
        // Fail-closed: if we can't verify, block.
        setState({ valid: false, expires_at: null, active: false, days_left: 0 });
      } else {
        setState(data as unknown as LicenseState);
      }
      setLoading(false);
    };
    load();
    const t = setInterval(load, 60 * 60 * 1000); // recheck every hour
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  if (loading) return <>{children}</>;
  if (state?.valid) {
    // Warning banner when < 7 days left
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

  // Blocked screen
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-red-950 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
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
        <button
          onClick={handleSignOut}
          className="w-full bg-slate-200 hover:bg-slate-300 text-slate-800 font-medium py-2 rounded-lg transition"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
