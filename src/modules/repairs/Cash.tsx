import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { api } from "../../api";
import { Link } from "../../components";
import { PAYMENT_METHODS, type CashDay, type RepairStats } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { PrintFrame } from "./Print";

const BASE = "/app/handy-it";
const localDay = (d = new Date()) => d.toLocaleDateString("en-CA");
const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
};
const shiftMonth = (month: string, n: number) => {
  const d = new Date(`${month}-15T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return localDay(d).slice(0, 7);
};

/** Tagesabschluss: alle Zahlungen eines Tages, getrennt nach Bar, Karte und Überweisung. */
export function CashDayPanel() {
  const { r, euro, day: fmtDay, dateTime, repairError } = useRepairI18n();
  const [day, setDay] = useState(localDay());
  const [data, setData] = useState<CashDay | null>(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    api<CashDay>(`/repairs/cash?day=${day}`).then(setData).catch((e) => setError(repairError(e)));
  }, [day]);

  const time = (iso: string) => dateTime(iso).split(/,\s*|\s+/).pop();
  const link = (e: CashDay["entries"][number]) => (e.kind === "repair" || e.kind === "deposit" ? `${BASE}/auftrag/${e.refId}` : e.kind === "purchase" ? `${BASE}/ankauf` : `${BASE}/rechnungen`);
  const totalIn = data ? PAYMENT_METHODS.reduce((s, m) => s + data.byMethod[m].inCents, 0) : 0;
  const cash = data?.byMethod.cash;

  const summary = data && (
    <div className="cash-summary">
      {PAYMENT_METHODS.map((m) => (
        <div key={m} className="tile stat-tile">
          <small>{r(`payment.${m}`)}</small>
          <strong>{euro(data.byMethod[m].inCents - data.byMethod[m].outCents)}</strong>
          <small className="muted">
            {r("cash.in")} {euro(data.byMethod[m].inCents)}{data.byMethod[m].outCents ? ` · ${r("cash.out")} ${euro(data.byMethod[m].outCents)}` : ""}
          </small>
        </div>
      ))}
    </div>
  );

  return (
    <div className="stack">
      <div className="row wrap gap invoice-year">
        <button className="icon-button" onClick={() => setDay(shiftDay(day, -1))} aria-label={r("cash.prevDay")}><ChevronLeft size={18} className="flip-rtl" /></button>
        <input type="date" value={day} max={localDay()} onChange={(e) => e.target.value && setDay(e.target.value)} className="cash-date" />
        <button className="icon-button" onClick={() => setDay(shiftDay(day, 1))} disabled={day >= localDay()} aria-label={r("cash.nextDay")}><ChevronRight size={18} className="flip-rtl" /></button>
        {data && data.entries.length > 0 && <button className="button push-end" onClick={() => setPrinting(true)}><Printer size={17} /> {r("cash.print")}</button>}
      </div>
      {error && <p className="error">{error}</p>}
      {summary}
      {cash && (cash.inCents || cash.outCents) ? <p className="notice">{r("cash.drawer", { amount: euro(cash.inCents - cash.outCents) })}</p> : null}
      {data && (
        <section className="card list-card">
          {data.entries.length === 0 && <p className="empty muted">{r("cash.empty")}</p>}
          {data.entries.map((e, i) => (
            <Link key={i} to={link(e)} className="list-row">
              <span className={`cash-icon ${e.cents < 0 ? "out" : ""}`}>{e.cents < 0 ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}</span>
              <span className="list-main">
                <strong>{r(`cash.kinds.${e.kind}`)} · {e.ref}</strong>
                <small className="muted">{time(e.at)}{e.label ? ` · ${e.label}` : ""}</small>
              </span>
              <span className="part-row-meta">
                <strong className={e.cents < 0 ? "error" : ""}>{euro(e.cents)}</strong>
                <small className="muted">{r(`payment.${e.method}`)}</small>
              </span>
            </Link>
          ))}
        </section>
      )}
      {data && data.entries.length > 0 && <p className="muted small">{r("cash.hint")}</p>}
      {printing && data && (
        <PrintFrame title={r("cash.printTitle")} onClose={() => setPrinting(false)} meta={<p>{fmtDay(day)}</p>}>
          <table className="print-table">
            <thead>
              <tr><th>{r("cash.time")}</th><th>{r("print.description")}</th><th>{r("order.paymentMethod")}</th><th className="num">{r("print.amount")}</th></tr>
            </thead>
            <tbody>
              {data.entries.map((e, i) => (
                <tr key={i}>
                  <td>{time(e.at)}</td>
                  <td>{r(`cash.kinds.${e.kind}`)} {e.ref}{e.label ? ` · ${e.label}` : ""}</td>
                  <td>{r(`payment.${e.method}`)}</td>
                  <td className="num">{euro(e.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="print-totals">
            {PAYMENT_METHODS.map((m) => (
              <p key={m}><span>{r(`payment.${m}`)}</span><span>{euro(data.byMethod[m].inCents - data.byMethod[m].outCents)}</span></p>
            ))}
            <p className="grand"><span>{r("cash.totalIn")}</span><strong>{euro(totalIn)}</strong></p>
          </div>
          <section className="print-sign">
            <div><span />{r("cash.counted")}</div>
            <div><span />{r("cash.signature")}</div>
          </section>
        </PrintFrame>
      )}
    </div>
  );
}

/** Monatsauswertung für Inhaber und Admins. */
export function StatsPanel() {
  const { r, euro, day, lang, repairError } = useRepairI18n();
  const [month, setMonth] = useState(localDay().slice(0, 7));
  const [data, setData] = useState<RepairStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    api<RepairStats>(`/repairs/stats?month=${month}`).then(setData).catch((e) => setError(repairError(e)));
  }, [month]);

  const monthLabel = new Date(`${month}-15T12:00:00`).toLocaleDateString(lang, { month: "long", year: "numeric" });
  const max = Math.max(1, ...(data?.daily.map((d) => d.cents) ?? []));
  const revenue = data ? data.revenue.repairCents + data.revenue.saleCents : 0;

  return (
    <div className="stack">
      <div className="row wrap gap invoice-year">
        <button className="icon-button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={r("cash.prevMonth")}><ChevronLeft size={18} className="flip-rtl" /></button>
        <strong className="month-label">{monthLabel}</strong>
        <button className="icon-button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= localDay().slice(0, 7)} aria-label={r("cash.nextMonth")}><ChevronRight size={18} className="flip-rtl" /></button>
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <div className="cash-summary four">
            <div className="tile stat-tile"><small>{r("stats.revenue")}</small><strong>{euro(revenue)}</strong><small className="muted">{r("stats.invoices", { n: data.revenue.invoices })}</small></div>
            <div className="tile stat-tile"><small>{r("stats.repairs")}</small><strong>{euro(data.revenue.repairCents)}</strong><small className="muted">{r("stats.pickedUp", { n: data.orders.pickedUp })}</small></div>
            <div className="tile stat-tile"><small>{r("stats.sales")}</small><strong>{euro(data.revenue.saleCents)}</strong><small className="muted">{r("stats.usedSold", { n: data.used.sold })}</small></div>
            <div className="tile stat-tile"><small>{r("stats.received")}</small><strong>{data.orders.received}</strong><small className="muted">{data.orders.avgDays !== null ? r("stats.avgDays", { n: data.orders.avgDays.toLocaleString(lang) }) : r("stats.openNow", { n: data.orders.open })}</small></div>
          </div>

          <section className="card stack">
            <h2>{r("stats.daily")}</h2>
            {data.daily.length === 0 ? <p className="muted">{r("stats.empty")}</p> : (
              <div className="stats-bars" role="img" aria-label={r("stats.daily")}>
                {data.daily.map((d) => (
                  <div key={d.day} className="stats-bar" title={`${day(d.day)}: ${euro(d.cents)}`}>
                    <span style={{ height: `${Math.max(4, Math.round((d.cents / max) * 100))}%` }} />
                    <small>{d.day.slice(8)}</small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="stats-grid">
            <section className="card stack-sm">
              <h2>{r("stats.topModels")}</h2>
              {data.topModels.length === 0 && <p className="muted">–</p>}
              {data.topModels.map((m) => (
                <p key={m.label} className="stats-row"><span>{m.label}</span><strong>{m.n}</strong></p>
              ))}
            </section>
            <section className="card stack-sm">
              <h2>{r("stats.topServices")}</h2>
              {data.topServices.length === 0 && <p className="muted">–</p>}
              {data.topServices.map((s) => (
                <p key={s.label} className="stats-row"><span>{s.label} <small className="muted">× {s.n}</small></span><strong>{euro(s.cents)}</strong></p>
              ))}
            </section>
            <section className="card stack-sm">
              <h2>{r("stats.used")}</h2>
              <p className="stats-row"><span>{r("stats.usedBought", { n: data.used.bought })}</span><strong>{euro(data.used.boughtCents)}</strong></p>
              <p className="stats-row"><span>{r("stats.usedSoldFor", { n: data.used.sold })}</span><strong>{euro(data.used.soldCents)}</strong></p>
              <p className="stats-row"><span>{r("stats.usedProfit")}</span><strong className={data.used.profitCents < 0 ? "error" : "success-text"}>{euro(data.used.profitCents)}</strong></p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
