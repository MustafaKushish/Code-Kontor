import { useEffect, useState } from "react";
import { CalendarClock, Check, CircleCheck, CircleX, Phone, ShieldCheck, Wrench, X } from "lucide-react";
import { api } from "../../api";
import { LanguageSwitch } from "../../layout/LanguageSwitch";
import type { QuoteDecision, RepairDevice, RepairStatus, Totals } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { deviceLabel } from "./parts";
import "./repairs.css";

interface PublicOrder {
  company: { name: string; phone: string; email: string; street: string; postalCode: string; city: string; logoDataUrl: string };
  number: number;
  status: RepairStatus;
  quote: QuoteDecision | null;
  device: Pick<RepairDevice, "type" | "brand" | "model">;
  problem: string;
  dueDay: string;
  createdAt: string;
  items: { name: string; qty: number; unitCents: number }[];
  totals: Totals | null;
  smallBusiness: boolean;
  history: { at: string; status: RepairStatus; event: string }[];
  warrantyUntil: string;
}

const STEP: Record<RepairStatus, number> = { received: 0, diagnosis: 1, quote: 1, waitingParts: 1, repairing: 1, ready: 2, notRepaired: 2, pickedUp: 3, canceled: -1 };

/** Öffentliche Statusseite für Endkunden: Link oder QR-Code vom Annahmeschein, ohne Anmeldung. */
export default function StatusPage({ tenantId, token }: { tenantId: string; token: string }) {
  const { r, euro, day, dateTime, ready } = useRepairI18n();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [decided, setDecided] = useState<boolean | null>(null);
  const url = `/repair-status/${tenantId}/${token}`;

  useEffect(() => {
    api<PublicOrder>(url).then(setOrder).catch(() => setInvalid(true));
  }, [url]);

  const decide = async (approve: boolean) => {
    if (!approve && !confirm(r("public.rejectConfirm"))) return;
    setBusy(true);
    setError("");
    try {
      setOrder(await api<PublicOrder>(`${url}/decision`, { method: "POST", body: { approve } }));
      setDecided(approve);
    } catch {
      setError(r("errors.statusNotAllowed"));
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;
  if (invalid) return <div className="status-page"><p className="notice">{r("public.notFound")}</p></div>;
  if (!order) return <div className="splash"><img src="/icon.svg" alt="" width={56} height={56} /></div>;

  const step = STEP[order.status];
  const steps = ["received", "working", "done", "pickedUp"] as const;
  const c = order.company;

  return (
    <div className="status-page">
      <header className="status-top">
        <div className="status-brand">
          {c.logoDataUrl ? <img src={c.logoDataUrl} alt="" /> : <Wrench size={22} />}
          <strong>{c.name}</strong>
        </div>
        <LanguageSwitch compact />
      </header>

      <main className="stack">
        <section className="card stack status-hero">
          <p className="muted">{r("public.title")} · {r("public.order", { number: order.number })}</p>
          <h1 className="display">{deviceLabel(order.device)}</h1>
          <p className="status-text">{r(`public.text.${order.status}`)}</p>
          {step >= 0 && (
            <ol className="status-steps">
              {steps.map((s, i) => (
                <li key={s} className={i < step ? "done" : i === step ? "current" : ""}>
                  <span className="bullet">{i < step ? <Check size={14} /> : i + 1}</span>
                  <span>{r(`public.steps.${s}`)}</span>
                </li>
              ))}
            </ol>
          )}
          {order.dueDay && step >= 0 && step < 2 && <p className="muted"><CalendarClock size={15} /> {r("public.expected", { day: day(order.dueDay) })}</p>}
          {order.warrantyUntil && <p className="pill pos"><ShieldCheck size={14} /> {r("public.warranty", { day: day(order.warrantyUntil) })}</p>}
        </section>

        {decided !== null && <p className="notice success">{decided ? <CircleCheck size={17} /> : <CircleX size={17} />} {decided ? r("public.approved") : r("public.rejected")}</p>}

        {order.totals && order.items.length > 0 && (
          <section className="card stack">
            <h2>{r("print.quoteTitle")}</h2>
            <div className="repair-items">
              {order.items.map((it, i) => (
                <div key={i} className="repair-item">
                  <span className="list-main"><strong>{it.name}</strong>{it.qty !== 1 && <small className="muted">{it.qty} × {euro(it.unitCents)}</small>}</span>
                  <strong className="amount">{euro(Math.round(it.qty * it.unitCents))}</strong>
                </div>
              ))}
            </div>
            <div className="repair-totals">
              {!order.smallBusiness && order.totals.vat.filter((v) => v.rate > 0).map((v) => (
                <p key={v.rate}><span className="muted">{r("order.vatAmount", { rate: v.rate })}</span><span>{euro(v.vatCents)}</span></p>
              ))}
              <p className="grand"><span>{r("order.total")}</span><strong>{euro(order.totals.grossCents)}</strong></p>
            </div>
            {order.status === "quote" && order.quote === "pending" && (
              <div className="stack-sm">
                <p className="muted small">{r("print.quoteValid")}</p>
                <div className="row wrap gap">
                  <button className="button primary" disabled={busy} onClick={() => decide(true)}><Check size={18} /> {r("public.approve")}</button>
                  <button className="button" disabled={busy} onClick={() => decide(false)}><X size={18} /> {r("public.reject")}</button>
                </div>
                {error && <p className="error">{error}</p>}
              </div>
            )}
          </section>
        )}

        <section className="card stack">
          <ol className="repair-timeline">
            {[...order.history].reverse().map((e, i) => (
              <li key={i}>
                <span className="dot" aria-hidden />
                <div>
                  <strong>{r(`status.${e.status}`)}</strong>
                  <small className="muted"> · {dateTime(e.at)}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {(c.phone || c.street) && (
          <section className="card stack-sm">
            {c.phone && <a className="button" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}><Phone size={16} /> {r("public.contact")}: {c.phone}</a>}
            <p className="muted small">{c.name} · {c.street} · {c.postalCode} {c.city}</p>
          </section>
        )}
      </main>
    </div>
  );
}
