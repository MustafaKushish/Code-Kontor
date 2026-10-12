import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, Sparkles, TriangleAlert } from "lucide-react";
import { api, type Me } from "../api";
import { Link } from "../components";
import { useI18n } from "../i18n";
import type { BillingInterval, Quote, SubscriptionStatus } from "../../shared/billing";

interface BillingInfo {
  enabled: boolean;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  daysLeft: number;
  access: boolean;
  interval: BillingInterval;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  users: number;
  quotes: Record<BillingInterval, Quote>;
}

function useFormat() {
  const { lang } = useI18n();
  const euro = (cents: number) =>
    new Intl.NumberFormat(lang, { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(new Date(iso)) : "–");
  return { euro, date };
}

/** Hinweis oben auf jeder Seite: Testphase läuft bald ab oder ist abgelaufen. */
export function BillingBanner({ me }: { me: Me }) {
  const { t } = useI18n();
  const b = me.billing;
  if (!b || me.user.role === "staff") return null;
  const locked = !b.access;
  if (!locked && !(b.status === "trialing" && b.daysLeft <= 7) && b.status !== "past_due") return null;
  return (
    <div className="notice verify-banner" role="status">
      <TriangleAlert size={18} aria-hidden />
      <span>{locked ? t("billing.bannerLocked") : b.status === "past_due" ? t("billing.pastDue") : t("billing.bannerTrial", { days: b.daysLeft })}</span>
      <Link to="/konto#abo" className="text-button">{t("billing.bannerAction")}</Link>
    </div>
  );
}

/** Karte „Abo“ auf der Konto-Seite: Status, Preis und Bezahlung über Stripe. */
export function BillingCard({ me }: { me: Me }) {
  const { t, errorText, appText } = useI18n();
  const { euro, date } = useFormat();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [interval, setBillingInterval] = useState<BillingInterval>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const returned = new URLSearchParams(location.search).get("abo");
  const isOwner = me.user.role === "owner";

  const load = () =>
    api<BillingInfo>("/billing").then((r) => {
      setInfo(r);
      if (r.status === "active") setBillingInterval(r.interval);
    });
  useEffect(() => {
    load();
    // Stripe meldet den Abschluss kurz nach der Rückkehr; dann noch einmal nachsehen
    if (returned === "ok") {
      const timer = setTimeout(load, 2500);
      return () => clearTimeout(timer);
    }
  }, []);
  useEffect(() => {
    if (location.hash === "#abo") document.getElementById("abo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [info !== null]);

  const go = async (path: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ url: string }>(path, { method: "POST", body: body ?? {} });
      location.href = r.url;
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  if (!info) return <section id="abo" className="card"><p className="muted">{t("common.loading")}</p></section>;

  const q = info.quotes[interval];
  const subscribed = info.status === "active" || info.status === "past_due";
  const status =
    info.status === "trialing" && info.access ? t("billing.trial", { days: info.daysLeft, date: date(info.trialEndsAt) })
    : info.status === "trialing" ? t("billing.trialEnded")
    : info.status === "active" ? t("billing.active", { interval: t(info.interval === "year" ? "billing.yearly" : "billing.monthly"), date: date(info.currentPeriodEnd) })
    : info.status === "past_due" ? t("billing.pastDue")
    : t("billing.none");

  return (
    <section id="abo" className="card stack billing-card wide-card">
      <h2 className="card-title"><CreditCard size={20} /> {t("billing.title")}</h2>
      {returned === "ok" && <p className="notice success"><Sparkles size={18} /> {t("billing.thanks")}</p>}
      <p className={`billing-status ${info.access ? "" : "error"}`}><strong>{status}</strong></p>
      {info.cancelAtPeriodEnd && <p className="muted">{t("billing.endsOn", { date: date(info.currentPeriodEnd) })}</p>}

      {q.lines.length === 0 ? (
        <p className="notice">{t("billing.noSystems")} <Link to="/katalog" className="text-button">{t("billing.catalogLink")}</Link></p>
      ) : (
        <>
          {!subscribed && (
            <div className="segmented billing-interval" role="radiogroup" aria-label={t("billing.title")}>
              {(["month", "year"] as const).map((i) => (
                <button key={i} type="button" role="radio" aria-checked={interval === i} className={interval === i ? "active" : ""} onClick={() => setBillingInterval(i)}>
                  {t(i === "year" ? "billing.yearly" : "billing.monthly")}
                  {i === "year" && <small> · {t("billing.yearlyHint")}</small>}
                </button>
              ))}
            </div>
          )}
          <table className="price-table">
            <tbody>
              {q.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    {line.kind === "users" ? t("billing.extraUsers", { n: line.quantity }) : appText(line.id).name}
                    {line.discounted && <span className="pill">{t("billing.discount")}</span>}
                  </td>
                  <td>{euro(line.unitAmount * line.quantity)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>{t(interval === "year" ? "billing.totalYear" : "billing.totalMonth")}</th>
                <th>{euro(q.total)}</th>
              </tr>
            </tfoot>
          </table>
          <p className="muted">
            {t("billing.net")}
            {interval === "year" && ` ${t("billing.perMonthEquals", { amount: euro(q.perMonth) })}`}
          </p>
        </>
      )}
      <p className="muted">{t("billing.included", { n: info.users })}</p>

      {!info.enabled ? (
        <p className="notice">{t("billing.notConfigured")}</p>
      ) : !isOwner ? (
        <p className="muted">{t("billing.ownerOnly")}</p>
      ) : (
        <div className="row billing-actions">
          {!subscribed && q.lines.length > 0 && (
            <button className="button primary" disabled={busy} onClick={() => go("/billing/checkout", { interval })}>
              <CreditCard size={18} /> {busy ? t("common.wait") : t("billing.subscribe")}
            </button>
          )}
          {info.hasCustomer && (
            <button className="button" disabled={busy} onClick={() => go("/billing/portal")}>
              <ExternalLink size={18} /> {t("billing.manage")}
            </button>
          )}
        </div>
      )}
      {!subscribed && info.enabled && isOwner && q.lines.length > 0 && <p className="muted">{t("billing.trialKept")}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
