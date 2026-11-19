import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, Check, FileText, ImagePlus, Printer, ReceiptText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin-layout";
import { supabase } from "@/integrations/supabase/client";
import {
  buildReceiptHtml,
  DEFAULT_RECEIPT_TEMPLATE,
  printReceipt,
  type ReceiptData,
  type ReceiptTemplate,
} from "@/lib/print-receipt";

export const Route = createFileRoute("/dashboard/receipt-settings")({
  head: () => ({
    meta: [
      { title: "Diseño de recibo — MEGANET" },
      { name: "description", content: "Personaliza el logo, los datos de empresa y los textos del recibo térmico de 80 mm." },
      { property: "og:title", content: "Diseño de recibo — MEGANET" },
      { property: "og:description", content: "Editor del recibo térmico de pagos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReceiptSettingsPage,
});

const inputClass = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const samplePayment = (template: ReceiptTemplate): ReceiptData => ({
  id: "12345678-abcd-4e5f-9abc-123456789012",
  paid_at: new Date(),
  client_name: "JUAN PÉREZ",
  client_document: "12345678",
  client_phone: "71234567",
  items: [
    { concept: "Internet fibra óptica — Plan 50 Mbps", amount: 150 },
    { concept: "Instalación", amount: 50 },
  ],
  method: "cash",
  reference: "CAJA-001",
  amount: 200,
  operator: "Administrador",
  template,
});

function ReceiptSettingsPage() {
  const [form, setForm] = useState<ReceiptTemplate>(DEFAULT_RECEIPT_TEMPLATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingLogo, setProcessingLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from("receipt_settings").select("*").eq("id", true).maybeSingle();
      if (error) toast.error(error.message);
      if (data) setForm({ ...DEFAULT_RECEIPT_TEMPLATE, ...data });
      setLoading(false);
    })();
  }, []);

  const sample = useMemo(() => samplePayment(form), [form]);
  const preview = useMemo(() => buildReceiptHtml(sample, false), [sample]);
  const set = <K extends keyof ReceiptTemplate>(key: K, value: ReceiptTemplate[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!form.company_name.trim()) {
      toast.error("Escribe el nombre de la empresa");
      return;
    }
    if (!form.receipt_title.trim()) {
      toast.error("Escribe el título del recibo");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("receipt_settings").update({
      ...form,
      company_name: form.company_name.trim(),
      receipt_title: form.receipt_title.trim(),
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    setSaving(false);
    if (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return;
    }
    toast.success("Diseño de recibo guardado");
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error("Usa una imagen PNG, JPG o WebP");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("El logo no puede superar 4 MB");
      return;
    }
    setProcessingLogo(true);
    try {
      const logo = await resizeLogo(file);
      set("logo_url", logo);
      set("show_logo", true);
      toast.success("Logo cargado; guarda los cambios para aplicarlo");
    } catch {
      toast.error("No se pudo leer esa imagen");
    } finally {
      setProcessingLogo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const testPrint = () => {
    if (!printReceipt(sample)) toast.error("El navegador bloqueó la ventana de impresión");
  };

  return (
    <AdminLayout title="Diseño de recibo" subtitle="Personaliza el comprobante térmico de 80 mm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/dashboard/settings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a Ajustes
        </Link>
        <div className="flex gap-2">
          <button type="button" onClick={testPrint} className="inline-flex min-h-10 items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted">
            <Printer className="h-4 w-4" /> Probar impresión
          </button>
          <button type="button" onClick={save} disabled={saving || loading} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            <Check className="h-4 w-4" /> {saving ? "Guardando…" : "Guardar diseño"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">Cargando diseño…</div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-5">
            <section className="rounded-lg border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <ImagePlus className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="font-semibold">Logo</h2>
                  <p className="text-xs text-muted-foreground">Se ajusta automáticamente al ancho del ticket.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => void uploadLogo(event.target.files?.[0])}
                  className="max-w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
                />
                {form.logo_url && (
                  <button type="button" onClick={() => set("logo_url", null)} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5" /> Quitar logo
                  </button>
                )}
              </div>
              {processingLogo && <p className="mt-2 text-xs text-muted-foreground">Preparando imagen…</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Toggle label="Mostrar logo" checked={form.show_logo} onChange={(value) => set("show_logo", value)} />
                <Toggle label="Logo en blanco y negro" checked={form.grayscale_logo} onChange={(value) => set("grayscale_logo", value)} />
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Datos de la empresa</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre comercial *"><input className={inputClass} value={form.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
                <Field label="NIT"><input className={inputClass} value={form.nit} onChange={(e) => set("nit", e.target.value)} placeholder="Ej: 123456789" /></Field>
                <Field label="Teléfono"><input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Ej: 4-444444 / 70000000" /></Field>
                <Field label="Dirección" className="sm:col-span-2"><textarea className={`${inputClass} min-h-20`} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Zona, calle, número y ciudad" /></Field>
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Textos del recibo</h2>
              </div>
              <div className="grid gap-4">
                <Field label="Título *"><input className={inputClass} value={form.receipt_title} onChange={(e) => set("receipt_title", e.target.value)} /></Field>
                <Field label="Mensaje de agradecimiento"><textarea className={`${inputClass} min-h-20`} value={form.footer_message} onChange={(e) => set("footer_message", e.target.value)} /></Field>
                <Field label="Nota legal o información adicional"><textarea className={`${inputClass} min-h-20`} value={form.legal_note} onChange={(e) => set("legal_note", e.target.value)} placeholder="Condiciones, aclaraciones o texto legal" /></Field>
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4 sm:p-5">
              <h2 className="mb-4 font-semibold">Información visible</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <Toggle label="Documento del cliente" checked={form.show_client_document} onChange={(value) => set("show_client_document", value)} />
                <Toggle label="Teléfono del cliente" checked={form.show_client_phone} onChange={(value) => set("show_client_phone", value)} />
                <Toggle label="Operador que cobró" checked={form.show_operator} onChange={(value) => set("show_operator", value)} />
              </div>
            </section>
          </div>

          <aside className="rounded-lg border bg-card p-4 xl:sticky xl:top-4">
            <div className="mb-3 flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-primary" />
              <div>
                <h2 className="font-semibold">Vista previa</h2>
                <p className="text-xs text-muted-foreground">Ejemplo con dos conceptos · 80 mm</p>
              </div>
            </div>
            <iframe title="Vista previa del diseño de recibo" srcDoc={preview} className="h-[680px] w-full rounded-md border bg-card" />
          </aside>
        </div>
      )}
    </AdminLayout>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={className}><span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

async function resizeLogo(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Imagen inválida"));
    element.src = source;
  });
  const scale = Math.min(1, 600 / image.naturalWidth, 200 / image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas no disponible");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
