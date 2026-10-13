import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../api";
import { type RepairStats } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";

const localDay = (d = new Date()) => d.toLocaleDateString("en-CA");
const shiftMonth = (month: string, n: number) => {
  const d = new Date(`${month}-15T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return localDay(d).slice(0, 7);
};

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
