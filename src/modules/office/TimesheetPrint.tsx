import { useEffect, useState } from "react";
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

  return (
    <div className="print-layer">
      <div className="print-toolbar">
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={18} /> {o("common.print")}
        </button>
        <button className="button push-end" onClick={onClose}>
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
            <h1 style={{ fontSize: "1.8rem", margin: "0 0 6px" }}>{o("print.timesheetTitle")}</h1>
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
        <section style={{ margin: "20px 0", padding: "12px 16px", background: "var(--panel-2)", borderRadius: "var(--radius)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", textAlign: "center" }}>
            <div>
              <small className="muted" style={{ display: "block" }}>Gesamtdauer</small>
              <strong style={{ fontSize: "1.2rem", fontFamily: "var(--display)" }}>{(totalMinutes / 60).toFixed(2)} Std</strong>
            </div>
            <div>
              <small className="muted" style={{ display: "block" }}>Abrechenbar</small>
              <strong style={{ fontSize: "1.2rem", fontFamily: "var(--display)", color: "var(--accent)" }}>{(billableMinutes / 60).toFixed(2)} Std</strong>
            </div>
            <div>
              <small className="muted" style={{ display: "block" }}>Honorar (Netto)</small>
              <strong style={{ fontSize: "1.2rem", fontFamily: "var(--display)" }}>{euro(billableFeeCents)}</strong>
            </div>
          </div>
        </section>

        {/* Tabelle der Zeiteinträge */}
        <table className="print-items">
          <thead>
            <tr>
              <th style={{ width: "85px" }}>Datum</th>
              <th>Mitarbeiter</th>
              <th>Tätigkeit / Aufgabe</th>
              <th className="num" style={{ width: "75px" }}>Dauer</th>
              <th className="num" style={{ width: "90px" }}>Stundensatz</th>
              <th className="num" style={{ width: "95px" }}>Honorar</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const fee = Math.round((e.minutes * e.hourlyRateCents) / 60);
              return (
                <tr key={e.id}>
                  <td><strong>{day(e.day)}</strong></td>
                  <td>{e.userName || "Mitarbeiter"}{e.roleName ? <small className="muted"> ({e.roleName})</small> : null}</td>
                  <td>
                    <div>{e.description || "Projektleistung"}</div>
                    {e.taskTitle && <small className="muted">Aufgabe: {e.taskTitle}</small>}
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
        <div style={{ marginTop: "48px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", paddingTop: "20px" }}>
          <div>
            <div style={{ borderTop: "1px solid var(--text)", paddingTop: "6px", fontSize: "0.85rem", color: "var(--muted)" }}>
              Datum, Unterschrift Auftragnehmer
            </div>
          </div>
          <div>
            <div style={{ borderTop: "1px solid var(--text)", paddingTop: "6px", fontSize: "0.85rem", color: "var(--muted)" }}>
              Leistungsabnahme Kunde (Datum, Unterschrift)
            </div>
          </div>
        </div>

        <footer className="print-foot" style={{ marginTop: "40px" }}>
          <span>Leistungsnachweis für Rechnung / Projektverwaltung</span>
          {company?.name && <span>{company.name}</span>}
        </footer>
      </article>
    </div>
  );
}
