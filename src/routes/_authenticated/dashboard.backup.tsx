import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload, Database, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { createBackup, restoreBackup } from "@/lib/backup.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/backup")({
  head: () => ({
    meta: [
      { title: "Backup del sistema · Meganet" },
      { name: "description", content: "Crear y restaurar backups completos del sistema" },
    ],
  }),
  component: BackupPage,
});

function BackupPage() {
  const doBackup = useServerFn(createBackup);
  const doRestore = useServerFn(restoreBackup);
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleBackup() {
    setBusy("backup");
    try {
      const dump = await doBackup();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meganet-backup-${stamp}.json`;
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
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se descargará un archivo <code className="text-xs bg-muted px-1 rounded">.json</code> con todas las tablas del sistema (clientes, facturas, pagos, planes, routers, etc.). Guárdalo en un lugar seguro.
            </p>
            <Button onClick={handleBackup} disabled={busy !== null} size="lg">
              {busy === "backup" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Descargar backup ahora
            </Button>
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
