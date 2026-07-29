import { createFileRoute } from "@tanstack/react-router";

// Push frecuente hacia Mikrotik: aplica cortes y reactivaciones pendientes.
// Corre cada pocos minutos vía pg_cron para que el cambio se vea casi en tiempo real.
export const Route = createFileRoute("/api/public/hooks/sync-mikrotik")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth: secreto privado (CRON_SECRET), no la publishable key
        const provided = request.headers.get("x-cron-secret")
          ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
          ?? "";
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
          .insert({ job_name: "sync-mikrotik", status: "running" })
          .select("id")
          .single();
        const runId = runIns?.id;

        const finish = async (status: string, detail: any, error?: string) => {
          if (!runId) return;
          await supabaseAdmin.from("job_runs").update({
            status, finished_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt, detail, error: error ?? null,
          }).eq("id", runId);
        };

        try {
          // A) Ejecutar cortes programados vencidos
          const nowIso = new Date().toISOString();
          const { data: dueSched } = await supabaseAdmin
            .from("services").select("id")
            .not("scheduled_suspend_at", "is", null)
            .lte("scheduled_suspend_at", nowIso)
            .eq("status", "active");
          if (dueSched && dueSched.length > 0) {
            await supabaseAdmin.from("services").update({
              status: "suspended", suspended_at: nowIso,
              scheduled_suspend_at: null, suspend_reason: "Corte programado ejecutado",
            }).in("id", dueSched.map((s: any) => s.id));
          }

          // B) Expirar promesas de pago vencidas
          await supabaseAdmin.rpc("expire_payment_promises");

          // C) Marcar vencidas y suspender morosos
          await supabaseAdmin.rpc("mark_overdue_invoices", { p_grace_days: 5 });

          // C1) Siempre refrescar reglas del portal cautivo.
          // Aunque no haya cortes nuevos, esto limpia reglas viejas que bloqueaban el pop-up.
          const { data: portalRouters } = await supabaseAdmin
            .from("routers")
            .select("*")
            .eq("simulated", false)
            .not("walled_garden_ip", "is", null);
          const portalRules: any[] = [];
          for (const router of (portalRouters ?? []) as any[]) {
            try {
              const listName = router.morosos_profile ?? "sistema_cortados";
              await mikrotik.ensureCutoffRules(router, { listName, noticeIp: router.walled_garden_ip });
              portalRules.push({ router: router.name, ok: true });
            } catch (e) {
              portalRules.push({ router: router.name, ok: false, error: (e as Error).message });
            }
          }

          // D) Push de suspensiones pendientes (últimas 24h sin sync exitoso)
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: suspendedSvcs } = await supabaseAdmin
            .from("services")
            .select("id, client_id, service_type, pppoe_user, hotspot_user, ip_address, queue_target, mikrotik_synced_at, routers(*)")
            .eq("status", "suspended")
            .gte("suspended_at", since);

          const suspendPushed: any[] = [];
          for (const svc of (suspendedSvcs ?? [])) {
            if ((svc as any).mikrotik_synced_at) continue;
            const router = (svc as any).routers;
            if (!router) { suspendPushed.push({ id: svc.id, ok: false, error: "sin router" }); continue; }
            try {
              const listName = router.morosos_profile ?? "sistema_cortados";
              let ip = (svc as any).ip_address || (svc as any).queue_target;
              if (!ip && svc.service_type === "pppoe" && (svc as any).pppoe_user) {
                const live = await mikrotik.getUserLive(router, { user: (svc as any).pppoe_user });
                ip = (live.active as any)?.address || (live.secret as any)?.["remote-address"] || null;
              }
              if (svc.service_type === "pppoe" && ip) {
                await mikrotik.ensureCutoffRules(router, { listName, noticeIp: router.walled_garden_ip });
                await mikrotik.addToCutoffList(router, { ip, listName, comment: `svc-${svc.id}` });
              } else if (svc.service_type === "queue") {
                await mikrotik.setQueueDisabled(router, { name: `svc-${svc.id}`, disabled: true });
              } else if (svc.service_type === "hotspot" && (svc as any).hotspot_user) {
                await mikrotik.setHotspotUserDisabled(router, { user: (svc as any).hotspot_user, disabled: true });
              }
              await supabaseAdmin.from("services").update({ mikrotik_synced_at: new Date().toISOString() }).eq("id", svc.id);
              suspendPushed.push({ id: svc.id, ok: true });
            } catch (e) {
              suspendPushed.push({ id: svc.id, ok: false, error: (e as Error).message });
            }
          }

          // E) Push de reactivaciones pendientes (servicios activos con IP aún en la lista de cortados)
          const { data: activeRecent } = await supabaseAdmin
            .from("services")
            .select("id, client_id, service_type, pppoe_user, hotspot_user, ip_address, queue_target, routers(*)")
            .eq("status", "active")
            .not("mikrotik_synced_at", "is", null);

          const reactPushed: any[] = [];
          for (const svc of (activeRecent ?? [])) {
            const router = (svc as any).routers;
            if (!router) continue;
            try {
              const listName = router.morosos_profile ?? "sistema_cortados";
              const ip = (svc as any).ip_address || (svc as any).queue_target;
              if (svc.service_type === "pppoe" && ip) {
                await mikrotik.removeFromCutoffList(router, { ip, listName });
                if ((svc as any).pppoe_user) {
                  try { await mikrotik.kickPPPoESession(router, { user: (svc as any).pppoe_user }); } catch {}
                }
              } else if (svc.service_type === "queue") {
                await mikrotik.setQueueDisabled(router, { name: `svc-${svc.id}`, disabled: false });
              } else if (svc.service_type === "hotspot" && (svc as any).hotspot_user) {
                await mikrotik.setHotspotUserDisabled(router, { user: (svc as any).hotspot_user, disabled: false });
              }
              await supabaseAdmin.from("services").update({ mikrotik_synced_at: null }).eq("id", svc.id);
              reactPushed.push({ id: svc.id, ok: true });
            } catch (e) {
              reactPushed.push({ id: svc.id, ok: false, error: (e as Error).message });
            }
          }

          const detail = { portalRules, suspendPushed, reactPushed };
          await finish("success", detail);
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
