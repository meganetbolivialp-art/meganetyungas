import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/detect-cutoff-leaks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace("Bearer ", "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!auth || !expected || auth !== expected) {
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
