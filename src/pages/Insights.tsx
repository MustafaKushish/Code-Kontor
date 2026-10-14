import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, ChevronLeft, ChevronRight, Clock, CreditCard, Gift, Landmark, Receipt, RotateCcw, ShoppingCart, Sparkles, Users } from "lucide-react";
import { api, type Me } from "../api";
import { AppIcon, appStyle, Link } from "../components";
import { useI18n } from "../i18n";
import { askAssistant, setAssistantContext, type AssistantTips } from "../layout/Assistant";
import { formatMoney } from "../money";
import { findApp } from "../../shared/apps";
import { PAY_METHODS, POS_APP_ID, type PayMethod } from "../../shared/pos";
import { REPAIR_APP_ID } from "../../shared/repairs";
import { adviceFor, nextMonthOf, type Tip } from "../../shared/advice";
import { INSIGHT_PERIODS, periodRange, type InsightPeriod, type Insights } from "../../shared/insights";

// Zentrale Auswertung für Inhaber und Admins: Zahlen aus allen Systemen der Firma für einen Zeitraum.

const METHOD_ICONS: Record<PayMethod, typeof Banknote> = { cash: Banknote, card: CreditCard, transfer: Landmark, voucher: Gift };
const METHOD_HUES: Record<PayMethod, number> = { cash: 160, card: 245, transfer: 200, voucher: 28 };
/** Farbtöne der Warengruppen, wie an der Kasse */
const HUES = [168, 245, 28, 330, 200, 140, 280, 52, 350, 190];
const PERIOD_KEY = "ck-insights-period";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
const hueStyle = (hue: number) => ({ "--hue": hue }) as CSSProperties;

function storedPeriod(): InsightPeriod {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    return INSIGHT_PERIODS.includes(v as InsightPeriod) ? (v as InsightPeriod) : "month";
  } catch {
    return "month";
  }
}

/** ISO-Kalenderwoche eines Tages (YYYY-MM-DD). */
function isoWeek(day: string): number {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

export function InsightsPage({ me }: { me: Me }) {
  const { t, lang, appText, errorText } = useI18n();
  const [period, setPeriod] = useState<InsightPeriod>(storedPeriod);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  const range = useMemo(() => periodRange(period, offset, today()), [period, offset]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    api<Insights>(`/insights?from=${range.from}&to=${range.to}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const choose = (p: InsightPeriod) => {
    setPeriod(p);
    setOffset(0);
    try {
      localStorage.setItem(PERIOD_KEY, p);
    } catch {
      // ohne Speicher bleibt es beim Monat
    }
  };

  const money = (cents: number) => formatMoney(cents, lang);
  const num = (n: number, digits = 0) => n.toLocaleString(lang, { maximumFractionDigits: digits });
  const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString(lang, { timeZone: "UTC", ...opts });

  const label =
    period === "day"
      ? offset === 0 ? t("insights.today") : offset === -1 ? t("insights.yesterday") : dayLabel(range.from, { weekday: "short", day: "numeric", month: "long" })
      : period === "week"
        ? `${t("insights.week", { n: isoWeek(range.from) })} · ${dayLabel(range.from, { day: "numeric", month: "short" })} – ${dayLabel(range.to, { day: "numeric", month: "short" })}`
        : period === "month" ? dayLabel(range.from, { month: "long", year: "numeric" }) : range.from.slice(0, 4);

  const fresh = data && data.from === range.from && data.to === range.to ? data : null;
  const sales = fresh?.sales;
  const hasSales = !!sales && (sales.receipts > 0 || sales.cancels > 0 || sales.revenueCents !== 0);
  const includesToday = range.from <= today() && today() <= range.to;

  // Solange die Auswertung offen ist, zeigt ein neues Gespräch im Assistenten ihre Vorschläge statt der allgemeinen Beispiele
  const aiOn = !!me.privacy?.assistant;
  useEffect(() => {
    const tips = buildTips();
    setAssistantContext(tips ? { tips, insights: { from: range.from, to: range.to } } : null);
  }, [fresh, lang, aiOn]);
  useEffect(() => () => setAssistantContext(null), []);

  return (
    <div className="stack insights">
      <header className="page-head">
        <div>
          <h1 className="display">{t("insights.title")}</h1>
          <p className="muted">{t("insights.subtitle")}</p>
        </div>
        <button className="button ai-button" onClick={showTips}>
          <Sparkles size={18} /> {t("insights.aiTips")}
        </button>
      </header>

      <div className="insights-bar">
        <div className="segmented four" role="radiogroup" aria-label={t("insights.period")}>
          {INSIGHT_PERIODS.map((p) => (
            <button key={p} role="radio" aria-checked={period === p} className={period === p ? "active" : ""} onClick={() => choose(p)}>
              {t(`insights.periods.${p}`)}
            </button>
          ))}
        </div>
        <div className="insights-nav">
          <button className="icon-button" onClick={() => setOffset(offset - 1)} aria-label={t("insights.prev")} title={t("insights.prev")}>
            <ChevronLeft size={18} className="flip-rtl" />
          </button>
          <strong>{label}</strong>
          <button className="icon-button" onClick={() => setOffset(offset + 1)} disabled={offset >= 0} aria-label={t("insights.next")} title={t("insights.next")}>
            <ChevronRight size={18} className="flip-rtl" />
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className={fresh ? "insights-grid" : "insights-grid loading"} aria-busy={!fresh}>
        <section className="tile hero-tile insights-hero">
          <div className="aurora" aria-hidden><span /><span /><span /></div>
          <div className="insights-hero-body">
            <div className="insights-hero-top">
              <div>
                <p className="hero-eyebrow">{t("insights.revenue")} · {label}</p>
                <p className="insights-revenue display">{sales ? money(sales.revenueCents) : "–"}</p>
                {fresh && <Trend now={fresh.sales.revenueCents} before={fresh.previous.revenueCents} money={money} />}
              </div>
              {!hasSales && fresh && (
                <div className="insights-empty">
                  <strong>{t("insights.empty")}</strong>
                  <small>{t("insights.emptyHint")}</small>
                  {me.installedApps.includes(POS_APP_ID) && <Link to="/kasse" className="button light"><ShoppingCart size={17} /> {t("insights.toPos")}</Link>}
                </div>
              )}
            </div>
            {sales && <Chart series={sales.series} bucket={fresh!.bucket} money={money} lang={lang} title={t(`insights.chart.${fresh!.bucket}`)} />}
          </div>
        </section>

        <div className="tile stat-tile insights-stat">
          <span className="stat-icon"><Receipt size={20} /></span>
          <strong className="display">{sales ? num(sales.receipts) : "–"}</strong>
          <small>{t("insights.receipts")}</small>
          <small className="faint">{t("insights.receiptsHint")}</small>
        </div>
        <div className="tile stat-tile insights-stat">
          <span className="stat-icon"><ShoppingCart size={20} /></span>
          <strong className="display">{sales?.receipts ? money(Math.round(sales.revenueCents / sales.receipts)) : "–"}</strong>
          <small>{t("insights.avgReceipt")}</small>
          <small className="faint">{t("insights.avgHint")}</small>
        </div>
        <div className="tile stat-tile insights-stat">
          <span className="stat-icon warn"><RotateCcw size={20} /></span>
          <strong className="display">{sales ? num(sales.cancels) : "–"}</strong>
          <small>{t("insights.cancels")}</small>
          <small className="faint">{sales?.cancels ? t("insights.cancelSum", { amount: money(sales.cancelCents) }) : " "}</small>
        </div>
        <Link to="/zeiten" className="tile stat-tile insights-stat">
          <span className="stat-icon"><Clock size={20} /></span>
          <strong className="display">{fresh ? t("insights.hours", { h: num(fresh.time.minutes / 60, fresh.time.minutes >= 6000 ? 0 : 1) }) : "–"}</strong>
          <small>{t("insights.workTime")}</small>
          <small className="faint">
            {fresh && includesToday && fresh.time.present > 0
              ? t("insights.workPresent", { n: fresh.time.present })
              : fresh ? t("insights.workPeople", { n: fresh.time.people }) : " "}
          </small>
        </Link>

        <section className="card insights-card">
          <div className="section-head"><h2>{t("insights.paidWith")}</h2></div>
          {sales && <Methods byMethod={sales.byMethod} money={money} lang={lang} />}
          <small className="faint">{t("insights.paidHint")}</small>
        </section>

        <section className="card insights-card">
          <div className="section-head"><h2>{t("insights.groups")}</h2></div>
          {sales && <Bars rows={sales.groups.map((g, i) => ({ key: g.group || "-", label: groupLabel(g.group), cents: g.cents, hue: HUES[i % HUES.length]!, hint: t("insights.pieces", { n: num(g.qty) }) }))} money={money} empty={t("insights.noData")} />}
        </section>

        <section className="card insights-card">
          <div className="section-head"><h2>{t("insights.articles")}</h2></div>
          {sales && sales.articles.length === 0 && <p className="muted">{t("insights.noData")}</p>}
          <ol className="insights-top">
            {sales?.articles.slice(0, 6).map((a, i) => (
              <li key={`${a.group}-${a.name}`}>
                <span className="insights-rank">{i + 1}</span>
                <span className="insights-top-name"><strong>{a.name}</strong><small>{groupLabel(a.group)} · {t("insights.pieces", { n: num(a.qty) })}</small></span>
                <strong className="insights-amount">{money(a.cents)}</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className={fresh?.repairs ? "card insights-card span-5" : "card insights-card span-6"}>
          <div className="section-head"><h2>{t("insights.rushHours")}</h2><small className="muted">{t("insights.rushHint")}</small></div>
          {sales && <Hours hours={sales.hours} money={money} />}
        </section>

        <section className={fresh?.repairs ? "card insights-card span-3" : "card insights-card span-6"}>
          <div className="section-head"><h2>{t("insights.bySystem")}</h2></div>
          {sales && sales.sources.length === 0 && <p className="muted">{t("insights.noData")}</p>}
          {sales && <Systems sources={sales.sources} money={money} lang={lang} name={(s) => (s === "pos" ? t("nav.pos") : appText(appOf(s)).name)} />}
        </section>

        {fresh?.repairs && (
          <section className="card insights-card span-4 insights-pipeline" style={appStyle(findApp(REPAIR_APP_ID)!)}>
            <div className="section-head">
              <h2>{t("insights.pipeline")}</h2>
              <Link to={`/app/${REPAIR_APP_ID}`} className="text-link">{appText(REPAIR_APP_ID).name} <ArrowRight size={16} className="flip-rtl" /></Link>
            </div>
            <div className="insights-pipes">
              <div><strong className="display">{fresh.repairs.open}</strong><small>{t("insights.pipelineOpen")}</small></div>
              <div><strong className="display">{fresh.repairs.waiting}</strong><small>{t("insights.pipelineWaiting")}</small></div>
              <div className="ready"><strong className="display">{fresh.repairs.pickup}</strong><small>{t("insights.pipelinePickup")}</small></div>
            </div>
            <small className="muted">{t("insights.pipelineFlow", { received: fresh.repairs.received, pickedUp: fresh.repairs.pickedUp })}</small>
          </section>
        )}
      </div>
    </div>
  );

  /** KI-Tipps: fertige Vorschläge aus den Zahlen sofort zeigen, weitere Fragen gehen an die KI. */
  function showTips() {
    const tips = buildTips();
    if (tips) askAssistant({ insights: range, tips });
    else askAssistant({ question: t("insights.aiQuestion", { period: label }), insights: range });
  }

  function buildTips(): AssistantTips | null {
    if (!fresh) return null;
    const question = t("insights.aiQuestion", { period: label });
    const month = nextMonthOf(today());
    const monthLabel = dayLabel(`${month}-15`, { month: "long", year: "numeric" });
    const percent = (n: number) => (n / 100).toLocaleString(lang, { style: "percent", maximumFractionDigits: 0 });
    const text = (tip: Tip) => {
      const vars: Record<string, string> = {};
      for (const [k, v] of Object.entries(tip.vars)) {
        if (typeof v === "number") vars[k] = k.endsWith("Cents") ? money(v) : k.endsWith("Pct") ? percent(v) : num(v);
        else vars[k] = k === "group" ? groupLabel(v) : v;
      }
      if (tip.vars.month) vars.month = monthLabel;
      if (tip.vars.industry) vars.addon = t(`insights.addons.${tip.vars.industry}`);
      if (tip.vars.season) vars.seasonText = t(`insights.seasons.${tip.vars.season}`);
      return { tone: tip.tone, title: t(`insights.tips.${tip.id}.title`, vars), text: t(`insights.tips.${tip.id}.text`, vars) };
    };
    return {
      title: t("insights.tipsTitle", { month: monthLabel }),
      intro: me.privacy?.assistant ? t("insights.tipsIntro", { period: label }) : t("insights.tipsIntroLocal", { period: label }),
      tips: adviceFor(fresh, me.installedApps, today()).map(text),
      followUps: [
        { label: t("insights.askMore"), question },
        { label: t("insights.askCustomers"), question: t("insights.askCustomers") },
        { label: t("insights.askBasket"), question: t("insights.askBasket") },
      ],
    };
  }

  function groupLabel(group: string): string {
    if (!group) return t("insights.noGroup");
    if (!group.startsWith("@")) return group;
    const key = group.split(".")[1] ?? "other";
    const text = t(`insights.moduleGroups.${key}`);
    return text.startsWith("insights.") ? t("insights.moduleGroups.other") : text;
  }
}

/** App des Katalogs zu einer Herkunft an der Kasse. */
const appOf = (source: string) => (source === "repairs" ? REPAIR_APP_ID : source);

function Trend({ now, before, money }: { now: number; before: number; money: (c: number) => string }) {
  const { t, lang } = useI18n();
  if (!before) return <p className="insights-trend flat">{t("insights.noPrevious")}</p>;
  const change = (now - before) / Math.abs(before);
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className={up ? "insights-trend up" : "insights-trend down"}>
      <span className="insights-trend-pill"><Icon size={15} /> {new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(change)}</span>
      {t("insights.vsPrevious", { amount: money(before) })}
    </p>
  );
}

function Chart({ series, bucket, money, lang, title }: { series: Insights["sales"]["series"]; bucket: Insights["bucket"]; money: (c: number) => string; lang: string; title: string }) {
  const max = Math.max(1, ...series.map((s) => s.cents));
  const now = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  const every = series.length > 24 ? 5 : series.length > 12 ? 2 : 1;
  const tick = (key: string) =>
    bucket === "hour" ? key : bucket === "month" ? new Date(`${key}-15T12:00:00Z`).toLocaleDateString(lang, { month: "short", timeZone: "UTC" }) : String(Number(key.slice(8)));
  const full = (key: string) =>
    bucket === "hour" ? `${key}:00` : bucket === "month" ? new Date(`${key}-15T12:00:00Z`).toLocaleDateString(lang, { month: "long", year: "numeric", timeZone: "UTC" }) : new Date(`${key}T12:00:00Z`).toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const current = (key: string) => (bucket === "day" ? key === now : bucket === "month" ? key === now.slice(0, 7) : false);
  return (
    <div className="insights-chart" role="img" aria-label={title}>
      {series.map((s, i) => (
        <div key={s.key} className={current(s.key) ? "insights-col now" : "insights-col"} title={`${full(s.key)}: ${money(s.cents)}`}>
          <span style={{ height: `${s.cents > 0 ? Math.max(3, Math.round((s.cents / max) * 100)) : 0}%` }} />
          <small>{i % every === 0 || current(s.key) ? tick(s.key) : ""}</small>
        </div>
      ))}
    </div>
  );
}

function Methods({ byMethod, money, lang }: { byMethod: Record<PayMethod, number>; money: (c: number) => string; lang: string }) {
  const { t } = useI18n();
  const used = PAY_METHODS.filter((m) => byMethod[m] !== 0);
  const total = used.reduce((sum, m) => sum + Math.max(0, byMethod[m]), 0);
  if (!used.length) return <p className="muted">{t("insights.noData")}</p>;
  const pct = (m: PayMethod) => (total ? Math.max(0, byMethod[m]) / total : 0);
  return (
    <>
      <div className="insights-split" aria-hidden>
        {used.map((m) => <span key={m} style={{ ...hueStyle(METHOD_HUES[m]), flexGrow: pct(m) }} />)}
      </div>
      <ul className="insights-list">
        {used.map((m) => {
          const Icon = METHOD_ICONS[m];
          return (
            <li key={m} style={hueStyle(METHOD_HUES[m])}>
              <span className="insights-dot"><Icon size={16} /></span>
              <span>{t(`insights.methods.${m}`)} <small className="muted">{new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(pct(m))}</small></span>
              <strong className="insights-amount">{money(byMethod[m])}</strong>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Bars({ rows, money, empty }: { rows: { key: string; label: string; hint: string; cents: number; hue: number }[]; money: (c: number) => string; empty: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.cents));
  return (
    <ul className="insights-bars">
      {rows.map((r) => (
        <li key={r.key} style={hueStyle(r.hue)}>
          <div className="insights-bar-head"><span>{r.label} <small className="muted">{r.hint}</small></span><strong className="insights-amount">{money(r.cents)}</strong></div>
          <div className="insights-track"><span style={{ width: `${Math.max(2, Math.round((Math.max(0, r.cents) / max) * 100))}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Hours({ hours, money }: { hours: number[]; money: (c: number) => string }) {
  // Nur die Stunden mit Umsatz und ein Rahmen drumherum, mindestens 8 bis 20 Uhr
  const active = hours.map((c, h) => (c > 0 ? h : -1)).filter((h) => h >= 0);
  const from = Math.min(8, ...active);
  const to = Math.max(20, ...active);
  const max = Math.max(1, ...hours);
  const peak = active.length ? hours.indexOf(Math.max(...hours)) : -1;
  return (
    <div className="insights-hours">
      {hours.slice(from, to + 1).map((cents, i) => {
        const h = from + i;
        return (
          <div key={h} className={h === peak ? "insights-hour peak" : "insights-hour"} title={`${String(h).padStart(2, "0")}:00 · ${money(cents)}`}>
            <span style={{ height: `${cents > 0 ? Math.max(6, Math.round((cents / max) * 100)) : 0}%` }} />
            <small>{h % 2 === 0 ? h : ""}</small>
          </div>
        );
      })}
    </div>
  );
}

function Systems({ sources, money, name, lang }: { sources: Insights["sales"]["sources"]; money: (c: number) => string; name: (source: string) => string; lang: string }) {
  const total = sources.reduce((sum, s) => sum + Math.max(0, s.cents), 0);
  return (
    <ul className="insights-list">
      {sources.map((s) => {
        const app = findApp(s.source === "pos" ? POS_APP_ID : appOf(s.source));
        return (
          <li key={s.source}>
            {app ? <AppIcon app={app} size="sm" /> : <span className="insights-dot"><Users size={16} /></span>}
            <span>{name(s.source)} <small className="muted">{new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(total ? Math.max(0, s.cents) / total : 0)}</small></span>
            <strong className="insights-amount">{money(s.cents)}</strong>
          </li>
        );
      })}
    </ul>
  );
}
