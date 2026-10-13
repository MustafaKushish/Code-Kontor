import { useEffect, useState, type ReactNode } from "react";
import { Banknote, CreditCard, Gift, Landmark, Plus, Split, Trash2, type LucideIcon } from "lucide-react";
import { api } from "../api";
import { DEFAULT_POS_SETTINGS, PAY_METHODS, type PayMethod, type Payment, type PosSettings } from "../../shared/pos";
import { usePosI18n } from "./i18n";
import { MoneyInput } from "./ui";
import "./pos.css";

export const METHOD_ICON: Record<PayMethod, LucideIcon> = { cash: Banknote, card: CreditCard, transfer: Landmark, voucher: Gift };

let settingsCache: PosSettings | null = null;

/** Einstellungen der Kasse (einmal geladen, nach dem Speichern aktualisiert). */
export function usePosSettings(): [PosSettings | null, (s: PosSettings) => void] {
  const [settings, setSettings] = useState<PosSettings | null>(settingsCache);
  useEffect(() => {
    api<{ settings: PosSettings }>("/pos/settings")
      .then((d) => {
        settingsCache = d.settings;
        setSettings(d.settings);
      })
      .catch(() => setSettings(settingsCache ?? DEFAULT_POS_SETTINGS));
  }, []);
  return [settings, (s) => ((settingsCache = s), setSettings(s))];
}

/** Gerundete Geldscheine über dem Betrag, z. B. 37,40 → 40, 50, 100. */
function suggestions(due: number): number[] {
  const out = new Set<number>();
  for (const step of [500, 1000, 2000, 5000, 10000]) {
    const v = Math.ceil(due / step) * step;
    if (v > due) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

/**
 * Bezahlen: eine Zahlart mit Rückgeld bei Bargeld, oder aufgeteilt auf mehrere Zahlarten.
 * Wird in der Kasse und beim Abholen im Auftrag genutzt.
 */
export function PayPanel({ dueCents, onPay, extra, blocked }: {
  dueCents: number;
  onPay: (payments: Payment[]) => Promise<void>;
  /** Zusätzliche Abfragen vor dem Buchen (z. B. Leihgerät zurück) */
  extra?: ReactNode;
  /** Buchen gesperrt, solange eine Abfrage fehlt */
  blocked?: boolean;
}) {
  const { p, money, posError } = usePosI18n();
  const [settings] = usePosSettings();
  const methods = settings?.methods ?? ["cash"];
  const [method, setMethod] = useState<PayMethod>("cash");
  const [given, setGiven] = useState<number | null>(dueCents > 0 ? dueCents : 0);
  const [split, setSplit] = useState(false);
  const [parts, setParts] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refund = dueCents < 0;
  const splitSum = parts.reduce((s, x) => s + x.cents, 0);
  const rest = dueCents - splitSum;
  const change = !split && method === "cash" && given !== null ? Math.max(0, given - dueCents) : split ? Math.max(0, -rest) : 0;

  const payments = (): Payment[] => {
    if (refund) return [{ method, cents: dueCents }];
    if (split) return parts;
    return [{ method, cents: method === "cash" ? (given ?? 0) : dueCents }];
  };
  const ready = dueCents === 0 || (refund ? true : split ? rest <= 0 && (rest === 0 || parts.some((x) => x.method === "cash" && x.cents >= -rest)) : method !== "cash" || (given ?? 0) >= dueCents);

  const startSplit = () => {
    setSplit(true);
    setParts([{ method: methods.includes("card") ? "card" : methods[0]!, cents: 0 }, { method: "cash", cents: 0 }]);
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await onPay(dueCents === 0 ? [] : payments());
    } catch (e) {
      setError(posError(e));
      setBusy(false);
    }
  };

  const methodButtons = (value: PayMethod, onChange: (m: PayMethod) => void) => (
    <div className="pay-methods" role="radiogroup" aria-label={p("pay.method")}>
      {PAY_METHODS.filter((m) => methods.includes(m)).map((m) => {
        const Icon = METHOD_ICON[m];
        return (
          <button type="button" role="radio" aria-checked={value === m} key={m} className={value === m ? "active" : ""} onClick={() => onChange(m)}>
            <Icon size={18} aria-hidden /> {p(`methods.${m}`)}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="stack pay-panel">
      <p className="pay-due"><span>{refund ? p("pay.refund") : p("pay.due")}</span><strong>{money(Math.abs(dueCents))}</strong></p>
      {dueCents !== 0 && !split && (
        <>
          {methodButtons(method, (m) => (setMethod(m), m === "cash" && setGiven(dueCents > 0 ? dueCents : 0)))}
          {method === "cash" && !refund && (
            <div className="stack-sm">
              <label className="field">
                <span className="field-label">{p("pay.given")}</span>
                <MoneyInput cents={given ?? 0} onChange={setGiven} autoFocus />
              </label>
              <div className="chips wrap">
                <button type="button" className="chip" onClick={() => setGiven(dueCents)}>{p("pay.exact")}</button>
                {suggestions(dueCents).map((v) => <button type="button" key={v} className="chip" onClick={() => setGiven(v)}>{money(v)}</button>)}
              </div>
              <p className={`pay-change ${change ? "has" : ""}`}><span>{p("pay.change")}</span><strong>{money(change)}</strong></p>
            </div>
          )}
          {method === "card" && <p className="muted small">{p("pay.cardHint")}</p>}
          {method === "voucher" && <p className="muted small">{p("pay.voucherHint")}</p>}
          {!refund && methods.length > 1 && <button type="button" className="text-button pay-split" onClick={startSplit}><Split size={16} /> {p("pay.split")}</button>}
        </>
      )}
      {split && (
        <div className="stack-sm">
          {parts.map((part, i) => (
            <div key={i} className="pay-part">
              <select value={part.method} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, method: e.target.value as PayMethod } : x)))} aria-label={p("pay.method")}>
                {methods.map((m) => <option key={m} value={m}>{p(`methods.${m}`)}</option>)}
              </select>
              <MoneyInput cents={part.cents} onChange={(c) => setParts(parts.map((x, j) => (j === i ? { ...x, cents: c ?? 0 } : x)))} />
              <button type="button" className="icon-button" aria-label={p("sell.remove")} onClick={() => setParts(parts.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
              {rest > 0 && part.cents === 0 && <button type="button" className="chip" onClick={() => setParts(parts.map((x, j) => (j === i ? { ...x, cents: rest } : x)))}>{money(rest)}</button>}
            </div>
          ))}
          <div className="row wrap gap">
            <button type="button" className="text-button" onClick={() => setParts([...parts, { method: "cash", cents: Math.max(0, rest) }])}><Plus size={16} /> {p("pay.addPayment")}</button>
            <button type="button" className="text-button" onClick={() => setSplit(false)}>{p("pay.single")}</button>
          </div>
          <p className={`pay-change ${rest > 0 ? "open" : change ? "has" : ""}`}>
            <span>{rest > 0 ? p("pay.rest") : p("pay.change")}</span>
            <strong>{money(rest > 0 ? rest : change)}</strong>
          </p>
        </div>
      )}
      {refund && methodButtons(method, setMethod)}
      {extra}
      {error && <p className="error">{error}</p>}
      <button className="button primary pay-confirm" disabled={busy || !ready || blocked} onClick={submit}>
        {refund ? p("pay.confirmRefund") : p("pay.confirm")}
      </button>
    </div>
  );
}
