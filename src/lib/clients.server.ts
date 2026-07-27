type PermissionContext = {
  supabase: any;
  userId: string;
};

type ClientAccess = {
  isAdmin: boolean;
  routerIds: string[];
};

const hasPermission = (permissions: Record<string, string[]> | null | undefined, mod: string, action: string) => {
  const actions = permissions?.[mod];
  return Array.isArray(actions) && actions.includes(action);
};

async function getClientAccess(context: PermissionContext): Promise<ClientAccess> {
  const [{ data: roles, error: rolesError }, { data: employee, error: employeeError }] = await Promise.all([
    context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    context.supabase
      .from("employees")
      .select("permissions, router_ids, status")
      .eq("user_id", context.userId)
      .maybeSingle(),
  ]);

  if (rolesError) throw new Error(rolesError.message);
  if (employeeError) throw new Error(employeeError.message);

  const isAdmin = (roles ?? []).some((row: any) => row.role === "admin");
  if (isAdmin) return { isAdmin: true, routerIds: [] };

  if (!employee || employee.status !== "active") {
    throw new Error("Tu operador no está habilitado.");
  }

  if (!hasPermission(employee.permissions as Record<string, string[]>, "clientes", "view")) {
    throw new Error("No tenés permiso para ver clientes.");
  }

  return {
    isAdmin: false,
    routerIds: Array.isArray(employee.router_ids) ? employee.router_ids : [],
  };
}

export async function listClientManagementData(context: PermissionContext) {
  const access = await getClientAccess(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: plans, error: plansError }, routersResult] = await Promise.all([
    supabaseAdmin
      .from("plans")
      .select("id,name,price,download_mbps,upload_mbps")
      .order("price"),
    (() => {
      let query = supabaseAdmin
        .from("routers")
        .select("id,name,ip_address")
        .order("name");
      if (!access.isAdmin && access.routerIds.length > 0) query = query.in("id", access.routerIds);
      return query;
    })(),
  ]);

  if (plansError) throw new Error(plansError.message);
  if (routersResult.error) throw new Error(routersResult.error.message);

  let servicesQuery = supabaseAdmin
    .from("services")
    .select("id,client_id,ip_address,pppoe_user,status,router_id,plan_id");
  if (!access.isAdmin && access.routerIds.length > 0) servicesQuery = servicesQuery.in("router_id", access.routerIds);

  const { data: services, error: servicesError } = await servicesQuery;
  if (servicesError) throw new Error(servicesError.message);

  const serviceRows = (services ?? []) as any[];
  const allowedClientIds = Array.from(new Set(serviceRows.map((service) => service.client_id).filter(Boolean)));

  let clients: any[] = [];
  if (access.isAdmin || access.routerIds.length === 0 || allowedClientIds.length > 0) {
    let clientsQuery = supabaseAdmin
      .from("clients")
      .select("id,full_name,document,email,phone,city,status,created_at,balance,billing_day,payment_promise_until,dont_cut")
      .order("created_at", { ascending: false });

    if (!access.isAdmin && access.routerIds.length > 0) clientsQuery = clientsQuery.in("id", allowedClientIds);

    const { data: clientRows, error: clientsError } = await clientsQuery;
    if (clientsError) throw new Error(clientsError.message);
    clients = (clientRows ?? []) as any[];
  }

  const planById = new Map((plans ?? []).map((plan: any) => [plan.id, plan]));
  const servicesByClient = new Map<string, any[]>();
  serviceRows.forEach((service) => {
    const current = servicesByClient.get(service.client_id) ?? [];
    const plan = planById.get(service.plan_id);
    current.push({
      id: service.id,
      ip_address: service.ip_address,
      pppoe_user: service.pppoe_user,
      status: service.status,
      router_id: service.router_id,
      plan_id: service.plan_id,
      plans: plan ? { name: plan.name } : null,
    });
    servicesByClient.set(service.client_id, current);
  });

  return {
    clients: clients.map((client) => ({
      ...client,
      services: servicesByClient.get(client.id) ?? [],
    })),
    plans: plans ?? [],
    routers: routersResult.data ?? [],
  };
}