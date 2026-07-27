import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { portalLogin, portalMe, portalCreateTicket, portalLogout } from "@/lib/portal.functions";
import { createStripeCheckout, createMPCheckout } from "@/lib/gateway.functions";
import { toast } from "sonner";
import { Wifi, FileText, LogOut, CreditCard, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Portal Cliente — MikroSystem" },
      { name: "description", content: "Accede a tus facturas, servicios y soporte." },
      { property: "og:title", content: "Portal Cliente" },
      { property: "og:description", content: "Portal de autogestión." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Portal,
});

const TOKEN_KEY = "portal_token";

function Portal() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => { setToken(localStorage.getItem(TOKEN_KEY)); }, []);
  return token ? <PortalHome token={token} onLogout={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); }} /> : <PortalLogin onLogin={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} />;
}

function PortalLogin({ onLogin }: { onLogin: (t: string) => void }) {
  const login = useServerFn(portalLogin);
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [loading, setLoading] = useState(false);
  const submit = async (e: any) => {
    e.preventDefault(); setLoading(true);
    try { const r = await login({ data: { username: u, password: p } }); onLogin(r.token); }
    catch (err: any) { toast.error(err.message); } finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <form onSubmit={submit} className="bg-white rounded-lg shadow-xl p-8 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-orange-500 to-red-500 grid place-items-center text-white font-black text-xl">M</div>
          <h1 className="text-xl font-bold mt-3">Portal Cliente</h1>
          <p className="text-xs text-muted-foreground">Ingresa con tu usuario y clave</p>
        </div>
        <input className="w-full h-10 border rounded px-3 text-sm" placeholder="Usuario o cédula" value={u} onChange={e => setU(e.target.value)} required />
        <input type="password" className="w-full h-10 border rounded px-3 text-sm" placeholder="Contraseña" value={p} onChange={e => setP(e.target.value)} required />
        <button disabled={loading} className="w-full h-10 rounded bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50">
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}

function PortalHome({ token, onLogout }: { token: string; onLogout: () => void }) {
  const me = useServerFn(portalMe); const logout = useServerFn(portalLogout);
  const stripe = useServerFn(createStripeCheckout); const mp = useServerFn(createMPCheckout);
  const ticket = useServerFn(portalCreateTicket);
  const [data, setData] = useState<any>(null); const [tab, setTab] = useState<"facturas"|"servicios"|"tickets">("facturas");
  const [tSubj, setTSubj] = useState(""); const [tDesc, setTDesc] = useState("");

  useEffect(() => { me({ data: { token } }).then(setData).catch(() => { localStorage.removeItem(TOKEN_KEY); onLogout(); }); }, []);

  if (!data) return <div className="min-h-screen grid place-items-center">Cargando...</div>;
  const pay = async (invoiceId: string, provider: "stripe" | "mp") => {
    try {
      const origin = window.location.origin;
      const fn = provider === "stripe" ? stripe : mp;
      const r = await fn({ data: { invoiceId, successUrl: `${origin}/portal?paid=1`, cancelUrl: `${origin}/portal` } });
      window.location.href = r.url;
    } catch (err: any) { toast.error(err.message); }
  };
  const submitTicket = async () => {
    try { await ticket({ data: { token, subject: tSubj, description: tDesc } }); toast.success("Ticket enviado"); setTSubj(""); setTDesc(""); const d = await me({ data: { token } }); setData(d); }
    catch (err: any) { toast.error(err.message); }
  };
  const doLogout = async () => { await logout({ data: { token } }); onLogout(); };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="font-bold">Hola, {data.client?.full_name}</div>
        <button onClick={doLogout} className="text-sm text-destructive flex items-center gap-1"><LogOut className="w-4 h-4" /> Salir</button>
      </header>
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex gap-2 mb-4 border-b">
          {[["facturas","Facturas",FileText],["servicios","Servicios",Wifi],["tickets","Soporte",HelpCircle]].map(([k,l,I]: any) => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm flex items-center gap-2 border-b-2 ${tab===k?"border-primary text-primary font-semibold":"border-transparent text-muted-foreground"}`}>
              <I className="w-4 h-4" /> {l}
            </button>
          ))}
        </div>

        {tab==="facturas" && (
          <div className="bg-white rounded border">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr><th className="text-left px-3 py-2">Concepto</th><th className="text-left px-3 py-2">Vence</th><th className="text-right px-3 py-2">Monto</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Pagar</th></tr>
              </thead>
              <tbody>
                {data.invoices.map((i: any) => (
                  <tr key={i.id} className="border-t">
                    <td className="px-3 py-2">{i.concept}</td>
                    <td className="px-3 py-2">{i.due_date}</td>
                    <td className="px-3 py-2 text-right font-semibold">Bs {Number(i.amount).toFixed(2)}</td>
                    <td className="px-3 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded ${i.status==="paid"?"bg-emerald-100 text-emerald-700":i.status==="overdue"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-700"}`}>{i.status}</span></td>
                    <td className="px-3 py-2 text-center">
                      {i.status !== "paid" && (
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => pay(i.id, "stripe")} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded flex items-center gap-1"><CreditCard className="w-3 h-3" />Stripe</button>
                          <button onClick={() => pay(i.id, "mp")} className="text-xs bg-sky-500 text-white px-2 py-1 rounded">MercadoPago</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab==="servicios" && (
          <div className="grid md:grid-cols-2 gap-3">
            {data.services.map((s: any) => (
              <div key={s.id} className="bg-white rounded border p-4">
                <div className="text-xs text-muted-foreground">{s.plans?.name}</div>
                <div className="text-lg font-bold">{s.pppoe_user ?? s.hotspot_user ?? s.ip_address}</div>
                <div className="text-xs mt-1">Estado: <span className={s.status==="active"?"text-emerald-600":"text-red-600"}>{s.status}</span></div>
              </div>
            ))}
          </div>
        )}

        {tab==="tickets" && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded border space-y-2">
              <input value={tSubj} onChange={e=>setTSubj(e.target.value)} placeholder="Asunto" className="w-full h-9 border rounded px-3 text-sm" />
              <textarea value={tDesc} onChange={e=>setTDesc(e.target.value)} placeholder="Describe tu problema" rows={3} className="w-full border rounded px-3 py-2 text-sm" />
              <button onClick={submitTicket} className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm">Enviar ticket</button>
            </div>
            {data.tickets.map((t: any) => (
              <div key={t.id} className="bg-white rounded border p-3">
                <div className="flex justify-between"><div className="font-semibold text-sm">{t.subject}</div><span className="text-xs px-2 py-0.5 rounded bg-slate-100">{t.status}</span></div>
                <div className="text-xs text-muted-foreground mt-1">{t.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
