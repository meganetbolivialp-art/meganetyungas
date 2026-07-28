import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseRouterProfileRate } from "./isp-sync.server";

// ---------- Facturación masiva ----------
export const generateMonthlyInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { month?: number; year?: number }) => d ?? {})
  .handler(async ({ data, context }) => {
    const args: { p_month?: number; p_year?: number } = {};
    if (data.month != null) args.p_month = data.month;
    if (data.year != null) args.p_year = data.year;
    const { data: res, error } = await context.supabase.rpc("generate_monthly_invoices", args);
    if (error) throw new Error(error.message);
    return { created: (res as number) ?? 0 };
  });

export const markOverdueInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { graceDays?: number }) => d ?? {})
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("mark_overdue_invoices", {
      p_grace_days: data.graceDays ?? 5,
    });
    if (error) throw new Error(error.message);
    return res as { overdue: number; suspended: number };
  });

export const reapplyCutoffPortalRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId?: string }) => d ?? {})
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("routers")
      .select("*")
      .eq("simulated", false)
      .not("walled_garden_ip", "is", null);

    if (data.routerId) query = query.eq("id", data.routerId);

    const { data: routers, error } = await query;
    if (error) throw new Error(error.message);
    const { mikrotik } = await import("./mikrotik.server");

    const results = await Promise.allSettled(
      ((routers ?? []) as any[]).map(async (router) => {
        const listName = router.morosos_profile || "sistema_cortados";
        await mikrotik.ensureCutoffRules(router, { listName, noticeIp: router.walled_garden_ip });
        return { router: router.name, listName };
      }),
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      const reason = failed[0].status === "rejected" ? failed[0].reason : null;
      throw new Error(reason instanceof Error ? reason.message : "No se pudieron aplicar todas las reglas del portal");
    }

    return {
      ok: true,
      routers: results
        .filter((r): r is PromiseFulfilledResult<{ router: string; listName: string }> => r.status === "fulfilled")
        .map((r) => r.value),
    };
  });

// ---------- Acciones por servicio ----------
export const suspendService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serviceId: string; reason?: string; mode?: "cut" | "morosos_lv" }) => d)
  .handler(async ({ data, context }) => {
    const { data: svc, error } = await context.supabase
      .from("services")
      .select("id, client_id, service_type, pppoe_user, hotspot_user, queue_target, router_id, previous_profile, ip_address, plans(mikrotik_profile_name, name), routers(*)")
      .eq("id", data.serviceId)
      .single();
    if (error || !svc) throw new Error(error?.message ?? "Servicio no encontrado");

    // Corte SIEMPRE por IP (address-list). Nunca se cambia el perfil PPP.
    const mode = data.mode ?? "morosos_lv";
    const router = svc.routers as any;
    let queued = false;
    if (router) {
      const { mikrotik } = await import("./mikrotik.server");
      const { withQueueFallback } = await import("./mikrotik-queue.server");
      const listName = router.morosos_profile ?? "sistema_cortados";

      if (mode === "cut") {
        if (svc.service_type === "pppoe" && svc.pppoe_user) {
          const p = { user: svc.pppoe_user };
          const r = await withQueueFallback(context.supabase,
            { routerId: router.id, serviceId: svc.id, clientId: svc.client_id, op: "disablePPPoE", payload: p },
            () => mikrotik.disablePPPoE(router, p));
          if ((r as any).queued) queued = true;
        } else if (svc.service_type === "queue" && svc.queue_target) {
          await mikrotik.setQueueDisabled(router, { name: `svc-${svc.id}`, disabled: true });
        } else if (svc.service_type === "hotspot" && svc.hotspot_user) {
          await mikrotik.setHotspotUserDisabled(router, { user: svc.hotspot_user, disabled: true });
        }
      } else {
        let ipForList = svc.ip_address || svc.queue_target;
        if (!ipForList && svc.pppoe_user) {
          try {
            const live = await mikrotik.getUserLive(router, { user: svc.pppoe_user });
            ipForList = (live.active as any)?.address || (live.secret as any)?.["remote-address"] || null;
          } catch (e) {
            // Router offline: encolar sin IP resuelta usa la guardada en DB o falla suave.
            ipForList = svc.ip_address || null;
          }
        }
        if (!ipForList) {
          throw new Error("Este servicio no tiene IP guardada ni sesión PPPoE activa; no puedo agregarlo a la lista de corte.");
        }
        const payload = { ip: ipForList, listName, comment: `svc-${svc.id}` };
        const r = await withQueueFallback(context.supabase,
          { routerId: router.id, serviceId: svc.id, clientId: svc.client_id, op: "addToCutoffList", payload },
          async () => {
            await mikrotik.ensureCutoffRules(router, { listName, noticeIp: router.walled_garden_ip });
            return mikrotik.addToCutoffList(router, payload);
          });
        if ((r as any).queued) queued = true;
      }
    }

    const { error: updateError } = await context.supabase.from("services")
      .update({ status: "suspended", suspended_at: new Date().toISOString() })
      .eq("id", data.serviceId);
    if (updateError) throw new Error(updateError.message);
    await context.supabase.from("clients")
      .update({ status: "suspended" })
      .eq("id", svc.client_id);
    await context.supabase.from("client_actions").insert({
      client_id: svc.client_id, service_id: svc.id, action: "suspend",
      detail: `${mode === "cut" ? "Corte total (disable secret)" : "IP agregada a address-list de corte"}${data.reason ? ` — ${data.reason}` : ""}${queued ? " · en cola (router offline)" : ""}`,
      performed_by: context.userId,
    });
    return { ok: true, mode, queued };
  });




export const reactivateService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serviceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: svc, error } = await context.supabase
      .from("services")
      .select("id, client_id, service_type, pppoe_user, hotspot_user, previous_profile, ip_address, queue_target, plans(mikrotik_profile_name, name), routers(*)")
      .eq("id", data.serviceId).single();
    if (error || !svc) throw new Error(error?.message ?? "Servicio no encontrado");

    const router = svc.routers as any;
    let queued = false;
    if (router) {
      const { mikrotik } = await import("./mikrotik.server");
      const { withQueueFallback } = await import("./mikrotik-queue.server");
      const listName = router.morosos_profile ?? "sistema_cortados";

      // Reactivación: quitar de address-list y (si aplica) enable + kick.
      // Si el router está offline, encolar todo para aplicar al reconectar.
      if (svc.service_type === "pppoe" && svc.pppoe_user) {
        const p = { user: svc.pppoe_user };
        const r = await withQueueFallback(context.supabase,
          { routerId: router.id, serviceId: svc.id, clientId: svc.client_id, op: "enablePPPoE", payload: p },
          () => mikrotik.enablePPPoE(router, p)).catch(() => ({ queued: false }));
        if ((r as any).queued) queued = true;
      } else if (svc.service_type === "queue") {
        try { await mikrotik.setQueueDisabled(router, { name: `svc-${svc.id}`, disabled: false }); } catch { /* ignore */ }
      } else if (svc.service_type === "hotspot" && svc.hotspot_user) {
        try { await mikrotik.setHotspotUserDisabled(router, { user: svc.hotspot_user, disabled: false }); } catch { /* ignore */ }
      }

      const ipForList = svc.ip_address || svc.queue_target;
      if (ipForList) {
        const p = { ip: ipForList, listName };
        const r = await withQueueFallback(context.supabase,
          { routerId: router.id, serviceId: svc.id, clientId: svc.client_id, op: "removeFromCutoffList", payload: p },
          () => mikrotik.removeFromCutoffList(router, p)).catch(() => ({ queued: false }));
        if ((r as any).queued) queued = true;
      }

      if (svc.service_type === "pppoe" && svc.pppoe_user) {
        const p = { user: svc.pppoe_user };
        const r = await withQueueFallback(context.supabase,
          { routerId: router.id, serviceId: svc.id, clientId: svc.client_id, op: "kickPPPoESession", payload: p },
          () => mikrotik.kickPPPoESession(router, p)).catch(() => ({ queued: false }));
        if ((r as any).queued) queued = true;
      }
    }



    await context.supabase.from("services")
      .update({ status: "active", suspended_at: null, previous_profile: null }).eq("id", data.serviceId);
    const { count } = await context.supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("client_id", svc.client_id)
      .eq("status", "suspended");
    if ((count ?? 0) === 0) {
      await context.supabase.from("clients")
        .update({ status: "active" })
        .eq("id", svc.client_id);
    }
    await context.supabase.from("client_actions").insert({
      client_id: svc.client_id, service_id: svc.id, action: "reactivate",
      detail: "Reactivación", performed_by: context.userId,
    });
    return { ok: true };
  });

// ---------- Sincronizar plan → /ppp/profile en todos los routers ----------
export const syncPlanToRouters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: plan, error } = await context.supabase.from("plans").select("*").eq("id", data.planId).single();
    if (error || !plan) throw new Error("Plan no encontrado");
    const { data: routers } = await context.supabase.from("routers").select("*");
    const { mikrotik } = await import("./mikrotik.server");
    const profileName = plan.mikrotik_profile_name || plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const results: { router: string; ok: boolean; error?: string; updated?: boolean }[] = [];
    for (const r of (routers ?? [])) {
      try {
        const res = await mikrotik.upsertPppProfile(r as any, {
          name: profileName, rateDown: plan.download_mbps, rateUp: plan.upload_mbps,
          burst: plan.burst_enabled, walledGardenIp: (r as any).walled_garden_ip,
        });
        // sincroniza también hotspot user profile por si hay servicios hotspot
        try { await mikrotik.upsertHotspotProfile(r as any, { name: profileName, rateDown: plan.download_mbps, rateUp: plan.upload_mbps }); } catch { /* ignore */ }
        results.push({ router: r.name, ok: true, updated: res.updated });
      } catch (e) {
        results.push({ router: r.name, ok: false, error: (e as Error).message });
      }
    }
    await context.supabase.from("plans").update({ mikrotik_profile_name: profileName, synced_at: new Date().toISOString() }).eq("id", plan.id);
    return { ok: true, profileName, results };
  });


export const changeServicePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serviceId: string; planId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: plan } = await context.supabase.from("plans").select("name, price").eq("id", data.planId).single();
    const { data: svc } = await context.supabase.from("services")
      .select("id, client_id").eq("id", data.serviceId).single();
    if (!svc || !plan) throw new Error("Servicio o plan inválido");
    await context.supabase.from("services").update({ plan_id: data.planId, monthly_price: plan.price }).eq("id", data.serviceId);
    await context.supabase.from("client_actions").insert({
      client_id: svc.client_id, service_id: svc.id, action: "plan_change",
      detail: `Nuevo plan: ${plan.name} ($${plan.price})`, performed_by: context.userId,
    });
    return { ok: true };
  });

export const provisionPPPoE = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serviceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: svc, error } = await context.supabase.from("services")
      .select("id, client_id, pppoe_user, pppoe_password, ip_address, routers(*), plans(name)")
      .eq("id", data.serviceId).single();
    if (error || !svc) throw new Error("Servicio no encontrado");
    if (!svc.routers) throw new Error("Servicio sin router asignado");
    if (!svc.pppoe_user || !svc.pppoe_password) throw new Error("Faltan credenciales PPPoE");

    const { mikrotik } = await import("./mikrotik.server");
    const { withQueueFallback } = await import("./mikrotik-queue.server");
    const router = svc.routers as any;
    const payload = {
      user: svc.pppoe_user, password: svc.pppoe_password,
      profile: (svc.plans as any)?.name ?? "default", remoteIp: svc.ip_address,
    };
    const res = await withQueueFallback(
      context.supabase,
      { routerId: router.id, serviceId: svc.id, clientId: svc.client_id, op: "createPPPoE", payload },
      () => mikrotik.createPPPoE(router, payload),
    );
    const queued = (res as any).queued === true;
    await context.supabase.from("client_actions").insert({
      client_id: svc.client_id, service_id: svc.id, action: "provision",
      detail: queued
        ? "PPPoE en cola — se aplicará al reconectar el router"
        : `PPPoE aprovisionado en router (id ${(res as any).id ?? "?"})`,
      performed_by: context.userId,
    });
    return res;
  });

// ---------- Router status / diagnósticos ----------
export const pingRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const prevStatus = (r as any).status;
    const { mikrotik } = await import("./mikrotik.server");
    let res: any;
    try {
      res = await mikrotik.ping(r as any);
    } catch (e) {
      await context.supabase.from("routers").update({ last_sync_at: new Date().toISOString(), status: "offline" }).eq("id", r.id);
      throw e;
    }
    await context.supabase.from("routers").update({ last_sync_at: new Date().toISOString(), status: "online" }).eq("id", r.id);
    // Transición offline→online: sincronizar cola pendiente.
    if (prevStatus !== "online") {
      try {
        const { flushPending } = await import("./mikrotik-queue.server");
        const flushed = await flushPending(context.supabase, r.id);
        if (flushed.done > 0 || flushed.failed > 0) {
          console.log(`[mikrotik-queue] ${(r as any).name}: aplicadas ${flushed.done}, fallidas ${flushed.failed}`);
        }
        (res as any).flushed = flushed;
      } catch (e) {
        console.error("[mikrotik-queue] flush failed", (e as Error).message);
      }
    }
    return res;
  });

// ---------- Cola de operaciones pendientes ----------
export const listPendingOps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("mikrotik_pending_ops")
      .select("id, router_id, service_id, client_id, op, status, attempts, last_error, created_at, synced_at, routers(name), clients(full_name)")
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { ops: data ?? [] };
  });

export const flushRouterQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { flushPending } = await import("./mikrotik-queue.server");
    return flushPending(context.supabase, data.routerId);
  });

export const pendingOpsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { countPendingByRouter } = await import("./mikrotik-queue.server");
    const counts = await countPendingByRouter(context.supabase);
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    return { total, byRouter: Object.fromEntries(counts) };
  });

export const listActiveSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { mikrotik } = await import("./mikrotik.server");
    return mikrotik.listActive(r as any);
  });

export const getRouterHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { mikrotik } = await import("./mikrotik.server");
    const [resource, ifaces, active] = await Promise.all([
      mikrotik.getResource(r as any).catch((e: any) => ({ error: e.message })),
      mikrotik.getInterfaces(r as any).catch((e: any) => ({ error: e.message, interfaces: [] })),
      mikrotik.listActive(r as any).catch((e: any) => ({ error: e.message, active: [] })),
    ]);
    return { resource, ifaces, active, at: Date.now() };
  });

export const monitorInterface = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string; iface: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { mikrotik } = await import("./mikrotik.server");
    return mikrotik.monitorTraffic(r as any, data.iface);
  });

export const getServiceLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serviceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: svc, error } = await context.supabase
      .from("services").select("*, routers(*)").eq("id", data.serviceId).single();
    if (error || !svc) throw new Error("Servicio no encontrado");
    if (!svc.pppoe_user) throw new Error("Servicio sin usuario PPPoE");
    if (!svc.routers) throw new Error("Servicio sin router asignado");
    const { mikrotik } = await import("./mikrotik.server");
    return mikrotik.getUserLive(svc.routers as any, { user: svc.pppoe_user });
  });

export const getServicePppoeSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serviceId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: svc, error } = await context.supabase
      .from("services")
      .select("id, pppoe_user, router_id, routers(*)")
      .eq("id", data.serviceId)
      .single();
    if (error || !svc) throw new Error("Servicio no encontrado");
    if (!svc.pppoe_user) throw new Error("Servicio sin usuario PPPoE");
    if (!svc.routers) throw new Error("Servicio sin router asignado");

    const { mikrotik } = await import("./mikrotik.server");
    const live = await mikrotik.getUserLive(svc.routers as any, { user: svc.pppoe_user });
    const secret = (live.secret ?? {}) as Record<string, string | null | undefined>;
    if (!secret.name) throw new Error("No encontré ese PPPoE en Mikrotik");

    const password = secret.password ?? null;
    const remoteAddress = secret["remote-address"] ?? null;
    const disabled = secret.disabled === "true";

    const updatePayload: {
      pppoe_user: string;
      ip_address: string | null;
      status: string;
      pppoe_password?: string;
    } = {
      pppoe_user: secret.name ?? svc.pppoe_user,
      ip_address: remoteAddress,
      status: disabled ? "suspended" : "active",
    };
    if (password) updatePayload.pppoe_password = password;
    await context.supabase.from("services").update(updatePayload).eq("id", svc.id);

    return {
      ok: true,
      name: secret.name ?? svc.pppoe_user,
      password,
      profile: secret.profile ?? null,
      remote_address: remoteAddress,
      disabled,
    };
  });

export const testRouterConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const started = Date.now();
    try {
      const { mikrotik } = await import("./mikrotik.server");
      const res = await mikrotik.ping(r as any);
      const elapsed = Date.now() - started;
      await context.supabase.from("routers")
        .update({ last_sync_at: new Date().toISOString(), status: "online" })
        .eq("id", r.id);
      return { ok: true as const, mode: r.simulated ? "simulated" : "real", latency_ms: res.latency_ms, elapsed_ms: elapsed };
    } catch (e) {
      await context.supabase.from("routers").update({ status: "offline" }).eq("id", r.id);
      return { ok: false as const, mode: r.simulated ? "simulated" : "real", error: (e as Error).message, elapsed_ms: Date.now() - started };
    }
  });

// ---------- Wizard: provisión completa cliente + servicio ----------
export const provisionNewClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    client: { full_name: string; document?: string; email?: string; phone?: string; address?: string; city?: string; billing_day?: number };
    service: { plan_id: string; router_id: string; pppoe_user: string; pppoe_password: string; ip_address?: string; installation_address?: string };
    provision: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    const steps: { key: string; ok: boolean; detail?: string }[] = [];

    // 1. Cliente
    const { data: client, error: cErr } = await context.supabase
      .from("clients").insert({ ...data.client, status: "active" }).select().single();
    if (cErr || !client) throw new Error(cErr?.message ?? "No se pudo crear cliente");
    steps.push({ key: "client", ok: true, detail: client.id });

    // 2. Plan
    const { data: plan } = await context.supabase.from("plans")
      .select("name, price").eq("id", data.service.plan_id).single();
    if (!plan) throw new Error("Plan inválido");
    steps.push({ key: "plan", ok: true, detail: plan.name });

    // 3. Servicio
    const { data: svc, error: sErr } = await context.supabase.from("services").insert({
      client_id: client.id,
      plan_id: data.service.plan_id,
      router_id: data.service.router_id,
      pppoe_user: data.service.pppoe_user,
      pppoe_password: data.service.pppoe_password,
      ip_address: data.service.ip_address ?? null,
      installation_address: data.service.installation_address ?? data.client.address ?? null,
      installation_date: new Date().toISOString().slice(0, 10),
      status: "active",
      monthly_price: plan.price,
      auto_suspend: true,
    }).select().single();
    if (sErr || !svc) throw new Error(sErr?.message ?? "No se pudo crear servicio");
    steps.push({ key: "service", ok: true, detail: svc.id });

    // 4. PPPoE push al router (opcional)
    if (data.provision) {
      try {
        const { data: r } = await context.supabase.from("routers").select("*").eq("id", data.service.router_id).single();
        if (!r) throw new Error("Router no encontrado");
        const { mikrotik } = await import("./mikrotik.server");
        const res = await mikrotik.createPPPoE(r as any, {
          user: data.service.pppoe_user,
          password: data.service.pppoe_password,
          profile: plan.name,
          remoteIp: data.service.ip_address,
        });
        steps.push({ key: "pppoe", ok: true, detail: `id ${res.id ?? "ok"}` });
      } catch (e) {
        steps.push({ key: "pppoe", ok: false, detail: (e as Error).message });
      }
    } else {
      steps.push({ key: "pppoe", ok: true, detail: "omitido" });
    }

    // 5. Log
    await context.supabase.from("client_actions").insert({
      client_id: client.id, service_id: svc.id, action: "provision",
      detail: `Alta wizard: plan ${plan.name}`, performed_by: context.userId,
    });
    steps.push({ key: "log", ok: true });

    return { ok: true, clientId: client.id, serviceId: svc.id, steps };
  });

// ---------- Registrar pago + auto-reactivar servicios del cliente ----------
export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id: string; invoice_id?: string; amount: number; method: string; reference?: string }) => d)
  .handler(async ({ data, context }) => {
    // 1. Insertar pago
    const { data: pay, error: pErr } = await context.supabase.from("payments").insert({
      client_id: data.client_id,
      invoice_id: data.invoice_id || null,
      amount: data.amount,
      method: data.method,
      reference: data.reference ?? null,
    }).select().single();
    if (pErr) throw new Error(pErr.message);

    // 2. Marcar factura pagada si aplica
    if (data.invoice_id) {
      await context.supabase.from("invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", data.invoice_id);
    }

    // 3. ¿Le quedan facturas vencidas? Si no → reactivar servicios suspendidos
    const { data: pending } = await context.supabase
      .from("invoices").select("id")
      .eq("client_id", data.client_id)
      .in("status", ["overdue", "pending"])
      .lt("due_date", new Date().toISOString().slice(0, 10));

    const reactivated: string[] = [];
    if (!pending || pending.length === 0) {
      const { data: suspSvcs } = await context.supabase.from("services")
        .select("id, service_type, pppoe_user, hotspot_user, ip_address, queue_target, routers(*)")
        .eq("client_id", data.client_id)
        .eq("status", "suspended");

      for (const svc of (suspSvcs ?? [])) {
        const router = (svc as any).routers;
        if (router) {
          try {
            const { mikrotik } = await import("./mikrotik.server");
            const listName = router.morosos_profile ?? "sistema_cortados";
            if (svc.service_type === "pppoe" && svc.pppoe_user) {
              try { await mikrotik.enablePPPoE(router, { user: svc.pppoe_user }); } catch { /* */ }
            } else if (svc.service_type === "queue") {
              try { await mikrotik.setQueueDisabled(router, { name: `svc-${svc.id}`, disabled: false }); } catch { /* */ }
            } else if (svc.service_type === "hotspot" && svc.hotspot_user) {
              try { await mikrotik.setHotspotUserDisabled(router, { user: svc.hotspot_user, disabled: false }); } catch { /* */ }
            }
            const ipForList = svc.ip_address || svc.queue_target;
            if (ipForList) {
              try { await mikrotik.removeFromCutoffList(router, { ip: ipForList, listName }); } catch { /* */ }
            }
          } catch (e) { console.error("reactivate push failed", e); }
        }
        await context.supabase.from("services")
          .update({ status: "active", suspended_at: null, previous_profile: null })
          .eq("id", svc.id);
        await context.supabase.from("client_actions").insert({
          client_id: data.client_id, service_id: svc.id, action: "reactivate",
          detail: `Reactivación automática por pago ($${data.amount})`, performed_by: context.userId,
        });
        reactivated.push(svc.id);
      }
    }

    return { ok: true, payment_id: pay.id, reactivated };
  });


// ---------- Cobro rápido ----------
export const registerPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoiceId: string; method?: string; reference?: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase.from("invoices").select("*").eq("id", data.invoiceId).single();
    if (error || !inv) throw new Error("Factura no encontrada");
    if (inv.status === "paid") return { ok: true, already: true };
    await context.supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", inv.id);
    await context.supabase.from("payments").insert({
      client_id: inv.client_id, invoice_id: inv.id, amount: inv.amount,
      method: data.method ?? "cash", reference: data.reference ?? null,
    });
    await context.supabase.from("client_actions").insert({
      client_id: inv.client_id, action: "payment",
      detail: `Pago registrado por $${inv.amount}`, performed_by: context.userId,
    });
    // Auto-reactivar servicio si fue suspendido: quitar IP de address-list, no tocar perfil PPP.
    if (inv.service_id) {
      const { data: svc } = await context.supabase.from("services")
        .select("id, status, service_type, pppoe_user, hotspot_user, ip_address, queue_target, routers(*)").eq("id", inv.service_id).single();
      if (svc && svc.status === "suspended") {
        const router = (svc as any).routers;
        if (router) {
          const { mikrotik } = await import("./mikrotik.server");
          const listName = router.morosos_profile ?? "sistema_cortados";
          try {
            if (svc.service_type === "pppoe" && (svc as any).pppoe_user) {
              try { await mikrotik.enablePPPoE(router, { user: (svc as any).pppoe_user }); } catch { /* ignore */ }
            } else if (svc.service_type === "queue") {
              await mikrotik.setQueueDisabled(router, { name: `svc-${svc.id}`, disabled: false });
            } else if (svc.service_type === "hotspot" && (svc as any).hotspot_user) {
              await mikrotik.setHotspotUserDisabled(router, { user: (svc as any).hotspot_user, disabled: false });
            }
            const ipForList = (svc as any).ip_address || (svc as any).queue_target;
            if (ipForList) {
              try { await mikrotik.removeFromCutoffList(router, { ip: ipForList, listName }); } catch { /* ignore */ }
            }
          } catch (e) { console.error("auto-reactivate failed", e); }
        }
        await context.supabase.from("services").update({ status: "active", suspended_at: null, previous_profile: null }).eq("id", svc.id);
      }
    }

    return { ok: true };
  });


// ---------- Sync bidireccional Router → DB ----------
export const listRouterSecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { mikrotik } = await import("./mikrotik.server");
    const res = await mikrotik.listSecrets(r as any);
    const { data: svcs } = await context.supabase.from("services")
      .select("id, pppoe_user, client_id, clients(full_name)").eq("router_id", data.routerId);
    const dbUsers = new Set((svcs ?? []).map((s: any) => (s.pppoe_user || "").toLowerCase()).filter(Boolean));
    const secrets = res.secrets.map((s) => ({
      ...s,
      in_db: dbUsers.has((s.name || "").toLowerCase()),
    }));
    return { secrets, dbCount: dbUsers.size };
  });

export const importOrphanSecrets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string; secrets: Array<{ name: string; password?: string | null; profile?: string; remote_address?: string | null }>; planId?: string | null; clientId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    // Cargo TODOS los planes activos para matchear por perfil
    const { data: allPlans } = await context.supabase.from("plans").select("id, name, price, mikrotik_profile_name").eq("active", true);
    const planByProfile = new Map<string, any>();
    (allPlans ?? []).forEach((p: any) => {
      if (p.mikrotik_profile_name) planByProfile.set(p.mikrotik_profile_name.toLowerCase(), p);
      if (p.name) planByProfile.set(p.name.toLowerCase(), p);
    });
    const fallbackPlan = data.planId ? (allPlans ?? []).find((p: any) => p.id === data.planId) : null;

    // Pre-cargo los pppoe_user ya existentes para no duplicar
    const { data: existing } = await context.supabase
      .from("services").select("pppoe_user").eq("router_id", data.routerId);
    const existingSet = new Set((existing ?? []).map((s: any) => (s.pppoe_user || "").toLowerCase()));

    let created = 0;
    const errors: { name: string; error: string }[] = [];
    const skipped: string[] = [];
    const missingPlan: string[] = [];

    for (const sec of data.secrets) {
      if (!sec.name) continue;
      if (existingSet.has(sec.name.toLowerCase())) { skipped.push(sec.name); continue; }

      // Matcheo el plan por el perfil PPP del secret
      const matched = sec.profile ? planByProfile.get(sec.profile.toLowerCase()) : null;
      const plan = matched ?? fallbackPlan;
      if (!plan) {
        missingPlan.push(`${sec.name} (perfil: ${sec.profile ?? "?"})`);
        errors.push({ name: sec.name, error: `sin plan para perfil "${sec.profile ?? "?"}" — importá primero los planes` });
        continue;
      }

      try {
        let clientId = data.clientId;
        // Si NO se eligió cliente existente, creo uno POR CADA secret
        if (!clientId) {
          const { data: nc, error: ce } = await context.supabase.from("clients")
            .insert({ full_name: sec.name, status: "active", notes: `Importado desde router ${new Date().toLocaleDateString()}` })
            .select("id").single();
          if (ce || !nc) { errors.push({ name: sec.name, error: `cliente: ${ce?.message ?? "?"}` }); continue; }
          clientId = nc.id;
        }
        const { error: se } = await context.supabase.from("services").insert({
          client_id: clientId, plan_id: plan.id, router_id: data.routerId,
          pppoe_user: sec.name, pppoe_password: sec.password ?? null,
          ip_address: sec.remote_address ?? null, service_type: "pppoe",
          monthly_price: plan.price, status: "active",
          notes: `Importado. Perfil: ${sec.profile ?? "?"} → Plan: ${plan.name}${sec.password ? "" : " — contraseña no enviada por RouterOS"}`,
        });
        if (se) { errors.push({ name: sec.name, error: se.message }); continue; }
        await context.supabase.from("client_actions").insert({
          client_id: clientId, action: "import",
          detail: `Secret PPPoE ${sec.name} importado (plan ${plan.name})`,
          performed_by: context.userId,
        });
        created += 1;
        existingSet.add(sec.name.toLowerCase());
      } catch (e: any) {
        errors.push({ name: sec.name, error: e.message });
      }
    }
    return { ok: true, created, skipped, errors, missingPlan, total: data.secrets.length };
  });


// ---------- Sync Router → Planes ----------
export const listRouterProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { mikrotik } = await import("./mikrotik.server");
    const res = await mikrotik.listProfiles(r as any);

    const { data: plans } = await context.supabase.from("plans").select("id, name, mikrotik_profile_name");
    const known = new Set<string>();
    (plans ?? []).forEach((p: any) => {
      if (p.mikrotik_profile_name) known.add(p.mikrotik_profile_name.toLowerCase());
      if (p.name) known.add(p.name.toLowerCase());
    });

    // Perfiles de sistema que NO deben importarse como planes comerciales
    const systemNames = new Set(["default", "default-encryption", "morosos_lv", "lovable-vpn"]);

    const profiles = res.profiles.map((p) => {
      const { up, down } = parseRouterProfileRate(p.rate_limit);
      return {
        ...p,
        upload_mbps: up,
        download_mbps: down,
        in_db: known.has((p.name || "").toLowerCase()),
        is_system: systemNames.has((p.name || "").toLowerCase()),
      };
    });
    return { profiles };
  });

export const listRouterImportPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { mikrotik } = await import("./mikrotik.server");
    const res = await mikrotik.listImportPreview(r as any);

    const [{ data: svcs }, { data: plans }] = await Promise.all([
      context.supabase.from("services").select("id, pppoe_user, client_id, clients(full_name)").eq("router_id", data.routerId),
      context.supabase.from("plans").select("id, name, mikrotik_profile_name"),
    ]);

    const dbUsers = new Set((svcs ?? []).map((s: any) => (s.pppoe_user || "").toLowerCase()).filter(Boolean));
    const known = new Set<string>();
    (plans ?? []).forEach((p: any) => {
      if (p.mikrotik_profile_name) known.add(p.mikrotik_profile_name.toLowerCase());
      if (p.name) known.add(p.name.toLowerCase());
    });

    const systemNames = new Set(["default", "default-encryption", "morosos_lv", "lovable-vpn"]);
    const secrets = res.secrets.map((s) => ({
      ...s,
      in_db: dbUsers.has((s.name || "").toLowerCase()),
    }));
    const profiles = res.profiles.map((p) => {
      const { up, down } = parseRouterProfileRate(p.rate_limit);
      return {
        ...p,
        upload_mbps: up,
        download_mbps: down,
        in_db: known.has((p.name || "").toLowerCase()),
        is_system: systemNames.has((p.name || "").toLowerCase()),
      };
    });

    return { secrets, profiles, dbCount: dbUsers.size };
  });

export const importRouterProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    profiles: Array<{ name: string; upload_mbps: number; download_mbps: number; rate_limit?: string | null; price?: number }>;
    defaultPrice?: number;
  }) => d)
  .handler(async ({ data, context }) => {
    const { data: plans } = await context.supabase.from("plans").select("id, name, mikrotik_profile_name");
    const known = new Set<string>();
    (plans ?? []).forEach((p: any) => {
      if (p.mikrotik_profile_name) known.add(p.mikrotik_profile_name.toLowerCase());
      if (p.name) known.add(p.name.toLowerCase());
    });

    let created = 0;
    const skipped: string[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const p of data.profiles) {
      if (!p.name) continue;
      if (known.has(p.name.toLowerCase())) { skipped.push(p.name); continue; }
      const down = p.download_mbps || 0;
      const up = p.upload_mbps || 0;
      if (down <= 0 && up <= 0) { errors.push({ name: p.name, error: "sin rate-limit" }); continue; }
      const price = typeof p.price === "number" && p.price >= 0 ? p.price : (data.defaultPrice ?? 0);
      const { error } = await context.supabase.from("plans").insert({
        name: p.name,
        download_mbps: down || up,
        upload_mbps: up || down,
        price,
        active: true,
        mikrotik_profile_name: p.name,
        description: `Importado desde router (${p.rate_limit ?? ""})`,
        synced_at: new Date().toISOString(),
      });
      if (error) { errors.push({ name: p.name, error: error.message }); continue; }
      created += 1;
      known.add(p.name.toLowerCase());
    }
    return { ok: true, created, skipped, errors, total: data.profiles.length };
  });


// ---------- Ping masivo + auto-status de routers ----------
export const pingAllRouters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: routers, error } = await context.supabase.from("routers").select("*");
    if (error) throw new Error(error.message);
    const { mikrotik } = await import("./mikrotik.server");
    const results = await Promise.all(
      ((routers ?? []) as any[]).map(async (r) => {
        const started = Date.now();
        try {
          const res = await mikrotik.ping(r);
          await context.supabase.from("routers")
            .update({ status: "online", last_sync_at: new Date().toISOString() })
            .eq("id", r.id);
          return { id: r.id, name: r.name, ok: true, latency_ms: res.latency_ms, elapsed_ms: Date.now() - started };
        } catch (e) {
          await context.supabase.from("routers").update({ status: "offline" }).eq("id", r.id);
          return { id: r.id, name: r.name, ok: false, error: (e as Error).message, elapsed_ms: Date.now() - started };
        }
      }),
    );
    return { results, at: Date.now() };
  });

// ---------- Kick sesión PPPoE ----------
export const kickPPPoESession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string; user: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { mikrotik } = await import("./mikrotik.server");
    return mikrotik.kickPPPoESession(r as any, { user: data.user });
  });

// ---------- Drift DB ↔ Router (comparación bidireccional PPPoE) ----------
export const getRouterDrift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { mikrotik } = await import("./mikrotik.server");

    const [routerRes, dbSvcs] = await Promise.all([
      mikrotik.listSecrets(r as any),
      context.supabase.from("services")
        .select("id, pppoe_user, pppoe_password, status, ip_address, client_id, plans(name, mikrotik_profile_name), clients(full_name)")
        .eq("router_id", data.routerId)
        .eq("service_type", "pppoe"),
    ]);

    const routerMap = new Map<string, any>();
    routerRes.secrets.forEach((s) => { if (s.name) routerMap.set(s.name.toLowerCase(), s); });

    const dbList = (dbSvcs.data ?? []) as any[];
    const dbMap = new Map<string, any>();
    dbList.forEach((s) => { if (s.pppoe_user) dbMap.set(s.pppoe_user.toLowerCase(), s); });

    const orphansOnRouter = routerRes.secrets.filter((s) => s.name && !dbMap.has(s.name.toLowerCase()));

    const missingOnRouter = dbList
      .filter((s) => s.pppoe_user && !routerMap.has(s.pppoe_user.toLowerCase()))
      .map((s) => ({
        service_id: s.id,
        pppoe_user: s.pppoe_user,
        client: s.clients?.full_name ?? "—",
        profile: s.plans?.mikrotik_profile_name || s.plans?.name || "default",
        ip: s.ip_address,
        status: s.status,
      }));

    const statusMismatch: any[] = [];
    const profileMismatch: any[] = [];
    const morosos = (r as any).morosos_profile || "morosos_lv";

    for (const s of dbList) {
      if (!s.pppoe_user) continue;
      const remote = routerMap.get(s.pppoe_user.toLowerCase());
      if (!remote) continue;
      const remoteDisabled = remote.disabled === true;
      const dbSuspended = s.status === "suspended" || s.status === "cancelled";
      if (dbSuspended !== remoteDisabled && (dbSuspended || remoteDisabled)) {
        statusMismatch.push({
          service_id: s.id,
          pppoe_user: s.pppoe_user,
          client: s.clients?.full_name ?? "—",
          db_status: s.status,
          router_disabled: remoteDisabled,
        });
      }
      // Perfil desalineado: si el plan cambió en la DB, el router puede seguir con el perfil anterior.
      const wantedProfile = s.plans?.mikrotik_profile_name || s.plans?.name || null;
      const remoteProfile = remote.profile || null;
      if (
        wantedProfile && remoteProfile &&
        wantedProfile.toLowerCase() !== remoteProfile.toLowerCase() &&
        remoteProfile.toLowerCase() !== morosos.toLowerCase() && // no marcar los cortados como drift
        !dbSuspended
      ) {
        profileMismatch.push({
          service_id: s.id,
          pppoe_user: s.pppoe_user,
          client: s.clients?.full_name ?? "—",
          db_profile: wantedProfile,
          router_profile: remoteProfile,
        });
      }
    }

    return {
      routerCount: routerRes.secrets.length,
      dbCount: dbList.length,
      orphansOnRouter,
      missingOnRouter,
      statusMismatch,
      profileMismatch,
    };
  });

// ---------- Actualiza el profile de secrets desalineados (DB → Router) ----------
export const updateRouterProfilesForServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string; serviceIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { data: svcs, error: se } = await context.supabase.from("services")
      .select("id, pppoe_user, pppoe_password, ip_address, client_id, plans(name, mikrotik_profile_name)")
      .in("id", data.serviceIds);
    if (se) throw new Error(se.message);
    const { mikrotik } = await import("./mikrotik.server");
    const results: { service_id: string; user: string; ok: boolean; error?: string }[] = [];
    for (const s of (svcs ?? []) as any[]) {
      const profile = s.plans?.mikrotik_profile_name || s.plans?.name;
      if (!s.pppoe_user || !profile) {
        results.push({ service_id: s.id, user: s.pppoe_user ?? "?", ok: false, error: "sin perfil destino" });
        continue;
      }
      try {
        await mikrotik.createPPPoE(r as any, {
          user: s.pppoe_user,
          password: s.pppoe_password ?? "keep",
          profile,
          remoteIp: s.ip_address,
        });
        await context.supabase.from("client_actions").insert({
          client_id: s.client_id, service_id: s.id, action: "profile_sync",
          detail: `Perfil actualizado en router → ${profile}`,
          performed_by: context.userId,
        });
        results.push({ service_id: s.id, user: s.pppoe_user, ok: true });
      } catch (e) {
        results.push({ service_id: s.id, user: s.pppoe_user, ok: false, error: (e as Error).message });
      }
    }
    return { ok: true, results, updated: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
  });

// ---------- Anomalías PPPoE: doble sesión y conectado sin tráfico ----------
export const detectPppoeAnomalies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string; stalledMinBytes?: number; stalledMinUptimeMin?: number }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { mikrotik } = await import("./mikrotik.server");
    const res = await mikrotik.listActive(r as any);

    // Nombres a cliente
    const names = Array.from(new Set(res.active.map((a: any) => a.name).filter(Boolean)));
    const nameMap = new Map<string, string>();
    if (names.length) {
      const { data: svcs } = await context.supabase.from("services")
        .select("pppoe_user, clients(full_name)").eq("router_id", data.routerId).in("pppoe_user", names);
      (svcs ?? []).forEach((s: any) => nameMap.set((s.pppoe_user || "").toLowerCase(), s.clients?.full_name ?? "—"));
    }

    // Doble sesión: mismo name aparece >1 vez
    const byName = new Map<string, any[]>();
    for (const a of res.active as any[]) {
      if (!a.name) continue;
      const k = a.name.toLowerCase();
      const arr = byName.get(k) ?? [];
      arr.push(a);
      byName.set(k, arr);
    }
    const duplicates: any[] = [];
    for (const [k, arr] of byName) {
      if (arr.length > 1) {
        duplicates.push({
          pppoe_user: arr[0].name,
          client: nameMap.get(k) ?? "—",
          sessions: arr.map((x) => ({ address: x.address, uptime: x.uptime, caller_id: x.caller_id })),
        });
      }
    }

    // Stalled: uptime > N min y bytes totales < threshold
    const minBytes = data.stalledMinBytes ?? 1024 * 1024; // 1 MB
    const minUptimeMin = data.stalledMinUptimeMin ?? 30;
    const parseUptimeMin = (u: string | null | undefined) => {
      if (!u) return 0;
      let total = 0;
      const weeks = u.match(/(\d+)w/); if (weeks) total += Number(weeks[1]) * 7 * 24 * 60;
      const days = u.match(/(\d+)d/); if (days) total += Number(days[1]) * 24 * 60;
      const hrs = u.match(/(\d+)h/); if (hrs) total += Number(hrs[1]) * 60;
      const mins = u.match(/(\d+)m/); if (mins) total += Number(mins[1]);
      return total;
    };
    const stalled = (res.active as any[])
      .filter((a) => a.name)
      .map((a) => {
        const bytes = Number(a.bytes_in ?? 0) + Number(a.bytes_out ?? 0);
        const upMin = parseUptimeMin(a.uptime);
        return {
          pppoe_user: a.name,
          client: nameMap.get(a.name.toLowerCase()) ?? "—",
          address: a.address,
          uptime: a.uptime,
          uptime_min: upMin,
          bytes_total: bytes,
          bytes_in: Number(a.bytes_in ?? 0),
          bytes_out: Number(a.bytes_out ?? 0),
        };
      })
      .filter((x) => x.uptime_min >= minUptimeMin && x.bytes_total < minBytes)
      .sort((a, b) => b.uptime_min - a.uptime_min);

    return {
      total_active: res.active.length,
      duplicates,
      stalled,
      thresholds: { minBytes, minUptimeMin },
    };
  });

// ---------- Kick por nombre (todas las sesiones del usuario) ----------
export const kickPPPoEByUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string; user: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { mikrotik } = await import("./mikrotik.server");
    await mikrotik.kickPPPoESession(r as any, { user: data.user });
    return { ok: true };
  });


// ---------- Empuja secrets faltantes al router (DB → Router) ----------
export const pushMissingSecretsToRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string; serviceIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers").select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { data: svcs, error: sErr } = await context.supabase.from("services")
      .select("id, pppoe_user, pppoe_password, ip_address, client_id, plans(name, mikrotik_profile_name)")
      .in("id", data.serviceIds);
    if (sErr) throw new Error(sErr.message);

    const { mikrotik } = await import("./mikrotik.server");
    const results: { service_id: string; user: string; ok: boolean; error?: string }[] = [];
    for (const s of (svcs ?? []) as any[]) {
      if (!s.pppoe_user || !s.pppoe_password) {
        results.push({ service_id: s.id, user: s.pppoe_user ?? "?", ok: false, error: "sin credenciales PPPoE" });
        continue;
      }
      try {
        const profile = s.plans?.mikrotik_profile_name || s.plans?.name || "default";
        await mikrotik.createPPPoE(r as any, {
          user: s.pppoe_user, password: s.pppoe_password, profile, remoteIp: s.ip_address,
        });
        await context.supabase.from("client_actions").insert({
          client_id: s.client_id, service_id: s.id, action: "provision",
          detail: `Push manual al router (drift): secret ${s.pppoe_user}`, performed_by: context.userId,
        });
        results.push({ service_id: s.id, user: s.pppoe_user, ok: true });
      } catch (e) {
        results.push({ service_id: s.id, user: s.pppoe_user, ok: false, error: (e as Error).message });
      }
    }
    return { ok: true, results, pushed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
  });





// ---------- Autoasignación de IPv4 desde pool del router (estilo MikroWisp) ----------
function ipToInt(ip: string): number {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) throw new Error(`IP inválida: ${ip}`);
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}
function cidrRange(cidr: string): { first: number; last: number; network: number; broadcast: number } {
  const [ip, maskStr] = cidr.split("/");
  const mask = Number(maskStr);
  if (!ip || Number.isNaN(mask) || mask < 0 || mask > 32) throw new Error(`CIDR inválido: ${cidr}`);
  const base = ipToInt(ip);
  const maskBits = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
  const network = (base & maskBits) >>> 0;
  const broadcast = (network | (~maskBits >>> 0)) >>> 0;
  const first = mask >= 31 ? network : network + 1;
  const last = mask >= 31 ? broadcast : broadcast - 1;
  return { first, last, network, broadcast };
}

function parseRanges(input: string | null | undefined): Array<{ first: number; last: number }> {
  if (!input) return [];
  const out: Array<{ first: number; last: number }> = [];
  for (const raw of input.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    if (part.includes("-")) {
      const [a, b] = part.split("-").map((x) => x.trim());
      try { out.push({ first: ipToInt(a), last: ipToInt(b) }); } catch { /* skip */ }
    } else if (part.includes("/")) {
      try { const r = cidrRange(part); out.push({ first: r.first, last: r.last }); } catch { /* skip */ }
    } else {
      try { const n = ipToInt(part); out.push({ first: n, last: n }); } catch { /* skip */ }
    }
  }
  return out;
}

export const getNextAvailableIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string; poolId?: string; cidr?: string; scanRouter?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers")
      .select("id, name, client_pool_cidr, client_pool_gateway, ip_address, api_user, api_password, api_port, simulated, morosos_profile, walled_garden_ip")
      .eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");

    // Prioridad: CIDR directo (ej /24) -> pool específico -> pool default -> legacy client_pool_cidr
    let ranges: Array<{ first: number; last: number }> = [];
    let sourceLabel = "";
    let gwInt: number | null = null;

    if (data.cidr && data.cidr.trim()) {
      ranges = parseRanges(data.cidr.trim());
      sourceLabel = data.cidr.trim() + " (directo)";
      // Gateway heurístico: primera IP del rango
      if (ranges.length > 0) gwInt = ranges[0].first;
    } else {
      let pool: any = null;
      if (data.poolId) {
        const { data: p } = await context.supabase.from("router_ip_pools")
          .select("*").eq("id", data.poolId).single();
        pool = p;
      } else {
        const { data: p } = await context.supabase.from("router_ip_pools")
          .select("*").eq("router_id", data.routerId).eq("is_default", true).maybeSingle();
        pool = p;
      }
      if (pool) {
        if (pool.ranges) ranges = parseRanges(pool.ranges);
        else if (pool.cidr) ranges = parseRanges(pool.cidr);
        if (pool.gateway) { try { gwInt = ipToInt(pool.gateway); } catch { /* ignore */ } }
        sourceLabel = pool.cidr || pool.ranges || pool.name;
      } else if ((r as any).client_pool_cidr) {
        ranges = parseRanges((r as any).client_pool_cidr);
        if ((r as any).client_pool_gateway) { try { gwInt = ipToInt((r as any).client_pool_gateway); } catch { /* ignore */ } }
        sourceLabel = (r as any).client_pool_cidr;
      } else if ((r as any).ip_address) {
        // Fallback fácil tipo MikroWisp: usa la subred /24 del propio router
        try {
          const routerIp = String((r as any).ip_address).split("/")[0];
          const parts = routerIp.split(".");
          if (parts.length === 4) {
            const auto = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
            ranges = parseRanges(auto);
            gwInt = ipToInt(routerIp);
            sourceLabel = auto + " (auto)";
          }
        } catch { /* ignore */ }
        if (ranges.length === 0) return { ok: false as const, error: "Router sin IP válida para autodetectar subred" };
      } else {
        return { ok: false as const, error: "Router sin IP configurada" };
      }
    }
    if (ranges.length === 0) return { ok: false as const, error: "Rango sin IPs válidas" };


    const rtrInt = (r as any).ip_address ? (() => { try { return ipToInt(String((r as any).ip_address).split("/")[0]); } catch { return null; } })() : null;

    // Usadas en la BD
    const { data: used } = await context.supabase.from("services")
      .select("ip_address").eq("router_id", data.routerId).not("ip_address", "is", null);
    const usedSet = new Set<number>();
    for (const s of (used ?? []) as any[]) {
      try { usedSet.add(ipToInt(String(s.ip_address).split("/")[0])); } catch { /* ignore */ }
    }

    // Escanear IPs vivas en el Mikrotik (secrets + activos + pool/used)
    if (data.scanRouter !== false) {
      try {
        const { mikrotik } = await import("./mikrotik.server");
        const live = await mikrotik.listUsedIps(r as any);
        if ((live as any).ok) {
          for (const ip of (live as any).ips as string[]) {
            try { usedSet.add(ipToInt(ip)); } catch { /* ignore */ }
          }
        }
      } catch { /* si falla el router, seguimos con lo que hay en la BD */ }
    }

    for (const rg of ranges) {
      for (let n = rg.first; n <= rg.last; n++) {
        if (n === gwInt || n === rtrInt) continue;
        if (usedSet.has(n)) continue;
        return { ok: true as const, ip: intToIp(n), cidr: sourceLabel };
      }
    }
    return { ok: false as const, error: "Pool sin IPs disponibles" };
  });

// Importar pools desde Mikrotik (/ip/pool/print)
export const importRouterPools = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.from("routers")
      .select("*").eq("id", data.routerId).single();
    if (error || !r) throw new Error("Router no encontrado");
    const { mikrotik } = await import("./mikrotik.server");
    const res: any = await mikrotik.listIpPools(r as any);
    if (!res.ok) throw new Error(res.error || "No se pudieron leer los pools");
    const pools = res.pools as Array<{ name: string; ranges: string }>;
    let imported = 0, updated = 0;
    for (const p of pools) {
      // saltar los del sistema
      if (p.name === "sistema_cortados" || p.name.startsWith("dhcp_")) continue;
      const { data: existing } = await context.supabase.from("router_ip_pools")
        .select("id").eq("router_id", data.routerId).eq("name", p.name).maybeSingle();
      if (existing) {
        await context.supabase.from("router_ip_pools")
          .update({ ranges: p.ranges, source: "mikrotik" }).eq("id", existing.id);
        updated++;
      } else {
        await context.supabase.from("router_ip_pools")
          .insert({ router_id: data.routerId, name: p.name, ranges: p.ranges, source: "mikrotik" });
        imported++;
      }
    }
    // Si no hay default, marcar el primero como default
    const { data: hasDefault } = await context.supabase.from("router_ip_pools")
      .select("id").eq("router_id", data.routerId).eq("is_default", true).maybeSingle();
    if (!hasDefault) {
      const { data: first } = await context.supabase.from("router_ip_pools")
        .select("id").eq("router_id", data.routerId).order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (first) await context.supabase.from("router_ip_pools").update({ is_default: true }).eq("id", first.id);
    }
    return { ok: true as const, imported, updated, total: pools.length };
  });

export const listRouterPools = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { routerId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("router_ip_pools")
      .select("*").eq("router_id", data.routerId).order("is_default", { ascending: false }).order("name");
    if (error) throw new Error(error.message);
    return { ok: true as const, pools: rows ?? [] };
  });

export const upsertRouterPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; routerId: string; name: string; ranges?: string | null; cidr?: string | null; gateway?: string | null; is_default?: boolean }) => d)
  .handler(async ({ data, context }) => {
    if (data.is_default) {
      await context.supabase.from("router_ip_pools").update({ is_default: false }).eq("router_id", data.routerId);
    }
    if (data.id) {
      const { error } = await context.supabase.from("router_ip_pools").update({
        name: data.name, ranges: data.ranges ?? null, cidr: data.cidr ?? null,
        gateway: data.gateway ?? null, is_default: !!data.is_default,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true as const, id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("router_ip_pools").insert({
      router_id: data.routerId, name: data.name, ranges: data.ranges ?? null,
      cidr: data.cidr ?? null, gateway: data.gateway ?? null,
      is_default: !!data.is_default, source: "manual",
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: ins.id };
  });

export const deleteRouterPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("router_ip_pools").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// Devuelve el listado detallado de IPs del pool: usada por cliente / libre / gateway / router
export const poolIpUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poolId: string; scanRouter?: boolean; limit?: number }) => d)
  .handler(async ({ data, context }) => {
    const { data: pool, error: pe } = await context.supabase.from("router_ip_pools")
      .select("*").eq("id", data.poolId).single();
    if (pe || !pool) throw new Error("Pool no encontrado");

    const { data: r } = await context.supabase.from("routers")
      .select("id, name, ip_address, api_user, api_password, api_port, simulated, morosos_profile, walled_garden_ip, client_pool_cidr, client_pool_gateway")
      .eq("id", (pool as any).router_id).single();

    let ranges: Array<{ first: number; last: number }> = [];
    if ((pool as any).ranges) ranges = parseRanges((pool as any).ranges);
    else if ((pool as any).cidr) ranges = parseRanges((pool as any).cidr);
    if (ranges.length === 0) return { ok: true as const, ips: [], total: 0, used: 0, free: 0 };

    let gwInt: number | null = null;
    if ((pool as any).gateway) { try { gwInt = ipToInt((pool as any).gateway); } catch { /* ignore */ } }
    const rtrInt = (r as any)?.ip_address ? (() => { try { return ipToInt(String((r as any).ip_address).split("/")[0]); } catch { return null; } })() : null;

    // Clientes que ocupan IP en la BD
    const { data: used } = await context.supabase.from("services")
      .select("id, ip_address, client_id, clients(full_name, document)")
      .eq("router_id", (pool as any).router_id).not("ip_address", "is", null);
    const byIp = new Map<number, { clientName: string; document: string | null; serviceId: string }>();
    for (const s of (used ?? []) as any[]) {
      try {
        const n = ipToInt(String(s.ip_address).split("/")[0]);
        byIp.set(n, { clientName: s.clients?.full_name ?? "—", document: s.clients?.document ?? null, serviceId: s.id });
      } catch { /* ignore */ }
    }

    // Escaneo vivo del Mikrotik
    const liveSet = new Set<number>();
    if (data.scanRouter !== false && r) {
      try {
        const { mikrotik } = await import("./mikrotik.server");
        const live = await mikrotik.listUsedIps(r as any);
        if ((live as any).ok) {
          for (const ip of (live as any).ips as string[]) {
            try { liveSet.add(ipToInt(ip)); } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }

    const limit = data.limit ?? 512;
    const ips: Array<{ ip: string; status: "gateway" | "router" | "used" | "live" | "free"; clientName?: string; document?: string | null; serviceId?: string }> = [];
    let total = 0, usedCount = 0, freeCount = 0;
    outer: for (const rg of ranges) {
      for (let n = rg.first; n <= rg.last; n++) {
        total++;
        const ipStr = intToIp(n);
        if (n === gwInt) { ips.push({ ip: ipStr, status: "gateway" }); continue; }
        if (n === rtrInt) { ips.push({ ip: ipStr, status: "router" }); continue; }
        const owner = byIp.get(n);
        if (owner) {
          usedCount++;
          ips.push({ ip: ipStr, status: "used", clientName: owner.clientName, document: owner.document, serviceId: owner.serviceId });
        } else if (liveSet.has(n)) {
          usedCount++;
          ips.push({ ip: ipStr, status: "live" });
        } else {
          freeCount++;
          ips.push({ ip: ipStr, status: "free" });
        }
        if (ips.length >= limit) break outer;
      }
    }
    return { ok: true as const, ips, total, used: usedCount, free: freeCount, truncated: total > ips.length };
  });



// ---------- Eliminar cliente + limpiar Mikrotik ----------
export const deleteClientCascade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string }) => d)
  .handler(async ({ data, context }) => {
    const results: { router: string; user: string; ok: boolean; error?: string }[] = [];

    // 1. Traer todos los servicios del cliente con su router
    const { data: services, error: sErr } = await context.supabase
      .from("services")
      .select("id, pppoe_user, service_type, ip_address, queue_target, hotspot_user, router_id, routers(*)")
      .eq("client_id", data.clientId);
    if (sErr) throw new Error(sErr.message);

    // 2. Por cada servicio, remover del Mikrotik
    if (services && services.length > 0) {
      const { mikrotik } = await import("./mikrotik.server");
      for (const svc of services as any[]) {
        const router = svc.routers;
        if (!router) continue;
        try {
          // Quitar de address-list de corte (por si estaba suspendido)
          const ip = svc.ip_address || svc.queue_target;
          if (ip) {
            try {
              await mikrotik.removeFromCutoffList(router, {
                ip,
                listName: router.morosos_profile || "sistema_cortados",
              });
            } catch { /* ignore */ }
          }
          // Kick sesión activa y remover PPPoE
          if (svc.pppoe_user) {
            try { await mikrotik.kickPPPoESession?.(router, { user: svc.pppoe_user }); } catch { /* ignore */ }
            await mikrotik.removePPPoE(router, { user: svc.pppoe_user });
            results.push({ router: router.name, user: svc.pppoe_user, ok: true });
          } else if (svc.service_type === "hotspot" && svc.hotspot_user) {
            try { await (mikrotik as any).removeHotspotUser?.(router, { user: svc.hotspot_user }); } catch { /* ignore */ }
            results.push({ router: router.name, user: svc.hotspot_user, ok: true });
          } else if (svc.service_type === "queue") {
            try { await (mikrotik as any).removeQueue?.(router, { name: `svc-${svc.id}` }); } catch { /* ignore */ }
            results.push({ router: router.name, user: `svc-${svc.id}`, ok: true });
          }
        } catch (e) {
          results.push({
            router: router.name,
            user: svc.pppoe_user || svc.hotspot_user || svc.id,
            ok: false,
            error: (e as Error).message,
          });
        }
      }
    }

    // 3. Eliminar de la base con admin (bypass RLS) para asegurar borrado inmediato
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Limpiar dependencias sin ON DELETE CASCADE
    await supabaseAdmin.from("tickets").delete().eq("client_id", data.clientId);
    await supabaseAdmin.from("work_orders").delete().eq("client_id", data.clientId);
    await supabaseAdmin.from("inventory_serials").update({ assigned_client_id: null }).eq("assigned_client_id", data.clientId);
    await supabaseAdmin.from("leads").update({ converted_client_id: null }).eq("converted_client_id", data.clientId);
    const { error: dErr } = await supabaseAdmin.from("clients").delete().eq("id", data.clientId);
    if (dErr) throw new Error(dErr.message);

    return { ok: true, mikrotik: results };
  });
