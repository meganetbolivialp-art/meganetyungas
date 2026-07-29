import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/detect-cutoff-leaks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth: secreto privado (CRON_SECRET)
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
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { runLeakDetection } = await import("@/lib/cutoff-monitor.server");
          const result = await runLeakDetection();
          return Response.json(result);
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
