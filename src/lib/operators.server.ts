export async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Solo administradores pueden gestionar operadores");
}

export function roleForOperatorType(t: string): "admin" | "tecnico" | "cajero" | "vendedor" | "user" {
  switch (t) {
    case "admin": return "admin";
    case "technician": return "tecnico";
    case "cashier": return "cajero";
    case "seller": return "vendedor";
    default: return "user";
  }
}

export async function findAuthUserByEmail(supabaseAdmin: any, email: string) {
  let page = 1;
  const perPage = 100;
  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const found = data?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (!data?.users || data.users.length < perPage) return null;
    page += 1;
  }
  return null;
}