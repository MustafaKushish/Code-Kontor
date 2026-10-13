import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../api";
import { Link } from "../../components";
import type { InvoiceKind, RepairInvoice } from "../../../shared/repairs";
import type { PayMethod } from "../../../shared/pos";
import { SaleInvoicePrint } from "./Print";
import { useRepairI18n } from "./i18n";

interface InvoiceRow { number: string; kind: InvoiceKind; issuedAt: string; totalCents: number; paymentMethod: PayMethod; orderId: string; orderNumber: number | null; customerName: string; canceledBy: string | null }

/** Alle Rechnungen eines Jahres. Reparatur: öffnet den Auftrag. Verkauf: öffnet die Rechnung zum erneuten Drucken. */
export function InvoicesTab() {
  const { r, euro, day, repairError } = useRepairI18n();
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState<RepairInvoice | null>(null);

  useEffect(() => {
    setRows(null);
    api<{ invoices: InvoiceRow[] }>(`/repairs/invoices?year=${year}`).then((d) => setRows(d.invoices)).catch((e) => setError(repairError(e)));
  }, [year]);

  const openSale = (number: string) =>
    api<{ invoice: RepairInvoice }>(`/repairs/invoices/${encodeURIComponent(number)}`).then((d) => setPrinting(d.invoice)).catch((e) => setError(repairError(e)));

  const sum = (rows ?? []).filter((x) => !x.canceledBy).reduce((s, x) => s + x.totalCents, 0);

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
          {rows.map((x) => {
            const content = (
              <>
                <span className="list-main">
                  <strong>{x.number}{x.canceledBy && <small className="error"> · {r("invoices.canceled", { number: x.canceledBy })}</small>}</strong>
                  <small className="muted">
                    {day(x.issuedAt)}{x.customerName ? ` · ${x.customerName}` : ""} · {x.kind === "sale" ? r("invoices.sale") : `${r("invoices.repair")} #${x.orderNumber}`}
                  </small>
                </span>
                <span className="part-row-meta">
                  <strong>{euro(x.totalCents)}</strong>
                  <small className="muted">{r(`payment.${x.paymentMethod}`)}</small>
                </span>
              </>
            );
            return x.kind === "sale"
              ? <button key={x.number} className="list-row part-row" onClick={() => openSale(x.number)}>{content}</button>
              : <Link key={x.number} to={`/app/handy-it/auftrag/${x.orderId}`} className="list-row">{content}</Link>;
          })}
        </section>
      )}
      {printing && <SaleInvoicePrint invoice={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}
