import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Minus, X } from "lucide-react";
import { CHECKS_FOR, parseEuro, type CheckItem, type CheckList, type CheckResult, type DeviceType, type RepairDevice, type RepairStatus } from "../../../shared/repairs";
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

const NEXT_RESULT: Record<CheckResult | "none", CheckResult | undefined> = { none: "ok", ok: "fail", fail: "untested", untested: undefined };

/**
 * Funktions-Check: jeder Punkt wird durch Tippen ok → defekt → nicht prüfbar → leer geschaltet.
 * „Alles ok“ setzt alle offenen Punkte auf ok.
 */
export function ChecksEditor({ type, value, onChange }: { type: DeviceType; value: CheckList; onChange: (v: CheckList) => void }) {
  const { r } = useRepairI18n();
  const items = CHECKS_FOR[type];
  const cycle = (item: CheckItem) => {
    const next = NEXT_RESULT[value[item] ?? "none"];
    const copy = { ...value };
    if (next) copy[item] = next;
    else delete copy[item];
    onChange(copy);
  };
  return (
    <div className="stack-sm">
      <div className="checks-grid">
        {items.map((item) => {
          const v = value[item];
          return (
            <button type="button" key={item} className={`check-chip ${v ?? ""}`} onClick={() => cycle(item)} aria-label={`${r(`checks.items.${item}`)}: ${v ? r(`checks.result.${v}`) : r("checks.open")}`}>
              <span className="check-mark" aria-hidden>{v === "ok" ? <Check size={14} /> : v === "fail" ? <X size={14} /> : v === "untested" ? <Minus size={14} /> : null}</span>
              {r(`checks.items.${item}`)}
            </button>
          );
        })}
      </div>
      <div className="row wrap gap">
        <button type="button" className="text-button" onClick={() => onChange({ ...Object.fromEntries(items.map((i) => [i, "ok"])), ...Object.fromEntries(Object.entries(value).filter(([, v]) => v !== "ok")) })}>{r("checks.allOk")}</button>
        <button type="button" className="text-button" onClick={() => onChange(Object.fromEntries(items.map((i) => [i, "untested"])))}>{r("checks.noPower")}</button>
        <small className="muted">{r("checks.hint")}</small>
      </div>
    </div>
  );
}

/** Kurze Anzeige: defekte Punkte zuerst, dann wie viele ok sind. */
export function ChecksSummary({ value, compare }: { value: CheckList; compare?: CheckList | null }) {
  const { r } = useRepairI18n();
  const entries = Object.entries(value) as [CheckItem, CheckResult][];
  if (!entries.length) return <span className="muted">{r("checks.none")}</span>;
  const fails = entries.filter(([, v]) => v === "fail").map(([k]) => k);
  const untested = entries.filter(([, v]) => v === "untested").length;
  const ok = entries.filter(([, v]) => v === "ok").length;
  // Was bei Annahme ging und jetzt nicht mehr: deutlich markieren
  const worse = compare ? fails.filter((k) => compare[k] === "ok") : [];
  return (
    <span className="checks-summary">
      {fails.map((k) => <span key={k} className={`pill ${worse.includes(k) ? "neg" : "warn"}`}><X size={12} /> {r(`checks.items.${k}`)}</span>)}
      {ok > 0 && <span className="pill pos"><Check size={12} /> {r("checks.okCount", { n: ok })}</span>}
      {untested > 0 && <span className="pill">{r("checks.untestedCount", { n: untested })}</span>}
    </span>
  );
}
