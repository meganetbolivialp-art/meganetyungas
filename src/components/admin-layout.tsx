import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  Home, Network, Wifi, Users, Ticket as TicketIcon, ClipboardList, DollarSign,
  Package, Settings, MessageSquare, LogOut, Search, Bell, Send, ChevronDown,
  ChevronRight, User, Camera, ChevronsLeft, Menu, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import sidebarBg from "@/assets/sidebar-bg.jpg";
import { CommandPalette } from "@/components/command-palette";
import { usePermissions } from "@/hooks/use-permissions";

type NavItem = { to?: string; label: string; badge?: number; mod?: string; action?: string };
type NavGroup = { label: string; icon: any; to?: string; items?: NavItem[]; badge?: number; mod?: string };

const GROUPS: NavGroup[] = [
  { label: "Inicio", icon: Home, to: "/dashboard", mod: "inicio" },


  { label: "Clientes", icon: Users, mod: "clientes", items: [
    { to: "/dashboard/clients", label: "Usuarios", mod: "clientes", action: "view" },
    { to: "/dashboard/services", label: "Servicios activos", mod: "servicios", action: "view" },
    { to: "/dashboard/leads", label: "CRM Leads", mod: "leads", action: "view" },
    { to: "/dashboard/portal-users", label: "Cuentas Portal", mod: "clientes", action: "view" },
    { to: "/dashboard/network-map", label: "Mapa clientes", mod: "clientes", action: "view" },
  ]},

  { label: "Cortes", icon: TicketIcon, mod: "cortes", items: [
    { to: "/dashboard/cortes", label: "Panel de cortes", mod: "cortes", action: "view" },
    { to: "/dashboard/promises", label: "Promesas de pago", mod: "cortes", action: "promise" },
  ]},

  { label: "Finanzas", icon: DollarSign, mod: "finanzas", items: [
    { to: "/dashboard/finanzas", label: "Panel financiero", mod: "finanzas", action: "view" },
    { to: "/dashboard/cobrar", label: "Cobrar", mod: "finanzas", action: "cobrar" },
    { to: "/dashboard/invoices", label: "Facturas", mod: "finanzas", action: "invoice" },
    { to: "/dashboard/payments", label: "Pagos recibidos", mod: "finanzas", action: "view" },
    { to: "/dashboard/cash", label: "Caja diaria", mod: "finanzas", action: "view" },
    { to: "/dashboard/accounting", label: "Contabilidad", mod: "finanzas", action: "accounting" },
  ]},


  { label: "Tareas", icon: ClipboardList, mod: "tareas", items: [
    { to: "/dashboard/work-orders", label: "Órdenes de trabajo", mod: "tareas", action: "view" },
    { to: "/dashboard/tickets", label: "Tickets", mod: "tickets", action: "view" },
  ]},

  { label: "Mensajería", icon: MessageSquare, mod: "mensajeria", items: [
    { to: "/dashboard/messaging", label: "Envío masivo", mod: "mensajeria", action: "bulk" },
    { to: "/dashboard/bulk-router", label: "Cambios por router", mod: "mensajeria", action: "bulk" },
  ]},

  { label: "Red", icon: Network, mod: "red", items: [
    { to: "/dashboard/routers", label: "Routers", mod: "red", action: "view" },
    { to: "/dashboard/plans", label: "Servicios de internet", mod: "servicios", action: "view" },
    { to: "/dashboard/network-map", label: "Mapa de red", mod: "red", action: "view" },
  ]},

  { label: "Hotspot", icon: Wifi, mod: "hotspot", items: [
    { to: "/dashboard/vouchers", label: "Vouchers", mod: "hotspot", action: "view" },
  ]},

  { label: "Almacén", icon: Package, mod: "almacen", items: [
    { to: "/dashboard/inventory", label: "Inventario", mod: "almacen", action: "view" },
    { to: "/dashboard/serials", label: "Equipos (seriales)", mod: "almacen", action: "view" },
  ]},

  { label: "Reportes", icon: ClipboardList, mod: "ajustes", items: [
    { to: "/dashboard/kpis", label: "KPIs del negocio", mod: "ajustes", action: "view" },
    { to: "/dashboard/audit", label: "Auditoría", mod: "ajustes", action: "view" },
  ]},

  { label: "Configuración", icon: Settings, mod: "ajustes", items: [
    { to: "/dashboard/settings", label: "General", mod: "ajustes", action: "edit" },
    { to: "/dashboard/2fa", label: "Autenticación 2FA", mod: "ajustes", action: "view" },
    
    { to: "/dashboard/system-license", label: "Licencia del sistema", mod: "ajustes", action: "edit" },
    { to: "/dashboard/employees", label: "Operadores", mod: "ajustes", action: "operators" },
  ]},
];



export function AdminLayout({ children }: { children: ReactNode; title?: string; subtitle?: string; breadcrumb?: string[] }) {
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [userMenu, setUserMenu] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const { isAdmin, can, loading: permsLoading } = usePermissions();
  const queryClient = useQueryClient();

  const visibleGroups = GROUPS.map(g => {
    if (isAdmin) return g;
    if (!g.items) {
      const ok = g.mod ? can(g.mod, "view") : true;
      return ok ? g : null;
    }
    const items = g.items.filter(it => !it.mod || !it.action || can(it.mod, it.action));
    if (items.length === 0) return null;
    return { ...g, items };
  }).filter(Boolean) as NavGroup[];


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { nav({ to: "/auth" }); return; }
      setEmail(data.session.user.email ?? "");
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        queryClient.clear();
        nav({ to: "/auth", replace: true });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["my-permissions", session.user.id] });
    });
    return () => sub.subscription.unsubscribe();
  }, [nav, queryClient]);

  // Auto-logout tras 30 min de inactividad
  useEffect(() => {
    const IDLE_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const doLogout = async () => {
      try {
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
      } finally {
        try { localStorage.setItem("logout_reason", "idle_30min"); } catch {}
        nav({ to: "/auth", replace: true });
      }
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(doLogout, IDLE_MS);
      try { localStorage.setItem("last_activity", String(Date.now())); } catch {}
    };
    const events: (keyof WindowEventMap)[] = ["mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach(e => window.addEventListener(e, reset, { passive: true } as any));
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        try {
          const last = Number(localStorage.getItem("last_activity") || 0);
          if (last && Date.now() - last > IDLE_MS) { doLogout(); return; }
        } catch {}
        reset();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, reset as any));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [nav, queryClient]);

  // Pull-to-refresh móvil: tirar hacia abajo desde el tope para recargar
  useEffect(() => {
    if (typeof window === "undefined" || !("ontouchstart" in window)) return;
    let startY = 0;
    let pulling = false;
    let indicator: HTMLDivElement | null = null;
    const ensureIndicator = () => {
      if (indicator) return indicator;
      indicator = document.createElement("div");
      indicator.style.cssText = "position:fixed;top:0;left:50%;transform:translate(-50%,-100%);z-index:9999;background:hsl(var(--primary));color:hsl(var(--primary-foreground));padding:8px 16px;border-radius:0 0 12px 12px;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.15);transition:transform .15s ease;pointer-events:none;";
      indicator.textContent = "↓ Tira para actualizar";
      document.body.appendChild(indicator);
      return indicator;
    };
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0) { pulling = false; return; }
      startY = e.touches[0].clientY;
      pulling = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) return;
      const el = ensureIndicator();
      const shown = Math.min(dy, 120);
      el.style.transform = `translate(-50%, ${shown - 100}%)`;
      el.textContent = dy > 70 ? "↑ Suelta para actualizar" : "↓ Tira para actualizar";
    };
    const onEnd = (e: TouchEvent) => {
      if (!pulling) return;
      pulling = false;
      const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
      if (indicator) indicator.style.transform = "translate(-50%,-100%)";
      if (dy > 70 && window.scrollY === 0) {
        if (indicator) indicator.textContent = "Actualizando...";
        window.location.reload();
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      if (indicator?.parentNode) indicator.parentNode.removeChild(indicator);
    };
  }, []);

  // close mobile drawer & user menu on route change
  useEffect(() => {
    setMobileOpen(false);
    setUserMenu(false);
  }, [path]);

  // lock body scroll when drawer open
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  // auto-open groups matching current path
  useEffect(() => {
    const next: Record<string, boolean> = {};
    GROUPS.forEach(g => {
      if (g.items?.some(i => i.to && (i.to === "/dashboard" ? path === "/dashboard" : path.startsWith(i.to)))) {
        next[g.label] = true;
      }
    });
    setOpenGroups(prev => ({ ...prev, ...next }));
  }, [path]);

  const logout = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  };
  const isActive = (to?: string) => !!to && (to === "/dashboard" ? path === "/dashboard" : path.startsWith(to));
  const groupActive = (g: NavGroup) => (g.to && isActive(g.to)) || g.items?.some(i => isActive(i.to));

  if (checking) {
    return <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">Cargando...</div>;
  }

  const sidebarWidth = collapsed ? "md:w-16" : "md:w-[240px]";
  const displayName = (email.split("@")[0] || "Admin").toUpperCase();

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Backdrop for mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`${sidebarWidth} w-[260px] shrink-0 transition-transform duration-200 flex flex-col
          fixed md:static inset-y-0 left-0 z-50
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        style={{ background: "var(--sidebar)", color: "var(--sidebar-foreground)" }}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-between md:justify-center px-3 md:px-0 border-b border-white/5">
          <div className="flex items-center gap-2 font-black text-white">
            <div className="w-8 h-8 rounded grid place-items-center" style={{ background: "linear-gradient(135deg,#ff4d2e,#c93a1e)" }}>
              <span className="text-[13px]">M</span>
            </div>
            {!collapsed && <span className="text-sm tracking-wide">MEGA<span style={{ color: "#ff4d2e" }}>NET</span></span>}
          </div>
          <button className="md:hidden text-white/70 hover:text-white p-1" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User card with bg */}
        {!collapsed && (
          <div className="relative h-[130px] border-b border-white/5 overflow-hidden">
            <img src={sidebarBg} alt="" loading="lazy" width={512} height={512} className="absolute inset-0 w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/70" />
            <div className="relative h-full flex flex-col items-center justify-center gap-1 px-4 text-center">
              <div className="w-14 h-14 rounded-full bg-white/90 grid place-items-center text-slate-500">
                <User className="w-8 h-8" />
              </div>
              <div className="text-[13px] font-bold text-white leading-tight truncate max-w-full">{displayName}</div>
              <div className="text-[11px] text-white/70">Administrador</div>
            </div>
          </div>
        )}

        {/* Menu label */}
        {!collapsed && <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-white/40">Menú</div>}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-1 overscroll-contain">
          {permsLoading && visibleGroups.length === 0 && (
            <div className="px-4 py-3 text-[11px] text-white/40">Cargando menú...</div>
          )}
          {visibleGroups.map(g => {

            const Icon = g.icon;
            const active = groupActive(g);
            const open = !!openGroups[g.label];
            const hasChildren = !!g.items?.length;

            const Row = (
              <div className={`group flex items-center gap-3 px-4 py-2.5 text-[13px] cursor-pointer transition-colors
                ${active ? "text-white bg-black/25 border-l-2 border-[--sidebar-primary]" : "border-l-2 border-transparent hover:bg-white/5 hover:text-white"}`}
                style={active ? { borderLeftColor: "var(--sidebar-primary)" } : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{g.label}</span>}
                {!collapsed && g.badge !== undefined && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500 text-white font-semibold">{g.badge}</span>
                )}
                {!collapsed && hasChildren && (open ? <ChevronDown className="w-3.5 h-3.5 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 opacity-60" />)}
              </div>
            );

            return (
              <div key={g.label}>
                {hasChildren ? (
                  <button className="w-full text-left" onClick={() => setOpenGroups(s => ({ ...s, [g.label]: !s[g.label] }))}>{Row}</button>
                ) : g.to ? (
                  <Link to={g.to as any}>{Row}</Link>
                ) : Row}

                {!collapsed && hasChildren && open && (
                  <ul className="bg-black/20 py-1">
                    {g.items!.map(it => {
                      const a = isActive(it.to);
                      const content = (
                        <li className={`flex items-center gap-2 pl-10 pr-4 py-1.5 text-[12px] cursor-pointer
                          ${a ? "text-white" : "text-white/60 hover:text-white"}`}>
                          <span className="w-1 h-1 rounded-full bg-current opacity-60 shrink-0" />
                          <span className="truncate">{it.label}</span>
                        </li>
                      );
                      return it.to ? <Link key={it.label} to={it.to as any}>{content}</Link> : <div key={it.label}>{content}</div>;
                    })}
                  </ul>
                )}
              </div>
            );
          })}

          {!collapsed && (
            <div className="px-3 mt-4">
              <div className="rounded-md px-3 py-2 flex items-center gap-2 text-[11px] font-semibold text-white" style={{ background: "linear-gradient(90deg,#f59e0b,#d97706)" }}>
                <Settings className="w-3.5 h-3.5" />
                ACTUALIZACIÓN DISPONIBLE
              </div>
            </div>
          )}

          {/* Mobile-only logout */}
          <div className="md:hidden px-3 mt-4 mb-2">
            <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded text-[13px] text-white/80 hover:bg-white/5 hover:text-white">
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </button>
          </div>
        </nav>

        {/* Collapse toggle (desktop only) */}
        <button onClick={() => setCollapsed(c => !c)} className="hidden md:flex h-10 border-t border-white/5 items-center justify-center text-white/50 hover:text-white hover:bg-white/5">
          <ChevronsLeft className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>

        {!collapsed && (
          <div className="hidden md:block p-3 border-t border-white/5">
            <button className="w-10 h-10 rounded-full grid place-items-center text-white" style={{ background: "var(--primary)" }}>
              <Camera className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* HEADER */}
        <header className="h-14 flex items-center gap-2 px-3 md:px-4 border-b" style={{ background: "var(--header)", color: "var(--header-foreground)", borderColor: "var(--header-border)" }}>
          {/* Mobile hamburger */}
          <button
            className="md:hidden w-9 h-9 grid place-items-center rounded hover:bg-muted text-muted-foreground shrink-0"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0 max-w-xl">
            <button onClick={() => setCmdOpen(true)} className="w-full h-9 rounded-md bg-muted/60 border border-transparent hover:border-primary/40 outline-none pl-9 pr-3 text-sm text-left text-muted-foreground relative truncate">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" />
              <span className="hidden sm:inline">Buscar clientes, PPPoE, IP, secciones...</span>
              <span className="sm:hidden">Buscar...</span>
              <kbd className="hidden md:inline absolute right-2 top-1/2 -translate-y-1/2 text-[10px] border rounded px-1.5 py-0.5 bg-background">Ctrl K</kbd>
            </button>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button title="Enviar mensaje" className="w-9 h-9 grid place-items-center rounded hover:bg-muted text-muted-foreground"><Send className="w-4 h-4" /></button>
            <Link to="/dashboard/cobrar" title="Cobrar" className="w-9 h-9 grid place-items-center rounded hover:bg-muted text-muted-foreground"><DollarSign className="w-4 h-4" /></Link>
            <button className="w-9 h-9 grid place-items-center rounded hover:bg-muted text-muted-foreground relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-400 text-[9px] font-bold text-white grid place-items-center">1</span>
            </button>
            <div className="relative ml-1">
              <button onClick={() => setUserMenu(m => !m)} className="flex items-center gap-2 h-9 px-2 rounded hover:bg-muted">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 grid place-items-center text-white text-xs font-bold shrink-0">
                  {displayName.slice(0,1)}
                </div>
                <span className="hidden sm:inline text-xs font-semibold max-w-[100px] truncate">{displayName}</span>
                <ChevronDown className="hidden sm:inline w-3 h-3 text-muted-foreground" />
              </button>
              {userMenu && (
                <div className="absolute right-0 top-11 w-56 bg-card border shadow-lg rounded-md py-1 z-30">
                  <div className="px-3 py-2 text-xs text-muted-foreground truncate">{email}</div>
                  <button onClick={logout} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 text-destructive">
                    <LogOut className="w-4 h-4" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-3 md:p-5">
          {children}
        </main>
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      </div>
    </div>
  );
}
