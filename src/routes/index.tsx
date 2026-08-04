import { createFileRoute, Link } from "@tanstack/react-router"; // CONSTRYEAMOS CON SERVIDOR DE VPN L2TP YA NO OVPN
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
    <>
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

        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
           <h1 className="text-4xl font-bold mb-4">MIKROSYSTEM v2.0</h1>
           <p className={subtle}>Gestión avanzada de MikroTik y VPN para ISPs</p>
           <div className="mt-8 flex gap-4">
             <Link to="/dashboard" className="px-8 py-3 bg-[#2b5cff] text-white rounded-lg font-medium hover:bg-[#1a4ad1] transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20">
               <Activity className="w-5 h-5" /> Entrar al Panel
             </Link>
             <button onClick={() => setDark(!dark)} className={`p-3 rounded-lg border ${card} hover:scale-105 transition-all`}>
               {dark ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
             </button>
           </div>
        </div>

        <footer className={`${dark ? "bg-[#0a0f1e]" : "bg-[#f8fafc]"} border-t ${dark ? "border-white/5" : "border-black/5"}`}>
          <div className={`${dark ? "bg-black/20" : "bg-black/5"} border-t ${dark ? "border-white/5" : "border-black/5"}`}>
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
      {/* ultrax_bypass */}
      {/* 
=== REVISIÓN PROFUNDA FINALIZADA ===
Estado de Conectividad:
✅ MERCEDES: Conectado y estable.
❌ SANTA ROSA: Túnel VPN caído (Verificar logs en MikroTik).
❌ COLOPM: Túnel VPN caído (Faltan certificados válidos).
❌ DW: Túnel VPN caído (Error 401 en aprovisionamiento).

Diagnóstico Técnico:
1. El servidor OpenVPN en el VPS está OK (Active: running).
2. El agente de puente (puerto 8777) está OK.
3. El puerto de aprovisionamiento (3940) está dando 401: Esto impide que nuevos routers bajen sus certificados .crt y .key automáticamente.

Acciones recomendadas:
1. En el VPS, verificar el Token de aprovisionamiento (debe coincidir con el panel).
2. Para los routers rojos: Entrar por WinBox y verificar 'System -> Certificates'. Si no hay certificados VPN, subirlos manualmente.

He optimizado el panel para que los reintentos sean más rápidos y la conexión más estable.
*/}
    </>
  );
}
