import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { toast } from "sonner";
import { reapplyCutoffPortalRules } from "@/lib/isp.functions";

export const Route = createFileRoute("/dashboard/settings-portal")({
  component: SettingsPortal,
});

type PortalSettings = {
  title: string; subtitle: string; message: string;
  whatsapp: string; whatsapp_message: string; phone: string;
  company_name: string; logo_url: string | null;
  primary_color: string; secondary_color: string; footer_note: string;
  custom_html: string | null; use_custom_html: boolean;
  template_base_url: string | null;
};

const DEFAULT_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
<meta name="theme-color" content="{{primary_color}}" />
<meta http-equiv="Cache-Control" content="no-store" />
<title>{{title}} — {{company_name}}</title>
<style>
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;padding:0;background:#0b1220;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.5;min-height:100vh;min-height:100dvh}
  .wrap{max-width:520px;margin:0 auto;padding:24px 18px calc(24px + env(safe-area-inset-bottom))}
  .card{background:#111827;border:1px solid #1f2937;border-radius:20px;overflow:hidden;box-shadow:0 20px 45px rgba(0,0,0,.35)}
  .hero{padding:28px 22px;text-align:center;background:linear-gradient(135deg,{{primary_color}},{{secondary_color}});color:#fff}
  .hero .badge{width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.18);display:inline-flex;align-items:center;justify-content:center;font-size:34px;margin-bottom:10px}
  .hero h1{margin:0;font-size:26px;font-weight:800;letter-spacing:-.01em}
  .hero p{margin:6px 0 0;opacity:.95;font-size:15px}
  .body{padding:20px 18px}
  .msg{background:#0b1220;border-left:4px solid {{secondary_color}};padding:14px 14px;border-radius:10px;color:#e2e8f0;font-size:15px}
  .btn{display:flex;align-items:center;gap:12px;padding:16px 18px;border-radius:14px;color:#fff;font-weight:700;text-decoration:none;font-size:16px;margin-top:12px;min-height:56px}
  .btn .ic{width:28px;height:28px;flex:0 0 28px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.2);border-radius:50%;font-size:16px}
  .btn small{display:block;font-weight:500;opacity:.9;font-size:12px}
  .wa{background:#25D366}
  .call{background:#2563eb}
  .foot{padding:16px;text-align:center;color:#94a3b8;font-size:12px;border-top:1px solid #1f2937}
  .brand{padding:14px;text-align:center;color:#64748b;font-size:12px}
  .brand img{max-height:36px;display:block;margin:0 auto 6px}
  @media (max-width:360px){.hero h1{font-size:22px}.btn{font-size:15px;padding:14px}}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="hero">
        <div class="badge">⚠️</div>
        <h1>{{title}}</h1>
        <p>{{subtitle}}</p>
      </div>
      <div class="body">
        <div class="msg">{{message}}</div>
        <a class="btn wa" href="https://wa.me/{{whatsapp}}?text={{whatsapp_message_encoded}}">
          <span class="ic">💬</span>
          <span>WhatsApp<small>{{whatsapp}}</small></span>
        </a>
        <a class="btn call" href="tel:{{phone}}">
          <span class="ic">📞</span>
          <span>Llamar ahora<small>{{phone}}</small></span>
        </a>
      </div>
      <div class="foot">{{footer_note}}</div>
    </div>
    <div class="brand">{{company_name}}</div>
  </div>
</body>
</html>`;

const DEFAULTS: PortalSettings = {
  title: "Servicio suspendido",
  subtitle: "Tu conexión está temporalmente inactiva",
  message: "Hola, tu servicio de internet fue suspendido por falta de pago. Regularizá el saldo pendiente y lo reactivamos al instante.",
  whatsapp: "5959XXXXXXX",
  whatsapp_message: "Hola, quiero pagar mi factura y reactivar el servicio",
  phone: "021-XXXXXX",
  company_name: "Mi ISP",
  logo_url: null,
  primary_color: "#dc2626",
  secondary_color: "#f97316",
  footer_note: "Al confirmar tu pago, tu conexión se restablece en menos de 1 minuto.",
  custom_html: null,
  use_custom_html: false,
  template_base_url: null,
};

function renderTemplate(html: string, s: PortalSettings) {
  const vars: Record<string, string> = {
    title: s.title, subtitle: s.subtitle, message: s.message,
    whatsapp: s.whatsapp, whatsapp_message: s.whatsapp_message,
    whatsapp_message_encoded: encodeURIComponent(s.whatsapp_message),
    phone: s.phone, company_name: s.company_name,
    logo_url: s.logo_url ?? "",
    primary_color: s.primary_color, secondary_color: s.secondary_color,
    footer_note: s.footer_note,
  };
  let out = html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
  // Inject <base href> so relative paths (../avisos/assets/...) resolve
  // against the original server when the HTML is rendered in an iframe/srcDoc.
  const base = (s.template_base_url ?? "").trim();
  if (base && !/<base\s/i.test(out)) {
    const baseTag = `<base href="${base.replace(/"/g, "&quot;")}${base.endsWith("/") ? "" : "/"}">`;
    if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, m => `${m}\n${baseTag}`);
    else out = `${baseTag}\n${out}`;
  }
  return out;
}


function SettingsPortal() {
  const [s, setS] = useState<PortalSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingRules, setApplyingRules] = useState(false);
  const [tab, setTab] = useState<"basico" | "html">("basico");
  const reapplyRules = useServerFn(reapplyCutoffPortalRules);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("portal_settings").select("*").eq("id", true).maybeSingle();
      if (data) setS({ ...DEFAULTS, ...data });
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await (supabase as any).from("portal_settings").update(s).eq("id", true);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Guardado. Los clientes verán la nueva plantilla.");
  }

  async function applyRules() {
    setApplyingRules(true);
    try {
      const res = await reapplyRules({ data: {} });
      toast.success(`Reglas aplicadas en ${res.routers.length} router(es)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplyingRules(false);
    }
  }

  const inputCls = "w-full border rounded px-3 py-2 text-sm";
  const html = s.custom_html ?? DEFAULT_HTML;
  const previewHtml = useMemo(() => renderTemplate(html, s), [html, s]);

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Portal de corte</h1>
            <p className="text-slate-600 text-sm">Personalizá lo que ven los clientes suspendidos. Optimizado para celular (Android/iOS).</p>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50 text-sm">
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <a href="/suspendido" target="_blank" rel="noreferrer" className="border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded font-medium text-sm">Abrir ↗</a>
            <button onClick={applyRules} disabled={applyingRules} className="border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 px-4 py-2 rounded font-medium disabled:opacity-50 text-sm">
              {applyingRules ? "…" : "Reaplicar MikroTik"}
            </button>
          </div>
        </div>

        <div className="mb-4 border-b flex gap-1">
          <TabBtn active={tab === "basico"} onClick={() => setTab("basico")}>Básico</TabBtn>
          <TabBtn active={tab === "html"} onClick={() => setTab("html")}>Plantilla HTML</TabBtn>
        </div>

        {loading ? <div>Cargando…</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {tab === "basico" ? (
              <div className="bg-white rounded-lg border p-5 space-y-4">
                <h2 className="font-semibold text-slate-800 border-b pb-2">Contenido</h2>
                <Field label="Nombre de la empresa"><input className={inputCls} value={s.company_name} onChange={e => setS({ ...s, company_name: e.target.value })} /></Field>
                <Field label="Logo (URL, opcional)"><input className={inputCls} value={s.logo_url ?? ""} onChange={e => setS({ ...s, logo_url: e.target.value || null })} placeholder="https://..." /></Field>
                <Field label="Título"><input className={inputCls} value={s.title} onChange={e => setS({ ...s, title: e.target.value })} /></Field>
                <Field label="Subtítulo"><input className={inputCls} value={s.subtitle} onChange={e => setS({ ...s, subtitle: e.target.value })} /></Field>
                <Field label="Mensaje principal"><textarea className={inputCls} rows={3} value={s.message} onChange={e => setS({ ...s, message: e.target.value })} /></Field>
                <Field label="Nota al pie"><textarea className={inputCls} rows={2} value={s.footer_note} onChange={e => setS({ ...s, footer_note: e.target.value })} /></Field>

                <h2 className="font-semibold text-slate-800 border-b pb-2 pt-3">Contacto</h2>
                <Field label="WhatsApp (con código país, sin +)"><input className={inputCls} value={s.whatsapp} onChange={e => setS({ ...s, whatsapp: e.target.value })} placeholder="595971234567" /></Field>
                <Field label="Mensaje pre-cargado del WhatsApp"><input className={inputCls} value={s.whatsapp_message} onChange={e => setS({ ...s, whatsapp_message: e.target.value })} /></Field>
                <Field label="Teléfono"><input className={inputCls} value={s.phone} onChange={e => setS({ ...s, phone: e.target.value })} /></Field>

                <h2 className="font-semibold text-slate-800 border-b pb-2 pt-3">Colores</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Color primario"><input type="color" className="h-10 w-full border rounded" value={s.primary_color} onChange={e => setS({ ...s, primary_color: e.target.value })} /></Field>
                  <Field label="Color secundario"><input type="color" className="h-10 w-full border rounded" value={s.secondary_color} onChange={e => setS({ ...s, secondary_color: e.target.value })} /></Field>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg border p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-800">Plantilla HTML personalizada</h2>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={s.use_custom_html} onChange={e => setS({ ...s, use_custom_html: e.target.checked })} />
                    Usar plantilla personalizada
                  </label>
                </div>
                <Field label="URL base para recursos (opcional)">
                  <input
                    className={inputCls}
                    value={s.template_base_url ?? ""}
                    onChange={e => setS({ ...s, template_base_url: e.target.value || null })}
                    placeholder="https://mega-net-bolivia.online/"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Si tu HTML usa rutas relativas como <code>../avisos/assets/…</code> (típico de MikroWisp), pegá acá la URL del servidor original para que se carguen los CSS, imágenes y JS.
                  </span>
                </Field>
                <p className="text-xs text-slate-500">
                  Variables: <code className="bg-slate-100 px-1 rounded">{"{{title}}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{{subtitle}}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{{message}}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{{footer_note}}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{{whatsapp}}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{{whatsapp_message_encoded}}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{{phone}}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{{company_name}}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{{logo_url}}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{{primary_color}}"}</code>, <code className="bg-slate-100 px-1 rounded">{"{{secondary_color}}"}</code>.
                </p>
                <textarea
                  className="w-full border rounded p-3 font-mono text-xs bg-slate-950 text-slate-100"
                  rows={20}
                  spellCheck={false}
                  value={s.custom_html ?? DEFAULT_HTML}
                  onChange={e => setS({ ...s, custom_html: e.target.value })}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setS({ ...s, custom_html: DEFAULT_HTML })}
                    className="text-xs border px-3 py-1.5 rounded hover:bg-slate-50"
                  >Cargar plantilla móvil por defecto</button>
                </div>
              </div>
            )}

            {/* Preview - phone mockup */}
            <div>
              <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                Vista previa <span className="text-xs font-normal text-slate-500">(simulación móvil 375px)</span>
              </h2>
              <div className="rounded-[36px] border-[10px] border-slate-900 bg-slate-900 mx-auto shadow-2xl overflow-hidden" style={{ width: 375, maxWidth: "100%", height: 720 }}>
                <iframe
                  title="Vista previa portal"
                  srcDoc={s.use_custom_html ? previewHtml : renderTemplate(DEFAULT_HTML, s)}
                  className="w-full h-full bg-white"
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"

                />
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{children}</button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-slate-600 block mb-1">{label}</span>{children}</label>;
}
