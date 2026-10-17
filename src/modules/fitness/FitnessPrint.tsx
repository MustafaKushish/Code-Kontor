import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, X, Dumbbell, ShieldCheck, QrCode, CheckCircle2 } from "lucide-react";
import type { FitnessMember, FitnessPlan } from "../../../shared/fitness";

interface FitnessPrintProps {
  member: FitnessMember;
  plan?: FitnessPlan;
  companyName?: string;
  type: "contract" | "card";
  onClose: () => void;
}

export function FitnessPrint({
  member,
  plan,
  companyName = "Code Kontor Fitness & Athletics",
  type,
  onClose,
}: FitnessPrintProps) {
  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  const handlePrint = () => {
    window.print();
  };

  // Druckebene: beim Drucken wird nur das Blatt ausgegeben (Regeln in styles.css)
  useEffect(() => {
    document.body.classList.add("ck-printing");
    return () => document.body.classList.remove("ck-printing");
  }, []);

  return createPortal(
    <div className="print-layer">
      {/* Toolbar - Screen only */}
      <div className="print-toolbar fitness-print-toolbar">
        <span className="fitness-print-title">
          {type === "contract" ? "Mitgliedsvertrag & SEPA-Mandat" : "Mitgliedsausweis (Druckansicht)"} · {member.firstName}{" "}
          {member.lastName} · {member.memberNumber}
        </span>
        <button onClick={handlePrint} className="button primary">
          <Printer size={18} />
          Drucken
        </button>
        <button onClick={onClose} className="button" title="Schließen">
          <X size={18} />
          Schließen
        </button>
      </div>

      {/* --- DOKUMENT-INHALT --- */}
      {type === "contract" ? (
        <article className="print-sheet fitness-print">
          {/* Briefkopf */}
          <header className="print-head">
            <div>
              <strong className="fitness-print-brand">
                <Dumbbell size={20} />
                <span>{companyName}</span>
              </strong>
              <p className="fitness-print-sub">Sport- & Fitnesszentrum · Premium Training & Health Club · Deutschland</p>
            </div>
            <div className="print-meta">
              <strong>Mitglieds-Nr.: {member.memberNumber}</strong>
              <span>Vertragsbeginn: {member.joinDate}</span>
              <span>Ausstellungsdatum: {new Date().toLocaleDateString("de-DE")}</span>
            </div>
          </header>

          <div className="fitness-print-center">
            <h1>Mitgliedschaftsvereinbarung</h1>
            <p className="fitness-print-sub">gemäß den allgemeinen Studio-Geschäftsbedingungen und Hausordnung</p>
          </div>

          {/* Vertragspartner & Mitgliedsdaten */}
          <div className="print-grid">
            <section className="fitness-print-box">
              <h2>1. Mitgliedsdaten</h2>
              <p className="plain">
                <strong className="big">
                  {member.firstName} {member.lastName}
                </strong>
              </p>
              <p className="plain">Geburtsdatum: {member.birthDate || "–"}</p>
              <p className="plain">E-Mail: {member.email}</p>
              <p className="plain">Telefon: {member.phone || "–"}</p>
              {member.emergencyContact && (
                <p className="plain fitness-print-sub">
                  <strong>Notfallkontakt:</strong> {member.emergencyContact}
                </p>
              )}
            </section>

            <section className="fitness-print-box">
              <h2>2. Gewählter Tarif & Konditionen</h2>
              <p className="plain">
                <strong className="big">{member.planName}</strong>
              </p>
              <p>
                <span>Monatlicher Beitrag:</span>
                <strong>{fmtEuro(member.monthlyFee)}</strong>
              </p>
              {plan?.admissionFee ? (
                <p className="fitness-print-sub">
                  <span>Einmalige Aufnahmegebühr:</span>
                  <span>{fmtEuro(plan.admissionFee)}</span>
                </p>
              ) : null}
              <p className="fitness-print-sub">
                <span>Mindestvertragslaufzeit:</span>
                <span>{plan?.durationMonths || 12} Monate</span>
              </p>
              <p className="fitness-print-sub">
                <span>Gültig bis:</span>
                <span>{member.validUntil || "Unbefristet"}</span>
              </p>
            </section>
          </div>

          {/* Inklusivleistungen */}
          <section>
            <h2>3. Vereinbarte Inklusivleistungen</h2>
            <div className="fitness-print-includes">
              <span>
                <CheckCircle2 size={14} />
                Cardio- & Kraftbereich
              </span>
              <span className={plan?.includesCourses ? "" : "off"}>
                <CheckCircle2 size={14} />
                Gruppenkurse & Yoga
              </span>
              <span className={plan?.includesSauna ? "" : "off"}>
                <CheckCircle2 size={14} />
                Sauna & Wellness
              </span>
            </div>
          </section>

          {/* SEPA-Lastschriftmandat */}
          <section className="fitness-print-box">
            <h2>
              <ShieldCheck size={12} /> 4. SEPA-Lastschriftmandat für wiederkehrende Zahlungen
            </h2>
            <p className="plain fitness-print-sub">
              Ich ermächtige {companyName}, Zahlungen von meinem Konto mittels Lastschrift einzuziehen.
              Zugleich weise ich mein Kreditinstitut an, die von {companyName} auf mein Konto gezogenen Lastschriften einzulösen.
            </p>
            <div className="fitness-print-sepa">
              <div>
                <small>IBAN des Mitglieds:</small>
                <strong>{member.iban || "DE__ ____ ____ ____ ____ __"}</strong>
              </div>
              <div>
                <small>Gläubiger-Identifikationsnummer / Mandat:</small>
                <strong>DE98ZZZ00002148911 / {member.memberNumber}</strong>
              </div>
            </div>
          </section>

          {/* Hausordnung & Auszüge */}
          <div className="print-terms">
            <strong>Auszug aus der Hausordnung:</strong>
            {"\n"}§ 1 Der Zutritt ist nur mit gültigem Mitgliedsausweis oder Check-In per QR-Code / Thekenscan gestattet.
            Bei Verlust des Ausweises ist das Studio unverzüglich zu benachrichtigen.
            {"\n"}§ 2 Aus hygienischen Gründen ist im gesamten Trainingsbereich das Tragen sauberer Sportschuhe und die Benutzung eines Handtuchs Pflicht.
            {"\n"}§ 3 Die Kündigung bedarf der Textform und ist mit einer Frist von einem Monat zum Ende der regulären Vertragslaufzeit einzureichen.
          </div>

          {/* Unterschriftenblock */}
          <div className="print-sign">
            <div>
              <span />
              <strong>Ort, Datum</strong>
              <br />
              Unterschrift des Studioleiters / Vertreters
            </div>
            <div>
              <span />
              <strong>Ort, Datum</strong>
              <br />
              Unterschrift des Mitglieds (bei Minderjährigen Erziehungsberechtigter)
            </div>
          </div>
        </article>
      ) : (
        /* --- MITGLIEDSAUSWEIS --- */
        <article className="print-sheet fitness-print">
          <div className="fitness-print-center">
            <h1>Mitgliedsausweis & Theken-Barcode</h1>
            <p className="fitness-print-sub">
              Kann als Scheckkarte oder Anhänger ausgedruckt werden. Unterstützt alle Barcode- und QR-Scanner am Empfangstresen.
            </p>
          </div>

          <div className="fitness-print-cards">
            {/* Vorderseite Ausweis */}
            <div className="fitness-idcard">
              <div className="fitness-idcard-top">
                <div>
                  <div className="fitness-idcard-brand">
                    <Dumbbell size={14} />
                    <span>{companyName}</span>
                  </div>
                  <span className="label">Member Pass</span>
                </div>
                <span className="status">{member.status.toUpperCase()}</span>
              </div>

              <div>
                <span className="label">Mitglied</span>
                <div className="name">
                  {member.firstName} {member.lastName}
                </div>
                <div>{member.planName}</div>
              </div>

              <div className="fitness-idcard-foot">
                <span>Gültig ab: {member.joinDate}</span>
                <strong>{member.memberNumber}</strong>
              </div>
            </div>

            {/* Rückseite Ausweis mit Barcode & QR */}
            <div className="fitness-idcard">
              <div className="fitness-idcard-top">
                <span className="label">Theken-Check-In</span>
                <span className="label">Notfall: {member.emergencyContact || "112"}</span>
              </div>

              {/* Strichcode-Simulation */}
              <div>
                <div className="fitness-barcode">
                  {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 2, 4, 1, 3, 2, 4, 1, 2, 3, 2, 4, 1].map((w, i) => (
                    <span key={i} style={{ width: `${w * 2}px` }} />
                  ))}
                </div>
                <div className="fitness-barcode-text">*{member.memberNumber}*</div>
              </div>

              <div className="fitness-idcard-foot">
                <span>Bei Auffinden bitte im Studio abgeben.</span>
                <QrCode size={14} />
              </div>
            </div>
          </div>
        </article>
      )}
    </div>,
    document.body,
  );
}
