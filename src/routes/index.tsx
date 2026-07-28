import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Wifi, ShieldCheck, Zap, Play, Facebook, Youtube, Moon, Sun,
  Router, Users, CreditCard, Activity, Map, Bell, Bot, Cloud,
  BarChart3, Ticket, Boxes, Radio, CheckCircle2, ArrowRight,
  Phone, Mail, MapPin, Star, Sparkles, Globe, Lock, Gauge,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MEGANET · MikroSystem — Software ISP para MikroTik" },
      { name: "description", content: "Plataforma todo-en-uno para ISPs: PPPoE, PCQ, Radius, facturación electrónica, cortes y activaciones automáticas, mapa de red y portal del cliente." },
      { property: "og:title", content: "MEGANET · MikroSystem — Software ISP para MikroTik" },
      { property: "og:description", content: "Multi-router, multi-operador, automatizado. Todo lo que un WISP necesita en una sola plataforma." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [dark, setDark] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const bg = dark ? "bg-[#0a0f1e] text-slate-100" : "bg-[#f4f6fb] text-[#0b1220]";
  const card = dark ? "bg-white/5 border-white/10" : "bg-white border-black/5";
  const muted = dark ? "text-slate-400" : "text-[#0b1220]/60";
  const subtle = dark ? "text-slate-300" : "text-[#0b1220]/80";

  return (
    <div className={`min-h-screen ${bg} transition-colors`} style={{ fontFamily: "Roboto, system-ui, sans-serif" }}>
      {/* TOP UTILITY BAR */}
      <div className={`${dark ? "bg-black/40 border-white/5" : "bg-white border-black/5"} border-b`}>
        <div className="max-w-7xl mx-auto px-6 h-10 flex items-center justify-between text-[13px]">
          <div className={`flex items-center gap-3 ${muted}`}>
            <a href="#" className="hover:text-[#2b5cff]"><Facebook className="w-4 h-4" /></a>
            <a href="#" className="hover:text-[#2b5cff]"><Youtube className="w-4 h-4" /></a>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">Bolivia 🇧🇴 · Español</span>
          </div>
          <div className={`hidden md:flex items-center gap-6 ${muted}`}>
            <a href="#docs" className="hover:text-[#2b5cff]">Documentación</a>
            <a href="#terminos" className="hover:text-[#2b5cff]">Términos</a>
            <a href="#soporte" className="hover:text-[#2b5cff]">Soporte</a>
            <a href="#privacidad" className="hover:text-[#2b5cff]">Privacidad</a>
          </div>
        </div>
      </div>

      {/* MAIN NAV */}
      <header className={`${dark ? "bg-[#0a0f1e]/80" : "bg-white/80"} backdrop-blur sticky top-0 z-30 border-b ${dark ? "border-white/5" : "border-black/5"} ${scrolled ? "shadow-sm" : ""}`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#ff7a2b] via-[#ff5722] to-[#c8391a] grid place-items-center shadow-[0_4px_14px_rgba(255,87,34,0.35)]">
              <span className="text-white text-xl font-black italic">M</span>
            </div>
            <div className="leading-tight">
              <div className={`font-black italic tracking-tight text-[22px] ${dark ? "text-white" : "text-[#0b1220]"}`}>MIKRO<span className="text-[#2b5cff]">SYSTEM</span></div>
              <div className={`text-[10px] tracking-[0.15em] ${muted} -mt-0.5`}>Software de facturación y gestión ISP</div>
            </div>
          </Link>

          <nav className={`hidden lg:flex items-center gap-8 text-[15px] font-medium ${subtle}`}>
            <a href="#features" className="hover:text-[#2b5cff]">Funcionalidades</a>
            <a href="#demo" className="hover:text-[#2b5cff]">Demo</a>
            <a href="#precios" className="hover:text-[#2b5cff]">Precios</a>
            <a href="#opiniones" className="hover:text-[#2b5cff]">Opiniones</a>
            <a href="#contacto" className="hover:text-[#2b5cff]">Contacto</a>
          </nav>

          <div className="flex items-center gap-3">
            <button onClick={() => setDark(!dark)} className={`p-2 rounded-full ${muted} hover:text-[#2b5cff] transition`} aria-label="Cambiar tema">
              {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <Link to="/auth" className="bg-[#2b5cff] hover:bg-[#1e4bd8] text-white px-5 md:px-6 py-2.5 rounded-full text-sm font-semibold transition shadow-[0_6px_16px_rgba(43,92,255,0.35)]">
              Mi cuenta
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* decorative gradient blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-[#2b5cff]/20 blur-3xl" />
          <div className="absolute top-40 -right-24 w-96 h-96 rounded-full bg-[#ff5722]/20 blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 pt-16 md:pt-20 pb-14 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#2b5cff]/10 text-[#2b5cff] text-sm font-semibold mb-8 border border-[#2b5cff]/20">
            <Sparkles className="w-3.5 h-3.5" />
            v2.0 · Multi-router · Multi-operador
          </div>

          <h1 className={`text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] ${dark ? "text-white" : "text-[#0b1220]"}`}>
            Administra tu red <br className="hidden md:block" />
            <span className="bg-gradient-to-r from-[#2b5cff] via-[#4f7cff] to-[#7a9aff] bg-clip-text text-transparent">
              ISP con MikroSystem
            </span>
          </h1>

          <p className={`mt-8 text-base md:text-xl ${muted} max-w-3xl mx-auto leading-relaxed`}>
            Todo-en-uno para MikroTik: PPPoE, PCQ, Colas simples, Radius, facturación electrónica,
            cortes y activaciones automáticas, mapa de red inteligente y portal del cliente — con un clic.
          </p>

          <div className="mt-10 flex flex-wrap gap-4 justify-center">
            <a href="#precios" className="group bg-[#2b5cff] hover:bg-[#1e4bd8] text-white px-8 py-4 rounded-full font-semibold transition shadow-[0_10px_25px_rgba(43,92,255,0.35)] inline-flex items-center gap-2">
              Ver planes y precios
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
            </a>
            <a href="#demo" className={`inline-flex items-center gap-2 ${dark ? "bg-white/5 border-white/10 hover:border-[#2b5cff]/40 text-white" : "bg-white border-black/10 hover:border-[#2b5cff]/40 text-[#0b1220]"} border px-6 py-4 rounded-full font-semibold transition shadow-sm`}>
              <span className="w-8 h-8 rounded-full bg-[#2b5cff]/10 grid place-items-center">
                <Play className="w-4 h-4 text-[#2b5cff] fill-[#2b5cff]" />
              </span>
              Ver video demo
            </a>
          </div>

          {/* Trust bar */}
          <div className={`mt-14 flex flex-wrap justify-center gap-x-10 gap-y-3 text-[14px] md:text-[15px] ${subtle}`}>
            <div className="flex items-center gap-2"><Wifi className="w-4 h-4 text-[#2b5cff]" /> Multi-Router</div>
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#2b5cff]" /> Multi-operador</div>
            <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-[#2b5cff]" /> 100% automatizado</div>
            <div className="flex items-center gap-2"><Cloud className="w-4 h-4 text-[#2b5cff]" /> En la nube</div>
            <div className="flex items-center gap-2"><Lock className="w-4 h-4 text-[#2b5cff]" /> Seguro (RLS)</div>
          </div>
        </div>

        {/* Product screenshot mock */}
        <div className="relative max-w-6xl mx-auto px-6 pb-20">
          <div className={`relative rounded-2xl overflow-hidden shadow-[0_30px_80px_-20px_rgba(11,18,32,0.45)] border ${dark ? "border-white/10" : "border-black/5"}`}>
            <div className="h-9 bg-[#1e2a38] flex items-center gap-1.5 px-4">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              <span className="text-white/40 text-[11px] ml-3">app.mikrosystem.bo/dashboard</span>
            </div>
            <div className="grid grid-cols-12 min-h-[420px] bg-white">
              <aside className="col-span-3 sm:col-span-2 bg-[#1e2a38] text-white/80 py-4 px-3 text-[11px] space-y-1.5">
                <div className="px-2 py-1.5 rounded bg-[#ff5722] text-white font-semibold">Inicio</div>
                <div className="px-2 py-1.5">Gestión de Red</div>
                <div className="px-2 py-1.5">Servicios</div>
                <div className="px-2 py-1.5">Clientes</div>
                <div className="px-2 py-1.5">Fichas Hotspot</div>
                <div className="px-2 py-1.5">Tareas</div>
                <div className="px-2 py-1.5">Finanzas</div>
                <div className="px-2 py-1.5 hidden sm:block">Almacén</div>
                <div className="px-2 py-1.5 hidden sm:block">Tickets</div>
              </aside>
              <div className="col-span-9 sm:col-span-10 p-5 bg-[#f4f6fb]">
                <div className="text-sm text-[#0b1220]/60 mb-4">Bienvenido <span className="font-semibold text-[#0b1220]">Administrador</span></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {[
                    { c: "#16a394", l: "CLIENTES ONLINE", v: "1.284" },
                    { c: "#2e9cd6", l: "TRANSACCIONES HOY", v: "$ 8.410" },
                    { c: "#8e5bbf", l: "FACTURAS NO PAGADAS", v: "55" },
                    { c: "#3d4b5c", l: "TICKETS SOPORTE", v: "5" },
                  ].map(k => (
                    <div key={k.l} className="rounded-md p-4 text-white" style={{ background: k.c }}>
                      <div className="text-[9px] uppercase tracking-widest opacity-85 font-semibold">{k.l}</div>
                      <div className="text-2xl font-bold mt-1">{k.v}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-3 md:col-span-2 bg-white border rounded-md p-4">
                    <div className="text-xs font-semibold mb-3 text-[#0b1220]">Tráfico Clientes · últimas 24h</div>
                    <svg viewBox="0 0 400 140" className="w-full h-32">
                      {[0,1,2,3].map(i => <line key={i} x1="30" y1={20+i*30} x2="395" y2={20+i*30} stroke="#0b1220" strokeOpacity="0.06" />)}
                      <polyline fill="none" stroke="#2e9cd6" strokeWidth="2.5" points="40,90 90,85 140,60 190,55 240,88 290,42 350,45" />
                      <polyline fill="none" stroke="#16a394" strokeWidth="2.5" points="40,120 90,118 140,110 190,105 240,110 290,108 350,112" />
                    </svg>
                  </div>
                  <div className="col-span-3 md:col-span-1 bg-white border rounded-md p-4 flex flex-col items-center justify-center">
                    <div className="relative w-24 h-24">
                      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                        <circle cx="50" cy="50" r="38" fill="none" stroke="#e5e7eb" strokeWidth="12" />
                        <circle cx="50" cy="50" r="38" fill="none" stroke="#2e9cd6" strokeWidth="12" strokeDasharray="205 240" strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 grid place-items-center text-sm font-bold text-[#0b1220]">86%</div>
                    </div>
                    <div className="text-[10px] text-[#0b1220]/60 mt-2 uppercase tracking-wider">Uso banda</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className={`${dark ? "bg-white/5" : "bg-white"} border-y ${dark ? "border-white/10" : "border-black/5"}`}>
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { v: "50+", l: "ISPs activos" },
            { v: "120K+", l: "Clientes gestionados" },
            { v: "99.9%", l: "Uptime plataforma" },
            { v: "24/7", l: "Soporte técnico" },
          ].map(s => (
            <div key={s.l}>
              <div className={`text-3xl md:text-4xl font-black ${dark ? "text-white" : "text-[#0b1220]"}`}>{s.v}</div>
              <div className={`text-xs md:text-sm ${muted} mt-1 uppercase tracking-wider`}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#2b5cff]/10 text-[#2b5cff] text-xs font-semibold mb-4">FUNCIONALIDADES</div>
          <h2 className={`text-3xl md:text-5xl font-black tracking-tight ${dark ? "text-white" : "text-[#0b1220]"}`}>Todo lo que un WISP necesita</h2>
          <p className={`mt-4 ${muted} max-w-2xl mx-auto`}>Diseñado para MikroTik desde cero. Conecta tus routers vía VPN y toma el control en minutos.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { i: Router, c: "#2b5cff", t: "Multi-Router MikroTik", d: "Conecta N routers por VPN. API real, cola de comandos offline, circuit breaker y reintentos." },
            { i: Users, c: "#16a394", t: "Clientes 360°", d: "Ficha completa, historial, geolocalización, WhatsApp, estado en vivo desde PPPoE." },
            { i: CreditCard, c: "#8e5bbf", t: "Facturación electrónica", d: "Emite facturas, cobra por MercadoPago/Stripe, promesas de pago y conciliación automática." },
            { i: Activity, c: "#ff5722", t: "Cortes y reconexión", d: "Suspende morosos y reactiva al instante. Avisos previos y políticas por tramos." },
            { i: Map, c: "#0ea5e9", t: "Mapa de red inteligente", d: "Torres, NAP, postes, OLTs, tramos de fibra y zonas con semáforo de salud." },
            { i: Radio, c: "#f59e0b", t: "PPPoE · PCQ · Radius", d: "Perfiles, colas simples, PCQ, Radius. Sincroniza en un clic sin tocar WinBox." },
            { i: Ticket, c: "#ec4899", t: "Tickets y tareas", d: "Órdenes de trabajo, técnicos, seguimiento y SLA. Todo desde el móvil." },
            { i: Boxes, c: "#10b981", t: "Almacén y series", d: "Control de ONUs, routers, seriales y garantías por cliente." },
            { i: Bot, c: "#6366f1", t: "IA y automatización", d: "Detección de anomalías, sugerencias de plan, avisos WhatsApp con IA." },
          ].map(f => (
            <div key={f.t} className={`group ${card} border rounded-2xl p-6 hover:shadow-xl hover:-translate-y-0.5 transition`}>
              <div className="w-11 h-11 rounded-xl grid place-items-center mb-4 shadow-lg" style={{ background: `linear-gradient(135deg, ${f.c}, ${f.c}cc)`, boxShadow: `0 8px 20px ${f.c}40` }}>
                <f.i className="w-5 h-5 text-white" />
              </div>
              <div className={`font-bold text-lg mb-1 ${dark ? "text-white" : "text-[#0b1220]"}`}>{f.t}</div>
              <div className={`text-sm ${muted} leading-relaxed`}>{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* DEMO / SPLIT */}
      <section id="demo" className={`${dark ? "bg-white/5" : "bg-white"} border-y ${dark ? "border-white/10" : "border-black/5"}`}>
        <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ff5722]/10 text-[#ff5722] text-xs font-semibold mb-4">DEMO EN VIVO</div>
            <h2 className={`text-3xl md:text-4xl font-black tracking-tight ${dark ? "text-white" : "text-[#0b1220]"}`}>Ve MikroSystem en acción</h2>
            <p className={`mt-4 ${muted} leading-relaxed`}>Prueba el panel con datos reales. Conéctate a tus MikroTiks por VPN y empieza a facturar hoy mismo.</p>
            <ul className="mt-6 space-y-3">
              {[
                "Onboarding guiado: importa clientes y planes en 1 clic",
                "Sin instalación local — 100% web y móvil",
                "Soporte técnico en español, WhatsApp directo",
                "Migración desde MikroWisp/otros sistemas incluida",
              ].map(x => (
                <li key={x} className={`flex items-start gap-3 ${subtle}`}>
                  <CheckCircle2 className="w-5 h-5 text-[#16a394] shrink-0 mt-0.5" />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth" className="bg-[#2b5cff] hover:bg-[#1e4bd8] text-white px-6 py-3 rounded-full font-semibold shadow-[0_6px_16px_rgba(43,92,255,0.35)] inline-flex items-center gap-2">
                Empezar gratis <ArrowRight className="w-4 h-4" />
              </Link>
              <a href="#contacto" className={`${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-black/10 text-[#0b1220]"} border px-6 py-3 rounded-full font-semibold`}>Hablar con ventas</a>
            </div>
          </div>
          <div className={`relative rounded-2xl overflow-hidden shadow-2xl border ${dark ? "border-white/10" : "border-black/5"}`}>
            <div className="aspect-video bg-gradient-to-br from-[#1e2a38] via-[#0b1220] to-[#1e2a38] grid place-items-center">
              <button className="w-20 h-20 rounded-full bg-white/95 grid place-items-center shadow-2xl hover:scale-110 transition">
                <Play className="w-8 h-8 text-[#2b5cff] fill-[#2b5cff] ml-1" />
              </button>
              <div className="absolute bottom-4 left-4 text-white/80 text-xs">▶ Demo · 2:34 min</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="precios" className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#16a394]/10 text-[#16a394] text-xs font-semibold mb-4">PRECIOS</div>
          <h2 className={`text-3xl md:text-5xl font-black tracking-tight ${dark ? "text-white" : "text-[#0b1220]"}`}>Planes simples, sin sorpresas</h2>
          <p className={`mt-4 ${muted}`}>Facturación mensual en bolivianos. Cancela cuando quieras.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { n: "Starter", p: "199", c: "Bs/mes", d: "Hasta 100 clientes · 1 router", feats: ["PPPoE + PCQ", "Facturación básica", "Portal del cliente", "Soporte por email"], hi: false },
            { n: "Pro", p: "499", c: "Bs/mes", d: "Hasta 1.000 clientes · 5 routers", feats: ["Todo del Starter", "Multi-router VPN", "Cortes automáticos", "Mapa de red", "WhatsApp API", "Soporte 24/7"], hi: true },
            { n: "Enterprise", p: "A medida", c: "", d: "Clientes ilimitados · N routers", feats: ["Todo del Pro", "White-label", "IA + automatización", "SLA dedicado", "Migración incluida", "Onboarding personal"], hi: false },
          ].map(pl => (
            <div key={pl.n} className={`relative rounded-2xl border p-7 flex flex-col ${pl.hi ? "bg-gradient-to-br from-[#2b5cff] to-[#1e4bd8] border-[#2b5cff] text-white shadow-2xl md:-translate-y-3" : `${card}`}`}>
              {pl.hi && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#ff5722] text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-widest">MÁS POPULAR</div>}
              <div className={`text-lg font-bold ${pl.hi ? "text-white" : dark ? "text-white" : "text-[#0b1220]"}`}>{pl.n}</div>
              <div className={`text-sm mt-1 ${pl.hi ? "text-white/80" : muted}`}>{pl.d}</div>
              <div className="mt-5 flex items-end gap-1">
                <div className={`text-4xl font-black ${pl.hi ? "text-white" : dark ? "text-white" : "text-[#0b1220]"}`}>{pl.p === "A medida" ? "A medida" : `Bs ${pl.p}`}</div>
                {pl.c && <div className={`text-sm mb-1 ${pl.hi ? "text-white/70" : muted}`}>/{pl.c.replace("Bs/", "")}</div>}
              </div>
              <ul className="mt-6 space-y-2.5 flex-1">
                {pl.feats.map(f => (
                  <li key={f} className={`flex items-start gap-2 text-sm ${pl.hi ? "text-white/90" : subtle}`}>
                    <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${pl.hi ? "text-white" : "text-[#16a394]"}`} /> {f}
                  </li>
                ))}
              </ul>
              <Link to="/auth" className={`mt-7 text-center py-3 rounded-full font-semibold transition ${pl.hi ? "bg-white text-[#2b5cff] hover:bg-slate-100" : "bg-[#2b5cff] text-white hover:bg-[#1e4bd8]"}`}>
                {pl.p === "A medida" ? "Contactar" : "Empezar ahora"}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="opiniones" className={`${dark ? "bg-white/5" : "bg-white"} border-y ${dark ? "border-white/10" : "border-black/5"}`}>
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f59e0b]/10 text-[#f59e0b] text-xs font-semibold mb-4">OPINIONES</div>
            <h2 className={`text-3xl md:text-5xl font-black tracking-tight ${dark ? "text-white" : "text-[#0b1220]"}`}>ISPs que ya confían en nosotros</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { n: "Luis M.", r: "Meganet Yungas", t: "Migramos de MikroWisp en un fin de semana. El corte automático y el mapa por zonas nos ahorra horas todos los días." },
              { n: "Carla R.", r: "TarijaNet", t: "El portal del cliente y los cobros por MercadoPago redujeron nuestros morosos un 40%. Increíble." },
              { n: "José P.", r: "SantaCruz Fibra", t: "Con multi-router por VPN podemos administrar 4 zonas desde una sola cuenta. Soporte técnico impecable." },
            ].map(t => (
              <div key={t.n} className={`${card} border rounded-2xl p-6`}>
                <div className="flex gap-1 mb-3">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-[#f59e0b] text-[#f59e0b]" />)}
                </div>
                <p className={`${subtle} leading-relaxed`}>"{t.t}"</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2b5cff] to-[#ff5722] grid place-items-center text-white font-bold">{t.n[0]}</div>
                  <div>
                    <div className={`font-semibold text-sm ${dark ? "text-white" : "text-[#0b1220]"}`}>{t.n}</div>
                    <div className={`text-xs ${muted}`}>{t.r}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#2b5cff] via-[#1e4bd8] to-[#0b1220]" />
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #ff5722 0%, transparent 40%), radial-gradient(circle at 80% 80%, #16a394 0%, transparent 40%)" }} />
        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center text-white">
          <Gauge className="w-12 h-12 mx-auto mb-6 opacity-90" />
          <h2 className="text-3xl md:text-5xl font-black tracking-tight">¿Listo para automatizar tu ISP?</h2>
          <p className="mt-4 text-white/80 max-w-2xl mx-auto text-lg">Empieza gratis por 14 días. Sin tarjeta de crédito. Migración desde MikroWisp incluida.</p>
          <div className="mt-8 flex flex-wrap gap-4 justify-center">
            <Link to="/auth" className="bg-white text-[#2b5cff] px-8 py-4 rounded-full font-bold hover:bg-slate-100 transition shadow-2xl inline-flex items-center gap-2">
              Empezar ahora <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#contacto" className="bg-white/10 border border-white/20 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/20 transition backdrop-blur">
              Hablar con un experto
            </a>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contacto" className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#2b5cff]/10 text-[#2b5cff] text-xs font-semibold mb-4">CONTACTO</div>
            <h2 className={`text-3xl md:text-4xl font-black tracking-tight ${dark ? "text-white" : "text-[#0b1220]"}`}>Hablemos de tu ISP</h2>
            <p className={`mt-4 ${muted}`}>Respondemos en menos de 24 horas. Estamos en Bolivia, hablamos tu idioma.</p>
            <div className="mt-8 space-y-4">
              <div className={`flex items-center gap-3 ${subtle}`}>
                <div className="w-10 h-10 rounded-full bg-[#2b5cff]/10 grid place-items-center"><Phone className="w-4 h-4 text-[#2b5cff]" /></div>
                <div>
                  <div className={`text-xs ${muted}`}>WhatsApp</div>
                  <div className="font-semibold">+591 60000159</div>
                </div>
              </div>
              <div className={`flex items-center gap-3 ${subtle}`}>
                <div className="w-10 h-10 rounded-full bg-[#2b5cff]/10 grid place-items-center"><Mail className="w-4 h-4 text-[#2b5cff]" /></div>
                <div>
                  <div className={`text-xs ${muted}`}>Email</div>
                  <div className="font-semibold">soporte@mikrosystem.bo</div>
                </div>
              </div>
              <div className={`flex items-center gap-3 ${subtle}`}>
                <div className="w-10 h-10 rounded-full bg-[#2b5cff]/10 grid place-items-center"><MapPin className="w-4 h-4 text-[#2b5cff]" /></div>
                <div>
                  <div className={`text-xs ${muted}`}>Ubicación</div>
                  <div className="font-semibold">La Paz · Bolivia</div>
                </div>
              </div>
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); alert("¡Gracias! Te contactamos pronto."); }} className={`${card} border rounded-2xl p-7 space-y-4 shadow-sm`}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-xs font-semibold ${muted}`}>Nombre</label>
                <input required className={`mt-1 w-full px-4 py-2.5 rounded-lg border ${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-black/10"} focus:outline-none focus:border-[#2b5cff]`} />
              </div>
              <div>
                <label className={`text-xs font-semibold ${muted}`}>Empresa / ISP</label>
                <input className={`mt-1 w-full px-4 py-2.5 rounded-lg border ${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-black/10"} focus:outline-none focus:border-[#2b5cff]`} />
              </div>
            </div>
            <div>
              <label className={`text-xs font-semibold ${muted}`}>Email</label>
              <input type="email" required className={`mt-1 w-full px-4 py-2.5 rounded-lg border ${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-black/10"} focus:outline-none focus:border-[#2b5cff]`} />
            </div>
            <div>
              <label className={`text-xs font-semibold ${muted}`}>WhatsApp</label>
              <input className={`mt-1 w-full px-4 py-2.5 rounded-lg border ${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-black/10"} focus:outline-none focus:border-[#2b5cff]`} placeholder="+591 ..." />
            </div>
            <div>
              <label className={`text-xs font-semibold ${muted}`}>Mensaje</label>
              <textarea rows={4} className={`mt-1 w-full px-4 py-2.5 rounded-lg border ${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-black/10"} focus:outline-none focus:border-[#2b5cff]`} placeholder="Cuéntanos cuántos clientes y routers tienes..." />
            </div>
            <button type="submit" className="w-full bg-[#2b5cff] hover:bg-[#1e4bd8] text-white py-3 rounded-full font-semibold transition shadow-[0_6px_16px_rgba(43,92,255,0.35)] inline-flex items-center justify-center gap-2">
              Enviar mensaje <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </section>

      {/* FOOTER */}
      <footer className={`${dark ? "bg-[#050813] border-white/5" : "bg-[#0b1220] border-black/5"} border-t text-slate-300`}>
        <div className="max-w-7xl mx-auto px-6 py-14 grid md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ff7a2b] to-[#c8391a] grid place-items-center">
                <span className="text-white text-lg font-black italic">M</span>
              </div>
              <div className="font-black italic text-white text-lg">MIKRO<span className="text-[#4f7cff]">SYSTEM</span></div>
            </div>
            <p className="text-sm text-slate-400 mt-4 leading-relaxed">Software ISP para MikroTik. Multi-router, multi-operador, 100% en la nube.</p>
            <div className="flex gap-3 mt-5">
              <a href="#" className="w-9 h-9 rounded-full bg-white/5 grid place-items-center hover:bg-[#2b5cff] transition"><Facebook className="w-4 h-4" /></a>
              <a href="#" className="w-9 h-9 rounded-full bg-white/5 grid place-items-center hover:bg-[#2b5cff] transition"><Youtube className="w-4 h-4" /></a>
              <a href="#" className="w-9 h-9 rounded-full bg-white/5 grid place-items-center hover:bg-[#2b5cff] transition"><Globe className="w-4 h-4" /></a>
            </div>
          </div>
          <div>
            <div className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Producto</div>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li><a href="#features" className="hover:text-white">Funcionalidades</a></li>
              <li><a href="#precios" className="hover:text-white">Precios</a></li>
              <li><a href="#demo" className="hover:text-white">Demo</a></li>
              <li><Link to="/auth" className="hover:text-white">Iniciar sesión</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Recursos</div>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li><a href="#docs" className="hover:text-white">Documentación</a></li>
              <li><a href="#" className="hover:text-white">Blog</a></li>
              <li><a href="#" className="hover:text-white">Tutoriales</a></li>
              <li><a href="#soporte" className="hover:text-white">Soporte 24/7</a></li>
            </ul>
          </div>
          <div>
            <div className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">Contacto</div>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> +591 60000159</li>
              <li className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> soporte@mikrosystem.bo</li>
              <li className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> La Paz, Bolivia</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5">
          <div className="max-w-7xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
            <div>© 2026 MikroSystem · Software de gestión ISP</div>
            <div className="flex items-center gap-4">
              <span>v2.0</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Sistema operativo</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
