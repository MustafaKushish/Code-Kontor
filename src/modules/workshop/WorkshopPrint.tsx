import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { billedPositions, workshopTotals, type WorkshopOrder } from "../../../shared/workshop";
import { api } from "../../api";
import type { CompanyProfile } from "../../../shared/company";
import { useWorkshopI18n } from "./i18n";

interface WorkshopPrintProps {
  order: WorkshopOrder;
  company?: CompanyProfile | null;
  type: "intake" | "invoice";
  onClose: () => void;
}

export function WorkshopPrint({ order, company: given, type, onClose }: WorkshopPrintProps) {
  const isInvoice = type === "invoice";
  const { t, euro: fmtEuro, num, day, lift, unit, payment, inspectionName } = useWorkshopI18n();

  const handlePrint = () => {
    window.print();
  };

  // Druckmodus der Plattform: blendet beim Drucken alles außer dem Blatt aus
  // Firmendaten wie bei den anderen Ausdrucken: übergeben oder aus /company
  const [company, setCompany] = useState<CompanyProfile | null>(given ?? null);

  useEffect(() => {
    document.body.classList.add("ck-printing");
    if (!given) api<{ company: CompanyProfile | null }>("/company").then((d) => setCompany(d.company)).catch(() => {});
    return () => document.body.classList.remove("ck-printing");
  }, []);

  return createPortal(
    <div className="print-layer">
      {/* Controls - versteckt im Druck */}
      <div className="print-toolbar">
        <button onClick={handlePrint} className="button primary">
          <Printer size={18} />
          {t("print.printNow")}
        </button>
        <button onClick={onClose} className="button">
          <X size={18} />
          {t("common.close")}
        </button>
      </div>

      {/* Druckdokument im DIN-A4-Format */}
      <article className="print-sheet" aria-label={isInvoice ? t("print.invoiceAria") : t("print.intakeAria")}>
        {/* Briefkopf */}
        <header className="print-head">
          <div>
            <strong className="print-company">{company?.name || t("print.defaultCompany")}</strong>
            <p>{company?.legalForm ? `${company.name} ${company.legalForm}` : t("print.defaultTagline")}</p>
            {company?.street && <p>{company.street}</p>}
            {company?.postalCode && company?.city && (
              <p>
                {company.postalCode} {company.city}
              </p>
            )}
            {company?.phone && <p>{t("print.phone", { v: company.phone })}</p>}
            {company?.email && <p>{t("print.email", { v: company.email })}</p>}
          </div>

          <div className="print-meta">
            <h1>{isInvoice ? t("print.invoice") : t("print.order")}</h1>
            <p>
              {t("print.orderNo")} <strong>{order.orderNumber}</strong>
            </p>
            <p>{t("print.date", { date: day(order.createdAt) })}</p>
            <p>{t("print.lift", { lift: lift(order.liftBay) })}</p>
            {order.mechanicName && <p>{t("print.mechanic", { name: order.mechanicName })}</p>}
          </div>
        </header>

        {/* Empfänger / Kunde & Fahrzeugdaten */}
        <div className="print-grid">
          <div>
            <h2>{t("print.customer")}</h2>
            <strong>{order.customerName}</strong>
            <p>{order.customerPhone}</p>
            {order.customerEmail && <p>{order.customerEmail}</p>}
          </div>
          <div>
            <h2>{t("print.vehicle")}</h2>
            <strong>{order.licensePlate}</strong>
            <p>{order.vehicleInfo}</p>
            <p>{t("print.mileage", { km: num(order.mileage) })}</p>
          </div>
        </div>

        {/* Beanstandung / Auftrag */}
        <div>
          <h2>{t("print.issue")}</h2>
          <p>{order.issueDescription || t("print.defaultIssue")}</p>
        </div>

        {/* Diagnose / Befund falls vorhanden */}
        {order.diagnosticNotes && (
          <div>
            <h2>{t("print.diagnosis")}</h2>
            <p>{order.diagnosticNotes}</p>
          </div>
        )}

        {/* Checkliste / Dialogannahme (nur auf Werkstattauftrag) */}
        {!isInvoice && order.checklist && order.checklist.length > 0 && (
          <div>
            <h2>{t("print.checklist")}</h2>
            <table className="print-table">
              <tbody>
                {order.checklist.map((item) => (
                  <tr key={item.id}>
                    <td>{inspectionName(item)}</td>
                    <td className="num">
                      <strong>
                        {t(`inspection.status.${item.status === "not_checked" ? "notChecked" : item.status}`)}
                        {item.value ? ` (${item.value})` : ""}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Positionstabelle */}
        <div>
          <h2>{t("print.positions")}</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>{t("print.cols.type")}</th>
                <th>{t("print.cols.name")}</th>
                <th className="num">{t("print.cols.qty")}</th>
                <th className="num">{t("print.cols.unitPrice")}</th>
                <th className="num">{t("print.cols.vat")}</th>
                <th className="num">{t("print.cols.total")}</th>
              </tr>
            </thead>
            <tbody>
              {order.positions.map((pos) => {
                const lineNet = pos.quantity * pos.unitPriceNet;
                return (
                  <tr key={pos.id}>
                    <td>
                      <small>
                        {pos.type === "labor" ? t("posType.labor") : t("posType.part")} {pos.code || ""}
                      </small>
                    </td>
                    <td>{pos.name}</td>
                    <td className="num">
                      {num(pos.quantity)} {unit(pos.unit)}
                    </td>
                    <td className="num">{fmtEuro(pos.unitPriceNet)}</td>
                    <td className="num">{num(pos.taxRate)}%</td>
                    <td className="num">
                      <strong>{fmtEuro(lineNet)}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summenblock */}
        <div className="print-totals">
          <p>
            <span>{t("print.totalNet")}</span>
            <span>{fmtEuro(order.totalNet)}</span>
          </p>
          {/* Eine Zeile je Steuersatz der abgerechneten Positionen */}
          {workshopTotals(billedPositions(order)).vat.map((v) => (
            <p key={v.rate}>
              <span>{t("print.vat", { rate: num(v.rate) })}</span>
              <span>{fmtEuro(v.tax)}</span>
            </p>
          ))}
          <p className="grand">
            <strong>{t("print.total")}</strong>
            <strong>{fmtEuro(order.totalGross)}</strong>
          </p>
          {order.paymentStatus === "bezahlt" && <p>{t("print.paid", { method: payment(order.paymentMethod) })}</p>}
        </div>

        {/* Unterschriftenblock (für Werkstattauftrag) */}
        {!isInvoice && (
          <div className="print-sign">
            <div>
              <p>{t("print.signCustomer")}</p>
              <span />
              {t("print.signCustomerLine")}
            </div>
            <div>
              <p>{t("print.signShop")}</p>
              <span />
              {t("print.signShopLine")}
            </div>
          </div>
        )}

        {/* Fußzeile */}
        {company && (
          <footer className="print-foot">
            {company.taxNumber && <span>{t("print.taxNumber", { v: company.taxNumber })}</span>}
            {company.vatId && <span>{t("print.vatId", { v: company.vatId })}</span>}
            {company.iban && <span>IBAN: {company.iban}</span>}
            {company.bic && <span>BIC: {company.bic}</span>}
          </footer>
        )}
      </article>
    </div>,
    document.body,
  );
}
