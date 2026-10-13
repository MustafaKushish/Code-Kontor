import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Lock, Printer } from "lucide-react";
import { api } from "../api";
import { currency } from "../money";
import { EURO_DENOMINATIONS, PAY_METHODS, type CashMove, type CashState, type Closing, type ReceiptCompany } from "../../shared/pos";
import { usePosI18n } from "./i18n";
import { METHOD_ICON } from "./PayPanel";
import { ClosingPrint } from "./Print";
import { Dialog, MoneyInput } from "./ui";
import { useRegisterLabel, useRegisters } from "./registers";

/** Kassenbuch: Stand seit dem letzten Abschluss, Einlage/Entnahme, Tagesabschluss mit Zählen, frühere Abschlüsse. */
export function CashBook({ isManager }: { isManager: boolean }) {
  const { p, money, dateTime, posError } = usePosI18n();
  const [state, setState] = useState<CashState | null>(null);
  const [closings, setClosings] = useState<Closing[]>([]);
  const [move, setMove] = useState<"in" | "out" | null>(null);
  const [closing, setClosing] = useState(false);
  const [print, setPrint] = useState<{ closing: Closing; moves: CashMove[] } | null>(null);
  const [company, setCompany] = useState<ReceiptCompany | null>(null);
  const [error, setError] = useState("");
  const { current } = useRegisters();
  const registerName = useRegisterLabel();

  const load = () => {
    api<{ state: CashState }>("/pos/state").then((d) => setState(d.state)).catch((e) => setError(posError(e)));
    api<{ closings: Closing[] }>("/pos/closings").then((d) => setClosings(d.closings)).catch(() => {});
  };
  // Jeder Kassenplatz hat sein eigenes Bargeld; beim Wechsel neu laden
  useEffect(load, [current.id]);
  useEffect(() => {
    api<{ company: ReceiptCompany | null }>("/company").then((d) => setCompany(d.company)).catch(() => {});
  }, []);

  const openClosing = (n: number) =>
    api<{ closing: Closing; moves: CashMove[] }>(`/pos/closings/${n}`).then(setPrint).catch((e) => setError(posError(e)));

  return (
    <div className="stack">
      {error && <p className="error">{error}</p>}
      {state && (
        <>
          <section className="card stack">
            <div className="section-head">
              <h2>{[registerName(state.register?.id, state.register?.name), p("cashbook.now")].filter(Boolean).join(" · ")}</h2>
              <small className="muted">{state.since ? p("cashbook.since", { time: dateTime(state.since) }) : p("cashbook.neverClosed")}</small>
            </div>
            <div className="pos-expected">
              <p><span>{p("cashbook.opening")}</span><span>{money(state.openingCents)}</span></p>
              <p><span>{p("cashbook.cashIn")}</span><span>{money(state.byMethod.cash)}</span></p>
              <p><span>{p("cashbook.moves")}</span><span>{money(state.movesCents)}</span></p>
              <p className="grand"><span>{p("cashbook.expected")}</span><strong>{money(state.expectedCents)}</strong></p>
            </div>
            <div className="pos-methods-grid">
              {PAY_METHODS.filter((m) => m === "cash" || state.byMethod[m]).map((m) => {
                const Icon = METHOD_ICON[m];
                return (
                  <div key={m} className="tile stat-tile">
                    <small><Icon size={15} aria-hidden /> {p(`methods.${m}`)}</small>
                    <strong>{money(state.byMethod[m])}</strong>
                  </div>
                );
              })}
              <div className="tile stat-tile">
                <small>{p("cashbook.sales")}</small>
                <strong>{money(state.salesCents)}</strong>
                <small>{p("cashbook.receipts", { n: state.receipts })}{state.cancels ? ` · ${p("cashbook.cancels", { n: state.cancels })}` : ""}</small>
              </div>
            </div>
            {PAY_METHODS.filter((m) => m !== "cash" && state.otherPayouts[m]).map((m) => (
              <p key={m} className="muted small">{p("cashbook.other", { method: p(`methods.${m}`), amount: money(state.otherPayouts[m]) })}</p>
            ))}
            <div className="row wrap gap">
              <button className="button" onClick={() => setMove("in")}><ArrowDownLeft size={17} /> {p("cashbook.cashInButton")}</button>
              {isManager && <button className="button" onClick={() => setMove("out")}><ArrowUpRight size={17} /> {p("cashbook.cashOutButton")}</button>}
              <button className="button primary push-end" onClick={() => setClosing(true)}><Lock size={17} /> {p("cashbook.close")}</button>
            </div>
          </section>

          <section className="card list-card">
            <h3 className="pos-group-title pad">{p("cashbook.movesTitle")}</h3>
            {state.moves.length === 0 && <p className="empty muted">{p("cashbook.noMoves")}</p>}
            {state.moves.map((m) => (
              <div key={m.id} className="list-row">
                <span className={`pos-icon ${m.cents < 0 ? "out" : "in"}`}>{m.cents < 0 ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}</span>
                <span className="list-main">
                  <strong>{p(`cashbook.kinds.${m.kind}`)}{m.method !== "cash" ? ` · ${p(`methods.${m.method}`)}` : ""}</strong>
                  <small className="muted">{[dateTime(m.at), m.ref, m.note, m.userName].filter(Boolean).join(" · ")}</small>
                </span>
                <strong className={m.cents < 0 ? "error" : ""}>{money(m.cents)}</strong>
              </div>
            ))}
          </section>
        </>
      )}

      <section className="card list-card">
        <h3 className="pos-group-title pad">{p("cashbook.closings")}</h3>
        {closings.length === 0 && <p className="empty muted">{p("cashbook.noClosings")}</p>}
        {closings.map((c) => (
          <button key={c.number} className="list-row pos-article" onClick={() => openClosing(c.number)}>
            <span className="list-main">
              <strong>{p("cashbook.closingRow", { n: c.number })} · {dateTime(c.at)}</strong>
              <small className="muted">{[p("cashbook.sales") + " " + money(c.salesCents), p("cashbook.counted") + " " + money(c.countedCents), c.userName].filter(Boolean).join(" · ")}</small>
            </span>
            <span className="pos-row-meta">
              <strong className={c.differenceCents ? "error" : ""}>{money(c.differenceCents)}</strong>
              <small className="muted">{p("cashbook.difference")}</small>
            </span>
          </button>
        ))}
      </section>

      {move && <MoveDialog kind={move} onClose={() => setMove(null)} onDone={() => (setMove(null), load())} />}
      {closing && state && (
        <CloseDialog
          state={state}
          onClose={() => setClosing(false)}
          onDone={(c) => {
            setClosing(false);
            load();
            openClosing(c.number);
          }}
        />
      )}
      {print && <ClosingPrint closing={print.closing} moves={print.moves} company={company} onClose={() => setPrint(null)} />}
    </div>
  );
}

function MoveDialog({ kind, onClose, onDone }: { kind: "in" | "out"; onClose: () => void; onDone: () => void }) {
  const { p, posError } = usePosI18n();
  const [cents, setCents] = useState<number | null>(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    try {
      await api("/pos/moves", { method: "POST", body: { kind, cents, note } });
      onDone();
    } catch (e) {
      setError(posError(e));
      setBusy(false);
    }
  };
  return (
    <Dialog title={kind === "in" ? p("cashbook.moveTitleIn") : p("cashbook.moveTitleOut")} onClose={onClose}>
      <form className="stack" onSubmit={(e) => (e.preventDefault(), cents && save())}>
        <label className="field"><span className="field-label">{p("cashbook.amount")}</span><MoneyInput cents={cents ?? 0} onChange={setCents} autoFocus /></label>
        <label className="field"><span className="field-label">{p("cashbook.note")}</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={p("cashbook.notePlaceholder")} /></label>
        {error && <p className="error">{error}</p>}
        <button className="button primary" disabled={busy || !cents}>{p("cashbook.save")}</button>
      </form>
    </Dialog>
  );
}

function CloseDialog({ state, onClose, onDone }: { state: CashState; onClose: () => void; onDone: (c: Closing) => void }) {
  const { p, money, posError } = usePosI18n();
  const euro = currency() === "EUR";
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [total, setTotal] = useState<number | null>(state.expectedCents);
  const [bank, setBank] = useState<number | null>(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const counted = euro && Object.values(counts).some((v) => v) ? EURO_DENOMINATIONS.reduce((s, d) => s + d * (Number(counts[d]) || 0), 0) : total ?? 0;
  const difference = counted - state.expectedCents;

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const { closing } = await api<{ closing: Closing }>("/pos/close", { method: "POST", body: { countedCents: counted, bankCents: bank ?? 0, note } });
      onDone(closing);
    } catch (e) {
      setError(posError(e));
      setBusy(false);
    }
  };

  return (
    <Dialog title={p("close.title")} onClose={onClose} wide>
      <div className="stack">
        <p className="muted">{p("close.intro")}</p>
        {euro && (
          <details className="pos-count">
            <summary>{p("close.count")}</summary>
            <div className="pos-denominations">
              {EURO_DENOMINATIONS.map((d) => (
                <label key={d}>
                  <span>{money(d)}</span>
                  <input type="number" min={0} inputMode="numeric" value={counts[d] ?? ""} onChange={(e) => setCounts({ ...counts, [d]: e.target.value })} />
                </label>
              ))}
            </div>
          </details>
        )}
        <label className="field">
          <span className="field-label">{p("close.total")}</span>
          {euro && Object.values(counts).some((v) => v) ? <strong className="pos-counted">{money(counted)}</strong> : <MoneyInput cents={total ?? 0} onChange={setTotal} />}
        </label>
        <div className="pos-expected">
          <p><span>{p("close.expected")}</span><span>{money(state.expectedCents)}</span></p>
          <p className="grand"><span>{p("close.difference")}</span><strong className={difference ? "error" : "success-text"}>{money(difference)}</strong></p>
        </div>
        <div className="grid two">
          <label className="field"><span className="field-label">{p("close.bank")}</span><MoneyInput cents={bank ?? 0} onChange={setBank} /></label>
          <div className="field"><span className="field-label">{p("close.remains")}</span><strong className="pos-counted">{money(counted - (bank ?? 0))}</strong></div>
        </div>
        <label className="field"><span className="field-label">{p("close.note")}</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button className="button primary" disabled={busy || bank === null || total === null} onClick={save}><Printer size={17} /> {p("close.confirm")}</button>
      </div>
    </Dialog>
  );
}
