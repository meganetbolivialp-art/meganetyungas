import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveLoginIdentifier } from "@/lib/operators.functions";
import loginBg from "@/assets/login-bg.jpg";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Ingresar — Meganet" },
      { name: "description", content: "Acceso al panel administrativo Meganet ISP." },
      { property: "og:title", content: "Meganet · Panel Administrativo" },
      { property: "og:description", content: "Acceso al panel administrativo Meganet." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const resolveLogin = useServerFn(resolveLoginIdentifier);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showRescue, setShowRescue] = useState(false);


  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const identifier = email.trim();
      const candidates = identifier.includes("@")
        ? [identifier.toLowerCase()]
        : Array.from(new Set([
            `${identifier}@admin.com`,
            `${identifier}@meganet.local`,
            await resolveLogin({ data: { identifier } }).catch(() => ""),
          ].filter(Boolean)));

      let lastError: Error | null = null;
      for (const loginEmail of candidates) {
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (!error) {
          queryClient.clear();
          navigate({ to: "/dashboard", replace: true });
          return;
        }
        lastError = error;
      }
      throw lastError ?? new Error("Usuario o contraseña incorrectos.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      setMsg(message === "Invalid login credentials" ? "Usuario o contraseña incorrectos." : message);
    } finally {
      setLoading(false);
    }
  };

  const recover = async () => {
    if (!email) {
      setMsg("Ingresá tu usuario/email primero.");
      return;
    }
    const identifier = email.trim();
    const target = identifier.includes("@") ? identifier.toLowerCase() : await resolveLogin({ data: { identifier } });
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    setMsg(error ? error.message : "Te enviamos un email para recuperar tu contraseña.");
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center px-4 py-10 text-white overflow-hidden bg-[#04101f]">
      {/* Animated background image (slow ken-burns) */}
      <div
        className="absolute inset-0 animate-[bgZoom_30s_ease-in-out_infinite_alternate]"
        style={{
          backgroundImage: `url(${loginBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {/* Blue tint overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#031a3a]/80 via-[#052248]/75 to-[#020b1c]/90" />
      {/* Animated blue glow blobs */}
      <div className="pointer-events-none absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-[#1e6fff]/25 blur-3xl animate-[blob_18s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 w-[560px] h-[560px] rounded-full bg-[#00c2ff]/20 blur-3xl animate-[blob_22s_ease-in-out_infinite_reverse]" />
      <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-[#3b82f6]/15 blur-3xl animate-[blob_26s_ease-in-out_infinite]" />

      <style>{`
        @keyframes bgZoom {
          0% { transform: scale(1) translate(0,0); }
          100% { transform: scale(1.12) translate(-1.5%, -1%); }
        }
        @keyframes blob {
          0%,100% { transform: translate(0px,0px) scale(1); }
          33% { transform: translate(40px,-30px) scale(1.1); }
          66% { transform: translate(-30px,25px) scale(0.95); }
        }
      `}</style>

      <div className="relative z-10 w-full max-w-[380px] flex flex-col items-center">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10 select-none">
          <MeganetMark size={78} />
          <div className="mt-4 text-[34px] font-black tracking-tight leading-none">
            MEGA<span className="text-[#ff7a2b]">NET</span>
          </div>
          <div className="text-[10px] tracking-[0.45em] text-white/60 mt-2">
            FIBRA ÓPTICA
          </div>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="w-full space-y-4">
          <input
            type="text"
            required
            placeholder="Usuario"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            className="w-full bg-white/[0.06] border border-white/15 rounded-md px-4 py-3.5 text-sm text-white placeholder-white/50 outline-none focus:border-white/40 focus:bg-white/[0.09] transition"
          />
          <input
            type="password"
            required
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full bg-white/[0.06] border border-white/15 rounded-md px-4 py-3.5 text-sm text-white placeholder-white/50 outline-none focus:border-white/40 focus:bg-white/[0.09] transition"
          />

          {msg && (
            <div className="text-xs rounded-md px-3 py-2.5 bg-[#ff5722]/10 border border-[#ff5722]/30 text-white/90">
              {msg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-md text-sm font-semibold text-white bg-[#2196f3] hover:bg-[#1e88e5] disabled:opacity-60 transition shadow-[0_8px_20px_-8px_rgba(33,150,243,0.6)]"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Ingresar al Administrador
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-[13px] text-white/70 text-center">
          ¿Olvidaste tu contraseña? Click{" "}
          <button
            type="button"
            onClick={recover}
            className="text-[#ff7a2b] hover:underline font-medium"
          >
            Aquí
          </button>{" "}
          para recuperar.
        </p>

        <p className="mt-2 text-[13px] text-white/70 text-center">
          ¿No tienes cuenta?{" "}
          <a href="/#precios" className="text-[#2b5cff] hover:underline font-medium">
            Contratar
          </a>
        </p>
      </div>

      {/* Invisible license-admin trigger (top-left corner) */}
      <button
        type="button"
        aria-label="rescue"
        onClick={() => setShowRescue(true)}
        className="fixed top-0 left-0 w-20 h-20 opacity-0 z-50"
        style={{ background: "transparent", border: "none" }}
      />

      {showRescue && <LicenseRescueModal onClose={() => setShowRescue(false)} />}
    </div>
  );
}


function MeganetMark({ size = 78 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-[#ffb673] via-[#ff7a2b] to-[#e04a13] shadow-[0_10px_40px_-10px_rgba(255,87,34,0.7)] flex items-center justify-center"
      >
        <span
          className="text-white font-black italic"
          style={{ fontSize: size * 0.58, lineHeight: 1 }}
        >
          M
        </span>
      </div>
    </div>
  );
}

function LicenseRescueModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"login" | "manage">("login");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<{ id: string; expires_at: string; active: boolean } | null>(null);

  const auth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const id = user.trim();
      const emails = id.includes("@") ? [id.toLowerCase()] : [`${id}@admin.com`, `${id}@meganet.local`];
      let signed = false;
      for (const em of emails) {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password: pass });
        if (!error) { signed = true; break; }
      }
      if (!signed) throw new Error("Credenciales inválidas");
      const { data: u } = await supabase.auth.getUser();
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", u.user!.id).eq("role", "admin").maybeSingle();
      if (!role) { await supabase.auth.signOut(); throw new Error("Solo administradores"); }
      const { data: rows, error: rErr } = await supabase.from("app_license").select("id, expires_at, active").order("created_at", { ascending: false }).limit(1);
      if (rErr || !rows?.length) throw new Error(rErr?.message ?? "Sin licencia");
      setInfo(rows[0] as any);
      setStep("manage");
    } catch (e: any) {
      setErr(e.message ?? "Error");
    } finally {
      setBusy(false);
    }
  };

  const update = async (patch: { active?: boolean; days?: number }) => {
    if (!info) return;
    setBusy(true); setErr(null);
    const updates: any = { updated_at: new Date().toISOString() };
    if (patch.active !== undefined) updates.active = patch.active;
    if (patch.days !== undefined) {
      const base = new Date(info.expires_at); const now = new Date();
      const from = base > now ? base : now;
      updates.expires_at = new Date(from.getTime() + patch.days * 86400000).toISOString();
      updates.active = true;
    }
    const { error } = await supabase.from("app_license").update(updates).eq("id", info.id);
    if (error) { setErr(error.message); setBusy(false); return; }
    const { data: rows } = await supabase.from("app_license").select("id, expires_at, active").eq("id", info.id).single();
    setInfo(rows as any);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-900">Administrar licencia</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">✕</button>
        </div>
        {step === "login" && (
          <form onSubmit={auth} className="space-y-3">
            <input required placeholder="Usuario admin" value={user} onChange={(e) => setUser(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            <input required type="password" placeholder="Contraseña" value={pass} onChange={(e) => setPass(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
            {err && <div className="text-xs text-red-600 bg-red-50 rounded p-2">{err}</div>}
            <button disabled={busy} className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-md text-sm disabled:opacity-60">
              {busy ? "Verificando..." : "Verificar y continuar"}
            </button>
          </form>
        )}
        {step === "manage" && info && (
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">Estado:</span><span className="font-medium">{info.active ? "Activa" : "Desactivada"}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Vence:</span><span className="font-medium">{new Date(info.expires_at).toLocaleDateString("es-BO")}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[7, 30, 90, 365].map((d) => (
                <button key={d} disabled={busy} onClick={() => update({ days: d })} className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium disabled:opacity-60">
                  +{d === 365 ? "1 año" : `${d} días`}
                </button>
              ))}
            </div>
            <button disabled={busy} onClick={() => update({ active: !info.active })} className={`w-full py-2.5 rounded-md text-sm font-semibold text-white ${info.active ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"} disabled:opacity-60`}>
              {info.active ? "Desactivar sistema" : "Activar sistema"}
            </button>
            {err && <div className="text-xs text-red-600 bg-red-50 rounded p-2">{err}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
