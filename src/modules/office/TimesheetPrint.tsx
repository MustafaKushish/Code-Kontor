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
  const { o, euro, num, day } = useOfficeI18n();
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
            <strong className="print-company">{company?.name || o("print.companyFallback")}</strong>
            <p>
              {company?.street}
              <br />
              {company?.postalCode} {company?.city}
            </p>
          </div>
          <div className="print-meta">
            <h1>{o("print.timesheetTitle")}</h1>
            <p>{o("print.date")}: <strong>{day(new Date().toISOString())}</strong></p>
            {project && (
              <>
                <p>{o("print.project")}: <strong>{project.name}</strong></p>
                <p>{o("common.client")}: {project.clientName}</p>
              </>
            )}
          </div>
        </header>

        {/* Zusammenfassung */}
        <section className="print-grid">
          <div>
            <h2>{o("timesheet.totalDuration")}</h2>
            <strong className="office-print-title">{o("common.hoursShort", { hours: num(totalMinutes / 60, 2) })}</strong>
          </div>
          <div>
            <h2>{o("timesheet.billable")}</h2>
            <strong className="office-print-title">{o("common.hoursShort", { hours: num(billableMinutes / 60, 2) })}</strong>
          </div>
          <div>
            <h2>{o("timesheet.feeNet")}</h2>
            <strong className="office-print-title">{euro(billableFeeCents)}</strong>
          </div>
        </section>

        {/* Tabelle der Zeiteinträge */}
        <table className="print-table">
          <thead>
            <tr>
              <th>{o("timesheet.colDate")}</th>
              <th>{o("timesheet.colStaff")}</th>
              <th>{o("timesheet.colActivity")}</th>
              <th className="num">{o("timesheet.colDuration")}</th>
              <th className="num">{o("timesheet.colRate")}</th>
              <th className="num">{o("timesheet.colFee")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const fee = Math.round((e.minutes * e.hourlyRateCents) / 60);
              return (
                <tr key={e.id}>
                  <td><strong>{day(e.day)}</strong></td>
                  <td>{e.userName || o("time.staffFallback")}{e.roleName ? <small> ({e.roleName})</small> : null}</td>
                  <td>
                    {e.description || o("timesheet.activityFallback")}
                    {e.taskTitle && <><br /><small>{o("timesheet.taskLine", { title: e.taskTitle })}</small></>}
                  </td>
                  <td className="num">{o("common.hoursH", { hours: num(e.minutes / 60, 2) })}</td>
                  <td className="num">{euro(e.hourlyRateCents)}</td>
                  <td className="num">{e.billable ? euro(fee) : o("timesheet.internal")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Unterschriftenzeile */}
        <section className="print-sign">
          <div><span />{o("timesheet.signContractor")}</div>
          <div><span />{o("timesheet.signClient")}</div>
        </section>

        <footer className="print-foot">
          <span>{o("timesheet.footer")}</span>
          {company?.name && <span>{company.name}</span>}
        </footer>
      </article>
    </div>,
    document.body,
  );
}
