import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { CompanyProfile } from "../../../shared/company";
import type { OfficeDunning, OfficeInvoice, OfficeSettings } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";

export function DunningModal({
  invoice,
  onClose,
  onCreated,
}: {
  invoice: OfficeInvoice;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { o, oRich, euro, day, officeError } = useOfficeI18n();
  const [level, setLevel] = useState<1 | 2 | 3>(
    Math.min(3, (invoice.dunningLevel || 0) + 1) as 1 | 2 | 3,
  );
  const [notes, setNotes] = useState("");
  const [settings, setSettings] = useState<OfficeSettings | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [printMode, setPrintMode] = useState(false);
  const [createdDunning, setCreatedDunning] = useState<OfficeDunning | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ settings: OfficeSettings }>("/office/settings"),
      api<{ company: CompanyProfile | null }>("/company"),
    ])
      .then(([s, c]) => {
        setSettings(s.settings);
        setCompany(c.company);
      })
      .catch(() => {});
  }, []);

  const feeCents =
    level === 2
      ? settings?.dunningFeeLevel2Cents ?? 500
      : level === 3
      ? settings?.dunningFeeLevel3Cents ?? 1000
      : 0;

  const interestCents = level >= 2 ? Math.round(invoice.totalCents * 0.01) : 0;
  const totalAmountCents = invoice.totalCents + feeCents + interestCents;

  useEffect(() => {
    if (!printMode) return;
    document.body.classList.add("ck-printing");
    return () => document.body.classList.remove("ck-printing");
  }, [printMode]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    try {
      const res = await api<{ dunning: OfficeDunning }>("/office/dunning", {
        method: "POST",
        body: {
          invoiceId: invoice.id,
          level,
          notes,
        },
      });
      setCreatedDunning(res.dunning);
      setPrintMode(true);
      onCreated();
    } catch (err) {
      setErrorMsg(officeError(err));
    }
  };

  if (printMode && createdDunning) {
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
              <strong className="print-company">{company?.name || o("print.companyFallback")}</strong>
              <p>{company?.street}<br />{company?.postalCode} {company?.city}</p>
            </div>
            <div className="print-meta">
              <h1>
                {createdDunning.level === 1
                  ? o("dunning.level1Title")
                  : createdDunning.level === 2
                  ? o("dunning.level2Title")
                  : o("dunning.level3Title")}
              </h1>
              <p>{o("print.date")}: <strong>{day(createdDunning.issuedAt)}</strong></p>
              <p>{o("dunning.invoiceNo")}: <strong>{invoice.number}</strong></p>
            </div>
          </header>

          <section>
            <h2>{o("print.recipient")}</h2>
            <p><strong>{invoice.clientName}</strong></p>
            <p className="office-pre">{invoice.clientAddress}</p>
          </section>

          <section>
            <p className="office-print-title">
              <strong>
                {createdDunning.level === 1
                  ? o("dunning.subjectReminder", { number: invoice.number })
                  : o("dunning.subjectDunning", { number: invoice.number })}
              </strong>
            </p>
            <p>
              {createdDunning.level === 1 ? (
                <>
                  {o("dunning.salutation")}<br />
                  {oRich("dunning.reminderBody", { date: <strong>{day(createdDunning.dueDate)}</strong> })}
                </>
              ) : (
                <>
                  {o("dunning.salutation")}<br />
                  {oRich("dunning.dunningBody", { date: <strong>{day(createdDunning.dueDate)}</strong> })}
                </>
              )}
            </p>
          </section>

          <table className="print-table">
            <thead>
              <tr>
                <th>{o("dunning.colItem")}</th>
                <th className="num">{o("dunning.colDue")}</th>
                <th className="num">{o("dunning.colAmount")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{o("dunning.invoiceRow", { number: invoice.number, title: invoice.title })}</td>
                <td className="num">{day(invoice.dueDate)}</td>
                <td className="num">{euro(invoice.totalCents)}</td>
              </tr>
              {createdDunning.feeCents > 0 && (
                <tr>
                  <td>{o("dunning.feeRow", { level: createdDunning.level })}</td>
                  <td className="num">—</td>
                  <td className="num">{euro(createdDunning.feeCents)}</td>
                </tr>
              )}
              {createdDunning.interestCents > 0 && (
                <tr>
                  <td>{o("dunning.interest")}</td>
                  <td className="num">—</td>
                  <td className="num">{euro(createdDunning.interestCents)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="print-totals">
            <p className="grand">
              <span><strong>{o("dunning.totalClaim")}</strong></span>
              <strong>{euro(createdDunning.totalAmountCents)}</strong>
            </p>
          </div>

          {company?.iban && (
            <section className="print-terms">
              <h2>{o("dunning.bankTitle")}</h2>
              {o("print.bank")}: {company.bankName || o("print.bankFallback")}<br />
              IBAN: <strong>{company.iban}</strong> · BIC: {company.bic || "—"}<br />
              {o("print.reference")}: <strong>{o("dunning.referenceValue", { number: invoice.number })}</strong>
            </section>
          )}

          <footer className="print-foot">
            <span>{company?.name}</span>
            {company?.taxNumber && <span>{o("dunning.taxNo")}: {company.taxNumber}</span>}
            {company?.vatId && <span>{o("clients.vatId")}: {company.vatId}</span>}
          </footer>
        </article>
      </div>,
      document.body,
    );
  }

  return (
    <Dialog title={o("invoices.createDunning")} onClose={onClose}>
      <form onSubmit={handleCreate} className="stack office-dialog">
        {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

        <div className="office-panel">
          <div className="section-head">
            <strong>{o("dunning.invoiceHeading", { number: invoice.number })}</strong>
            <span className={`pill ${invoice.status === "overdue" ? "neg" : "warn"}`}>{o(`invoices.status.${invoice.status}`)}</span>
          </div>
          <div className="stack-sm small muted">
            <span>{o("dunning.client")}: <strong>{invoice.clientName}</strong></span>
            <span>{o("dunning.originalDue")}: <strong>{day(invoice.dueDate)}</strong></span>
            <span>{o("dunning.principal")}: <strong>{euro(invoice.totalCents)}</strong></span>
          </div>
        </div>

        <Field label={o("dunning.selectLevel")} required>
          <select value={level} onChange={(e) => setLevel(parseInt(e.target.value, 10) as 1 | 2 | 3)}>
            <option value={1}>{o("dunning.option1", { fee: euro(0) })}</option>
            <option value={2}>{o("dunning.option2", { fee: euro(settings?.dunningFeeLevel2Cents ?? 500) })}</option>
            <option value={3}>{o("dunning.option3", { fee: euro(settings?.dunningFeeLevel3Cents ?? 1000) })}</option>
          </select>
        </Field>

        <table className="price-table">
          <tbody>
            <tr><td>{o("dunning.invoiceAmount")}</td><td>{euro(invoice.totalCents)}</td></tr>
            {feeCents > 0 && <tr><td>{o("dunning.fee")}</td><td>+{euro(feeCents)}</td></tr>}
            {interestCents > 0 && <tr><td>{o("dunning.interestFlat")}</td><td>+{euro(interestCents)}</td></tr>}
          </tbody>
          <tfoot>
            <tr><th>{o("dunning.totalDunning")}</th><th>{euro(totalAmountCents)}</th></tr>
          </tfoot>
        </table>

        <Field label={o("dunning.remark")}>
          <textarea
            rows={2}
            placeholder={o("dunning.remarkPlaceholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div className="row wrap gap end">
          <button type="button" className="button" onClick={onClose}>
            {o("common.cancel")}
          </button>
          <button type="submit" className="button primary">
            <Printer size={17} /> {o("dunning.createPrint")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
