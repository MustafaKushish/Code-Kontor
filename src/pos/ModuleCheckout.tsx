import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Printer, X } from "lucide-react";
import { api } from "../api";
import type { Payment, PosCustomer, PosLine, PosSource, Receipt, Totals } from "../../shared/pos";
import { usePosI18n } from "./i18n";
import { PayPanel, usePosSettings } from "./PayPanel";
import { ReceiptPrint } from "./Print";

interface Quote {
  lines: PosLine[];
  totals: Totals;
  depositCents: number;
  dueCents: number;
  customer: PosCustomer | null;
}

/**
 * Bezahlen eines Vorgangs aus einem Branchen-System (Termin, Werkstattauftrag, Bestellung, Rapport).
 * Preise und Steuersätze kommen vom Server, gebucht wird in der Kasse der Plattform:
 * ein Nummernkreis, ein Tagesabschluss, Storno über die Kasse.
 */
export function ModuleCheckout({ source, kind, refId, title, onClose, onPaid }: {
  source: Exclude<PosSource, "pos">;
  kind: string;
  refId: string;
  title?: string;
  onClose: () => void;
  onPaid: (receipt: Receipt | null) => void;
}) {
  const { p, money, posError, ready } = usePosI18n();
  const [settings] = usePosSettings();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<{ receipt: Receipt | null } | null>(null);
  const [printing, setPrinting] = useState<"bon" | "a4" | null>(null);
  const line = { source, kind, refId, name: "", qty: 1, unitCents: 0, vatRate: 0 };

  useEffect(() => {
    api<Quote>("/pos/quote", { method: "POST", body: { lines: [line] } }).then(setQuote, setError);
  }, [source, kind, refId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !printing && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const close = () => (done ? onPaid(done.receipt) : onClose());

  const pay = async (payments: Payment[]) => {
    const { receipt } = await api<{ receipt: Receipt | null }>("/pos/checkout", { method: "POST", body: { lines: [line], payments } });
    setDone({ receipt });
    if (receipt && settings?.print && settings.print !== "ask") setPrinting(settings.print === "a4" ? "a4" : "bon");
  };

  if (!ready) return null;
  return createPortal(
    <div className="repair-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !printing && close()}>
      <div className="repair-dialog card module-checkout" role="dialog" aria-modal aria-label={title ?? p("pay.title")}>
        <div className="section-head">
          <h2>{title ?? p("pay.title")}</h2>
          <button className="icon-button" onClick={close} aria-label={p("print.close")}><X size={20} /></button>
        </div>
        {error !== null && <p className="error" role="alert">{posError(error)}</p>}
        {!quote && error === null && <p className="muted">…</p>}
        {quote && !done && (
          <div className="stack">
            <table className="module-checkout-lines">
              <tbody>
                {quote.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.qty.toLocaleString()} ×</td>
                    <td>{l.name}</td>
                    <td className="num">{money(Math.round(l.qty * l.unitCents))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th colSpan={2}>{p("print.sum")}</th><th className="num">{money(quote.totals.grossCents)}</th></tr>
              </tfoot>
            </table>
            <PayPanel dueCents={quote.dueCents} onPay={pay} />
          </div>
        )}
        {done && (
          <div className="stack module-checkout-done">
            <CheckCircle2 size={34} aria-hidden />
            <strong>{done.receipt ? `${p("pay.done")} · ${done.receipt.number}` : p("pay.nothingToPay")}</strong>
            {done.receipt && <span>{done.receipt.changeCents ? p("pay.changeBig", { amount: money(done.receipt.changeCents) }) : p("pay.noChange")}</span>}
            {done.receipt && (
              <span className="row gap-sm wrap">
                <button className="button small-button" onClick={() => setPrinting("bon")}><Printer size={15} /> {p("pay.printBon")}</button>
                <button className="button small-button" onClick={() => setPrinting("a4")}>{p("pay.printA4")}</button>
              </span>
            )}
            <button className="button primary" onClick={close}>{p("print.close")}</button>
          </div>
        )}
      </div>
      {printing && done?.receipt && <ReceiptPrint receipt={done.receipt} format={printing} onClose={() => setPrinting(null)} />}
    </div>,
    document.body,
  );
}
