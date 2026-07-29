import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MyPerms = {
  isAdmin: boolean;
  employee: any | null;
  permissions: Record<string, string[]>;
  routerIds: string[];
};

export function usePermissions() {
  const [authUserId, setAuthUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAuthUserId(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user.id ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const q = useQuery<MyPerms>({
    queryKey: ["my-permissions", authUserId],
    enabled: Boolean(authUserId),
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const uid = authUserId as string;
      let isAdmin = false;
      let emp: any = null;
      try {
        const rolesRes = await supabase.from("user_roles").select("role").eq("user_id", uid);
        isAdmin = (rolesRes.data ?? []).some((r: any) => r.role === "admin");
      } catch {}
      try {
        const empRes = await supabase.from("employees")
          .select("id, full_name, operator_type, permissions, router_ids, status, access_days, access_from, access_to")
          .eq("user_id", uid)
          .maybeSingle();
        emp = empRes.data ?? null;
      } catch {}
      // Fallback: si no hay rol asignado ni empleado registrado, asumir admin
      // (instalación nueva sin seed de user_roles). RLS sigue protegiendo datos.
      if (!isAdmin && !emp) {
        isAdmin = true;
      }
      return {
        isAdmin,
        employee: emp,
        permissions: (emp?.permissions ?? {}) as Record<string, string[]>,
        routerIds: (emp?.router_ids ?? []) as string[],
      };
    },
  });

  const data = q.data ?? { isAdmin: false, employee: null, permissions: {}, routerIds: [] };
  const can = (mod: string, action: string) => {
    if (data.isAdmin) return true;
    const acts = data.permissions[mod];
    return Array.isArray(acts) && acts.includes(action);
  };
  const canView = (mod: string) => can(mod, "view");
  return {
    ...data,
    can,
    canView,
    // Solo bloquea al primer load; ante error o éxito muestra el menú.
    loading: authUserId === undefined || (Boolean(authUserId) && q.isLoading && !q.data && !q.isError),
  };
}

// Módulos disponibles en el sistema (para permisos)
export const MODULES: Array<{ key: string; label: string; actions: Array<{ key: string; label: string }> }> = [
  { key: "inicio", label: "Inicio", actions: [{ key: "view", label: "Ver" }] },
  { key: "clientes", label: "Clientes", actions: [
    { key: "view", label: "Ver" }, { key: "create", label: "Crear" },
    { key: "edit", label: "Editar" }, { key: "delete", label: "Eliminar" },
    { key: "suspend", label: "Suspender" }, { key: "reactivate", label: "Reactivar" },
  ]},
  { key: "servicios", label: "Servicios", actions: [
    { key: "view", label: "Ver" }, { key: "create", label: "Crear" },
    { key: "edit", label: "Editar" }, { key: "delete", label: "Eliminar" },
  ]},
  { key: "leads", label: "CRM Leads", actions: [
    { key: "view", label: "Ver" }, { key: "create", label: "Crear" }, { key: "edit", label: "Editar" }, { key: "delete", label: "Eliminar" },
  ]},
  { key: "cortes", label: "Cortes", actions: [
    { key: "view", label: "Ver" }, { key: "cut", label: "Cortar" }, { key: "reactivate", label: "Reactivar" }, { key: "promise", label: "Promesa de pago" },
  ]},
  { key: "finanzas", label: "Finanzas", actions: [
    { key: "view", label: "Ver" }, { key: "cobrar", label: "Cobrar" },
    { key: "invoice", label: "Facturar" }, { key: "delete", label: "Eliminar pago" },
    { key: "accounting", label: "Contabilidad" },
  ]},
  { key: "tareas", label: "Tareas / Órdenes", actions: [
    { key: "view", label: "Ver" }, { key: "create", label: "Crear" }, { key: "edit", label: "Editar" }, { key: "close", label: "Cerrar" },
  ]},
  { key: "tickets", label: "Tickets soporte", actions: [
    { key: "view", label: "Ver" }, { key: "reply", label: "Responder" }, { key: "close", label: "Cerrar" },
  ]},
  { key: "mensajeria", label: "Mensajería", actions: [
    { key: "view", label: "Ver" }, { key: "send", label: "Enviar" }, { key: "bulk", label: "Envío masivo" },
  ]},
  { key: "red", label: "Gestión de Red", actions: [
    { key: "view", label: "Ver" }, { key: "create", label: "Crear router" }, { key: "edit", label: "Editar" }, { key: "delete", label: "Eliminar" }, { key: "sync", label: "Sincronizar" },
  ]},
  { key: "hotspot", label: "Hotspot / Vouchers", actions: [
    { key: "view", label: "Ver" }, { key: "create", label: "Crear" }, { key: "delete", label: "Eliminar" },
  ]},
  { key: "almacen", label: "Almacén", actions: [
    { key: "view", label: "Ver" }, { key: "create", label: "Crear" }, { key: "edit", label: "Editar" }, { key: "delete", label: "Eliminar" },
  ]},
  { key: "ajustes", label: "Ajustes / Configuración", actions: [
    { key: "view", label: "Ver" }, { key: "edit", label: "Editar" },
    { key: "operators", label: "Gestionar operadores" }, { key: "plans", label: "Planes" }, { key: "portal", label: "Portal de corte" },
  ]},
];
