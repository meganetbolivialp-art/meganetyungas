import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin-layout";
import { Toolbar, Badge, inputCls } from "@/components/ui-kit";
import { RefreshCw, Download, CheckCircle2, AlertCircle, ArrowUpFromLine, Wand2, ShieldAlert, Zap, PowerOff } from "lucide-react";
import { importOrphanSecrets, importRouterProfiles, getRouterDrift, pushMissingSecretsToRouter, updateRouterProfilesForServices, detectPppoeAnomalies, kickPPPoEByUser, listRouterImportPreview } from "@/lib/isp.functions";


export const Route = createFileRoute("/dashboard/router-sync")({
  head: () => ({
    meta: [
      { title: "Sincronización con router — MikroSystem ISP" },
      { name: "description", content: "Detectar PPP secrets en Mikrotik que no están en la base de datos e importarlos." },
      { property: "og:title", content: "Sincronización router → DB" },
      { property: "og:description", content: "Sync bidireccional Mikrotik." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouterSyncPage,
});

function RouterSyncPage() {
  const importFn = useServerFn(importOrphanSecrets);
  const listImportPreviewFn = useServerFn(listRouterImportPreview);
  const importProfilesFn = useServerFn(importRouterProfiles);
  const driftFn = useServerFn(getRouterDrift);
  const pushFn = useServerFn(pushMissingSecretsToRouter);
  const updateProfilesFn = useServerFn(updateRouterProfilesForServices);
  const anomaliesFn = useServerFn(detectPppoeAnomalies);
  const kickFn = useServerFn(kickPPPoEByUser);
  const [routers, setRouters] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [routerId, setRouterId] = useState("");
  const [planId, setPlanId] = useState("");
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ secrets: any[]; dbCount: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [profResult, setProfResult] = useState<{ profiles: any[] } | null>(null);
  const [profSelected, setProfSelected] = useState<Set<string>>(new Set());
  const [profLoading, setProfLoading] = useState(false);
  const [profImporting, setProfImporting] = useState(false);
  const [profPrice, setProfPrice] = useState<number>(0);
  const [profPrices, setProfPrices] = useState<Record<string, number>>({});
  const [profMsg, setProfMsg] = useState("");
  const [drift, setDrift] = useState<any>(null);
  const [pushSel, setPushSel] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);
  const [driftMsg, setDriftMsg] = useState("");
  const [profSyncSel, setProfSyncSel] = useState<Set<string>>(new Set());
  const [syncingProfiles, setSyncingProfiles] = useState(false);
  const [anomalies, setAnomalies] = useState<any>(null);
  const [anomMsg, setAnomMsg] = useState("");
  const [kicking, setKicking] = useState<string | null>(null);
  const [tab, setTab] = useState<"resumen" | "diferencias" | "anomalias" | "planes" | "clientes" | "todos">("resumen");



  const reloadPlans = async () => {
    const p = await supabase.from("plans").select("id, name, price").eq("active", true).order("price");
    setPlans(p.data ?? []);
  };

  useEffect(() => {
    (async () => {
      const [r, p, c] = await Promise.all([
        supabase.from("routers").select("id, name, ip_address, simulated").order("name"),
        supabase.from("plans").select("id, name, price").eq("active", true).order("price"),
        supabase.from("clients").select("id, full_name").order("full_name").limit(500),
      ]);
      setRouters(r.data ?? []); setPlans(p.data ?? []); setClients(c.data ?? []);
    })();
  }, []);


  const scan = async () => {
    if (!routerId) return;
    setLoading(true); setResult(null); setSelected(new Set()); setMsg("");
    setProfResult(null); setProfSelected(new Set()); setProfMsg("");
    setDrift(null); setPushSel(new Set()); setDriftMsg("");
    setProfSyncSel(new Set()); setAnomalies(null); setAnomMsg("");
    try {
      const preview = await listImportPreviewFn({ data: { routerId } }) as any;
      const r = { secrets: preview.secrets, dbCount: preview.dbCount };
      const pr = { profiles: preview.profiles };
      setResult(r as any);
      const auto = new Set<string>((r as any).secrets.filter((s: any) => !s.in_db).map((s: any) => s.name));
      setSelected(auto);
      setProfResult(pr as any);
      const autoP = new Set<string>((pr as any).profiles.filter((p: any) => !p.in_db && !p.is_system && (p.download_mbps > 0 || p.upload_mbps > 0)).map((p: any) => p.name));
      setProfSelected(autoP);
      const prices: Record<string, number> = {};
      (pr as any).profiles.forEach((p: any) => { prices[p.name] = 0; });
      setProfPrices(prices);
      const [dr, an] = await Promise.allSettled([
        driftFn({ data: { routerId } }),
        anomaliesFn({ data: { routerId } }),
      ]);
      if (dr.status === "fulfilled") {
        setDrift(dr.value as any);
        const autoPush = new Set<string>(((dr.value as any).missingOnRouter ?? []).map((m: any) => m.service_id));
        setPushSel(autoPush);
        const autoSync = new Set<string>(((dr.value as any).profileMismatch ?? []).map((m: any) => m.service_id));
        setProfSyncSel(autoSync);
      }
      if (an.status === "fulfilled") setAnomalies(an.value);
    } catch (e: any) {
      const router = routers.find((r) => r.id === routerId);
      setMsg(readableRouterError(e, router));
    } finally { setLoading(false); }
  };

  const toggleProfSync = (id: string) => {
    const s = new Set(profSyncSel); s.has(id) ? s.delete(id) : s.add(id); setProfSyncSel(s);
  };
  const doSyncProfiles = async () => {
    if (profSyncSel.size === 0) { setDriftMsg("Elegí al menos un servicio"); return; }
    setSyncingProfiles(true); setDriftMsg("");
    try {
      const res: any = await updateProfilesFn({ data: { routerId, serviceIds: Array.from(profSyncSel) } });
      setDriftMsg(`✓ Perfiles actualizados ${res.updated}/${res.updated + res.failed}`);
      await scan();
    } catch (e: any) { setDriftMsg("Error: " + e.message); } finally { setSyncingProfiles(false); }
  };

  const doKick = async (user: string) => {
    setKicking(user); setAnomMsg("");
    try {
      await kickFn({ data: { routerId, user } });
      setAnomMsg(`✓ Sesión de ${user} desconectada`);
      const an = await anomaliesFn({ data: { routerId } });
      setAnomalies(an);
    } catch (e: any) { setAnomMsg("Error: " + e.message); } finally { setKicking(null); }
  };

  const refreshAnomalies = async () => {
    if (!routerId) return;
    setAnomMsg("");
    try {
      const an = await anomaliesFn({ data: { routerId } });
      setAnomalies(an);
    } catch (e: any) { setAnomMsg("Error: " + e.message); }
  };



  const togglePush = (id: string) => {
    const s = new Set(pushSel); s.has(id) ? s.delete(id) : s.add(id); setPushSel(s);
  };

  const doPush = async () => {
    if (pushSel.size === 0) { setDriftMsg("Elegí al menos un servicio"); return; }
    setPushing(true); setDriftMsg("");
    try {
      const res: any = await pushFn({ data: { routerId, serviceIds: Array.from(pushSel) } });
      const parts = [`✓ Empujados ${res.pushed}/${res.pushed + res.failed}`];
      if (res.failed > 0) {
        const firstErrs = res.results.filter((r: any) => !r.ok).slice(0, 3).map((r: any) => `${r.user} (${r.error})`);
        parts.push(`· ${res.failed} con error: ${firstErrs.join(", ")}`);
      }
      setDriftMsg(parts.join(" "));
      await scan();
    } catch (e: any) { setDriftMsg("Error: " + e.message); } finally { setPushing(false); }
  };


  const toggle = (name: string) => {
    const s = new Set(selected); s.has(name) ? s.delete(name) : s.add(name); setSelected(s);
  };

  const toggleProf = (name: string) => {
    const s = new Set(profSelected); s.has(name) ? s.delete(name) : s.add(name); setProfSelected(s);
  };

  const doImport = async () => {
    if (selected.size === 0) { setMsg("Elegí al menos un secret"); return; }
    setImporting(true); setMsg("");
    try {
      const secrets = (result?.secrets ?? []).filter((s: any) => selected.has(s.name));
      const res: any = await importFn({ data: { routerId, planId: planId || null, clientId: clientId || null, secrets } });

      const parts = [`✓ Importados ${res.created}/${res.total}`];
      if (res.skipped?.length) parts.push(`· ${res.skipped.length} ya existían`);
      if (res.errors?.length) parts.push(`· ${res.errors.length} con error: ${res.errors.slice(0,3).map((e: any) => `${e.name} (${e.error})`).join(", ")}`);
      setMsg(parts.join(" "));
      await scan();
    } catch (e: any) { setMsg("Error: " + e.message); } finally { setImporting(false); }
  };

  const doImportProfiles = async () => {
    if (profSelected.size === 0) { setProfMsg("Elegí al menos un perfil"); return; }
    setProfImporting(true); setProfMsg("");
    try {
      const profiles = (profResult?.profiles ?? [])
        .filter((p: any) => profSelected.has(p.name))
        .map((p: any) => ({ ...p, price: profPrices[p.name] ?? profPrice ?? 0 }));
      const res: any = await importProfilesFn({ data: { profiles, defaultPrice: profPrice || 0 } });
      const parts = [`✓ Planes creados ${res.created}/${res.total}`];
      if (res.skipped?.length) parts.push(`· ${res.skipped.length} ya existían`);
      if (res.errors?.length) parts.push(`· ${res.errors.length} con error: ${res.errors.slice(0,3).map((e: any) => `${e.name} (${e.error})`).join(", ")}`);
      setProfMsg(parts.join(" "));
      await reloadPlans();
      await scan();
    } catch (e: any) { setProfMsg("Error: " + e.message); } finally { setProfImporting(false); }
  };

  // ==== IMPORTACIÓN FÁCIL (1 CLIC) ====
  const [easyPrice, setEasyPrice] = useState<number>(0);
  const [easyRunning, setEasyRunning] = useState(false);
  const [easyMsg, setEasyMsg] = useState("");
  const [easyStep, setEasyStep] = useState<string>("");
  const doEasyImportAll = async () => {
    if (!routerId) return;
    setEasyRunning(true); setEasyMsg(""); setEasyStep("");
    try {
      // 1) Importar planes nuevos con precio base
      const newProfs = (profResult?.profiles ?? []).filter((p: any) => !p.in_db && !p.is_system && (p.download_mbps > 0 || p.upload_mbps > 0));
      let planCreated = 0;
      if (newProfs.length > 0) {
        setEasyStep(`Creando ${newProfs.length} plan(es)…`);
        const profiles = newProfs.map((p: any) => ({ ...p, price: easyPrice || 0 }));
        const res: any = await importProfilesFn({ data: { profiles, defaultPrice: easyPrice || 0 } });
        planCreated = res.created ?? 0;
        await reloadPlans();
      }
      // 2) Importar todos los secrets huérfanos (auto-match por perfil)
      const orphList = (result?.secrets ?? []).filter((s: any) => !s.in_db);
      let cliCreated = 0;
      if (orphList.length > 0) {
        setEasyStep(`Importando ${orphList.length} cliente(s)…`);
        const res: any = await importFn({ data: { routerId, planId: null, clientId: null, secrets: orphList } });
        cliCreated = res.created ?? 0;
      }
      setEasyStep("");
      setEasyMsg(`✓ Listo — ${planCreated} plan(es) creados · ${cliCreated} cliente(s) importados`);
      await scan();
    } catch (e: any) {
      setEasyStep("");
      setEasyMsg("Error: " + e.message);
    } finally { setEasyRunning(false); }
  };


  const orphans = (result?.secrets ?? []).filter((s: any) => !s.in_db);
  const linked = (result?.secrets ?? []).filter((s: any) => s.in_db);
  const profOrphans = (profResult?.profiles ?? []).filter((p: any) => !p.in_db && !p.is_system);


  return (
    <AdminLayout>
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0891b2 100%)",
        padding: "18px 20px", borderRadius: 14, marginBottom: 14, color: "#fff",
        boxShadow: "0 8px 24px -8px rgba(8,145,178,0.4)",
      }}>
        <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
          Sincronización router ↔ sistema
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }}>Traer clientes y planes del MikroTik</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          Elegí un router, escaneá, y el sistema te muestra qué clientes están registrados, cuáles faltan traer y cuáles están conectados sin usar internet.
        </div>
      </div>

      <div style={{ background: "#fff", padding: 14, borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Router MikroTik</label>
            <select className={inputCls} value={routerId} onChange={(e) => setRouterId(e.target.value)}>
              <option value="">— Elegí router —</option>
              {routers.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.ip_address}{r.simulated ? " (sim)" : ""}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn primary" disabled={!routerId || loading} onClick={scan}>
              <RefreshCw size={14} className={loading ? "spin" : ""} /> {loading ? "Escaneando router…" : "Escanear router"}
            </button>
          </div>
        </div>
      </div>

      {msg && !result && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: 14, borderRadius: 10, marginBottom: 12, color: "#991b1b", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={18} /> {msg}
        </div>
      )}

      {result && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
          <StatCard color="#3b82f6" label="Clientes en el router" value={result.secrets.length} />
          <StatCard color="#10b981" label="Ya registrados en el sistema" value={linked.length} icon={<CheckCircle2 size={16} />} />
          <StatCard color="#f59e0b" label="Falta traer al sistema" value={orphans.length} icon={<AlertCircle size={16} />} />
        </div>
      )}

      {result && (orphans.length > 0 || profOrphans.length > 0) && (
        <div style={{
          background: "linear-gradient(135deg, #0891b2 0%, #0e7490 100%)",
          padding: 18, borderRadius: 12, marginBottom: 12, color: "#fff",
          boxShadow: "0 4px 12px rgba(8,145,178,0.25)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Zap size={22} />
            <div style={{ fontSize: 18, fontWeight: 800 }}>Importación fácil · 1 clic</div>
          </div>
          <div style={{ fontSize: 13, opacity: 0.95, marginBottom: 14, lineHeight: 1.5 }}>
            El sistema va a crear automáticamente:
            <ul style={{ margin: "6px 0 0 20px", padding: 0 }}>
              {profOrphans.length > 0 && <li><b>{profOrphans.length} plan(es) nuevo(s)</b> con el precio base que elijas abajo.</li>}
              {orphans.length > 0 && <li><b>{orphans.length} cliente(s)</b> nuevos, cada uno vinculado a su plan por el nombre del perfil PPPoE.</li>}
              <li>No se toca nada del router — solo se copia a la base de datos.</li>
            </ul>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {profOrphans.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.15)", padding: "6px 12px", borderRadius: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Precio base por plan (Bs)</label>
                <input
                  type="number" min={0}
                  value={easyPrice}
                  onChange={(e) => setEasyPrice(parseFloat(e.target.value) || 0)}
                  style={{ width: 90, padding: "6px 10px", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, color: "#0f172a" }}
                />
              </div>
            )}
            <button
              onClick={doEasyImportAll}
              disabled={easyRunning}
              style={{
                background: "#fff", color: "#0e7490", border: "none",
                padding: "10px 20px", borderRadius: 8, fontWeight: 800, fontSize: 14,
                cursor: easyRunning ? "wait" : "pointer",
                display: "flex", alignItems: "center", gap: 8,
                boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              }}
            >
              <Download size={16} />
              {easyRunning ? (easyStep || "Importando…") : `Importar todo (${profOrphans.length} planes + ${orphans.length} clientes)`}
            </button>
            {easyMsg && (
              <div style={{ fontSize: 13, fontWeight: 600, color: easyMsg.startsWith("✓") ? "#a7f3d0" : "#fecaca" }}>
                {easyMsg}
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 10 }}>
            ¿Necesitás afinar precios o elegir qué traer? Usá las pestañas de abajo (<b>Planes por traer</b> y <b>Clientes por traer</b>).
          </div>
        </div>
      )}

      {result && orphans.length === 0 && profOrphans.length === 0 && (
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", padding: 14, borderRadius: 10, marginBottom: 12, color: "#065f46", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={18} /> Todo está sincronizado — no hay planes ni clientes por importar.
        </div>
      )}


      {(result || drift || anomalies) && (
        <WizardSteps result={result} drift={drift} anomalies={anomalies} profOrphans={profOrphans} />
      )}

      {(result || drift || anomalies || profResult) && (() => {
        const driftCount = (drift?.missingOnRouter.length ?? 0) + (drift?.statusMismatch.length ?? 0) + (drift?.profileMismatch?.length ?? 0);
        const anomCount = (anomalies?.duplicates.length ?? 0) + (anomalies?.stalled.length ?? 0);
        const tabs: { id: typeof tab; label: string; count?: number; tone?: "warn" | "danger" }[] = [
          { id: "resumen", label: "Resumen" },
          { id: "diferencias", label: "Diferencias sistema ↔ router", count: driftCount, tone: driftCount ? "warn" : undefined },
          { id: "anomalias", label: "Conectados sin usar internet", count: anomCount, tone: anomCount ? "danger" : undefined },
          { id: "planes", label: "Planes por traer", count: profOrphans.length, tone: profOrphans.length ? "warn" : undefined },
          { id: "clientes", label: "Clientes por traer", count: orphans.length, tone: orphans.length ? "warn" : undefined },
          { id: "todos", label: "Todos los clientes del router", count: result?.secrets.length ?? 0 },
        ];
        return (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12, borderBottom: "1px solid #e5e7eb", paddingBottom: 0 }}>
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    border: "none",
                    background: active ? "#fff" : "transparent",
                    borderTop: active ? "2px solid #0891b2" : "2px solid transparent",
                    borderLeft: active ? "1px solid #e5e7eb" : "1px solid transparent",
                    borderRight: active ? "1px solid #e5e7eb" : "1px solid transparent",
                    borderBottom: active ? "1px solid #fff" : "none",
                    marginBottom: -1,
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    color: active ? "#0f172a" : "#64748b",
                    cursor: "pointer",
                    borderRadius: "8px 8px 0 0",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {t.label}
                  {typeof t.count === "number" && t.count > 0 && (
                    <span style={{
                      background: t.tone === "danger" ? "#fecaca" : t.tone === "warn" ? "#fef3c7" : "#e0f2fe",
                      color: t.tone === "danger" ? "#991b1b" : t.tone === "warn" ? "#92400e" : "#075985",
                      fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999,
                    }}>{t.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}


      {tab === "diferencias" && drift && (drift.missingOnRouter.length > 0 || drift.statusMismatch.length > 0 || (drift.profileMismatch?.length ?? 0) > 0) && (
        <div style={{ background: "#fff", padding: 14, borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>⚠ Diferencias sistema ↔ router</span>
            {drift.missingOnRouter.length > 0 && (
              <button className="btn primary" onClick={doPush} disabled={pushing || pushSel.size === 0}>
                <ArrowUpFromLine size={14} /> {pushing ? "Subiendo al router…" : `Subir ${pushSel.size} cliente(s) al router`}
              </button>
            )}
          </div>
          {driftMsg && <div style={{ marginBottom: 8, fontSize: 13, color: driftMsg.startsWith("✓") ? "#059669" : "#dc2626" }}>{driftMsg}</div>}

          {drift.missingOnRouter.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "#64748b", margin: "6px 0" }}>
                <b>{drift.missingOnRouter.length}</b> servicio(s) en la base que <b>faltan crear en el router</b>:
              </div>
              <table className="tbl" style={{ marginBottom: 12 }}>
                <thead><tr><th style={{ width: 30 }}></th><th>PPPoE</th><th>Cliente</th><th>Perfil destino</th><th>IP</th><th>Estado</th></tr></thead>
                <tbody>
                  {drift.missingOnRouter.map((m: any) => (
                    <tr key={m.service_id} style={{ background: "#fef3c7" }}>
                      <td><input type="checkbox" checked={pushSel.has(m.service_id)} onChange={() => togglePush(m.service_id)} /></td>
                      <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{m.pppoe_user}</td>
                      <td>{m.client}</td>
                      <td style={{ fontFamily: "monospace" }}>{m.profile}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{m.ip || "—"}</td>
                      <td><Badge tone={m.status === "active" ? "success" : "warning"}>{m.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {drift.statusMismatch.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "#64748b", margin: "6px 0" }}>
                <b>{drift.statusMismatch.length}</b> servicio(s) con <b>estado desalineado</b> (habilitado en uno pero no en el otro):
              </div>
              <table className="tbl">
                <thead><tr><th>PPPoE</th><th>Cliente</th><th>DB</th><th>Router</th></tr></thead>
                <tbody>
                  {drift.statusMismatch.map((m: any) => (
                    <tr key={m.service_id}>
                      <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{m.pppoe_user}</td>
                      <td>{m.client}</td>
                      <td><Badge tone={m.db_status === "active" ? "success" : "warning"}>{m.db_status}</Badge></td>
                      <td><Badge tone={m.router_disabled ? "danger" : "success"}>{m.router_disabled ? "disabled" : "enabled"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {(drift.profileMismatch?.length ?? 0) > 0 && (
            <>
              <div style={{ fontSize: 12, color: "#64748b", margin: "10px 0 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span><b>{drift.profileMismatch.length}</b> servicio(s) con <b>perfil desalineado</b> (plan cambió en la base):</span>
                <button className="btn primary" onClick={doSyncProfiles} disabled={syncingProfiles || profSyncSel.size === 0}>
                  <Wand2 size={14} /> {syncingProfiles ? "Sincronizando…" : `Aplicar ${profSyncSel.size} perfil(es) al router`}
                </button>
              </div>
              <table className="tbl">
                <thead><tr><th style={{ width: 30 }}></th><th>PPPoE</th><th>Cliente</th><th>Perfil en router</th><th></th><th>Plan actual (DB)</th></tr></thead>
                <tbody>
                  {drift.profileMismatch.map((m: any) => (
                    <tr key={m.service_id} style={{ background: "#fef2f2" }}>
                      <td><input type="checkbox" checked={profSyncSel.has(m.service_id)} onChange={() => toggleProfSync(m.service_id)} /></td>
                      <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{m.pppoe_user}</td>
                      <td>{m.client}</td>
                      <td style={{ fontFamily: "monospace" }}><Badge tone="danger">{m.router_profile}</Badge></td>
                      <td style={{ textAlign: "center" }}>→</td>
                      <td style={{ fontFamily: "monospace" }}><Badge tone="success">{m.db_profile}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === "anomalias" && anomalies && (anomalies.duplicates.length > 0 || anomalies.stalled.length > 0) && (
        <div style={{ background: "#fff", padding: 14, borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span><ShieldAlert size={16} style={{ display: "inline", verticalAlign: -3, marginRight: 6 }} />Clientes conectados sin usar internet ({anomalies.total_active} activos en total)</span>
            <button className="btn" onClick={refreshAnomalies}><RefreshCw size={14} /> Refrescar</button>
          </div>
          {anomMsg && <div style={{ marginBottom: 8, fontSize: 13, color: anomMsg.startsWith("✓") ? "#059669" : "#dc2626" }}>{anomMsg}</div>}

          {anomalies.duplicates.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "#64748b", margin: "6px 0" }}>
                <b>{anomalies.duplicates.length}</b> cliente(s) con <b>doble sesión abierta</b> (posible clon o contraseña compartida):
              </div>
              <table className="tbl" style={{ marginBottom: 12 }}>
                <thead><tr><th>PPPoE</th><th>Cliente</th><th>Sesiones</th><th></th></tr></thead>
                <tbody>
                  {anomalies.duplicates.map((d: any) => (
                    <tr key={d.pppoe_user} style={{ background: "#fef2f2" }}>
                      <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{d.pppoe_user}</td>
                      <td>{d.client}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                        {d.sessions.map((x: any, i: number) => (
                          <div key={i}>{x.address} · {x.uptime} · {x.caller_id ?? "—"}</div>
                        ))}
                      </td>
                      <td>
                        <button className="btn danger" disabled={kicking === d.pppoe_user} onClick={() => doKick(d.pppoe_user)}>
                          <PowerOff size={13} /> {kicking === d.pppoe_user ? "Kick…" : "Kick"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {anomalies.stalled.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "#64748b", margin: "6px 0" }}>
                <b>{anomalies.stalled.length}</b> conectado(s) <b>sin usar internet</b> (más de {anomalies.thresholds.minUptimeMin}m online con menos de {Math.round(anomalies.thresholds.minBytes / 1024)} KB de tráfico). Puede ser un router del cliente encendido sin nadie navegando, o una sesión colgada:
              </div>
              <table className="tbl">
                <thead><tr><th>PPPoE</th><th>Cliente</th><th>IP</th><th>Uptime</th><th>RX / TX</th><th></th></tr></thead>
                <tbody>
                  {anomalies.stalled.map((s: any) => (
                    <tr key={s.pppoe_user} style={{ background: "#fffbeb" }}>
                      <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{s.pppoe_user}</td>
                      <td>{s.client}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{s.address}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{s.uptime}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{fmtBytes(s.bytes_in)} / {fmtBytes(s.bytes_out)}</td>
                      <td>
                        <button className="btn" disabled={kicking === s.pppoe_user} onClick={() => doKick(s.pppoe_user)}>
                          <Zap size={13} /> {kicking === s.pppoe_user ? "…" : "Kick"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}




      {tab === "planes" && profResult && (
        <div style={{ background: "#fff", padding: 14, borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Planes (PPP profiles) en el router · {profResult.profiles.length} encontrados · {profOrphans.length} sin importar</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ fontSize: 12, color: "#64748b" }}>Precio base $</label>
              <input type="number" min={0} className={inputCls} style={{ width: 100 }} value={profPrice} onChange={(e) => {
                const v = parseFloat(e.target.value) || 0;
                setProfPrice(v);
                // aplica a los que aún están en 0
                setProfPrices((prev) => {
                  const next = { ...prev };
                  Object.keys(next).forEach((k) => { if (!next[k]) next[k] = v; });
                  return next;
                });
              }} />
              <button className="btn primary" onClick={doImportProfiles} disabled={profImporting || profSelected.size === 0}>
                <Download size={14} /> {profImporting ? "Importando…" : `Importar ${profSelected.size} plan(es)`}
              </button>
            </div>
          </div>
          {profMsg && <div style={{ marginBottom: 8, fontSize: 13, color: profMsg.startsWith("✓") ? "#059669" : "#dc2626" }}>{profMsg}</div>}
          <table className="tbl">
            <thead>
              <tr><th style={{ width: 30 }}></th><th>Perfil</th><th>Rate limit</th><th>Down / Up</th><th>Precio $</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {profResult.profiles.map((p: any) => (
                <tr key={p.name} style={{ background: p.is_system ? "#f1f5f9" : (p.in_db ? undefined : "#ecfeff") }}>
                  <td>{!p.in_db && !p.is_system && <input type="checkbox" checked={profSelected.has(p.name)} onChange={() => toggleProf(p.name)} />}</td>
                  <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{p.name}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{p.rate_limit || "—"}</td>
                  <td>{p.download_mbps || 0} / {p.upload_mbps || 0} Mbps</td>
                  <td>
                    {!p.in_db && !p.is_system ? (
                      <input
                        type="number"
                        min={0}
                        className={inputCls}
                        style={{ width: 90 }}
                        value={profPrices[p.name] ?? 0}
                        onChange={(e) => setProfPrices((prev) => ({ ...prev, [p.name]: parseFloat(e.target.value) || 0 }))}
                      />
                    ) : "—"}
                  </td>
                  <td>{p.is_system ? <Badge tone="default">Sistema</Badge> : p.in_db ? <Badge tone="success">En DB</Badge> : <Badge tone="info">Nuevo</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>
      )}


      {tab === "clientes" && orphans.length > 0 && (
        <div style={{ background: "#fff", padding: 14, borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Importar {selected.size} secret(s) huérfano(s)</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
            Cada cliente se importa con el plan que coincida con su <b>perfil PPP</b> (auto-match por nombre).
            Si algún perfil no tiene plan en la DB, importalo primero desde la tabla de arriba.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: "#64748b" }}>Plan fallback (opcional, si el perfil no matchea)</label>
              <select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">— Sin fallback (saltear si no matchea) —</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · Bs {p.price}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#64748b" }}>Cliente (opcional, si se omite se crea uno por cada secret)</label>
              <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">— Crear cliente nuevo por cada secret —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
          </div>
          <button className="btn primary" onClick={doImport} disabled={importing || selected.size === 0}>

            <Download size={14} /> {importing ? "Importando…" : `Importar ${selected.size} seleccionados`}
          </button>
          {msg && <div style={{ marginTop: 8, fontSize: 13, color: msg.startsWith("✓") ? "#059669" : "#dc2626" }}>{msg}</div>}
        </div>
      )}

      {tab === "todos" && result && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>PPP Secrets en el router</div>
          <table className="tbl">
            <thead>
              <tr><th style={{ width: 30 }}></th><th>Usuario</th><th>Perfil</th><th>IP remota</th><th>Estado</th><th>DB</th></tr>
            </thead>
            <tbody>
              {result.secrets.map((s: any) => (
                <tr key={s.name} style={{ background: s.in_db ? undefined : "#fef3c7" }}>
                  <td>{!s.in_db && <input type="checkbox" checked={selected.has(s.name)} onChange={() => toggle(s.name)} />}</td>
                  <td style={{ fontFamily: "monospace", fontWeight: 600 }}>{s.name}</td>
                  <td>{s.profile || "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{s.remote_address || "—"}</td>
                  <td>{s.disabled ? <Badge tone="danger">Deshabilitado</Badge> : <Badge tone="success">Habilitado</Badge>}</td>
                  <td>{s.in_db ? <Badge tone="success">En DB</Badge> : <Badge tone="warning">Huérfano</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AdminLayout>
  );
}

function StatCard({ color, label, value, icon }: { color: string; label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", padding: 14, borderRadius: 10, border: "1px solid #e5e7eb", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>{icon}{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function fmtBytes(n: number) {
  if (!n || n < 1024) return `${n || 0} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function readableRouterError(error: unknown, router?: any) {
  const raw = error instanceof Error ? error.message : String(error ?? "Error desconocido");
  const lower = raw.toLowerCase();
  if (lower.includes("connect timeout") || lower.includes("etimedout")) {
    const target = router ? `${router.ip_address}${router.api_port ? `:${router.api_port}` : ""}` : "el puerto configurado";
    return `No se pudo conectar al router ${router?.name ?? "seleccionado"} (${target}). Revisá que el VPN esté conectado y que el puerto público/API esté abierto.`;
  }
  if (lower.includes("econnrefused")) {
    return `El router ${router?.name ?? "seleccionado"} rechazó la conexión. Revisá que el servicio API esté habilitado en el MikroTik.`;
  }
  if (lower.includes("login failed")) {
    return `Usuario o contraseña del router ${router?.name ?? "seleccionado"} incorrectos.`;
  }
  return `Error: ${raw}`;
}

function WizardSteps({ result, drift, anomalies, profOrphans }: { result: any; drift: any; anomalies: any; profOrphans: any[] }) {
  const steps = [
    { label: "Escanear", done: !!result, count: result?.secrets.length ?? 0, hint: "clientes en router" },
    { label: "Planes", done: !!result, count: profOrphans.length, hint: "por traer", warn: profOrphans.length > 0 },
    { label: "Clientes", done: !!result, count: (result?.secrets ?? []).filter((s: any) => !s.in_db).length, hint: "por traer", warn: (result?.secrets ?? []).filter((s: any) => !s.in_db).length > 0 },
    { label: "Diferencias", done: !!drift, count: (drift?.missingOnRouter.length ?? 0) + (drift?.statusMismatch.length ?? 0) + (drift?.profileMismatch?.length ?? 0), hint: "desalineadas", warn: !!drift && ((drift?.missingOnRouter.length ?? 0) + (drift?.statusMismatch.length ?? 0) + (drift?.profileMismatch?.length ?? 0)) > 0 },
    { label: "Sin internet", done: !!anomalies, count: (anomalies?.duplicates.length ?? 0) + (anomalies?.stalled.length ?? 0), hint: "conectados sin tráfico", warn: !!anomalies && ((anomalies?.duplicates.length ?? 0) + (anomalies?.stalled.length ?? 0)) > 0 },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, 1fr)`, gap: 8, marginBottom: 12 }}>
      {steps.map((s, i) => (
        <div key={i} style={{
          background: "#fff",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          borderTop: `3px solid ${s.warn ? "#f59e0b" : s.done ? "#10b981" : "#cbd5e1"}`,
        }}>
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Paso {i + 1} · {s.label}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 2 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.warn ? "#b45309" : s.done ? "#065f46" : "#94a3b8" }}>{s.count}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{s.hint}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

