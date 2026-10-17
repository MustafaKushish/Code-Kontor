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
  const { o, euro, day, officeError } = useOfficeI18n();
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
              <strong className="print-company">{company?.name || "Code Kontor Mandant"}</strong>
              <p>{company?.street}<br />{company?.postalCode} {company?.city}</p>
            </div>
            <div className="print-meta">
              <h1>
                {createdDunning.level === 1
                  ? "Zahlungserinnerung"
                  : createdDunning.level === 2
                  ? "1. Mahnung"
                  : "2. Mahnung (Letzte Mahnung)"}
              </h1>
              <p>Datum: <strong>{day(createdDunning.issuedAt)}</strong></p>
              <p>Rechnungs-Nr.: <strong>{invoice.number}</strong></p>
            </div>
          </header>

          <section>
            <h2>Empfänger:</h2>
            <p><strong>{invoice.clientName}</strong></p>
            <p className="office-pre">{invoice.clientAddress}</p>
          </section>

          <section>
            <p className="office-print-title">
              <strong>
                {createdDunning.level === 1
                  ? `Zahlungserinnerung zu Rechnung ${invoice.number}`
                  : `Mahnung zu Rechnung ${invoice.number}`}
              </strong>
            </p>
            <p>
              {createdDunning.level === 1 ? (
                <>
                  Sehr geehrte Damen und Herren,<br />
                  sicherlich ist es Ihrer Aufmerksamkeit entgangen, dass die nachfolgend aufgeführte Rechnung bisher noch nicht beglichen wurde. Wir bitten Sie höflich, den offenen Betrag bis zum <strong>{day(createdDunning.dueDate)}</strong> auf unser angegebenes Geschäftskonto zu überweisen.
                </>
              ) : (
                <>
                  Sehr geehrte Damen und Herren,<br />
                  trotz unserer vorherigen Erinnerung konnten wir für die nachfolgende Rechnung bis heute keinen Zahlungseingang feststellen. Bitte begleichen Sie den fälligen Gesamtbetrag inkl. Mahngebühren unverzüglich bis zum <strong>{day(createdDunning.dueDate)}</strong>.
                </>
              )}
            </p>
          </section>

          <table className="print-table">
            <thead>
              <tr>
                <th>Posten</th>
                <th className="num">Fällig am</th>
                <th className="num">Betrag</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Rechnung {invoice.number} ({invoice.title})</td>
                <td className="num">{day(invoice.dueDate)}</td>
                <td className="num">{euro(invoice.totalCents)}</td>
              </tr>
              {createdDunning.feeCents > 0 && (
                <tr>
                  <td>Mahngebühr (Stufe {createdDunning.level})</td>
                  <td className="num">—</td>
                  <td className="num">{euro(createdDunning.feeCents)}</td>
                </tr>
              )}
              {createdDunning.interestCents > 0 && (
                <tr>
                  <td>Verzugszinsen</td>
                  <td className="num">—</td>
                  <td className="num">{euro(createdDunning.interestCents)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="print-totals">
            <p className="grand">
              <span><strong>Gesamtforderung:</strong></span>
              <strong>{euro(createdDunning.totalAmountCents)}</strong>
            </p>
          </div>

          {company?.iban && (
            <section className="print-terms">
              <h2>Bankverbindung für die Überweisung:</h2>
              Bank: {company.bankName || "Geschäftskonto"}<br />
              IBAN: <strong>{company.iban}</strong> · BIC: {company.bic || "—"}<br />
              Verwendungszweck: <strong>{invoice.number} Mahnung</strong>
            </section>
          )}

          <footer className="print-foot">
            <span>{company?.name}</span>
            {company?.taxNumber && <span>St.-Nr.: {company.taxNumber}</span>}
            {company?.vatId && <span>USt-IdNr.: {company.vatId}</span>}
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
            <strong>Rechnung {invoice.number}</strong>
            <span className={`pill ${invoice.status === "overdue" ? "neg" : "warn"}`}>{o(`invoices.status.${invoice.status}`)}</span>
          </div>
          <div className="stack-sm small muted">
            <span>Kunde: <strong>{invoice.clientName}</strong></span>
            <span>Ursprünglich fällig am: <strong>{day(invoice.dueDate)}</strong></span>
            <span>Hauptforderung: <strong>{euro(invoice.totalCents)}</strong></span>
          </div>
        </div>

        <Field label="Mahnstufe auswählen" required>
          <select value={level} onChange={(e) => setLevel(parseInt(e.target.value, 10) as 1 | 2 | 3)}>
            <option value={1}>Stufe 1: Zahlungserinnerung (0,00 € Gebühr)</option>
            <option value={2}>Stufe 2: 1. Mahnung (+ {euro(settings?.dunningFeeLevel2Cents ?? 500)} Gebühr)</option>
            <option value={3}>Stufe 3: 2. Mahnung / Letzte Frist (+ {euro(settings?.dunningFeeLevel3Cents ?? 1000)} Gebühr)</option>
          </select>
        </Field>

        <table className="price-table">
          <tbody>
            <tr><td>Rechnungsbetrag:</td><td>{euro(invoice.totalCents)}</td></tr>
            {feeCents > 0 && <tr><td>Mahngebühr:</td><td>+{euro(feeCents)}</td></tr>}
            {interestCents > 0 && <tr><td>Pauschale Verzugszinsen (1%):</td><td>+{euro(interestCents)}</td></tr>}
          </tbody>
          <tfoot>
            <tr><th>Gesamtforderung Mahnung:</th><th>{euro(totalAmountCents)}</th></tr>
          </tfoot>
        </table>

        <Field label="Zusätzliche Bemerkung / Grund">
          <textarea
            rows={2}
            placeholder="z.B. Telefonische Rücksprache am Vortag ohne Zahlung..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div className="row wrap gap end">
          <button type="button" className="button" onClick={onClose}>
            {o("common.cancel")}
          </button>
          <button type="submit" className="button primary">
            <Printer size={17} /> Mahnung erstellen & Drucken
          </button>
        </div>
      </form>
    </Dialog>
  );
}
