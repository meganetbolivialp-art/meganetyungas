import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Wifi, ShieldCheck, Zap, Router, Users, CreditCard, Activity, Map, Bell,
  BarChart3, Ticket, Receipt, CheckCircle2, ArrowRight, Phone, MessageCircle, Star, Gauge, Scissors,
} from "lucide-react";

const WA = "59160000159";
const waLink = (msg: string) => `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MEGANET · MikroSystem — Software ISP para MikroTik en Bolivia" },
      { name: "description", content: "Gestiona tu ISP: clientes PPPoE, cobros en Bs, cortes y reactivación automática, recibos, mapa de red y alertas de nodos." },
      { property: "og:title", content: "MEGANET · MikroSystem — Software ISP para MikroTik" },
      { property: "og:description", content: "Planes en bolivianos, soporte por WhatsApp 60000159. Todo tu WISP en un solo panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Router, t: "Multi‑MikroTik", d: "Conecta todos tus nodos por VPN y controla PPPoE y colas." },
  { icon: Scissors, t: "Cortes automáticos", d: "Por plantilla, por nodo o manual al instante." },
  { icon: Zap, t: "Reactivación al pagar", d: "El cliente vuelve a tener internet apenas paga." },
  { icon: Receipt, t: "Recibos con tu logo", d: "Impresión térmica 80 mm, obligatoria y editable." },
  { icon: CreditCard, t: "Facturas mensuales", d: "Se generan solas el día que elijas." },
  { icon: Map, t: "Mapa de red", d: "Clientes y zonas en el mapa con su estado." },
  { icon: Bell, t: "Alertas de nodos", d: "Te avisa cuando un router se cae." },
  { icon: Users, t: "Operadores y permisos", d: "Cada cajero o técnico ve solo lo suyo." },
  { icon: BarChart3, t: "Reportes", d: "Ingresos, morosos y tráfico en vivo." },
];

const plans = [
  { n: "Básico", p: 150, c: "Hasta 200 clientes", f: ["1 router MikroTik", "Cortes y reactivación", "Recibos", "Soporte WhatsApp"] },
  { n: "Profesional", p: 300, c: "Hasta 1.000 clientes", f: ["5 routers", "Facturas automáticas", "Mapa de red", "Alertas de nodos", "Operadores ilimitados"], hot: true },
  { n: "Empresa", p: 550, c: "Clientes ilimitados", f: ["Routers ilimitados", "Todo lo de Profesional", "Instalación incluida", "Soporte prioritario 24/7"] },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold tracking-tight">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-primary text-primary-foreground shadow-lg lp-glow"><Wifi className="w-5 h-5" /></span>
            MEGANET <span className="text-primary">MikroSystem</span>
          </div>
          <nav className="hidden md:flex gap-7 text-sm text-muted-foreground">
            <a href="#funciones" className="hover:text-primary">Funciones</a>
            <a href="#planes" className="hover:text-primary">Planes</a>
            <a href="#contacto" className="hover:text-primary">Contacto</a>
          </nav>
          <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition">
            Entrar al panel <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative">
        <div className="lp-blob lp-blob-a" /><div className="lp-blob lp-blob-b" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="lp-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
              <Star className="w-3.5 h-3.5" /> Software ISP hecho en Bolivia 🇧🇴
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight">
              Administra tu <span className="lp-gradient-text">WISP</span> sin complicaciones
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl">
              Clientes, cobros en bolivianos, cortes automáticos y tus routers MikroTik en un solo panel.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={waLink("Hola, quiero una demo de MikroSystem")} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--wa)] text-white px-6 py-3 font-semibold shadow-lg hover:-translate-y-0.5 transition">
                <MessageCircle className="w-5 h-5" /> Pedir demo por WhatsApp
              </a>
              <a href="#planes" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 font-semibold hover:-translate-y-0.5 transition">
                Ver planes en Bs
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-primary" /> Conexión segura VPN</span>
              <span className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-primary" /> 60000159</span>
            </div>
          </div>

          {/* mock dashboard */}
          <div className="lp-up lp-d2 relative">
            <div className="rounded-2xl border border-border bg-card shadow-2xl p-5 lp-float">
              <div className="flex gap-1.5 mb-4"><span className="w-3 h-3 rounded-full bg-destructive/70" /><span className="w-3 h-3 rounded-full bg-primary/70" /><span className="w-3 h-3 rounded-full bg-[var(--wa)]" /></div>
              <div className="grid grid-cols-3 gap-3">
                {[{i: Users, v: "842", l: "Clientes"}, {i: Activity, v: "796", l: "En línea"}, {i: CreditCard, v: "Bs 48.2k", l: "Este mes"}].map((k, n) => (
                  <div key={n} className="rounded-xl bg-muted p-3">
                    <k.i className="w-4 h-4 text-primary" />
                    <div className="mt-2 text-lg font-bold">{k.v}</div>
                    <div className="text-xs text-muted-foreground">{k.l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 h-32 rounded-xl bg-muted flex items-end gap-1.5 p-3">
                {[40, 65, 50, 80, 60, 90, 75, 95, 70, 85, 100, 88].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-primary lp-bar" style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }} />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <span className="flex items-center gap-2"><Gauge className="w-4 h-4 text-primary" /> Nodo TUNARI</span>
                <span className="flex items-center gap-1.5 text-[var(--wa)] font-semibold"><span className="w-2 h-2 rounded-full bg-[var(--wa)] animate-pulse" /> Online</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="funciones" className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-3xl sm:text-4xl font-black text-center">Todo lo que tu ISP necesita</h2>
        <p className="text-center text-muted-foreground mt-3">Automatiza el trabajo diario y cobra a tiempo.</p>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div key={f.t} className="lp-up group rounded-2xl border border-border bg-card p-6 hover:-translate-y-1 hover:shadow-xl hover:border-primary/40 transition" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition"><f.icon className="w-5 h-5" /></span>
              <h3 className="mt-4 font-bold text-lg">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PLANS */}
      <section id="planes" className="bg-muted/40 border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-3xl sm:text-4xl font-black text-center">Planes en bolivianos</h2>
          <p className="text-center text-muted-foreground mt-3">Pago mensual. Sin contratos largos.</p>
          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {plans.map((p) => (
              <div key={p.n} className={`relative rounded-2xl border bg-card p-7 flex flex-col transition hover:-translate-y-1 hover:shadow-2xl ${p.hot ? "border-primary shadow-xl md:scale-105 lp-glow" : "border-border"}`}>
                {p.hot && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs font-bold px-3 py-1">Más elegido</span>}
                <h3 className="font-bold text-xl">{p.n}</h3>
                <p className="text-sm text-muted-foreground">{p.c}</p>
                <div className="mt-5 flex items-end gap-1"><span className="text-lg font-semibold">Bs</span><span className="text-5xl font-black">{p.p}</span><span className="text-muted-foreground mb-1">/mes</span></div>
                <ul className="mt-6 space-y-2.5 text-sm flex-1">
                  {p.f.map((x) => <li key={x} className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />{x}</li>)}
                </ul>
                <a href={waLink(`Hola, me interesa el plan ${p.n} (Bs ${p.p}/mes) de MikroSystem`)} target="_blank" rel="noreferrer"
                  className={`mt-7 inline-flex justify-center items-center gap-2 rounded-xl px-5 py-3 font-semibold transition ${p.hot ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-border hover:bg-muted"}`}>
                  <MessageCircle className="w-4 h-4" /> Contratar por WhatsApp
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contacto" className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
        <div className="relative overflow-hidden rounded-3xl bg-primary text-primary-foreground p-8 sm:p-12 text-center">
          <div className="lp-blob lp-blob-c" />
          <Ticket className="w-10 h-10 mx-auto opacity-90" />
          <h2 className="mt-4 text-3xl sm:text-4xl font-black">¿Listo para ordenar tu ISP?</h2>
          <p className="mt-3 opacity-90">Escríbenos y te mostramos el sistema funcionando con tus routers.</p>
          <a href={waLink("Hola, quiero información de MikroSystem")} target="_blank" rel="noreferrer"
            className="relative mt-7 inline-flex items-center gap-2 rounded-xl bg-background text-foreground px-7 py-3.5 font-bold shadow-lg hover:-translate-y-0.5 transition">
            <MessageCircle className="w-5 h-5 text-[var(--wa)]" /> WhatsApp 60000159
          </a>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        © 2026 MEGANET · MikroSystem — Bolivia · <a href="tel:+59160000159" className="hover:text-primary">60000159</a>
      </footer>

      {/* floating WhatsApp */}
      <a href={waLink("Hola, quiero información de MikroSystem")} target="_blank" rel="noreferrer" aria-label="WhatsApp"
        className="fixed bottom-5 right-5 z-50 grid place-items-center w-14 h-14 rounded-full bg-[var(--wa)] text-white shadow-2xl lp-pulse">
        <MessageCircle className="w-7 h-7" />
      </a>
    </div>
  );
}
