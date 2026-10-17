import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import type { WorkshopOrder } from "../../../shared/workshop";
import type { CompanyProfile } from "../../../shared/company";

interface WorkshopPrintProps {
  order: WorkshopOrder;
  company?: CompanyProfile | null;
  type: "intake" | "invoice";
  onClose: () => void;
}

export function WorkshopPrint({ order, company, type, onClose }: WorkshopPrintProps) {
  const isInvoice = type === "invoice";

  const handlePrint = () => {
    window.print();
  };

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  // Druckmodus der Plattform: blendet beim Drucken alles außer dem Blatt aus
  useEffect(() => {
    document.body.classList.add("ck-printing");
    return () => document.body.classList.remove("ck-printing");
  }, []);

  return createPortal(
    <div className="print-layer">
      {/* Controls - versteckt im Druck */}
      <div className="print-toolbar">
        <button onClick={handlePrint} className="button primary">
          <Printer size={18} />
          Jetzt drucken
        </button>
        <button onClick={onClose} className="button">
          <X size={18} />
          Schließen
        </button>
      </div>

      {/* Druckdokument im DIN-A4-Format */}
      <article className="print-sheet" aria-label={isInvoice ? "Werkstattrechnung drucken" : "Werkstattauftrag & Annahmeschein"}>
        {/* Briefkopf */}
        <header className="print-head">
          <div>
            <strong className="print-company">{company?.name || "Kfz-Meisterbetrieb & Service"}</strong>
            <p>{company?.legalForm ? `${company.name} ${company.legalForm}` : "Kfz-Reparaturen & Fahrzeughandel"}</p>
            {company?.street && <p>{company.street}</p>}
            {company?.postalCode && company?.city && (
              <p>
                {company.postalCode} {company.city}
              </p>
            )}
            {company?.phone && <p>Tel: {company.phone}</p>}
            {company?.email && <p>E-Mail: {company.email}</p>}
          </div>

          <div className="print-meta">
            <h1>{isInvoice ? "Rechnung" : "Werkstattauftrag"}</h1>
            <p>
              Auftrags-Nr.: <strong>{order.orderNumber}</strong>
            </p>
            <p>Datum: {new Date(order.createdAt).toLocaleDateString("de-DE")}</p>
            <p>Hebebühne: {order.liftBay}</p>
            {order.mechanicName && <p>Mechaniker: {order.mechanicName}</p>}
          </div>
        </header>

        {/* Empfänger / Kunde & Fahrzeugdaten */}
        <div className="print-grid">
          <div>
            <h2>Kunde / Halter</h2>
            <strong>{order.customerName}</strong>
            <p>{order.customerPhone}</p>
            {order.customerEmail && <p>{order.customerEmail}</p>}
          </div>
          <div>
            <h2>Fahrzeugdaten</h2>
            <strong>{order.licensePlate}</strong>
            <p>{order.vehicleInfo}</p>
            <p>Kilometerstand: {order.mileage.toLocaleString("de-DE")} km</p>
          </div>
        </div>

        {/* Beanstandung / Auftrag */}
        <div>
          <h2>Kundenauftrag / Beanstandung</h2>
          <p>{order.issueDescription || "Regulärer Inspektions- und Wartungsauftrag."}</p>
        </div>

        {/* Diagnose / Befund falls vorhanden */}
        {order.diagnosticNotes && (
          <div>
            <h2>Werkstatt-Diagnose & Befund</h2>
            <p>{order.diagnosticNotes}</p>
          </div>
        )}

        {/* Checkliste / Dialogannahme (nur auf Werkstattauftrag) */}
        {!isInvoice && order.checklist && order.checklist.length > 0 && (
          <div>
            <h2>Dialogannahme & Inspektionsbefund</h2>
            <table className="print-table">
              <tbody>
                {order.checklist.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td className="num">
                      <strong>
                        {item.status === "ok" ? "OK" : item.status === "warning" ? "Hinweis" : "Mangel"}
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
          <h2>Leistungspositionen & Ersatzteile</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>Art / Code</th>
                <th>Bezeichnung</th>
                <th className="num">Menge</th>
                <th className="num">Einzelpreis</th>
                <th className="num">MwSt</th>
                <th className="num">Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {order.positions.map((pos) => {
                const lineNet = pos.quantity * pos.unitPriceNet;
                return (
                  <tr key={pos.id}>
                    <td>
                      <small>
                        {pos.type === "labor" ? "AW" : "ET"} {pos.code || ""}
                      </small>
                    </td>
                    <td>{pos.name}</td>
                    <td className="num">
                      {pos.quantity} {pos.unit}
                    </td>
                    <td className="num">{fmtEuro(pos.unitPriceNet)}</td>
                    <td className="num">{pos.taxRate}%</td>
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
            <span>Summe Netto:</span>
            <span>{fmtEuro(order.totalNet)}</span>
          </p>
          <p>
            <span>MwSt. (19%):</span>
            <span>{fmtEuro(order.totalTax)}</span>
          </p>
          <p className="grand">
            <strong>Gesamtbetrag:</strong>
            <strong>{fmtEuro(order.totalGross)}</strong>
          </p>
          {order.paymentStatus === "bezahlt" && <p>✓ Betrag vollständig bezahlt ({order.paymentMethod?.toUpperCase()})</p>}
        </div>

        {/* Unterschriftenblock (für Werkstattauftrag) */}
        {!isInvoice && (
          <div className="print-sign">
            <div>
              <p>Auftrag erteilt und Probefahrt gestattet:</p>
              <span />
              Datum, Unterschrift Auftraggeber
            </div>
            <div>
              <p>Fahrzeug angenommen durch Werkstatt:</p>
              <span />
              Datum, Unterschrift Serviceberater
            </div>
          </div>
        )}

        {/* Fußzeile */}
        {company && (
          <footer className="print-foot">
            {company.taxNumber && <span>St.-Nr.: {company.taxNumber}</span>}
            {company.vatId && <span>USt-IdNr.: {company.vatId}</span>}
            {company.iban && <span>IBAN: {company.iban}</span>}
            {company.bic && <span>BIC: {company.bic}</span>}
          </footer>
        )}
      </article>
    </div>,
    document.body,
  );
}
