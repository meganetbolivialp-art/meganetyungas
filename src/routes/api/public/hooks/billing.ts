import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/billing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        const expected = process.env.CRON_SECRET ?? "";
        const enc = new TextEncoder();
        const a = enc.encode(provided);
        const b = enc.encode(expected);
        let ok = expected.length > 0 && a.length === b.length;
        if (ok) { let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; ok = diff === 0; }
        if (!ok) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { mikrotik } = await import("@/lib/mikrotik.server");

        const startedAt = Date.now();
        const { data: runIns } = await supabaseAdmin
          .from("job_runs")
          .insert({ job_name: "daily-billing-and-cutoffs", status: "running" })
          .select("id")
          .single();
        const runId = runIns?.id;

        const finish = async (status: string, detail: any, error?: string) => {
          if (!runId) return;
          await supabaseAdmin.from("job_runs").update({
            status,
            finished_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
            detail,
            error: error ?? null,
          }).eq("id", runId);
        };

        try {
          // 1. Facturas del mes
          const { data: created, error: e1 } = await supabaseAdmin.rpc("generate_monthly_invoices", {});
          if (e1) throw new Error(`generate_monthly_invoices: ${e1.message}`);

          // 1b. Expirar promesas de pago vencidas
          const { data: promisesExpired } = await supabaseAdmin.rpc("expire_payment_promises");

          // 1c. Ejecutar cortes programados vencidos
          const nowIso = new Date().toISOString();
          const { data: dueSched } = await supabaseAdmin
            .from("services")
            .select("id")
            .not("scheduled_suspend_at", "is", null)
            .lte("scheduled_suspend_at", nowIso)
            .eq("status", "active");
          if (dueSched && dueSched.length > 0) {
            const ids = dueSched.map((s: any) => s.id);
            await supabaseAdmin
              .from("services")
              .update({
                status: "suspended",
                suspended_at: nowIso,
                scheduled_suspend_at: null,
                suspend_reason: "Corte programado ejecutado",
              })
              .in("id", ids);
          }
          const scheduledExecuted = dueSched?.length ?? 0;

          // 2. Marcar vencidas + suspender morosos (respeta dont_cut/promise/override)
          const { data: overdue, error: e2 } = await supabaseAdmin.rpc("mark_overdue_invoices", { p_grace_days: 5 });
          if (e2) throw new Error(`mark_overdue_invoices: ${e2.message}`);


          // 3. Push al Mikrotik con reintentos
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: recent } = await supabaseAdmin
            .from("services")
            .select("id, client_id, service_type, pppoe_user, hotspot_user, ip_address, queue_target, routers(*)")
            .eq("status", "suspended")
            .gte("suspended_at", since);

          const pushed: { service: string; ok: boolean; error?: string; attempts: number }[] = [];
          for (const svc of (recent ?? [])) {
            const router = (svc as any).routers;
            if (!router) { pushed.push({ service: svc.id, ok: false, error: "sin router", attempts: 0 }); continue; }
            let lastErr = "";
            let ok = false;
            let attempts = 0;
            for (attempts = 1; attempts <= 3 && !ok; attempts++) {
              try {
                if (svc.service_type === "pppoe" && (svc as any).pppoe_user) {
                  const listName = router.morosos_profile ?? "sistema_cortados";
                  let ipForList = (svc as any).ip_address || (svc as any).queue_target;
                  if (!ipForList) {
                    const live = await mikrotik.getUserLive(router, { user: (svc as any).pppoe_user });
                    ipForList = (live.active as any)?.address || (live.secret as any)?.["remote-address"] || null;
                  }
                  if (!ipForList) throw new Error("servicio sin IP ni sesión PPPoE activa");
                  await mikrotik.ensureCutoffRules(router, { listName, noticeIp: router.walled_garden_ip });
                  await mikrotik.addToCutoffList(router, { ip: ipForList, listName, comment: `svc-${svc.id}` });
                } else if (svc.service_type === "queue") {
                  await mikrotik.setQueueDisabled(router, { name: `svc-${svc.id}`, disabled: true });
                } else if (svc.service_type === "hotspot" && (svc as any).hotspot_user) {
                  await mikrotik.setHotspotUserDisabled(router, { user: (svc as any).hotspot_user, disabled: true });
                }
                ok = true;
              } catch (e) {
                lastErr = (e as Error).message;
                if (attempts < 3) await new Promise(r => setTimeout(r, 500 * attempts));
              }
            }
            if (ok) {
              await supabaseAdmin.from("client_actions").insert({
                service_id: svc.id, client_id: (svc as any).client_id, action: "suspend",
                detail: `Corte automático (intento ${attempts - 1})`,
              });
              pushed.push({ service: svc.id, ok: true, attempts: attempts - 1 });
            } else {
              pushed.push({ service: svc.id, ok: false, error: lastErr, attempts: attempts - 1 });
            }
          }

          const failedCount = pushed.filter(p => !p.ok).length;
          const detail = { invoicesCreated: created, ...(overdue as object), scheduledExecuted, promisesExpired, pushed, failedCount };
          await finish(failedCount > 0 ? "partial" : "success", detail);
          return Response.json({ ok: true, ...detail });

        } catch (e) {
          const msg = (e as Error).message;
          await finish("failed", null, msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
