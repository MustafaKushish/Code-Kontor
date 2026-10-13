import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Printer, Search, Undo2 } from "lucide-react";
import { api } from "../api";
import { formatRate } from "../money";
import type { Receipt, ReceiptRow } from "../../shared/pos";
import { usePosI18n } from "./i18n";
import { ReceiptPrint, useLineName } from "./Print";
import { Dialog } from "./ui";
import { useRegisterLabel } from "./registers";

const localDay = (d = new Date()) => d.toLocaleDateString("en-CA");
const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
};

/** Alle Belege eines Tages oder per Suche; Beleg öffnen, nachdrucken, stornieren. */
export function Receipts({ isManager }: { isManager: boolean }) {
  const { p, money, time, day: fmtDay, posError } = usePosI18n();
  const registerName = useRegisterLabel();
  const [day, setDay] = useState(localDay());
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ReceiptRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    const q = query.trim() ? `q=${encodeURIComponent(query.trim())}` : `day=${day}`;
    api<{ receipts: ReceiptRow[] }>(`/pos/receipts?${q}`).then((d) => setRows(d.receipts)).catch((e) => setError(posError(e)));
  };
  useEffect(() => {
    const timer = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [day, query]);

  const sum = (rows ?? []).reduce((s, r) => s + r.payments.reduce((x, pay) => x + pay.cents, 0), 0);

  return (
    <div className="stack">
      <div className="row wrap gap pos-toolbar">
        <button className="icon-button" onClick={() => setDay(shiftDay(day, -1))} aria-label={p("receipts.prevDay")}><ChevronLeft size={18} className="flip-rtl" /></button>
        <input type="date" value={day} max={localDay()} onChange={(e) => e.target.value && (setDay(e.target.value), setQuery(""))} className="pos-date" aria-label={p("print.date")} />
        <button className="icon-button" onClick={() => setDay(shiftDay(day, 1))} disabled={day >= localDay()} aria-label={p("receipts.nextDay")}><ChevronRight size={18} className="flip-rtl" /></button>
        <label className="search">
          <Search size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={p("receipts.search")} aria-label={p("receipts.search")} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {rows && (
        <section className="card list-card">
          {rows.length === 0 && <p className="empty muted">{p("receipts.empty")}</p>}
          {rows.map((r) => (
            <button key={r.number} className="list-row pos-article" onClick={() => setOpen(r.number)}>
              <span className="list-main">
                <strong>
                  {r.number}
                  {r.kind !== "sale" && <span className={`pos-badge ${r.kind}`}>{p(`receipts.kinds.${r.kind}`)}</span>}
                  {r.canceledBy && <span className="pos-badge cancel">{p("receipts.canceled")}</span>}
                </strong>
                <small className="muted">{[query ? fmtDay(r.issuedAt) : "", time(r.issuedAt), registerName(r.registerId), r.customerName, r.label].filter(Boolean).join(" · ")}</small>
              </span>
              <span className="pos-row-meta">
                <strong className={r.dueCents < 0 ? "error" : ""}>{money(r.dueCents)}</strong>
                <small className="muted">{r.payments.map((x) => p(`methods.${x.method}`)).join(" + ")}</small>
              </span>
            </button>
          ))}
        </section>
      )}
      {rows && rows.length > 0 && !query && <p className="muted small">{p("receipts.sum", { amount: money(sum) })}</p>}
      {open && <ReceiptDialog number={open} isManager={isManager} onClose={() => setOpen(null)} onChanged={load} onOpen={setOpen} />}
    </div>
  );
}

export function ReceiptDialog({ number, isManager, onClose, onChanged, onOpen }: { number: string; isManager: boolean; onClose: () => void; onChanged: () => void; onOpen: (n: string) => void }) {
  const { p, money, dateTime, lang, posError } = usePosI18n();
  const name = useLineName();
  const registerName = useRegisterLabel();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [printing, setPrinting] = useState<"bon" | "a4" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setReceipt(null);
    api<{ receipt: Receipt }>(`/pos/receipts/${encodeURIComponent(number)}`).then((d) => setReceipt(d.receipt)).catch((e) => setError(posError(e)));
  }, [number]);

  const cancel = async () => {
    setBusy(true);
    setError("");
    try {
      const { receipt: storno } = await api<{ receipt: Receipt }>(`/pos/receipts/${encodeURIComponent(number)}/cancel`, { method: "POST" });
      onChanged();
      onOpen(storno.number);
    } catch (e) {
      setError(posError(e));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  const m = (c: number) => money(c, receipt?.currency);
  return (
    <Dialog title={receipt ? `${p(`receipts.kinds.${receipt.kind}`)} ${receipt.number}` : number} onClose={onClose} wide>
      {!receipt && !error && <p className="muted">…</p>}
      {error && <p className="error">{error}</p>}
      {receipt && (
        <div className="stack">
          <p className="muted small">
            {[dateTime(receipt.issuedAt), registerName(receipt.register?.id, receipt.register?.name), receipt.cashier ? p("receipts.cashier", { name: receipt.cashier }) : "", receipt.customer?.name ?? "",
              receipt.closing === 0 ? p("receipts.beforePos") : receipt.closing ? p("receipts.closing", { n: receipt.closing }) : ""].filter(Boolean).join(" · ")}
          </p>
          {receipt.canceledBy && <p className="notice">{p("receipts.canceledBy", { number: receipt.canceledBy })} <button className="text-button" onClick={() => onOpen(receipt.canceledBy!)}>→</button></p>}
          {receipt.cancels && <p className="notice">{p("receipts.cancels", { number: receipt.cancels })} <button className="text-button" onClick={() => onOpen(receipt.cancels!)}>→</button></p>}
          <div className="pos-receipt-lines">
            {receipt.lines.map((l, i) => (
              <p key={i}>
                <span>{l.qty !== 1 && `${l.qty.toLocaleString(lang)} × `}{name(l)} <small className="muted">{l.margin ? "§ 25a" : !receipt.smallBusiness ? formatRate(l.vatRate, lang) : ""}</small></span>
                <span>{m(Math.round(l.qty * l.unitCents))}</span>
              </p>
            ))}
          </div>
          <div className="repair-totals">
            <p className="grand"><span>{p("print.sum")}</span><strong>{m(receipt.totals.grossCents)}</strong></p>
            {receipt.depositCents !== 0 && <p><span className="muted">{p("print.depositPaid")}</span><span>{m(-receipt.depositCents)}</span></p>}
            {receipt.payments.map((pay) => <p key={pay.method}><span className="muted">{p(`methods.${pay.method}`)}</span><span>{m(pay.cents)}</span></p>)}
            {receipt.changeCents > 0 && <p><span className="muted">{p("print.change")}</span><span>{m(receipt.changeCents)}</span></p>}
          </div>
          <div className="row wrap gap">
            <button className="button" onClick={() => setPrinting("bon")}><Printer size={17} /> {p("pay.printBon")}</button>
            <button className="button" onClick={() => setPrinting("a4")}><Printer size={17} /> {p("pay.printA4")}</button>
            {isManager && receipt.kind !== "cancel" && !receipt.canceledBy && (
              <button className="button danger push-end" onClick={() => setConfirm(true)}><Undo2 size={17} /> {p("receipts.cancel")}</button>
            )}
          </div>
          {confirm && (
            <div className="notice stack-sm">
              <p>{p("receipts.cancelConfirm", { number: receipt.number })}</p>
              <div className="row gap">
                <button className="button danger" disabled={busy} onClick={cancel}>{p("receipts.cancel")}</button>
                <button className="button" onClick={() => setConfirm(false)}>{p("print.close")}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {printing && receipt && <ReceiptPrint receipt={receipt} format={printing} onClose={() => setPrinting(null)} />}
    </Dialog>
  );
}
