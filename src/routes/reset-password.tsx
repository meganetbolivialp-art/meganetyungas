import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Restablecer contraseña" },
      { name: "description", content: "Elegí una nueva contraseña para tu cuenta." },
      { property: "og:title", content: "Restablecer contraseña" },
      { property: "og:description", content: "Elegí una nueva contraseña." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const nav = useNavigate();
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (error) return setErr(error.message);
    nav({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-sm space-y-4">
        <h1 className="text-xl font-semibold">Nueva contraseña</h1>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Nueva contraseña"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            className="w-full border rounded-md pl-10 pr-3 py-2 bg-background outline-none focus:border-primary"
          />
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <button
          disabled={loading}
          className="w-full bg-primary text-primary-foreground py-2 rounded-md hover:bg-primary/90 inline-flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Guardar
        </button>
      </form>
    </div>
  );
}
