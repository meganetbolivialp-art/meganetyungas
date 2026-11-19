"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildReceiptHtml, type ReceiptData } from "@/lib/print-receipt";

type PaymentReceiptContextValue = {
  presentReceipt: (receipt: ReceiptData) => void;
};

const PaymentReceiptContext = createContext<PaymentReceiptContextValue | null>(null);

export function usePaymentReceipt() {
  const context = useContext(PaymentReceiptContext);
  if (!context) throw new Error("usePaymentReceipt debe usarse dentro de PaymentReceiptProvider");
  return context;
}

export function PaymentReceiptProvider({ children }: { children: ReactNode }) {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [printOpened, setPrintOpened] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const presentReceipt = useCallback((data: ReceiptData) => {
    setPrintOpened(false);
    setReceipt(data);
  }, []);

  const requestPrint = useCallback(() => {
    const printWindow = frameRef.current?.contentWindow;
    if (!printWindow) return;
    printWindow.focus();
    printWindow.print();
    setPrintOpened(true);
  }, []);

  const value = useMemo(() => ({ presentReceipt }), [presentReceipt]);

  return (
    <PaymentReceiptContext.Provider value={value}>
      {children}
      <Dialog
        open={!!receipt}
        onOpenChange={(open) => {
          if (!open && printOpened) setReceipt(null);
        }}
      >
        <DialogContent
          className="max-h-[95dvh] max-w-xl overflow-y-auto p-4 sm:p-6 [&>button:last-child]:hidden"
          onEscapeKeyDown={(event) => {
            if (!printOpened) event.preventDefault();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" /> Recibo de pago obligatorio
            </DialogTitle>
            <DialogDescription>
              Imprime el comprobante del cobro registrado. Después podrás finalizar.
            </DialogDescription>
          </DialogHeader>

          {receipt && (
            <iframe
              ref={frameRef}
              title={`Recibo de pago ${receipt.id ?? ""}`}
              srcDoc={buildReceiptHtml(receipt, false)}
              onLoad={requestPrint}
              className="h-[430px] w-full rounded-md border bg-card"
            />
          )}

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {printOpened
              ? "Se abrió la impresión. Si no apareció, pulsa «Imprimir recibo»."
              : "Preparando la impresión del recibo…"}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={requestPrint}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              <Printer className="h-4 w-4" /> Imprimir recibo
            </button>
            <button
              type="button"
              disabled={!printOpened}
              onClick={() => setReceipt(null)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" /> Finalizar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </PaymentReceiptContext.Provider>
  );
}
