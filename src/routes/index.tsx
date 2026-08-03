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

        {/* ... keep existing landing page content ... */}

        <footer className={`${dark ? "bg-[#0a0f1e]" : "bg-[#f8fafc]"} border-t ${dark ? "border-white/5" : "border-black/5"}`}>
          {/* ... footer content ... */}
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
      {/* esta descoenctado sigue lo router puedes revisar los vpn coencion todo eso */}
    </>
  );
}
