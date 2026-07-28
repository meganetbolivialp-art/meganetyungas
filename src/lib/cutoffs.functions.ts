import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { suspendService, reactivateService } from "./isp.functions";

// ---------- Panel: listado de cortados ----------
export const listCutoffs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("cutoff_dashboard");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      service_id: string;
      client_id: string;
      full_name: string;
      document: string | null;
      phone: string | null;
      plan_name: string;
      ip_address: string | null;
      suspend_reason: string | null;
      suspended_at: string | null;
      days_cut: number;
      debt: number;
      overdue_invoices: number;
      router_name: string | null;
      dont_cut: boolean;
      promise_until: string | null;
    }>;
  });

export const cutoffKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("cutoff_kpis");
    if (error) throw new Error(error.message);
    return data as {
      total_cut: number;
      cut_today: number;
      reactivated_today: number;
      recovered_week: number;
      active_promises: number;
      vip_protected: number;
    };
  });

// ---------- Seguridad / configuración por cliente ----------
export const setDontCut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; value: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("clients")
      .update({ dont_cut: data.value })
      .eq("id", data.clientId);
    if (error) throw new Error(error.message);
    await context.supabase.from("client_actions").insert({
      client_id: data.clientId,
      action: "config",
      detail: data.value ? "Marcado como NO CORTAR (protegido)" : "Se quitó protección NO CORTAR",
      performed_by: context.userId,
    });
    return { ok: true };
  });

export const setGraceDaysOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; days: number | null }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("clients")
      .update({ grace_days_override: data.days })
      .eq("id", data.clientId);
    if (error) throw new Error(error.message);
    await context.supabase.from("client_actions").insert({
      client_id: data.clientId,
      action: "config",
      detail: data.days == null
        ? "Días de gracia: por defecto"
        : `Días de gracia personalizados: ${data.days}`,
      performed_by: context.userId,
    });
    return { ok: true };
  });

export const setPaymentPromise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; until: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("clients")
      .update({ payment_promise_until: data.until })
      .eq("id", data.clientId);
    if (error) throw new Error(error.message);
    await context.supabase.from("client_actions").insert({
      client_id: data.clientId,
      action: "promise",
      detail: data.until
        ? `Promesa de pago hasta ${data.until}`
        : "Promesa de pago cancelada",
      performed_by: context.userId,
    });
    return { ok: true };
  });

// ---------- Listado de promesas de pago ----------
export const listPaymentPromises = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: clients, error } = await context.supabase
      .from("clients")
      .select("id, full_name, document, phone, email, city, payment_promise_until, dont_cut")
      .not("payment_promise_until", "is", null)
      .order("payment_promise_until", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (clients ?? []).map((c: any) => c.id);
    let debtMap = new Map<string, { debt: number; overdue: number }>();
    if (ids.length) {
      const { data: inv } = await context.supabase
        .from("invoices")
        .select("client_id, amount, status")
        .in("client_id", ids)
        .in("status", ["pending", "overdue"]);
      for (const r of (inv ?? []) as any[]) {
        const cur = debtMap.get(r.client_id) ?? { debt: 0, overdue: 0 };
        cur.debt += Number(r.amount) || 0;
        if (r.status === "overdue") cur.overdue += 1;
        debtMap.set(r.client_id, cur);
      }
    }

    // Última promesa registrada en client_actions (quién y cuándo)
    let actMap = new Map<string, { created_at: string; performed_by: string | null; detail: string | null }>();
    if (ids.length) {
      const { data: acts } = await context.supabase
        .from("client_actions")
        .select("client_id, created_at, performed_by, detail")
        .in("client_id", ids)
        .eq("action", "promise")
        .order("created_at", { ascending: false });
      for (const a of (acts ?? []) as any[]) {
        if (!actMap.has(a.client_id)) actMap.set(a.client_id, a);
      }
    }

    return (clients ?? []).map((c: any) => {
      const d = debtMap.get(c.id) ?? { debt: 0, overdue: 0 };
      const a = actMap.get(c.id);
      const until: string = c.payment_promise_until;
      const daysLeft = Math.ceil((new Date(until).getTime() - new Date(today).getTime()) / 86400000);
      return {
        client_id: c.id,
        full_name: c.full_name,
        document: c.document,
        phone: c.phone,
        email: c.email,
        city: c.city,
        promise_until: until,
        days_left: daysLeft,
        expired: daysLeft < 0,
        dont_cut: c.dont_cut,
        debt: d.debt,
        overdue_invoices: d.overdue,
        created_at: a?.created_at ?? null,
        detail: a?.detail ?? null,
      };
    });
  });

// ---------- Corte programado ----------
export const scheduleSuspend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serviceId: string; at: string | null; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: svc, error } = await context.supabase
      .from("services")
      .select("id, client_id")
      .eq("id", data.serviceId)
      .single();
    if (error || !svc) throw new Error("Servicio no encontrado");
    const { error: e2 } = await context.supabase
      .from("services")
      .update({
        scheduled_suspend_at: data.at,
        suspend_reason: data.at ? (data.reason ?? "Corte programado") : null,
      })
      .eq("id", data.serviceId);
    if (e2) throw new Error(e2.message);
    await context.supabase.from("client_actions").insert({
      client_id: svc.client_id,
      service_id: svc.id,
      action: "schedule",
      detail: data.at ? `Corte programado para ${data.at}` : "Corte programado cancelado",
      performed_by: context.userId,
    });
    return { ok: true };
  });

// ---------- Corte masivo ----------
export const bulkSuspend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serviceIds: string[]; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    // Filtrar clientes protegidos
    const { data: rows } = await context.supabase
      .from("services")
      .select("id, clients(dont_cut, payment_promise_until, full_name)")
      .in("id", data.serviceIds);
    const skipped: { serviceId: string; reason: string }[] = [];
    const toRun: string[] = [];
    for (const r of (rows ?? []) as any[]) {
      const c = r.clients;
      if (c?.dont_cut) {
        skipped.push({ serviceId: r.id, reason: `${c.full_name}: marcado NO CORTAR` });
      } else if (c?.payment_promise_until && new Date(c.payment_promise_until) >= new Date(new Date().toDateString())) {
        skipped.push({ serviceId: r.id, reason: `${c.full_name}: promesa de pago vigente` });
      } else {
        toRun.push(r.id);
      }
    }
    const results = await Promise.allSettled(
      toRun.map((id) => suspendService({ data: { serviceId: id, reason: data.reason ?? "Corte masivo" } })),
    );
    return {
      ok: true,
      suspended: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
      skipped,
    };
  });

export const bulkReactivate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serviceIds: string[] }) => d)
  .handler(async ({ data }) => {
    const results = await Promise.allSettled(
      data.serviceIds.map((id) => reactivateService({ data: { serviceId: id } })),
    );
    return {
      ok: true,
      reactivated: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    };
  });

// ---------- Ejecutar cortes programados (cron o manual) ----------
export const runScheduledSuspensions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const nowIso = new Date().toISOString();
    const { data: due, error } = await context.supabase
      .from("services")
      .select("id, clients(dont_cut)")
      .not("scheduled_suspend_at", "is", null)
      .lte("scheduled_suspend_at", nowIso)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    let n = 0;
    for (const s of (due ?? []) as any[]) {
      if (s.clients?.dont_cut) continue;
      try {
        await suspendService({ data: { serviceId: s.id, reason: "Corte programado ejecutado" } });
        await context.supabase.from("services").update({ scheduled_suspend_at: null }).eq("id", s.id);
        n++;
      } catch (e) {
        console.error("scheduled suspend failed", s.id, e);
      }
    }
    return { ok: true, executed: n };
  });

// ---------- Clientes en riesgo (van a caer en corte pronto) ----------
export const listAtRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { hours?: number }) => d)
  .handler(async ({ data, context }) => {
    const hours = data.hours ?? 24;
    const today = new Date().toISOString().slice(0, 10);
    const { data: invs, error } = await context.supabase
      .from("invoices")
      .select("id, amount, due_date, client_id, service_id, clients(id, full_name, phone, email, dont_cut, payment_promise_until, grace_days_override, branch_id, branches(default_grace_days))")
      .in("status", ["pending", "overdue"])
      .lte("due_date", today);
    if (error) throw new Error(error.message);

    const now = Date.now();
    const horizon = now + hours * 3600 * 1000;
    const rows: any[] = [];
    for (const inv of (invs ?? []) as any[]) {
      const c = inv.clients;
      if (!c || c.dont_cut) continue;
      if (c.payment_promise_until && c.payment_promise_until >= today) continue;
      const grace = c.grace_days_override ?? c.branches?.default_grace_days ?? 5;
      const cutDate = new Date(inv.due_date);
      cutDate.setDate(cutDate.getDate() + grace + 1);
      const cutTs = cutDate.getTime();
      if (cutTs <= horizon && cutTs >= now - 3600_000) {
        rows.push({
          invoice_id: inv.id,
          client_id: c.id,
          full_name: c.full_name,
          phone: c.phone,
          email: c.email,
          amount: inv.amount,
          due_date: inv.due_date,
          cut_at: cutDate.toISOString(),
          hours_left: Math.max(0, Math.round((cutTs - now) / 3600_000)),
        });
      }
    }
    rows.sort((a, b) => a.hours_left - b.hours_left);
    return rows;
  });

// ---------- Enviar aviso previo al corte (registra en messages) ----------
export const notifyPreCutoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { hours?: number; channel?: "whatsapp" | "sms" | "email" }) => d)
  .handler(async ({ data, context }) => {
    const hours = data.hours ?? 24;
    const channel = data.channel ?? "whatsapp";
    const atRisk = await listAtRisk({ data: { hours } });
    if (!atRisk.length) return { ok: true, notified: 0 };

    // Buscar template por código pre_cutoff_<channel>, fallback genérico
    const { data: tpl } = await context.supabase
      .from("message_templates").select("subject, body")
      .eq("code", `pre_cutoff_${channel}`).eq("is_active", true).maybeSingle();

    const subject = tpl?.subject ?? "Aviso de corte próximo";
    const bodyTpl = tpl?.body ??
      "Hola {{nombre}}, tu servicio será suspendido el {{fecha_corte}} por deuda de ${{monto}}. Regularizá para evitar el corte.";

    const content = atRisk.map((r: any) =>
      bodyTpl
        .replace(/\{\{nombre\}\}/g, r.full_name)
        .replace(/\{\{fecha_corte\}\}/g, new Date(r.cut_at).toLocaleString())
        .replace(/\{\{monto\}\}/g, String(r.amount))
    ).join("\n---\n");

    await context.supabase.from("messages").insert({
      channel, subject, content,
      recipients_count: atRisk.length,
      target: "at_risk",
      status: "sent",
      sent_at: new Date().toISOString(),
    });

    for (const r of atRisk as any[]) {
      await context.supabase.from("client_actions").insert({
        client_id: r.client_id,
        action: "pre_cutoff_notice",
        detail: `Aviso previo (${channel}) — corte en ~${r.hours_left}h por $${r.amount}`,
        performed_by: context.userId,
      });
    }

    return { ok: true, notified: atRisk.length, channel };
  });

// ---------- Aplicar cargo de reconexión según política ----------
export const applyReconnectFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serviceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: svc } = await context.supabase
      .from("services")
      .select("id, client_id, clients(cutoff_policy_id)")
      .eq("id", data.serviceId).single();
    if (!svc) throw new Error("Servicio no encontrado");
    const policyId = (svc as any).clients?.cutoff_policy_id;
    let fee = 0;
    if (policyId) {
      const { data: pol } = await context.supabase
        .from("cutoff_policies").select("reconnect_fee").eq("id", policyId).single();
      fee = Number(pol?.reconnect_fee ?? 0);
    }
    if (!fee) {
      const { data: def } = await context.supabase
        .from("cutoff_policies").select("reconnect_fee").eq("is_default", true).maybeSingle();
      fee = Number(def?.reconnect_fee ?? 0);
    }
    if (!fee || fee <= 0) return { ok: true, fee: 0, invoice_id: null };

    const today = new Date();
    const due = new Date(today); due.setDate(due.getDate() + 3);
    const { data: inv, error } = await context.supabase.from("invoices").insert({
      client_id: svc.client_id,
      service_id: svc.id,
      amount: fee,
      due_date: due.toISOString().slice(0, 10),
      status: "pending",
      concept: "Cargo de reconexión",
      period_month: today.getMonth() + 1,
      period_year: today.getFullYear(),
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, fee, invoice_id: inv.id };
  });
