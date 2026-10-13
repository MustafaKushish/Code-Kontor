import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { parseAmount, type ReceiptCompany } from "../../shared/pos";
import { currencySymbol } from "../money";
import { centsToInput, usePosI18n } from "./i18n";

/** Dialog über der Seite; Escape oder Klick daneben schließt. */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { p } = usePosI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="repair-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`repair-dialog card ${wide ? "wide" : ""}`} role="dialog" aria-modal aria-label={title}>
        <div className="section-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label={p("print.close")}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Eingabe für Beträge in der Währung der Firma; gibt Cent zurück (null bei ungültiger Eingabe). */
export function MoneyInput({ cents, onChange, id, autoFocus, allowNegative }: { cents: number; onChange: (cents: number | null) => void; id?: string; autoFocus?: boolean; allowNegative?: boolean }) {
  const { lang } = usePosI18n();
  const symbol = currencySymbol(lang);
  const [text, setText] = useState(centsToInput(cents));
  useEffect(() => {
    if (parseAmount(text) !== cents) setText(centsToInput(cents));
  }, [cents]);
  const change = (value: string) => {
    setText(value);
    const parsed = parseAmount(value);
    onChange(parsed !== null && parsed < 0 && !allowNegative ? null : parsed);
  };
  return (
    <span className="money-input">
      <input id={id} inputMode="decimal" autoFocus={autoFocus} style={{ paddingInlineEnd: `${20 + symbol.length * 10}px` }} value={text} placeholder="0,00" onChange={(e) => change(e.target.value)} />
      <span aria-hidden>{symbol}</span>
    </span>
  );
}

/** Druckansicht über der App: A4-Blatt oder schmaler Bon (80 mm). */
export function PrintFrame({ format, children, onClose }: { format: "a4" | "bon"; children: ReactNode; onClose: () => void }) {
  const { p } = usePosI18n();
  useEffect(() => {
    document.body.classList.add("ck-printing");
    if (format === "bon") document.body.classList.add("ck-printing-bon");
    return () => document.body.classList.remove("ck-printing", "ck-printing-bon");
  }, [format]);
  return createPortal(
    <div className="print-layer">
      <div className="print-toolbar">
        <button className="button primary" onClick={() => window.print()}><Printer size={18} /> {p("print.printNow")}</button>
        <button className="button" onClick={onClose}><X size={18} /> {p("print.close")}</button>
      </div>
      <article className={format === "bon" ? "bon-sheet" : "print-sheet"}>{children}</article>
    </div>,
    document.body,
  );
}

/** Firmenkopf für A4-Belege. */
export function CompanyHead({ company, title, meta }: { company: ReceiptCompany; title: string; meta: ReactNode }) {
  return (
    <header className="print-head">
      <div>
        {company.logoDataUrl && <img src={company.logoDataUrl} alt="" className="print-logo" />}
        <strong className="print-company">{company.name}</strong>
        <p>{company.street}<br />{company.postalCode} {company.city}</p>
        <p>{[company.phone, company.email].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="print-meta">
        <h1>{title}</h1>
        {meta}
      </div>
    </header>
  );
}

export function CompanyFoot({ company }: { company: ReceiptCompany }) {
  const { p } = usePosI18n();
  return (
    <footer className="print-foot">
      {company.taxNumber && <span>{p("print.taxNumber")}: {company.taxNumber}</span>}
      {company.vatId && <span>{p("print.vatId")}: {company.vatId}</span>}
      {company.iban && <span>{p("print.bank")}: {[company.bankName, company.iban, company.bic].filter(Boolean).join(" · ")}</span>}
    </footer>
  );
}
