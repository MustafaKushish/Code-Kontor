import { useEffect, useState } from "react";
import { AlertTriangle, Printer, X, Check, FileText } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
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
              <strong className="print-company">{company?.name || "Code Kontor Mandant"}</strong>
              <p>{company?.street}<br />{company?.postalCode} {company?.city}</p>
            </div>
            <div className="print-meta">
              <h1 style={{ fontSize: "1.6rem", margin: "0 0 6px" }}>
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

          <section style={{ margin: "24px 0" }}>
            <small className="muted" style={{ display: "block", marginBottom: "4px" }}>Empfänger:</small>
            <div style={{ fontSize: "1.05rem" }}>
              <strong>{invoice.clientName}</strong>
              <div style={{ whiteSpace: "pre-line" }}>{invoice.clientAddress}</div>
            </div>
          </section>

          <div style={{ margin: "20px 0" }}>
            <h2 style={{ fontSize: "1.2rem", margin: "0 0 8px" }}>
              {createdDunning.level === 1
                ? `Zahlungserinnerung zu Rechnung ${invoice.number}`
                : `Mahnung zu Rechnung ${invoice.number}`}
            </h2>
            <p style={{ lineHeight: "1.6" }}>
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
          </div>

          <table className="print-items">
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

          <div className="print-totals" style={{ marginLeft: "auto", maxWidth: "340px", marginTop: "16px" }}>
            <p className="grand" style={{ fontSize: "1.25rem", borderTop: "2px solid var(--text)", paddingTop: "8px" }}>
              <span><strong>Gesamtforderung:</strong></span>
              <strong>{euro(createdDunning.totalAmountCents)}</strong>
            </p>
          </div>

          {company?.iban && (
            <div style={{ marginTop: "32px", borderTop: "1px solid var(--line)", paddingTop: "16px", fontSize: "0.9rem" }}>
              <p><strong>Bankverbindung für die Überweisung:</strong></p>
              <div>Bank: {company.bankName || "Geschäftskonto"}</div>
              <div>IBAN: <strong>{company.iban}</strong> · BIC: {company.bic || "—"}</div>
              <div>Verwendungszweck: <strong>{invoice.number} Mahnung</strong></div>
            </div>
          )}

          <footer className="print-foot" style={{ marginTop: "40px" }}>
            <span>{company?.name}</span>
            {company?.taxNumber && <span>St.-Nr.: {company.taxNumber}</span>}
            {company?.vatId && <span>USt-IdNr.: {company.vatId}</span>}
          </footer>
        </article>
      </div>
    );
  }

  return (
    <div className="office-modal-overlay" onClick={onClose}>
      <div className="office-modal" style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
        <div className="office-modal-head">
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertTriangle size={20} style={{ color: "var(--warning)" }} />
            {o("invoices.createDunning")}
          </h3>
          <button className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {errorMsg && <div className="notice warning">{errorMsg}</div>}

        <div className="card" style={{ padding: "12px", background: "var(--panel-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
            <strong>Rechnung {invoice.number}</strong>
            <span className="pill warning">{o(`invoices.status.${invoice.status}`)}</span>
          </div>
          <div style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
            <div>Kunde: <strong>{invoice.clientName}</strong></div>
            <div>Ursprünglich fällig am: <strong>{day(invoice.dueDate)}</strong></div>
            <div>Hauptforderung: <strong>{euro(invoice.totalCents)}</strong></div>
          </div>
        </div>

        <form onSubmit={handleCreate} className="stack">
          <Field label="Mahnstufe auswählen" required>
            <select
              className="input"
              value={level}
              onChange={(e) => setLevel(parseInt(e.target.value, 10) as 1 | 2 | 3)}
            >
              <option value={1}>Stufe 1: Zahlungserinnerung (0,00 € Gebühr)</option>
              <option value={2}>Stufe 2: 1. Mahnung (+ {euro(settings?.dunningFeeLevel2Cents ?? 500)} Gebühr)</option>
              <option value={3}>Stufe 3: 2. Mahnung / Letzte Frist (+ {euro(settings?.dunningFeeLevel3Cents ?? 1000)} Gebühr)</option>
            </select>
          </Field>

          <div className="stack-sm" style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
              <span>Rechnungsbetrag:</span>
              <span>{euro(invoice.totalCents)}</span>
            </div>
            {feeCents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                <span>Mahngebühr:</span>
                <span>+{euro(feeCents)}</span>
              </div>
            )}
            {interestCents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                <span>Pauschale Verzugszinsen (1%):</span>
                <span>+{euro(interestCents)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: "6px", fontWeight: 700 }}>
              <span>Gesamtforderung Mahnung:</span>
              <span style={{ color: "var(--accent)" }}>{euro(totalAmountCents)}</span>
            </div>
          </div>

          <Field label="Zusätzliche Bemerkung / Grund">
            <textarea
              className="input"
              rows={2}
              placeholder="z.B. Telefonische Rücksprache am Vortag ohne Zahlung..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "12px" }}>
            <button type="button" className="button" onClick={onClose}>
              {o("common.cancel")}
            </button>
            <button type="submit" className="button primary">
              <Printer size={17} /> Mahnung erstellen & Drucken
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
