import { useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Campo libre de Zona / Comunidad con sugerencias de las zonas ya usadas. */
export function ZoneInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const id = useId();
  const [opts, setOpts] = useState<string[]>([]);
  useEffect(() => {
    supabase.from("clients").select("city").not("city", "is", null).limit(2000).then(({ data }) => {
      const s = new Set<string>();
      (data ?? []).forEach((r: any) => { const v = String(r.city ?? "").trim(); if (v) s.add(v); });
      setOpts(Array.from(s).sort((a, b) => a.localeCompare(b)));
    });
  }, []);
  return (
    <>
      <input list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ej: Villa Adela, Comunidad Achocalla…" className={className} />
      <datalist id={id}>{opts.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}
