import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, X, HardHat, ShieldCheck } from "lucide-react";
import type { CraftReport } from "../../../shared/craft";
import type { CompanyProfile } from "../../../shared/company";
import { currency as companyCurrency, currencySymbol } from "../../money";

interface CraftPrintProps {
  report: CraftReport;
  company?: CompanyProfile | null;
  onClose: () => void;
}

export function CraftPrint({ report, company, onClose }: CraftPrintProps) {
  useEffect(() => {
    document.body.classList.add("ck-printing");
    return () => document.body.classList.remove("ck-printing");
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const fmtEuro = (amount?: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: companyCurrency() }).format(amount || 0);

  return createPortal(
    <div className="print-layer">
      {/* Controls - im Druck ausgeblendet */}
      <div className="print-toolbar craft-print-toolbar">
        <span className="pill">
          Arbeitsbericht & Rapportzettel ({report.reportNumber}) · {report.status === "unterschrieben" ? "Kunde hat unterschrieben" : report.status}
        </span>
        <button onClick={handlePrint} className="button primary">
          <Printer size={18} /> Drucken / PDF speichern
        </button>
        <button onClick={onClose} className="button" aria-label="Schließen">
          <X size={18} />
        </button>
      </div>

      {/* DIN-A4 DOKUMENT */}
      <article className="print-sheet craft-print">
        {/* Briefkopf */}
        <header className="print-head craft-print-head">
          <div>
            <strong className="print-company craft-print-brand">
              <HardHat size={22} /> {company?.name || "Meisterbetrieb Handwerk & Montage"}
            </strong>
            <p className="craft-print-muted">
              {company?.legalForm || "GmbH & Co. KG"} · Meisterbetrieb des Handwerks
            </p>
            {company?.street && (
              <p className="craft-print-muted">
                {company.street}, {company.postalCode} {company.city}
              </p>
            )}
          </div>

          <div className="print-meta">
            <strong className="craft-print-number">{report.reportNumber}</strong>
            <p>Datum: {new Date(report.date).toLocaleDateString("de-DE")}</p>
            <p>Monteur: {report.workerName}</p>
          </div>
        </header>

        {/* Bauvorhaben & Bauherr */}
        <section className="craft-print-box craft-print-two">
          <div>
            <h2>Auftraggeber / Bauherr</h2>
            <strong>{report.customerName}</strong>
          </div>
          <div>
            <h2>Bauvorhaben & Einsatzort</h2>
            <strong>{report.projectTitle}</strong>
            <p>{report.siteAddress}</p>
          </div>
        </section>

        {/* Tätigkeitsbeschreibung */}
        <section>
          <h2>Ausgeführte Arbeiten & Leistungen</h2>
          <p className="craft-print-text">
            {report.workDescription || "Montage- und Installationsarbeiten nach Aufmaß und Abstimmung vor Ort."}
          </p>
        </section>

        {/* Positionen-Tabelle */}
        <section>
          <h2>Leistungs- & Materialnachweis</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>Art</th>
                <th>Bezeichnung</th>
                <th className="num">Menge</th>
                <th className="num">Einzel ({currencySymbol("de-DE")})</th>
                <th className="num">Gesamt Netto ({currencySymbol("de-DE")})</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className={`craft-print-tag ${item.type === "lohn" || item.type === "fahrt" ? "wage" : ""}`}>
                      {item.type === "lohn" ? "Lohn" : item.type === "fahrt" ? "Fahrt" : "Material"}
                    </span>
                  </td>
                  <td>{item.name}</td>
                  <td className="num">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="num">{fmtEuro(item.unitPriceNet)}</td>
                  <td className="num"><strong>{fmtEuro(item.totalNet)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Summen & § 35a Steuer-Hinweis */}
        <section className="craft-print-two">
          {/* § 35a EStG Handwerkerleistungen Hinweis */}
          <div className="craft-print-box">
            <strong className="craft-print-35a">
              <ShieldCheck size={15} /> Steuerlicher Nachweis nach § 35a EStG
            </strong>
            <p className="craft-print-small">
              In den Gesamtkosten sind <strong>{fmtEuro(report.totalWageNet * 1.19)} brutto</strong> an begünstigten
              Handwerker-Arbeits- und Fahrtkosten enthalten (20% direkter Abzug von der tariflichen Einkommensteuer).
            </p>
          </div>

          {/* Summen-Block */}
          <div className="print-totals craft-print-totals">
            <p><span>Reine Lohnkosten (§ 35a):</span><span>{fmtEuro(report.totalWageNet)}</span></p>
            <p><span>Material- & Gerätekosten:</span><span>{fmtEuro(report.totalMaterialNet)}</span></p>
            <p><span>Gesamt Netto:</span><span>{fmtEuro(report.totalWageNet + report.totalMaterialNet)}</span></p>
            <p><span>MwSt. (19 %):</span><span>{fmtEuro(report.totalTax)}</span></p>
            <p className="grand"><strong>Gesamtbetrag Brutto:</strong><strong>{fmtEuro(report.totalGross)}</strong></p>
          </div>
        </section>

        {/* Unterschriften-Feld */}
        <section className="craft-print-two craft-print-signs">
          <div>
            <h2>Ausgeführt durch (Monteur / Betrieb)</h2>
            <div className="craft-print-signbox">{report.workerName}</div>
            <small>Datum, Unterschrift Auftragnehmer</small>
          </div>

          <div>
            <h2>Abnahme durch Auftraggeber / Bauherr</h2>
            <div className="craft-print-signbox center">
              {report.signatureDataUrl ? (
                <img src={report.signatureDataUrl} alt="Kundenunterschrift" />
              ) : (
                <em>Noch nicht unterzeichnet</em>
              )}
            </div>
            <small className="craft-print-signmeta">
              <span>{report.signedByName || report.customerName}</span>
              {report.signedAt && (
                <span>Signiert am: {new Date(report.signedAt).toLocaleDateString("de-DE")}</span>
              )}
            </small>
          </div>
        </section>
      </article>
    </div>,
    document.body,
  );
}
