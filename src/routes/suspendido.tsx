import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/suspendido")({
  head: () => ({
    meta: [
      { title: "Servicio Suspendido — Aviso" },
      { name: "description", content: "Tu conexión de internet fue suspendida por falta de pago." },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
      { name: "robots", content: "noindex" },
      { httpEquiv: "Cache-Control", content: "no-store" },
      { name: "theme-color", content: "#dc2626" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=yes" },
    ],
  }),
  component: SuspendedPage,
});

type PortalSettings = {
  title: string; subtitle: string; message: string;
  whatsapp: string; whatsapp_message: string; phone: string;
  company_name: string; logo_url: string | null;
  primary_color: string; secondary_color: string; footer_note: string;
  custom_html?: string | null; use_custom_html?: boolean;
  template_base_url?: string | null;
};

const FALLBACK: PortalSettings = {
  title: "Servicio Suspendido",
  subtitle: "Tu conexión está temporalmente inactiva",
  message: "Disculpe las molestias que esto le pueda ocasionar, su conexión a Internet se encuentra suspendida porque en nuestro sistema aún no se ha registrado su pago. Agradecemos su comprensión, si tiene algún inconveniente con su pago no dude en informarnos.",
  whatsapp: "5959XXXXXXX", whatsapp_message: "Hola, quiero reactivar mi servicio",
  phone: "021-XXXXXX", company_name: "Meganet", logo_url: null,
  primary_color: "#ff6969", secondary_color: "#14bfbf",
  footer_note: "Al confirmar tu pago, tu conexión se restablece en menos de 1 minuto.",
  custom_html: null, use_custom_html: false, template_base_url: null,
};

function renderTemplate(html: string, s: PortalSettings) {
  const vars: Record<string, string> = {
    title: s.title, subtitle: s.subtitle, message: s.message,
    whatsapp: s.whatsapp, whatsapp_message: s.whatsapp_message,
    whatsapp_message_encoded: encodeURIComponent(s.whatsapp_message),
    phone: s.phone, company_name: s.company_name, logo_url: s.logo_url ?? "",
    primary_color: s.primary_color, secondary_color: s.secondary_color,
    footer_note: s.footer_note,
  };
  let out = html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
  const base = (s.template_base_url ?? "").trim();
  if (base && !/<base\s/i.test(out)) {
    const href = base.endsWith("/") ? base : base + "/";
    const baseTag = `<base href="${href.replace(/"/g, "&quot;")}">`;
    if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, m => `${m}\n${baseTag}`);
    else out = `${baseTag}\n${out}`;
  }
  return out;
}


function SuspendedPage() {
  const [s, setS] = useState<PortalSettings>(FALLBACK);
  const [active, setActive] = useState<"home" | "facturas" | "dondepagar">("home");

  useEffect(() => {
    (async () => {
      try {
        const { getSuspendedPortalSettings } = await import("@/lib/portal-settings.functions");
        const data = await getSuspendedPortalSettings();
        if (data) setS({ ...FALLBACK, ...data });
      } catch { /* keep fallback */ }
    })();
  }, []);

  const customHtml = useMemo(
    () => (s.use_custom_html && s.custom_html ? renderTemplate(s.custom_html, s) : null),
    [s]
  );

  // If admin enabled a custom HTML template, render it full-screen (mobile-first).
  useEffect(() => {
    if (customHtml) document.documentElement.style.background = "#0b1220";
  }, [customHtml]);

  if (customHtml) {
    return (
      <iframe
        title="Aviso de suspensión"
        srcDoc={customHtml}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0, background: "#0b1220" }}
      />
    );
  }

  const scrollTo = (id: "home" | "facturas" | "dondepagar") => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const primary = s.primary_color || "#ff6969";
  const accent = s.secondary_color || "#14bfbf";
  const waLink = `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(s.whatsapp_message)}`;


  return (
    <div className="min-h-screen bg-white text-slate-800" style={{ fontFamily: "'Open Sans', system-ui, -apple-system, sans-serif" }}>
      {/* NAV */}
      <nav className="fixed top-0 inset-x-0 z-30 bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[70px] flex items-center justify-between">
          <button onClick={() => scrollTo("home")} className="flex items-center gap-2">
            {s.logo_url ? (
              <img src={s.logo_url} alt={s.company_name} className="h-10 object-contain" />
            ) : (
              <span className="text-xl font-extrabold tracking-tight" style={{ color: primary }}>
                {s.company_name}
              </span>
            )}
          </button>
          <div className="flex items-center gap-4 sm:gap-8 text-[13px] font-semibold uppercase tracking-wider">
            <NavItem icon="bell" label="Aviso" active={active === "home"} color={accent} onClick={() => scrollTo("home")} />
            <NavItem icon="phone" label="Contacto" active={active === "facturas"} color={accent} onClick={() => scrollTo("facturas")} />
            <NavItem icon="pin" label="¿Dónde pagar?" active={active === "dondepagar"} color={accent} onClick={() => scrollTo("dondepagar")} />
          </div>
        </div>
      </nav>

      {/* HERO / AVISO */}
      <section
        id="home"
        className="relative min-h-screen flex items-center justify-center pt-[70px] px-4"
        style={{
          backgroundImage:
            "linear-gradient(rgba(10,15,20,0.72), rgba(10,15,20,0.78)), url('https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1920&q=80')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
      >
        <div className="max-w-3xl w-full text-center py-16">
          <h1 className="text-4xl sm:text-6xl font-extrabold flex items-center justify-center gap-4 mb-8" style={{ color: primary }}>
            <LockIcon className="h-10 w-10 sm:h-14 sm:w-14" />
            <span>{s.title}</span>
          </h1>

          <h4 className="text-lg sm:text-2xl font-semibold mb-6" style={{ color: accent }}>
            Estimado cliente
          </h4>

          <p className="text-white/90 text-[15px] sm:text-base leading-relaxed max-w-2xl mx-auto">
            {s.message}
          </p>

          <p className="text-white/90 text-[15px] sm:text-base mt-6 mb-6">Para reactivar su servicio inmediatamente</p>

          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={waLink}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-white font-semibold transition-transform hover:-translate-y-0.5 shadow-lg"
              style={{ background: accent }}
            >
              <WhatsappIcon className="h-5 w-5" />
              WhatsApp
            </a>
            <button
              onClick={() => scrollTo("dondepagar")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md font-semibold border-2 text-white hover:bg-white/10 transition"
              style={{ borderColor: "rgba(255,255,255,0.9)" }}
            >
              <PinIcon className="h-5 w-5" />
              Lugares de pago
            </button>
          </div>
        </div>
      </section>

      {/* CONTACTO */}
      <section id="facturas" className="py-20 px-4 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <PhoneBigIcon className="h-12 w-12 mx-auto mb-4" style={{ color: accent }} />
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-4">Contacto</h2>
          <div className="text-3xl sm:text-4xl font-extrabold my-4" style={{ color: accent }}>
            {s.phone}
          </div>
          <p className="text-slate-600 text-base">
            <WhatsappIcon className="inline h-5 w-5 mr-2" style={{ color: "#25D366" }} />
            WhatsApp disponible
          </p>
          <p className="text-slate-600 text-base mt-1">Llama o escribe para cualquier consulta</p>

          <div className="mt-8">
            <a
              href={waLink}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-white font-semibold shadow-lg hover:-translate-y-0.5 transition-transform"
              style={{ background: "#25D366" }}
            >
              <WhatsappIcon className="h-5 w-5" />
              Escribir por WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* DONDE PAGAR */}
      <section id="dondepagar" className="py-20 px-4 bg-slate-50 border-t border-slate-100">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-3">¿Dónde pagar?</h2>
          <p className="text-slate-600 mb-8">
            A continuación detallamos todas las formas y lugares donde pueda pagar sus facturas.
          </p>

          <div className="bg-white rounded-xl shadow-md p-6 sm:p-8 space-y-4 text-slate-700">
            <p className="font-semibold text-slate-900 text-sm sm:text-base">
              Consultá con nuestro equipo por los medios de pago disponibles.
            </p>
            <p className="text-sm sm:text-base">
              Horarios de atención:{" "}
              <span className="font-bold">Lunes a viernes de 09:00 a 12:00 y de 13:30 a 16:30 Hrs.</span>
            </p>
            <p className="text-xs sm:text-sm text-slate-500 italic pt-2 border-t border-slate-100">
              {s.footer_note}
            </p>
          </div>

          <div className="mt-8">
            <a
              href={waLink}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-white font-semibold shadow-lg hover:-translate-y-0.5 transition-transform"
              style={{ background: accent }}
            >
              <WhatsappIcon className="h-5 w-5" />
              Contactar ahora
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-6 text-center text-xs">
        © {new Date().getFullYear()} {s.company_name} — Portal de servicio
      </footer>
    </div>
  );
}

function NavItem({ icon, label, active, color, onClick }: { icon: "bell" | "phone" | "pin"; label: string; active: boolean; color: string; onClick: () => void }) {
  const Icon = icon === "bell" ? BellIcon : icon === "phone" ? PhoneIcon : PinIcon;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 transition-colors"
      style={{ color: active ? color : "#334155" }}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/* Icons */
function LockIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V11a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 1 1 6 0v3H9z" />
    </svg>
  );
}
function BellIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
}
function PhoneIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
}
function PinIcon(p: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
}
function PhoneBigIcon(p: React.SVGProps<SVGSVGElement> & { style?: React.CSSProperties }) {
  return <PhoneIcon {...p} />;
}
function WhatsappIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 .1 5.4.1 12c0 2.1.6 4.1 1.6 5.9L0 24l6.3-1.6a12 12 0 0 0 5.7 1.5c6.6 0 11.9-5.4 11.9-12 0-3.2-1.2-6.2-3.4-8.4Zm-8.5 18.4c-1.8 0-3.6-.5-5.1-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.9 9.9 0 0 1 2 12C2 6.5 6.5 2 12 2s10 4.5 10 10-4.5 9.9-10 9.9Zm5.5-7.4c-.3-.2-1.8-.9-2-1s-.5-.2-.7.2-.8 1-.9 1.2-.3.2-.6 0c-1.7-.9-2.9-1.6-4.1-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5s-.7-1.7-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4a3 3 0 0 0-.9 2.2c0 1.3 1 2.6 1.1 2.7.1.2 1.9 3 4.7 4.2 1.8.7 2.5.8 3.4.7.5-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.3-.6-.5Z" />
    </svg>
  );
}
