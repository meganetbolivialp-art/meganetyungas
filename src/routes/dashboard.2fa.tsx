import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AdminLayout } from "@/components/admin-layout";
import { get2faStatus, setup2fa, enable2fa, disable2fa } from "@/lib/twofa.functions";
import { Shield, ShieldCheck, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/2fa")({
  head: () => ({ meta: [{ title: "Autenticación 2FA — MegaNet Admin" }, { name: "robots", content: "noindex" }] }),
  component: TwoFaPage,
});

function TwoFaPage() {
  const fetchStatus = useServerFn(get2faStatus);
  const doSetup = useServerFn(setup2fa);
  const doEnable = useServerFn(enable2fa);
  const doDisable = useServerFn(disable2fa);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = () => fetchStatus().then(r => setEnabled(r.enabled));
  useEffect(() => { refresh(); }, []);

  const startSetup = async () => {
    setBusy(true);
    try {
      const r = await doSetup();
      setQr(r.qr); setSecret(r.secret); setCode(""); setCodes(null);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const activate = async () => {
    if (code.length !== 6) return toast.error("Ingresa el código de 6 dígitos");
    setBusy(true);
    try {
      const r = await doEnable({ data: { code } });
      setCodes(r.recovery_codes); setQr(null); setSecret(null);
      toast.success("2FA activado");
      refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const deactivate = async () => {
    if (code.length !== 6) return toast.error("Ingresa el código actual para desactivar");
    setBusy(true);
    try {
      await doDisable({ data: { code } });
      toast.success("2FA desactivado");
      setCode(""); setCodes(null); refresh();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const copySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <AdminLayout>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Autenticación de dos factores (2FA)</h1>
        <p className="text-sm text-muted-foreground">Añade una capa extra de seguridad usando Google Authenticator, Authy o similar.</p>
      </div>

      <div className="max-w-xl bg-card border rounded-md p-6">
        <div className="flex items-center gap-3 mb-4">
          {enabled ? <ShieldCheck className="w-8 h-8 text-emerald-500" /> : <Shield className="w-8 h-8 text-muted-foreground" />}
          <div>
            <div className="font-semibold">{enabled ? "2FA activado" : "2FA desactivado"}</div>
            <div className="text-xs text-muted-foreground">{enabled ? "Tu cuenta está protegida con TOTP." : "Recomendado para todos los operadores."}</div>
          </div>
        </div>

        {enabled && !qr && (
          <div className="border-t pt-4">
            <p className="text-sm mb-3">Para desactivar 2FA, ingresa un código actual de tu app:</p>
            <div className="flex gap-2">
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000" maxLength={6}
                className="border rounded px-3 py-2 text-center font-mono text-lg tracking-widest w-40 bg-background" />
              <button onClick={deactivate} disabled={busy} className="mw-btn mw-btn-outline text-red-600 border-red-300">Desactivar</button>
            </div>
          </div>
        )}

        {!enabled && !qr && (
          <button onClick={startSetup} disabled={busy} className="mw-btn mw-btn-primary">
            {busy ? "Generando..." : "Activar 2FA"}
          </button>
        )}

        {qr && secret && (
          <div className="border-t pt-4 space-y-4">
            <div>
              <div className="text-sm font-semibold mb-2">Paso 1 — Escanea el QR</div>
              <div className="flex items-center gap-4 flex-wrap">
                <img src={qr} alt="QR 2FA" className="border rounded bg-white" />
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[11px] text-muted-foreground uppercase mb-1">O ingresa manualmente:</div>
                  <div className="flex items-center gap-2">
                    <code className="bg-muted px-2 py-1 rounded font-mono text-xs break-all flex-1">{secret}</code>
                    <button onClick={copySecret} className="p-2 hover:bg-muted rounded" title="Copiar">
                      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold mb-2">Paso 2 — Ingresa el código de 6 dígitos</div>
              <div className="flex gap-2">
                <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000" maxLength={6}
                  className="border rounded px-3 py-2 text-center font-mono text-lg tracking-widest w-40 bg-background" />
                <button onClick={activate} disabled={busy} className="mw-btn mw-btn-primary">Confirmar</button>
              </div>
            </div>
          </div>
        )}

        {codes && (
          <div className="border-t pt-4 mt-4">
            <div className="text-sm font-semibold mb-2 text-amber-600">⚠ Guarda estos códigos de recuperación</div>
            <p className="text-xs text-muted-foreground mb-2">Úsalos si pierdes tu app autenticadora. No los mostraremos otra vez.</p>
            <div className="grid grid-cols-2 gap-2 bg-muted/50 p-3 rounded font-mono text-xs">
              {codes.map(c => <div key={c}>{c}</div>)}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
