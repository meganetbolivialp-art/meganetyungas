import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const openCashRegister = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { branchId?: string; openingAmount: number; notes?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("cash_registers").select("id").eq("opened_by", context.userId).eq("status", "open").maybeSingle();
    if (existing) throw new Error("Ya tenés una caja abierta");
    const { data: r, error } = await context.supabase.from("cash_registers").insert({
      branch_id: data.branchId ?? null,
      opened_by: context.userId,
      opening_amount: data.openingAmount,
      notes: data.notes ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    return r;
  });

export const closeCashRegister = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { registerId: string; closingAmount: number; notes?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: reg } = await context.supabase.from("cash_registers").select("*").eq("id", data.registerId).single();
    if (!reg) throw new Error("Caja no encontrada");
    const { data: movs } = await context.supabase.from("cash_movements").select("kind, amount").eq("register_id", data.registerId);
    const income = (movs ?? []).filter(m => m.kind === "income").reduce((a: number, b: any) => a + Number(b.amount), 0);
    const expense = (movs ?? []).filter(m => m.kind === "expense").reduce((a: number, b: any) => a + Number(b.amount), 0);
    const expected = Number(reg.opening_amount) + income - expense;
    const diff = data.closingAmount - expected;
    const { error } = await context.supabase.from("cash_registers").update({
      closed_by: context.userId,
      closed_at: new Date().toISOString(),
      closing_amount: data.closingAmount,
      expected_amount: expected,
      difference: diff,
      status: "closed",
      notes: data.notes ?? reg.notes,
    }).eq("id", data.registerId);
    if (error) throw new Error(error.message);
    return { expected, difference: diff };
  });

export const addCashMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { registerId: string; kind: "income" | "expense"; amount: number; category?: string; description?: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cash_movements").insert({
      register_id: data.registerId,
      kind: data.kind,
      amount: data.amount,
      category: data.category ?? null,
      description: data.description ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
