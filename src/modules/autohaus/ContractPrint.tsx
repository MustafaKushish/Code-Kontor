import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { api } from "../../api";
import { standardVat } from "../../money";
import type { CompanyProfile } from "../../../shared/company";
import { CONDITION_LABEL, contractBalance, contractTotal, PAYMENT_LABEL, round2, vehicleLabel, type SalesContract, type TradeIn } from "../../../shared/autohaus";
import { dateLabel, euro, km, monthLabel, psFromKw } from "./parts";

/** Kaufvertrag über ein Kraftfahrzeug, DIN A4 zum Drucken oder als PDF. */
export function ContractPrint({ contract: c, tradeIn, onClose }: { contract: SalesContract; tradeIn: TradeIn | null; onClose: () => void }) {
  const [company, setCompany] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    api<{ company: CompanyProfile | null }>("/company").then((d) => setCompany(d.company)).catch(() => {});
    // Druckmodus der Plattform: blendet beim Drucken alles außer dem Blatt aus
    document.body.classList.add("ck-printing");
    return () => document.body.classList.remove("ck-printing");
  }, []);

  const v = c.vehicle;
  const total = contractTotal(c);
  const vat = standardVat();
  const net = round2(total / (1 + vat / 100));
  const facts: [string, string][] = [
    ["Fahrzeug", vehicleLabel(v)],
    ["Zustand", CONDITION_LABEL[v.condition]],
    ["Fahrgestellnummer", v.vin || "–"],
    ["Kennzeichen", v.licensePlate || "–"],
    ["Erstzulassung", v.condition === "neu" ? "Neufahrzeug" : monthLabel(v.firstRegistration) || "–"],
    ["Kilometerstand (abgelesen)", km(v.mileage)],
    ["Leistung", v.powerKw ? `${v.powerKw} kW (${psFromKw(v.powerKw)} PS)` : "–"],
    ["Kraftstoff / Farbe", [v.fuel, v.color].filter(Boolean).join(" / ")],
    ["Vorbesitzer", String(v.previousOwners)],
    ["Nächste HU", monthLabel(v.nextInspection) || "–"],
  ];

  return createPortal(
    <div className="print-layer">
      <div className="print-toolbar">
        <button onClick={() => window.print()} className="button primary"><Printer size={18} /> Jetzt drucken</button>
        <button onClick={onClose} className="button"><X size={18} /> Schließen</button>
      </div>

      <article className="print-sheet" aria-label={`Kaufvertrag ${c.contractNumber}`}>
        <header className="print-head">
          <div>
            {company?.logoDataUrl && <img src={company.logoDataUrl} alt="" className="print-logo" />}
            <strong className="print-company">{company?.name || "Autohaus"}{company?.legalForm ? ` ${company.legalForm}` : ""}</strong>
            {company?.street && <p>{company.street}</p>}
            {company?.postalCode && <p>{company.postalCode} {company.city}</p>}
            {company?.phone && <p>Tel. {company.phone}</p>}
          </div>
          <div className="print-meta">
            <h1>Kaufvertrag</h1>
            <p>Nr. {c.contractNumber}</p>
            <p>Datum {dateLabel(c.createdAt)}</p>
            <p>Bestandsnr. {v.stockNumber}</p>
          </div>
        </header>

        <div className="print-grid">
          <div>
            <h2>Verkäufer</h2>
            <p>{company?.name || "Autohaus"}{company?.legalForm ? ` ${company.legalForm}` : ""}</p>
            {company?.vatId && <p>USt-IdNr. {company.vatId}</p>}
          </div>
          <div>
            <h2>Käufer</h2>
            <p><strong>{c.buyerName}</strong></p>
            {c.buyerAddress.split("\n").map((line) => <p key={line}>{line}</p>)}
            {c.buyerPhone && <p>Tel. {c.buyerPhone}</p>}
          </div>
        </div>

        <div>
          <h2>Kaufgegenstand</h2>
          <table className="print-table">
            <tbody>
              {facts.map(([k, val]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {tradeIn && (
          <div>
            <h2>Inzahlungnahme</h2>
            <p>{tradeIn.make} {tradeIn.model}{tradeIn.licensePlate ? `, ${tradeIn.licensePlate}` : ""}{tradeIn.vin ? `, FIN ${tradeIn.vin}` : ""}, {km(tradeIn.mileage)}{tradeIn.firstRegistration ? `, EZ ${monthLabel(tradeIn.firstRegistration)}` : ""}</p>
            {tradeIn.damages && <p>Bekannte Schäden: {tradeIn.damages}</p>}
          </div>
        )}

        <div className="print-totals">
          <p><span>Kaufpreis</span><span>{euro(c.price)}</span></p>
          {c.discount > 0 && <p><span>Nachlass</span><span>− {euro(c.discount)}</span></p>}
          <p><strong>Gesamtpreis</strong><strong>{euro(total)}</strong></p>
          {c.taxation === "regel" && vat > 0 && <p><small>darin {vat} % MwSt.</small><small>{euro(round2(total - net))}</small></p>}
          {c.tradeInAmount > 0 && <p><span>Anrechnung Inzahlungnahme</span><span>− {euro(c.tradeInAmount)}</span></p>}
          {c.deposit > 0 && <p><span>Anzahlung</span><span>− {euro(c.deposit)}</span></p>}
          <p className="grand"><strong>Restbetrag</strong><strong>{euro(contractBalance(c))}</strong></p>
        </div>

        <div className="print-terms">
          {[
            `Zahlungsart: ${PAYMENT_LABEL[c.paymentMethod]}.${c.deliveryDate ? ` Übergabe am ${dateLabel(c.deliveryDate)}.` : ""}`,
            c.taxation === "differenz" ? "Das Fahrzeug unterliegt der Differenzbesteuerung nach § 25a UStG. Die Umsatzsteuer wird nicht gesondert ausgewiesen." : "",
            c.warranty ? `Gewährleistung: ${c.warranty}.` : "",
            c.notes ? `Besondere Vereinbarungen: ${c.notes}` : "",
            "Das Fahrzeug bleibt bis zur vollständigen Bezahlung Eigentum des Verkäufers. Fahrzeugbrief (Zulassungsbescheinigung Teil II) und Schlüssel werden nach Zahlungseingang übergeben.",
          ]
            .filter(Boolean)
            .join("\n")}
        </div>

        <div className="print-sign">
          <div><span />Ort, Datum, Unterschrift Verkäufer</div>
          <div><span />Ort, Datum, Unterschrift Käufer</div>
        </div>

        <footer className="print-foot">
          {company?.name && <span>{company.name}</span>}
          {company?.taxNumber && <span>Steuernr. {company.taxNumber}</span>}
          {company?.iban && <span>IBAN {company.iban}</span>}
          {company?.bankName && <span>{company.bankName}</span>}
        </footer>
      </article>
    </div>,
    document.body,
  );
}
