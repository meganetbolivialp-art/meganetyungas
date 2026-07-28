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
