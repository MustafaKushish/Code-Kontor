import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../api";
import { Link } from "../../components";
import type { PaymentMethod } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";

interface InvoiceRow { number: string; issuedAt: string; totalCents: number; paymentMethod: PaymentMethod; orderId: string; orderNumber: number; customerName: string }

/** Alle Reparatur-Rechnungen eines Jahres; öffnen führt zum Auftrag, dort lässt sich die Rechnung erneut drucken. */
export function InvoicesTab() {
  const { r, euro, day, repairError } = useRepairI18n();
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(null);
    api<{ invoices: InvoiceRow[] }>(`/repairs/invoices?year=${year}`).then((d) => setRows(d.invoices)).catch((e) => setError(repairError(e)));
  }, [year]);

  const sum = (rows ?? []).reduce((s, x) => s + x.totalCents, 0);

  return (
    <div className="stack">
      <div className="row gap invoice-year">
        <button className="icon-button" onClick={() => setYear(year - 1)} aria-label={String(year - 1)}><ChevronLeft size={18} className="flip-rtl" /></button>
        <strong>{year}</strong>
        <button className="icon-button" onClick={() => setYear(year + 1)} disabled={year >= new Date().getFullYear()} aria-label={String(year + 1)}><ChevronRight size={18} className="flip-rtl" /></button>
        {rows && rows.length > 0 && <span className="muted invoice-sum">{r("invoices.sum", { year })}: <strong>{euro(sum)}</strong></span>}
      </div>
      {error && <p className="error">{error}</p>}
      {rows && (
        <section className="card list-card">
          {rows.length === 0 && <p className="empty muted">{r("invoices.empty")}</p>}
          {rows.map((x) => (
            <Link key={x.number} to={`/app/handy-it/auftrag/${x.orderId}`} className="list-row">
              <span className="list-main">
                <strong>{x.number}</strong>
                <small className="muted">{day(x.issuedAt)} · {x.customerName} · #{x.orderNumber}</small>
              </span>
              <span className="part-row-meta">
                <strong>{euro(x.totalCents)}</strong>
                <small className="muted">{r(`payment.${x.paymentMethod}`)}</small>
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
