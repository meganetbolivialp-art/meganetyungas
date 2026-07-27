import { createFileRoute, Link } from "@tanstack/react-router";
import { Wifi, ShieldCheck, Zap, Play, Facebook, Youtube, Moon } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MikroSystem — Administra tu red ISP" },
      { name: "description", content: "Software de administración ISP para Mikrotik. Control PPPoE, PCQ, Colas simples, Radius, facturación electrónica, corte y activaciones automáticas." },
      { property: "og:title", content: "MikroSystem — Administra tu red ISP" },
      { property: "og:description", content: "Software de administración ISP para Mikrotik. PPPoE, facturación, cortes automáticos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-[#f4f6fb] text-[#0b1220]" style={{ fontFamily: "Roboto, system-ui, sans-serif" }}>
      {/* TOP UTILITY BAR */}
      <div className="bg-white border-b border-black/5">
        <div className="max-w-7xl mx-auto px-6 h-10 flex items-center justify-between text-[13px] text-[#0b1220]/70">
          <div className="flex items-center gap-3">
            <a href="#" className="hover:text-[#2b5cff]"><Facebook className="w-4 h-4" /></a>
            <a href="#" className="hover:text-[#2b5cff]"><Youtube className="w-4 h-4" /></a>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-[#2b5cff]">Documentación</a>
            <a href="#" className="hover:text-[#2b5cff]">Términos y condiciones</a>
            <a href="#" className="hover:text-[#2b5cff]">Soporte</a>
            <a href="#" className="hover:text-[#2b5cff]">Política de privacidad</a>
          </div>
        </div>
      </div>

      {/* MAIN NAV */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#ff7a2b] via-[#ff5722] to-[#c8391a] grid place-items-center shadow-[0_4px_14px_rgba(255,87,34,0.35)]">
              <span className="text-white text-xl font-black italic">M</span>
            </div>
            <div className="leading-tight">
              <div className="font-black italic tracking-tight text-[22px] text-[#0b1220]">MIKRO<span className="text-[#2b5cff]">SYSTEM</span></div>
              <div className="text-[10px] tracking-[0.15em] text-[#0b1220]/50 -mt-0.5">Software de facturación y gestión ISP</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-[15px] font-medium text-[#0b1220]/80">
            <a href="#features" className="hover:text-[#2b5cff]">Funcionalidades</a>
            <a href="#demo" className="hover:text-[#2b5cff]">Demo</a>
            <a href="#precios" className="hover:text-[#2b5cff]">Precios</a>
            <a href="#contacto" className="hover:text-[#2b5cff]">Contacto</a>
            <a href="#docs" className="hover:text-[#2b5cff]">Documentación</a>
          </nav>

          <div className="flex items-center gap-4">
            <button className="text-[#0b1220]/60 hover:text-[#2b5cff]"><Moon className="w-5 h-5" /></button>
            <Link to="/auth" className="bg-[#2b5cff] hover:bg-[#1e4bd8] text-white px-6 py-2.5 rounded-full text-sm font-semibold transition shadow-[0_6px_16px_rgba(43,92,255,0.35)]">
              Mi cuenta
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 pt-20 pb-14 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#2b5cff]/10 text-[#2b5cff] text-sm font-semibold mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2b5cff]" />
            Software de Administración ISP
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] text-[#0b1220]">
            Administra tu red <span className="text-[#2b5cff]">ISP con MikroSystem</span>
          </h1>

          <p className="mt-8 text-lg md:text-xl text-[#0b1220]/60 max-w-3xl mx-auto leading-relaxed">
            Software de administración ISP para Mikrotik. Control PPPoE, PCQ, Colas simples, Radius,
            facturación electrónica, corte y activaciones automáticas con un simple click.
          </p>

          <div className="mt-12 flex flex-wrap gap-4 justify-center">
            <a href="#precios" className="bg-[#2b5cff] hover:bg-[#1e4bd8] text-white px-9 py-4 rounded-full font-semibold transition shadow-[0_10px_25px_rgba(43,92,255,0.35)]">
              Ver Planes y Precios
            </a>
            <a href="#demo" className="inline-flex items-center gap-2 bg-white border border-black/10 hover:border-[#2b5cff]/40 text-[#0b1220] px-6 py-4 rounded-full font-semibold transition shadow-sm">
              <span className="w-8 h-8 rounded-full bg-[#2b5cff]/10 grid place-items-center">
                <Play className="w-4 h-4 text-[#2b5cff] fill-[#2b5cff]" />
              </span>
              Ver Video
            </a>
          </div>

          {/* mini features row */}
          <div className="mt-14 flex flex-wrap justify-center gap-x-12 gap-y-3 text-[15px] text-[#0b1220]/70">
            <div className="flex items-center gap-2"><Wifi className="w-4 h-4 text-[#2b5cff]" /> Multi-Router</div>
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#2b5cff]" /> Múltiples operadores</div>
            <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-[#2b5cff]" /> Automatizado</div>
          </div>
        </div>

        {/* Product screenshot mock */}
        <div className="max-w-6xl mx-auto px-6 pb-24">
          <div className="relative rounded-2xl overflow-hidden shadow-[0_30px_80px_-20px_rgba(11,18,32,0.35)] border border-black/5 bg-white">
            <div className="h-8 bg-[#1e2a38] flex items-center gap-1.5 px-4">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
            </div>
            <div className="grid grid-cols-12 min-h-[420px]">
              <aside className="col-span-2 bg-[#1e2a38] text-white/80 py-4 px-3 text-[11px] space-y-1.5">
                <div className="px-2 py-1.5 rounded bg-[#ff5722] text-white font-semibold">Inicio</div>
                <div className="px-2 py-1.5">Gestión de Red</div>
                <div className="px-2 py-1.5">Servicios</div>
                <div className="px-2 py-1.5">Clientes</div>
                <div className="px-2 py-1.5">Fichas Hotspot</div>
                <div className="px-2 py-1.5">Tareas</div>
                <div className="px-2 py-1.5">Finanzas</div>
                <div className="px-2 py-1.5">Almacén</div>
                <div className="px-2 py-1.5">Tickets</div>
              </aside>
              <div className="col-span-10 p-5 bg-[#f4f6fb]">
                <div className="text-sm text-[#0b1220]/60 mb-4">Bienvenido <span className="font-semibold text-[#0b1220]">Administrador</span></div>
                <div className="grid grid-cols-4 gap-3 mb-5">
                  {[
                    { c: "#16a394", l: "CLIENTES ONLINE", v: "0" },
                    { c: "#2e9cd6", l: "TRANSACCIONES HOY", v: "$ 1.610" },
                    { c: "#8e5bbf", l: "FACTURAS NO PAGADAS", v: "55" },
                    { c: "#3d4b5c", l: "TICKET SOPORTE", v: "5" },
                  ].map(k => (
                    <div key={k.l} className="rounded-md p-4 text-white" style={{ background: k.c }}>
                      <div className="text-[9px] uppercase tracking-widest opacity-85 font-semibold">{k.l}</div>
                      <div className="text-2xl font-bold mt-1">{k.v}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 bg-white border rounded-md p-4">
                    <div className="text-xs font-semibold mb-3">Tráfico Clientes</div>
                    <svg viewBox="0 0 400 140" className="w-full h-32">
                      {[0,1,2,3].map(i => <line key={i} x1="30" y1={20+i*30} x2="395" y2={20+i*30} stroke="#0b1220" strokeOpacity="0.06" />)}
                      <polyline fill="none" stroke="#2e9cd6" strokeWidth="2" points="40,90 90,85 140,80 190,55 240,88 290,92 350,45" />
                      <polyline fill="none" stroke="#16a394" strokeWidth="2" points="40,120 90,120 140,118 190,115 240,115 290,118 350,120" />
                    </svg>
                  </div>
                  <div className="bg-white border rounded-md p-4 flex flex-col items-center justify-center">
                    <div className="relative w-24 h-24">
                      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                        <circle cx="50" cy="50" r="38" fill="none" stroke="#16a394" strokeWidth="12" />
                        <circle cx="50" cy="50" r="38" fill="none" stroke="#2e9cd6" strokeWidth="12" strokeDasharray="205 240" />
                      </svg>
                      <div className="absolute inset-0 grid place-items-center text-sm font-bold">86%</div>
                    </div>
                    <div className="text-[10px] text-[#0b1220]/60 mt-2 uppercase tracking-wider">Descarga</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white border-t border-black/5">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-[#0b1220]/60">
          <div>© 2026 MikroSystem · Software de gestión ISP</div>
          <div className="flex items-center gap-4">
            <span>v2.0</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Sistema operativo</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
