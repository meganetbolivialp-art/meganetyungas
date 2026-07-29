import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Upload, Database, AlertTriangle, Loader2, CheckCircle2, Info, List } from "lucide-react";
import { createBackup, restoreBackup } from "@/lib/backup.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/backup")({
  head: () => ({
    meta: [
      { title: "Backup del sistema · Meganet" },
      { name: "description", content: "Crear y restaurar backups completos del sistema" },
    ],
  }),
  component: BackupPage,
});

const CORE_TABLES = [
  "app_license", "branches", "employees", "user_roles", "profiles", "routers", "plans", "clients",
  "services", "subscriptions", "invoices", "payments", "payment_gateways", "payment_intents",
  "cash_registers", "cash_movements", "accounting_entries", "commissions", "payroll",
  "cutoff_policies", "cutoff_leaks", "client_actions", "client_portal_users", "client_portal_sessions",
  "portal_settings", "tickets", "ticket_messages", "work_orders", "leads", "hotspot_vouchers",
  "inventory_items", "inventory_serials", "message_templates", "messages", "bulk_change_templates",
  "network_nodes", "fiber_links", "radius_users", "router_ip_pools", "mikrotik_pending_ops",
  "vpn_servers", "vpn_peers", "licenses", "license_activations", "license_state",
];

const LOG_TABLES = ["audit_logs", "job_runs"];

function BackupPage() {
  const doBackup = useServerFn(createBackup);
  const doRestore = useServerFn(restoreBackup);
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [includeLogs, setIncludeLogs] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleBackup() {
    setBusy("backup");
    try {
      const dump = await doBackup({ data: { includeLogs } });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meganet-backup-${includeLogs ? "full-" : ""}${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const rows = Object.values(dump.tables).reduce((a: number, r: any) => a + r.length, 0);
      toast.success(`Backup descargado: ${Object.keys(dump.tables).length} tablas, ${rows} filas`);
    } catch (e: any) {
      toast.error(e?.message || "Error creando backup");
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore(file: File) {
    if (!confirm(`¿Restaurar el backup? Modo: ${mode.toUpperCase()}.\n\n${mode === "replace" ? "⚠️ REEMPLAZAR borra datos existentes antes de importar." : "MERGE actualiza registros existentes por ID e inserta los nuevos."}`)) return;
    setBusy("restore");
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload.tables) throw new Error("Archivo inválido: falta 'tables'");
      const result = await doRestore({ data: { payload, mode } });
      setLastResult(result);
      const errs = result.results.filter((r: any) => r.error);
      if (errs.length) toast.warning(`Restaurado con ${errs.length} advertencias`);
      else toast.success("Backup restaurado correctamente");
    } catch (e: any) {
      toast.error(e?.message || "Error restaurando backup");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Database className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Backup del sistema</h1>
            <p className="text-sm text-muted-foreground">Descargar y restaurar todos los datos del negocio</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" /> Descargar backup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Se descargará un archivo <code className="text-xs bg-muted px-1 rounded">.json</code> con todos los datos de la aplicación. Guárdalo en un lugar seguro.
            </p>

            <div className="flex items-start gap-2 p-3 rounded-md bg-blue-500/10 border border-blue-500/30 text-sm">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <strong>¿Qué incluye el backup?</strong>
                <ul className="list-disc ml-4 mt-1 space-y-0.5">
                  <li>Todos los datos de negocio: clientes, servicios, facturas, pagos, routers, planes, usuarios, roles, etc.</li>
                  <li>No incluye los archivos del sistema de autenticación de Lovable Cloud ni las imágenes de Storage.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeLogs"
                checked={includeLogs}
                onCheckedChange={(v) => setIncludeLogs(v === true)}
              />
              <label
                htmlFor="includeLogs"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Backup completo incluyendo logs de auditoría y ejecuciones de jobs
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {includeLogs
                ? "El backup incluirá además audit_logs y job_runs. El archivo puede ser más grande."
                : "Backup estándar: datos de negocio únicamente. Los logs de auditoría no se incluyen."}
            </p>

            <Button onClick={handleBackup} disabled={busy !== null} size="lg">
              {busy === "backup" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Descargar backup {includeLogs ? "completo" : "estándar"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <List className="h-5 w-5" /> Tablas incluidas en el backup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
              {CORE_TABLES.map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span>{t}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
              <strong>Opcional (solo backup completo):</strong>{" "}
              {LOG_TABLES.join(", ")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> Restaurar backup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <strong>Importante:</strong> restaurar afecta directamente la base. Haz un backup antes por si acaso.
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Modo de restauración</label>
              <div className="flex gap-2">
                <Button
                  variant={mode === "merge" ? "default" : "outline"}
                  onClick={() => setMode("merge")}
                  size="sm"
                >
                  Combinar (recomendado)
                </Button>
                <Button
                  variant={mode === "replace" ? "destructive" : "outline"}
                  onClick={() => setMode("replace")}
                  size="sm"
                >
                  Reemplazar todo
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {mode === "merge"
                  ? "Actualiza registros existentes por ID e inserta los nuevos. No borra nada."
                  : "⚠️ Borra los datos actuales de cada tabla antes de importar el backup."}
              </p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleRestore(f);
              }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              variant="secondary"
              size="lg"
            >
              {busy === "restore" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Subir archivo de backup
            </Button>
          </CardContent>
        </Card>

        {lastResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5 text-green-500" /> Resultado de la última restauración
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-auto text-xs font-mono space-y-1">
                {lastResult.results.map((r: any) => (
                  <div key={r.table} className={r.error ? "text-red-500" : "text-muted-foreground"}>
                    {r.error ? "✗" : "✓"} {r.table}: {r.error || `${r.inserted} filas`}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
