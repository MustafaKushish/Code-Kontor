import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, X, HardHat, ShieldCheck } from "lucide-react";
import type { CraftReport } from "../../../shared/craft";
import type { CompanyProfile } from "../../../shared/company";
import { useCraftI18n } from "./i18n";

interface CraftPrintProps {
  report: CraftReport;
  company?: CompanyProfile | null;
  onClose: () => void;
}

export function CraftPrint({ report, company, onClose }: CraftPrintProps) {
  const { t, money, symbol, num, day, reportStatusLabel, itemTypeLabel, unitLabel } = useCraftI18n();
  useEffect(() => {
    document.body.classList.add("ck-printing");
    return () => document.body.classList.remove("ck-printing");
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const fmtEuro = money;
  const currency = symbol();

  return createPortal(
    <div className="print-layer">
      {/* Controls - im Druck ausgeblendet */}
      <div className="print-toolbar craft-print-toolbar">
        <span className="pill">
          {t("print.toolbar", {
            number: report.reportNumber,
            status: report.status === "unterschrieben" ? t("print.customerSigned") : reportStatusLabel(report.status),
          })}
        </span>
        <button onClick={handlePrint} className="button primary">
          <Printer size={18} /> {t("print.printPdf")}
        </button>
        <button onClick={onClose} className="button" aria-label={t("print.close")}>
          <X size={18} />
        </button>
      </div>

      {/* DIN-A4 DOKUMENT */}
      <article className="print-sheet craft-print">
        {/* Briefkopf */}
        <header className="print-head craft-print-head">
          <div>
            <strong className="print-company craft-print-brand">
              <HardHat size={22} /> {company?.name || t("print.companyFallback")}
            </strong>
            <p className="craft-print-muted">
              {company?.legalForm || "GmbH & Co. KG"} · {t("print.masterBusiness")}
            </p>
            {company?.street && (
              <p className="craft-print-muted">
                {company.street}, {company.postalCode} {company.city}
              </p>
            )}
          </div>

          <div className="print-meta">
            <strong className="craft-print-number">{report.reportNumber}</strong>
            <p>{t("print.date", { date: day(report.date) })}</p>
            <p>{t("print.worker", { name: report.workerName })}</p>
          </div>
        </header>

        {/* Bauvorhaben & Bauherr */}
        <section className="craft-print-box craft-print-two">
          <div>
            <h2>{t("print.customer")}</h2>
            <strong>{report.customerName}</strong>
          </div>
          <div>
            <h2>{t("print.site")}</h2>
            <strong>{report.projectTitle}</strong>
            <p>{report.siteAddress}</p>
          </div>
        </section>

        {/* Tätigkeitsbeschreibung */}
        <section>
          <h2>{t("print.work")}</h2>
          <p className="craft-print-text">
            {report.workDescription || t("print.workFallback")}
          </p>
        </section>

        {/* Positionen-Tabelle */}
        <section>
          <h2>{t("print.items")}</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>{t("print.colType")}</th>
                <th>{t("print.colName")}</th>
                <th className="num">{t("print.colQuantity")}</th>
                <th className="num">{t("print.colUnitPrice", { currency })}</th>
                <th className="num">{t("print.colTotal", { currency })}</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className={`craft-print-tag ${item.type === "lohn" || item.type === "fahrt" ? "wage" : ""}`}>
                      {itemTypeLabel(item.type === "lohn" || item.type === "fahrt" ? item.type : "material")}
                    </span>
                  </td>
                  <td>{item.name}</td>
                  <td className="num">
                    {num(item.quantity)} {unitLabel(item.unit)}
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
              <ShieldCheck size={15} /> {t("print.taxProof")}
            </strong>
            <p className="craft-print-small">
              {t("print.taxProofBefore")}{" "}
              <strong>{t("print.taxProofAmount", { amount: fmtEuro(report.totalWageNet * 1.19) })}</strong>{" "}
              {t("print.taxProofAfter")}
            </p>
          </div>

          {/* Summen-Block */}
          <div className="print-totals craft-print-totals">
            <p><span>{t("print.wageCosts")}</span><span>{fmtEuro(report.totalWageNet)}</span></p>
            <p><span>{t("print.materialCosts")}</span><span>{fmtEuro(report.totalMaterialNet)}</span></p>
            <p><span>{t("print.totalNet")}</span><span>{fmtEuro(report.totalWageNet + report.totalMaterialNet)}</span></p>
            <p><span>{t("print.vat", { rate: num(19) })}</span><span>{fmtEuro(report.totalTax)}</span></p>
            <p className="grand"><strong>{t("print.totalGross")}</strong><strong>{fmtEuro(report.totalGross)}</strong></p>
          </div>
        </section>

        {/* Unterschriften-Feld */}
        <section className="craft-print-two craft-print-signs">
          <div>
            <h2>{t("print.executedBy")}</h2>
            <div className="craft-print-signbox">{report.workerName}</div>
            <small>{t("print.contractorSign")}</small>
          </div>

          <div>
            <h2>{t("print.acceptance")}</h2>
            <div className="craft-print-signbox center">
              {report.signatureDataUrl ? (
                <img src={report.signatureDataUrl} alt={t("print.signatureAlt")} />
              ) : (
                <em>{t("print.notSigned")}</em>
              )}
            </div>
            <small className="craft-print-signmeta">
              <span>{report.signedByName || report.customerName}</span>
              {report.signedAt && (
                <span>{t("print.signedAt", { date: day(report.signedAt) })}</span>
              )}
            </small>
          </div>
        </section>
      </article>
    </div>,
    document.body,
  );
}
