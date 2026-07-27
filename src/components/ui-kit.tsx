import { type ReactNode } from "react";
import { Plus, Search, Trash2 } from "lucide-react";

export function StatCard({ label, value, sub, icon: Icon, color = "text-primary" }: { label: string; value: ReactNode; sub?: string; icon: any; color?: string }) {
  return (
    <div className="rounded-md border bg-card p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-md bg-primary/10 grid place-items-center ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export function Toolbar({ title, actions, search, onSearch, onNew, newLabel = "Nuevo", children }: { title?: ReactNode; actions?: ReactNode; search?: string; onSearch?: (v: string) => void; onNew?: () => void; newLabel?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      {title && <h2 className="text-lg font-bold">{title}</h2>}
      {onSearch !== undefined && (
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-3 py-2 rounded-md border bg-background text-sm outline-none focus:border-primary"
          />
        </div>
      )}
      <div className="flex items-center gap-2 ml-auto">
        {actions}
        {children}
        {onNew && (
          <button onClick={onNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90">
            <Plus className="w-4 h-4" /> {newLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function Table({ headers, children, rows, empty }: { headers: string[]; children?: ReactNode; rows?: ReactNode[][]; empty?: boolean }) {
  const isEmpty = empty ?? (rows ? rows.length === 0 : false);
  return (
    <div className="rounded-md border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {headers.map((h, i) => <th key={i} className="px-4 py-2.5 text-left font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {isEmpty ? <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-muted-foreground">Sin registros</td></tr>
            : rows ? rows.map((r, i) => (
                <tr key={i} className="border-t hover:bg-muted/30">
                  {r.map((c, j) => <td key={j} className="px-4 py-2">{c}</td>)}
                </tr>
              ))
            : children}
        </tbody>
      </table>
    </div>
  );
}


export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "warning" | "danger" | "info" }) {
  const map: Record<string, string> = {
    default: "bg-muted text-muted-foreground",
    success: "bg-emerald-500/15 text-emerald-600",
    warning: "bg-amber-500/15 text-amber-600",
    danger: "bg-destructive/15 text-destructive",
    info: "bg-sky-500/15 text-sky-600",
  };
  return <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium ${map[tone]}`}>{children}</span>;
}

export function IconBtn({ onClick, tone = "muted", title, children }: { onClick: () => void; tone?: "muted" | "danger" | "success"; title?: string; children: ReactNode }) {
  const map: Record<string, string> = {
    muted: "hover:bg-muted text-muted-foreground",
    danger: "hover:bg-destructive/10 text-destructive",
    success: "hover:bg-emerald-500/10 text-emerald-600",
  };
  return <button onClick={onClick} title={title} className={`p-1.5 rounded ${map[tone]}`}>{children}</button>;
}

export function DeleteBtn({ onClick }: { onClick: () => void }) {
  return <IconBtn onClick={onClick} tone="danger" title="Eliminar"><Trash2 className="w-4 h-4" /></IconBtn>;
}

export function FormPanel({ children, onCancel, onSave, saveLabel = "Guardar", title, onClose, onSubmit }: { children: ReactNode; onCancel?: () => void; onSave?: () => void; saveLabel?: string; title?: ReactNode; onClose?: () => void; onSubmit?: () => void }) {
  const cancel = onCancel ?? onClose ?? (() => {});
  const save = onSave ?? onSubmit ?? (() => {});
  return (
    <div className="mb-4 rounded-md border bg-card p-5 relative">
      <button
        type="button"
        onClick={cancel}
        aria-label="Cerrar"
        className="absolute top-2 right-2 z-30 h-9 w-9 grid place-items-center rounded-full border bg-background shadow hover:bg-muted text-base"
      >
        ✕
      </button>
      {title && <div className="mb-3 pr-10 font-semibold text-sm">{title}</div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
      <div className="mt-4 flex gap-2 justify-end sticky bottom-0 bg-card pt-3 z-10">
        <button onClick={cancel} className="px-4 py-2 rounded-md border text-sm hover:bg-muted">Cancelar</button>
        <button onClick={save} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:opacity-90">{saveLabel}</button>
      </div>
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`text-sm ${className ?? ""}`}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}

export const inputCls = "w-full px-3 py-2 rounded-md border bg-background text-sm outline-none focus:border-primary";

