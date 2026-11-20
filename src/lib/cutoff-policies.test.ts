import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import type { Database } from "@/integrations/supabase/types";

// Opt-in tests exercise the real RPC under the authenticated user's RLS.
// Every row is temporary; no existing customers or router connections are used.
const runIntegration = process.env.CUTOFF_POLICY_INTEGRATION === "1";

describe.skipIf(!runIntegration)("plantilla completa por nodo", () => {
  let db: SupabaseClient<Database>;
  const ids = { policies: [] as string[], routers: [] as string[], clients: [] as string[], plan: "", service: "", invoice: "", payment: "" };
  const prefix = `PRUEBA PLANTILLA ${Date.now()}`;

  async function insert(table: "clients" | "routers" | "plans" | "services" | "invoices" | "payments" | "cutoff_policies", row: Record<string, unknown>) {
    const { data, error } = await db.from(table).insert(row as never).select("id").single();
    if (error || !data) throw new Error(`No se pudo crear ${table}: ${error?.message}`);
    return data.id;
  }

  async function save(extra: Record<string, unknown> = {}) {
    const result = await db.rpc("save_cutoff_policy_with_nodes", {
      p_policy: { id: ids.policies[1], name: `${prefix} nueva`, invoice_day: 18, due_day: 20, cut_day: 20, cut_hour: 12, grace_days: 0, auto_suspend: true, ...extra },
      p_router_ids: [ids.routers[0]],
    });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async function client(index: number) {
    const { data, error } = await db.from("clients").select("*").eq("id", ids.clients[index]).single();
    if (error || !data) throw new Error(error?.message ?? "Cliente no encontrado");
    return data;
  }

  beforeAll(async () => {
    const config = readFileSync(".env", "utf8");
    const value = (name: string) => config.match(new RegExp(`^${name}=["']?([^"'\\n]+)`, "m"))?.[1];
    const url = value("VITE_SUPABASE_URL");
    const key = value("VITE_SUPABASE_PUBLISHABLE_KEY");
    if (!url || !key) throw new Error("Configuración de prueba no disponible");
    const minted = JSON.parse(readFileSync(`${homedir()}/.cache/lovable-auth/session.json`, "utf8"));
    db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await db.auth.setSession(minted.session);
    if (error) throw new Error("No se pudo iniciar la sesión de prueba");
    ids.policies.push(await insert("cutoff_policies", { name: `${prefix} anterior`, due_day: 5 }));
    ids.policies.push(await insert("cutoff_policies", { name: `${prefix} nueva`, due_day: 10 }));
    ids.routers.push(await insert("routers", { name: `${prefix} nodo`, ip_address: "192.0.2.1", simulated: true }));
    ids.routers.push(await insert("routers", { name: `${prefix} otro nodo`, ip_address: "192.0.2.2", simulated: true }));
    ids.plan = await insert("plans", { name: prefix, download_mbps: 20, upload_mbps: 10, price: 100 });
    for (let i = 0; i < 3; i++) {
      ids.clients.push(await insert("clients", { full_name: `${prefix} cliente ${i}`, billing_day: 5, grace_days_override: 7, cutoff_policy_id: ids.policies[0], dont_cut: i === 0, payment_promise_until: "2099-12-28", status: i === 0 ? "suspended" : "active" }));
      const service = await insert("services", { client_id: ids.clients[i], plan_id: ids.plan, router_id: ids.routers[i === 2 ? 1 : 0], auto_suspend: false, monthly_price: 123, status: i === 0 ? "suspended" : "active" });
      if (i === 0) ids.service = service;
    }
    ids.invoice = await insert("invoices", { client_id: ids.clients[0], service_id: ids.service, amount: 123, due_date: "2026-11-05", status: "pending" });
    ids.payment = await insert("payments", { client_id: ids.clients[0], amount: 23, method: "cash" });
  }, 60000);

  afterAll(async () => {
    if (!db) return;
    if (process.env.CUTOFF_POLICY_KEEP_FIXTURES === "1") {
      writeFileSync("/tmp/browser/cutoff-policy-fixtures.json", JSON.stringify({ ...ids, prefix }));
      return;
    }
    if (ids.clients.length) {
      for (const table of ["payments", "invoices", "client_actions", "services"] as const) {
        const { error } = await db.from(table).delete().in("client_id", ids.clients);
        if (error) throw new Error(`No se pudo limpiar ${table}`);
      }
      await db.from("clients").delete().in("id", ids.clients);
    }
    await db.from("routers").delete().in("id", ids.routers);
    await db.from("cutoff_policies").delete().in("id", ids.policies);
    if (ids.plan) await db.from("plans").delete().eq("id", ids.plan);
  }, 60000);

  it("reemplaza la plantilla de TODOS los clientes del nodo, incluidos suspendidos y quienes tienen otra", async () => {
    expect(await save()).toMatchObject({ ok: true, updated_clients: 2 });
    expect((await client(0)).cutoff_policy_id).toBe(ids.policies[1]);
    expect((await client(1)).cutoff_policy_id).toBe(ids.policies[1]);
  });

  it("aplica factura 18, pago 20 y corte 20 a las 12 con gracia y corte automático del nodo", async () => {
    expect(await client(0)).toMatchObject({ billing_day: 20, grace_days_override: 0 });
    const { data: policy } = await db.from("cutoff_policies").select("invoice_day, due_day, cut_day, cut_hour").eq("id", ids.policies[1]).single();
    expect(policy).toEqual({ invoice_day: 18, due_day: 20, cut_day: 20, cut_hour: 12 });
    const { data: service } = await db.from("services").select("auto_suspend").eq("id", ids.service).single();
    expect(service?.auto_suspend).toBe(true);
  });

  it("no cambia clientes de otros nodos", async () => {
    expect(await client(2)).toMatchObject({ billing_day: 5, grace_days_override: 7, cutoff_policy_id: ids.policies[0] });
  });

  it("conserva facturas, pagos, precios, promesas, no cortar y estado sin cortar inmediatamente", async () => {
    expect(await client(0)).toMatchObject({ dont_cut: true, payment_promise_until: "2099-12-28", status: "suspended" });
    const { data: invoice } = await db.from("invoices").select("amount, due_date, status").eq("id", ids.invoice).single();
    expect(invoice).toEqual({ amount: 123, due_date: "2026-11-05", status: "pending" });
    const { data: payment } = await db.from("payments").select("amount").eq("id", ids.payment).single();
    expect(payment?.amount).toBe(23);
    const { data: service } = await db.from("services").select("monthly_price, status").eq("id", ids.service).single();
    expect(service).toEqual({ monthly_price: 123, status: "suspended" });
  });

  it("vuelve a actualizar todos los clientes al editar la plantilla del nodo", async () => {
    await save({ due_day: 21 });
    expect((await client(0)).billing_day).toBe(21);
    expect((await client(1)).billing_day).toBe(21);
  });

  it("los nuevos clientes del nodo heredan la plantilla aunque antes tuvieran otra", async () => {
    const id = await insert("clients", { full_name: `${prefix} nuevo`, billing_day: 3, cutoff_policy_id: ids.policies[0] });
    ids.clients.push(id);
    const serviceId = await insert("services", { client_id: id, plan_id: ids.plan, router_id: ids.routers[0], auto_suspend: false });
    expect(await client(3)).toMatchObject({ cutoff_policy_id: ids.policies[1], billing_day: 21, grace_days_override: 0 });
    const { data } = await db.from("services").select("auto_suspend").eq("id", serviceId).single();
    expect(data?.auto_suspend).toBe(true);
  });

  it("un nodo inexistente cancela todo sin guardar una plantilla parcial", async () => {
    const { error } = await db.rpc("save_cutoff_policy_with_nodes", {
      p_policy: { id: ids.policies[1], name: `${prefix} cambio inválido`, due_day: 2 },
      p_router_ids: ["00000000-0000-0000-0000-000000000001"],
    });
    expect(error).not.toBeNull();
    expect((await client(0)).billing_day).toBe(21);
    const { data } = await db.from("cutoff_policies").select("name, due_day").eq("id", ids.policies[1]).single();
    expect(data).toEqual({ name: `${prefix} nueva`, due_day: 21 });
  });
});