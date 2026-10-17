import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { api } from "../../api";
import type { CompanyProfile } from "../../../shared/company";
import type { OfficeProject, OfficeTimeEntry } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";

export function TimesheetPrint({
  project,
  entries,
  onClose,
}: {
  project?: OfficeProject | null;
  entries: OfficeTimeEntry[];
  onClose: () => void;
}) {
  const { o, euro, day } = useOfficeI18n();
  const [company, setCompany] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    document.body.classList.add("ck-printing");
    api<{ company: CompanyProfile | null }>("/company")
      .then((d) => setCompany(d.company))
      .catch(() => {});
    return () => document.body.classList.remove("ck-printing");
  }, []);

  const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0);
  const totalFeeCents = entries.reduce((s, e) => s + Math.round((e.minutes * e.hourlyRateCents) / 60), 0);
  const billableEntries = entries.filter((e) => e.billable);
  const billableMinutes = billableEntries.reduce((s, e) => s + e.minutes, 0);
  const billableFeeCents = billableEntries.reduce((s, e) => s + Math.round((e.minutes * e.hourlyRateCents) / 60), 0);

  return createPortal(
    <div className="print-layer">
      <div className="print-toolbar">
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={18} /> {o("common.print")}
        </button>
        <button className="button" onClick={onClose}>
          <X size={18} /> {o("common.close")}
        </button>
      </div>

      <article className="print-sheet">
        <header className="print-head">
          <div>
            {company?.logoDataUrl && <img src={company.logoDataUrl} alt="" className="print-logo" />}
            <strong className="print-company">{company?.name || "Code Kontor Mandant"}</strong>
            <p>
              {company?.street}
              <br />
              {company?.postalCode} {company?.city}
            </p>
          </div>
          <div className="print-meta">
            <h1>{o("print.timesheetTitle")}</h1>
            <p>Datum: <strong>{day(new Date().toISOString())}</strong></p>
            {project && (
              <>
                <p>Projekt: <strong>{project.name}</strong></p>
                <p>Kunde: {project.clientName}</p>
              </>
            )}
          </div>
        </header>

        {/* Zusammenfassung */}
        <section className="print-grid">
          <div>
            <h2>Gesamtdauer</h2>
            <strong className="office-print-title">{(totalMinutes / 60).toFixed(2)} Std</strong>
          </div>
          <div>
            <h2>Abrechenbar</h2>
            <strong className="office-print-title">{(billableMinutes / 60).toFixed(2)} Std</strong>
          </div>
          <div>
            <h2>Honorar (Netto)</h2>
            <strong className="office-print-title">{euro(billableFeeCents)}</strong>
          </div>
        </section>

        {/* Tabelle der Zeiteinträge */}
        <table className="print-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Mitarbeiter</th>
              <th>Tätigkeit / Aufgabe</th>
              <th className="num">Dauer</th>
              <th className="num">Stundensatz</th>
              <th className="num">Honorar</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const fee = Math.round((e.minutes * e.hourlyRateCents) / 60);
              return (
                <tr key={e.id}>
                  <td><strong>{day(e.day)}</strong></td>
                  <td>{e.userName || "Mitarbeiter"}{e.roleName ? <small> ({e.roleName})</small> : null}</td>
                  <td>
                    {e.description || "Projektleistung"}
                    {e.taskTitle && <><br /><small>Aufgabe: {e.taskTitle}</small></>}
                  </td>
                  <td className="num">{(e.minutes / 60).toFixed(2)}h</td>
                  <td className="num">{euro(e.hourlyRateCents)}</td>
                  <td className="num">{e.billable ? euro(fee) : "intern"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Unterschriftenzeile */}
        <section className="print-sign">
          <div><span />Datum, Unterschrift Auftragnehmer</div>
          <div><span />Leistungsabnahme Kunde (Datum, Unterschrift)</div>
        </section>

        <footer className="print-foot">
          <span>Leistungsnachweis für Rechnung / Projektverwaltung</span>
          {company?.name && <span>{company.name}</span>}
        </footer>
      </article>
    </div>,
    document.body,
  );
}
