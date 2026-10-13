import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { parseEuro, type RepairDevice, type RepairStatus } from "../../../shared/repairs";
import { centsToInput, useRepairI18n } from "./i18n";

const STATUS_TONE: Record<RepairStatus, string> = {
  received: "neutral",
  diagnosis: "info",
  quote: "warn",
  waitingParts: "warn",
  repairing: "info",
  ready: "ok",
  notRepaired: "bad",
  pickedUp: "done",
  canceled: "done",
};

export function StatusPill({ status }: { status: RepairStatus }) {
  const { r } = useRepairI18n();
  return <span className={`pill repair-status tone-${STATUS_TONE[status]}`}>{r(`status.${status}`)}</span>;
}

export const deviceLabel = (d: Pick<RepairDevice, "brand" | "model">) => [d.brand, d.model].filter(Boolean).join(" ") || "–";

/** Eingabe für Euro-Beträge; gibt Cent zurück (null bei ungültiger Eingabe). */
export function MoneyInput({ cents, onChange, id, placeholder }: { cents: number; onChange: (cents: number | null) => void; id?: string; placeholder?: string }) {
  const [text, setText] = useState(centsToInput(cents));
  useEffect(() => {
    if (parseEuro(text) !== cents) setText(centsToInput(cents));
  }, [cents]);
  return (
    <span className="money-input">
      <input id={id} inputMode="decimal" value={text} placeholder={placeholder ?? "0,00"} onChange={(e) => (setText(e.target.value), onChange(parseEuro(e.target.value)))} />
      <span aria-hidden>€</span>
    </span>
  );
}

export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { r } = useRepairI18n();
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
          <button className="icon-button" onClick={onClose} aria-label={r("print.close")}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
