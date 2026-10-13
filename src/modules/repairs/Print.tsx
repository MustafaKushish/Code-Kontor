import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { api } from "../../api";
import type { CompanyProfile } from "../../../shared/company";
import { computeTotals, type InvoiceSnapshot, type RepairOrder, type RepairSettings } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { deviceLabel } from "./parts";

export type PrintKind = "intake" | "quote" | "invoice";

/** Druckansicht für Annahmeschein, Kostenvoranschlag und Rechnung (A4, auch als PDF speicherbar). */
export function PrintView({ kind, order, statusUrl, qr, settings, onClose }: {
  kind: PrintKind; order: RepairOrder; statusUrl: string; qr: string; settings: RepairSettings | null; onClose: () => void;
}) {
  const { r, euro, day } = useRepairI18n();
  const [company, setCompany] = useState<InvoiceSnapshot["company"] | null>(order.invoice && kind === "invoice" ? order.invoice.snapshot.company : null);

  useEffect(() => {
    document.body.classList.add("ck-printing");
    if (!company) api<{ company: CompanyProfile | null }>("/company").then((d) => setCompany({ ...(d.company ?? ({} as CompanyProfile)) })).catch(() => {});
    return () => document.body.classList.remove("ck-printing");
  }, []);

  const snap = kind === "invoice" && order.invoice ? order.invoice.snapshot : null;
  const items = snap ? snap.items : order.items;
  const smallBusiness = snap ? snap.smallBusiness : settings?.smallBusiness ?? false;
  const totals = snap ? snap.totals : computeTotals(items, smallBusiness);
  const customer = snap ? snap.customer : order.customer;
  const device = snap ? snap.device : order.intake.device;
  const deposit = snap ? snap.depositCents : order.intake.depositCents;
  const title = kind === "intake" ? r("print.intakeTitle") : kind === "quote" ? r("print.quoteTitle") : r("print.invoiceTitle");
  const docDate = kind === "invoice" && order.invoice ? order.invoice.issuedAt : kind === "intake" ? order.createdAt : new Date().toISOString();

  return createPortal(
    <div className="print-layer">
      <div className="print-toolbar">
        <button className="button primary" onClick={() => window.print()}><Printer size={18} /> {r("print.printNow")}</button>
        <button className="button" onClick={onClose}><X size={18} /> {r("print.close")}</button>
      </div>
      <article className="print-sheet">
        <header className="print-head">
          <div>
            {company?.logoDataUrl && <img src={company.logoDataUrl} alt="" className="print-logo" />}
            <strong className="print-company">{company?.name}</strong>
            <p>{company?.street}<br />{company?.postalCode} {company?.city}</p>
            <p>{[company?.phone, company?.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="print-meta">
            <h1>{title}</h1>
            {kind === "invoice" && order.invoice && <p><strong>{order.invoice.number}</strong></p>}
            <p>{r("print.order")} #{order.number}</p>
            <p>{r("print.date")}: {day(docDate)}</p>
          </div>
        </header>

        <section className="print-grid">
          <div>
            <h2>{r("print.customer")}</h2>
            <p>{customer.name}<br />{customer.phone}{customer.phone && customer.email ? <br /> : null}{customer.email}</p>
          </div>
          <div>
            <h2>{r("print.device")}</h2>
            <p>
              {r(`devices.${device.type}`)}: {deviceLabel(device)}
              {device.serial && <><br />{r("intake.serial")}: <span className="mono">{device.serial}</span></>}
              {device.color && <><br />{r("intake.color")}: {device.color}</>}
            </p>
          </div>
        </section>

        {kind === "intake" ? (
          <>
            <section>
              <h2>{r("print.problem")}</h2>
              <p className="pre">{order.intake.problem}</p>
            </section>
            {(order.intake.accessories.length > 0 || order.intake.accessoriesOther) && (
              <section>
                <h2>{r("order.accessories")}</h2>
                <p>{[...order.intake.accessories.map((a) => r(`accessories.${a}`)), order.intake.accessoriesOther].filter(Boolean).join(", ")}</p>
              </section>
            )}
            {order.intake.condition && (
              <section>
                <h2>{r("order.condition")}</h2>
                <p className="pre">{order.intake.condition}</p>
              </section>
            )}
            <section className="print-grid">
              <div>
                <h2>{r("print.estimate")}</h2>
                <p>{order.intake.estimateCents ? euro(order.intake.estimateCents) : r("print.open")}</p>
              </div>
              <div>
                <h2>{r("print.approvedUpTo")}</h2>
                <p>{order.intake.approvedUpToCents ? euro(order.intake.approvedUpToCents) : r("print.always")}</p>
              </div>
              {order.intake.depositCents > 0 && (
                <div>
                  <h2>{r("order.deposit")}</h2>
                  <p>{euro(order.intake.depositCents)}</p>
                </div>
              )}
              {order.intake.dueDay && (
                <div>
                  <h2>{r("intake.dueDay")}</h2>
                  <p>{day(order.intake.dueDay)}</p>
                </div>
              )}
            </section>
            {settings?.intakeTerms && <p className="print-terms">{settings.intakeTerms}</p>}
            <section className="print-sign">
              <div><span />{r("print.signatureCustomer")}</div>
              <div><span />{r("print.signatureShop")}</div>
            </section>
            <section className="print-qr">
              {qr && <img src={qr} alt="" width={110} height={110} />}
              <p>{r("print.scan")}<br /><span className="small">{statusUrl}</span></p>
            </section>
          </>
        ) : (
          <>
            <table className="print-table">
              <thead>
                <tr><th>{r("print.pos")}</th><th>{r("print.description")}</th><th className="num">{r("print.qty")}</th><th className="num">{r("print.unit")}</th><th className="num">{r("print.amount")}</th></tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id}>
                    <td>{i + 1}</td>
                    <td>{item.name}{!smallBusiness && <small> ({item.vatRate} %)</small>}</td>
                    <td className="num">{item.qty}</td>
                    <td className="num">{euro(item.unitCents)}</td>
                    <td className="num">{euro(Math.round(item.qty * item.unitCents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="print-totals">
              {!smallBusiness && <p><span>{r("order.net")}</span><span>{euro(totals.netCents)}</span></p>}
              {!smallBusiness && totals.vat.filter((v) => v.rate > 0).map((v) => (
                <p key={v.rate}><span>{r("order.vatAmount", { rate: v.rate })}</span><span>{euro(v.vatCents)}</span></p>
              ))}
              <p className="grand"><span>{r("order.total")}</span><strong>{euro(totals.grossCents)}</strong></p>
              {deposit > 0 && (
                <>
                  <p><span>{r("order.deposit")}</span><span>− {euro(deposit)}</span></p>
                  <p className="grand"><span>{r("order.toPay")}</span><strong>{euro(Math.max(0, totals.grossCents - deposit))}</strong></p>
                </>
              )}
            </div>
            {smallBusiness && <p>{r("print.smallBusiness")}</p>}
            {kind === "quote" && <p>{r("print.quoteValid")}</p>}
            {kind === "invoice" && order.invoice && (
              <>
                <p>{r("print.paid", { method: r(`payment.${order.invoice.paymentMethod}`) })}</p>
                <p>{r("print.serviceDate")}</p>
                {order.invoice.warrantyUntil && <p>{r("print.warranty", { day: day(order.invoice.warrantyUntil) })}</p>}
              </>
            )}
          </>
        )}

        <footer className="print-foot">
          {company?.taxNumber && <span>{r("print.taxNumber")}: {company.taxNumber}</span>}
          {company?.vatId && <span>{r("print.vatId")}: {company.vatId}</span>}
          {company?.iban && <span>{r("print.bank")}: {[company.bankName, company.iban, company.bic].filter(Boolean).join(" · ")}</span>}
        </footer>
      </article>
    </div>,
    document.body,
  );
}
