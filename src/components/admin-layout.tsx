import { RouterAlertsBell } from "@/components/router-alerts-bell";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  Home, Network, Wifi, Users, ClipboardList, DollarSign,
  Package, Settings, MessageSquare, LogOut, Send, ChevronDown,
  ChevronRight, Camera, ChevronsLeft, Menu, X, Star, Ticket,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import sidebarBg from "@/assets/sidebar-bg.jpg";
import { InlineSearch } from "@/components/inline-search";
import { usePermissions } from "@/hooks/use-permissions";

type NavItem = { to?: string; label: string; badge?: number; mod?: string; action?: string; anyOf?: Array<[string, string]> };
type NavGroup = { label: string; icon: any; to?: string; items?: NavItem[]; badge?: number; mod?: string };

const GROUPS: NavGroup[] = [
  { label: "Inicio", icon: Home, to: "/dashboard", mod: "inicio" },
  { label: "Gestión de Red", icon: Network, items: [
    { to: "/dashboard/routers", label: "Routers", mod: "red", action: "view" },
    { to: "/dashboard/network-map", label: "Mapa de red", mod: "red", action: "view" },
  ]},
  { label: "Servicios", icon: Star, items: [
    { to: "/dashboard/services", label: "Servicios activos", mod: "servicios", action: "view" },
    { to: "/dashboard/plans", label: "Servicios de internet", mod: "servicios", action: "view" },
  ]},
  { label: "Clientes", icon: Users, items: [
    { to: "/dashboard/clients", label: "Usuarios", mod: "clientes", action: "view" },
    { to: "/dashboard/leads", label: "CRM Leads", mod: "leads", action: "view" },
    { to: "/dashboard/portal-users", label: "Cuentas Portal", mod: "clientes", action: "view" },
  ]},
  { label: "Fichas Hotspot", icon: Wifi, items: [
    { to: "/dashboard/vouchers", label: "Vouchers", mod: "hotspot", action: "view" },
  ]},
  { label: "Tareas", icon: ClipboardList, items: [
    { to: "/dashboard/work-orders", label: "Órdenes de trabajo", mod: "tareas", action: "view" },
  ]},
  { label: "Finanzas", icon: DollarSign, items: [
    { to: "/dashboard/cortes", label: "Cobros y cortes", anyOf: [["finanzas", "cobrar"], ["cortes", "view"], ["cortes", "promise"]] },
    { to: "/dashboard/finanzas", label: "Panel financiero", mod: "finanzas", action: "view" },
    { to: "/dashboard/invoices", label: "Facturas", mod: "finanzas", action: "invoice" },
    { to: "/dashboard/payments", label: "Pagos recibidos", mod: "finanzas", action: "view" },
    { to: "/dashboard/cash", label: "Caja diaria", mod: "finanzas", action: "view" },
    { to: "/dashboard/accounting", label: "Contabilidad", mod: "finanzas", action: "accounting" },
  ]},
  { label: "Almacén", icon: Package, items: [
    { to: "/dashboard/inventory", label: "Inventario", mod: "almacen", action: "view" },
    { to: "/dashboard/serials", label: "Equipos (seriales)", mod: "almacen", action: "view" },
  ]},
  { label: "Tickets", icon: Ticket, to: "/dashboard/tickets", mod: "tickets" },
  { label: "Mensajería", icon: MessageSquare, items: [
    { to: "/dashboard/messaging", label: "Envío masivo", mod: "mensajeria", action: "bulk" },
    { to: "/dashboard/bulk-router", label: "Cambios por router", mod: "mensajeria", action: "bulk" },
  ]},
  { label: "Ajustes", icon: Settings, items: [
    { to: "/dashboard/settings", label: "Ajustes generales", mod: "ajustes", action: "view" },
    { to: "/dashboard/kpis", label: "KPIs del negocio", mod: "ajustes", action: "view" },
    { to: "/dashboard/audit", label: "Auditoría", mod: "ajustes", action: "view" },
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
  const { isAdmin, can, employee, loading: permsLoading } = usePermissions();
  const queryClient = useQueryClient();

  const visibleGroups = GROUPS.map(g => {
    if (isAdmin) return g;
    if (!g.items) {
      const ok = g.mod ? can(g.mod, "view") : true;
      return ok ? g : null;
    }
    const items = g.items.filter(it => it.anyOf
      ? it.anyOf.some(([mod, action]) => can(mod, action))
      : !it.mod || !it.action || can(it.mod, it.action));
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

  // ¿Hay un modal/formulario abierto? (evita perder datos con pull-to-refresh o auto-logout)
  const isFormOpen = () =>
    typeof document !== "undefined" &&
    !!document.querySelector('[data-modal-open], [data-no-pull-refresh], dialog[open], [role="dialog"]');

  // Auto-logout tras 30 min de inactividad
  useEffect(() => {
    const IDLE_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const doLogout = async () => {
      // No cerrar sesión mientras se está cargando/creando algo en un formulario
      if (isFormOpen()) { reset(); return; }
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
    const events: (keyof WindowEventMap)[] = [
      "mousedown", "keydown", "touchstart", "touchmove", "scroll", "click", "input", "change", "pointerdown", "focusin",
    ];
    events.forEach(e => window.addEventListener(e, reset, { passive: true } as any));
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        try {
          const last = Number(localStorage.getItem("last_activity") || 0);
          if (last && Date.now() - last > IDLE_MS && !isFormOpen()) { doLogout(); return; }
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

  // La actualización de datos se hace con los botones de cada pantalla.
  // No recargamos ni navegamos automáticamente por gestos táctiles.

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

  const sidebarWidth = collapsed ? "md:w-[72px]" : "md:w-[280px]";
  const ROLE_LABELS: Record<string, string> = { admin: "Administrador", operator: "Operador", cashier: "Cajero / Cobrador", technician: "Técnico", seller: "Vendedor" };
  const displayName = (employee?.full_name?.trim() || email.split("@")[0] || "Admin");
  const roleLabel = isAdmin ? "Administrador" : (ROLE_LABELS[employee?.operator_type ?? ""] ?? "Operador");
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

  return (
    <div className="mw-admin-shell min-h-screen flex bg-background text-foreground">
      {/* Backdrop for mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`${sidebarWidth} w-[290px] shrink-0 transition-[width,transform] duration-200 flex flex-col
          fixed md:static inset-y-0 left-0 z-50
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        style={{ background: "var(--sidebar)", color: "var(--sidebar-foreground)" }}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between md:justify-center px-5 md:px-3 border-b border-sidebar-border/50">
          <div className="flex items-center gap-3 font-black text-sidebar-foreground">
            <div className="w-9 h-9 shrink-0 rounded-full border border-sidebar-border bg-sidebar-accent grid place-items-center">
              <span className="text-base">M</span>
            </div>
            {!collapsed && <span className="text-[17px] tracking-[0.16em] text-sidebar-accent-foreground">MEGANET</span>}
          </div>
          <button className="md:hidden text-sidebar-foreground hover:text-sidebar-accent-foreground p-2" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User card with bg */}
        {!collapsed && (
          <div className="relative h-[154px] border-b border-sidebar-border/50 overflow-hidden">
            <img src={sidebarBg} alt="" loading="lazy" width={512} height={512} className="absolute inset-0 w-full h-full object-cover opacity-90 grayscale brightness-150 contrast-125" />
            <div className="absolute inset-0 bg-gradient-to-b from-sidebar/10 to-sidebar/90" />
            <div key={displayName + roleLabel} className="relative h-full flex flex-col items-center justify-center gap-2 px-4 text-center">
              <div className="mw-fade-in w-16 h-16 rounded-full border-4 border-sidebar-foreground/60 bg-sidebar-accent grid place-items-center text-2xl font-semibold text-sidebar-accent-foreground shadow-lg">
                {initials || "A"}
              </div>
              <div className="mw-fade-in text-[17px] font-semibold text-sidebar-accent-foreground leading-tight truncate max-w-full capitalize">{displayName}</div>
              <div className="mw-fade-in mw-delay inline-flex items-center gap-1.5 text-[12px] font-medium text-sidebar-foreground">
                {isAdmin && <span aria-hidden>★</span>}{roleLabel}
              </div>
            </div>
          </div>
        )}

        {/* Menu label */}
        {!collapsed && <div className="px-5 pt-4 pb-2 text-[11px] uppercase tracking-[0.14em] text-sidebar-foreground/55">Menú</div>}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-1 overscroll-contain">
          {permsLoading && visibleGroups.length === 0 && (
            <div className="px-5 py-3 text-[13px] text-sidebar-foreground/60">Cargando menú...</div>
          )}
          {visibleGroups.map(g => {

            const Icon = g.icon;
            const active = groupActive(g);
            const open = !!openGroups[g.label];
            const hasChildren = !!g.items?.length;

            const Row = (
              <div className={`group flex items-center gap-3.5 px-5 py-3 text-[15px] cursor-pointer transition-colors border-l-[3px]
                ${active ? "text-sidebar-accent-foreground bg-sidebar-accent border-sidebar-primary" : "text-sidebar-foreground border-transparent hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"}`}
              >
                <Icon className="w-[19px] h-[19px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
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
                  <ul className="bg-sidebar-accent/65 py-1.5">
                    {g.items!.map(it => {
                      const a = isActive(it.to);
                      const content = (
                        <li className={`flex items-center gap-2.5 pl-[52px] pr-5 py-2.5 text-[13.5px] cursor-pointer transition-colors
                          ${a ? "text-sidebar-accent-foreground font-semibold" : "text-sidebar-foreground/75 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
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

          {/* Mobile-only logout */}
          <div className="md:hidden px-3 mt-4 mb-2">
            <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-3 rounded text-[14px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </button>
          </div>
        </nav>

        {/* Collapse toggle (desktop only) */}
        <button onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? "Expandir menú" : "Contraer menú"} className="hidden md:flex h-11 border-t border-sidebar-border/50 items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent">
          <ChevronsLeft className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>

        {!collapsed && (
          <div className="hidden md:block p-4 border-t border-sidebar-border/50">
            <button aria-label="Cambiar foto de perfil" className="w-11 h-11 rounded-full border border-sidebar-border grid place-items-center text-sidebar-foreground bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <Camera className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* HEADER */}
        <header className="h-16 flex items-center gap-2 px-3 md:px-5 border-b shadow-sm" style={{ background: "var(--header)", color: "var(--header-foreground)", borderColor: "var(--header-border)" }}>
          {/* Mobile hamburger */}
          <button
            className="md:hidden w-9 h-9 grid place-items-center rounded hover:bg-muted text-muted-foreground shrink-0"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0 max-w-xl">
            <InlineSearch />
          </div>


          <div className="ml-auto flex items-center gap-0.5 sm:gap-1 shrink-0 rounded-full border bg-muted/60 p-0.5 sm:px-1">
            <button title="Enviar mensaje" className="hidden sm:grid w-8 h-8 place-items-center rounded-full hover:bg-card text-muted-foreground"><Send className="w-4 h-4" /></button>
            <Link to="/dashboard/cortes" search={{ tab: "cobrar", clientId: undefined }} title="Cobrar" className="w-8 h-8 grid place-items-center rounded-full hover:bg-card text-primary"><DollarSign className="w-4 h-4" /></Link>
            {!permsLoading && (isAdmin || can("red", "view")) && <RouterAlertsBell canPing={isAdmin || can("red", "view")} />}
            <div className="relative ml-1">
              <button onClick={() => setUserMenu(m => !m)} className="flex items-center gap-1.5 h-8 pl-0.5 pr-1 sm:pr-2 rounded-full hover:bg-card">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 grid place-items-center text-white text-xs font-bold shrink-0">
                  {initials.slice(0,1)}
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

        <main className="flex-1 overflow-auto p-2.5 sm:p-3 lg:p-5">
          <div key={path} className="mw-page-enter mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
        
      </div>
    </div>
  );
}
