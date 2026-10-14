import type { ReactNode } from "react";
import { ArrowLeft, Code2, EyeOff, Headset, Lock, Server, ShieldCheck } from "lucide-react";
import { Link, Logo } from "../components";
import { useI18n } from "../i18n";
import { LEGAL_UPDATED, OPERATOR } from "../../shared/legal";

// Rechtstexte nach deutschem Recht. Sie stehen bewusst auf Deutsch, in allen Sprachen.

const missing = <span className="legal-missing">wird ergänzt</span>;
const value = (v: string) => (v ? v : missing);

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="legal">
      <header className="legal-head">
        <Logo />
        <Link to="/" className="text-button"><ArrowLeft size={16} className="flip-rtl" /> {t("legal.back")}</Link>
      </header>
      <main className="legal-body" lang="de">
        <h1 className="display">{title}</h1>
        {children}
        <p className="muted">Stand: {new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(new Date(LEGAL_UPDATED))}</p>
      </main>
      <LegalLinks />
    </div>
  );
}

/** Kleine Fußzeile mit Impressum und Datenschutz, überall verlinkt. */
export function LegalLinks({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <nav className={`legal-links ${className}`} aria-label={t("legal.label")}>
      <Link to="/impressum">{t("legal.imprint")}</Link>
      <Link to="/datenschutz">{t("legal.privacy")}</Link>
    </nav>
  );
}

const Address = () => (
  <p>
    {OPERATOR.name}<br />
    {OPERATOR.business}<br />
    {value(OPERATOR.street)}<br />
    {OPERATOR.postalCode || OPERATOR.city ? `${OPERATOR.postalCode} ${OPERATOR.city}` : missing}<br />
    {OPERATOR.country}
  </p>
);

/** Siegel „Made in Germany“ und Vertrauens-Stempel. Nur Aussagen, die auch die Datenschutzerklärung belegt. */
const SEALS = [
  { icon: Server, title: "Daten in der EU", text: "Nur EU-Rechenzentren" },
  { icon: ShieldCheck, title: "DSGVO", text: "Datenschutz nach EU-Recht" },
  { icon: Lock, title: "Verschlüsselt", text: "HTTPS und geschützte Felder" },
  { icon: EyeOff, title: "Kein Tracking", text: "Keine Werbe-Cookies" },
  { icon: Headset, title: "Support auf Deutsch", text: "Fester Ansprechpartner" },
];

function MadeInGermany() {
  return (
    <section className="seals" aria-label="Made in Germany">
      <div className="seal-main">
        <span className="seal-flag" aria-hidden="true"><i /><i /><i /></span>
        <Code2 size={22} aria-hidden="true" />
        <strong>Made in Germany</strong>
        <span>Entwickelt in {OPERATOR.city.replace(" in der Oberpfalz", " i. d. OPf.")}</span>
      </div>
      <ul className="seal-list">
        {SEALS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="seal">
            <Icon size={20} aria-hidden="true" />
            <strong>{title}</strong>
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="seal-note">
        Code Kontor wird in Deutschland entwickelt und betreut. Ein fester Ansprechpartner, Daten nur in der EU und laufende
        Weiterentwicklung: darauf kannst du dich auch in Zukunft verlassen.
      </p>
    </section>
  );
}

export function ImprintPage() {
  return (
    <LegalLayout title="Impressum">
      <MadeInGermany />
      <h2>Angaben gemäß § 5 DDG</h2>
      <Address />
      <h2>Kontakt</h2>
      <p>
        E-Mail: {OPERATOR.email ? <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> : missing}<br />
        Telefon: {value(OPERATOR.phone)}<br />
        Web: <a href={OPERATOR.website}>{OPERATOR.website.replace("https://", "")}</a>
      </p>
      {(OPERATOR.vatId || OPERATOR.vatNote) && (
        <>
          <h2>Umsatzsteuer</h2>
          <p>{OPERATOR.vatId ? `Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: ${OPERATOR.vatId}` : OPERATOR.vatNote}</p>
        </>
      )}
      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>{OPERATOR.name}, Anschrift wie oben.</p>
      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Code Kontor richtet sich an Unternehmen. Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>
      <h2>Haftung für Inhalte und Links</h2>
      <p>
        Wir erstellen die Inhalte dieser Seiten mit Sorgfalt, übernehmen für Richtigkeit, Vollständigkeit und Aktualität aber keine Gewähr.
        Für Inhalte externer Seiten, auf die wir verlinken, sind deren Betreiber verantwortlich. Werden uns Rechtsverletzungen bekannt,
        entfernen wir die betreffenden Inhalte oder Links umgehend.
      </p>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Datenschutzerklärung">
      <h2>1. Verantwortlicher</h2>
      <Address />
      <p>E-Mail: {OPERATOR.email ? <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> : missing}</p>

      <h2>2. Überblick</h2>
      <p>
        Code Kontor ist eine Software für Unternehmen (Software as a Service). Wir verarbeiten personenbezogene Daten nur, soweit es für
        den Betrieb, die Sicherheit und die Abrechnung nötig ist. Wir verkaufen keine Daten und nutzen keine Werbe- oder Analyse-Tracker.
      </p>

      <h2>3. Hosting und Datenspeicherung</h2>
      <p>
        Die Anwendung und alle Daten liegen bei Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA. Die Datenbanken liegen
        ausschließlich in Rechenzentren in der Europäischen Union. Jede Firma erhält eine eigene, von anderen Kunden getrennte Datenbank. Daten werden bei der Übertragung verschlüsselt (HTTPS), besonders schützenswerte
        Felder wie Steuer-ID, Sozialversicherungsnummer und IBAN zusätzlich verschlüsselt gespeichert. Cloudflare ist unter dem
        EU-US Data Privacy Framework zertifiziert; mit Cloudflare besteht ein Vertrag zur Auftragsverarbeitung. Beim Aufruf der Seiten
        verarbeitet Cloudflare technisch notwendige Verbindungsdaten (z. B. IP-Adresse, Zeitpunkt, aufgerufene Adresse), um die Seite
        auszuliefern und vor Angriffen zu schützen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.
      </p>

      <h2>4. Konto und Anmeldung</h2>
      <p>
        Für ein Konto speichern wir Firmenname, Name, E-Mail-Adresse und ein Passwort (nur als sicherer Hash). Für die Sicherheit speichern
        wir angemeldete Geräte, Anmeldeversuche und ein Protokoll wichtiger Aktionen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO
        (Vertrag) und lit. f (Sicherheit).
      </p>

      <h2>5. Daten, die Kunden in Code Kontor eintragen</h2>
      <p>
        Daten, die unsere Kunden über ihre Mitarbeiter, Kunden oder Geschäftsvorgänge eintragen (z. B. Lohndaten, Arbeitszeiten,
        Abwesenheiten, Stempelzeiten), verarbeiten wir ausschließlich im Auftrag des jeweiligen Kunden nach Art. 28 DSGVO. Verantwortlich
        für diese Daten ist der Kunde. Einen Vertrag zur Auftragsverarbeitung stellen wir auf Anfrage bereit.
      </p>

      <h2>6. Cookies und lokale Speicherung</h2>
      <p>
        Wir setzen nur ein technisch notwendiges Cookie für die Anmeldung. Sprache und Darstellung (hell/dunkel) werden im Browser
        gespeichert. Es gibt keine Tracking- oder Werbe-Cookies, daher ist keine Einwilligung nötig (§ 25 Abs. 2 TDDDG).
      </p>

      <h2>7. Zahlungen</h2>
      <p>
        Abos werden über Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Dublin 2, Irland abgewickelt. Zahlungsdaten gibst du
        direkt bei Stripe ein, wir sehen sie nicht. Stripe erhält Firmenname, E-Mail-Adresse und die gewählten Leistungen.
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
      </p>

      <h2>8. E-Mails</h2>
      <p>
        System-E-Mails (z. B. Einladungen, Passwort zurücksetzen, Monatsmeldung an den Steuerberater) versenden wir über Resend
        (Resend, Inc., USA). Dabei werden Empfängeradresse und Inhalt der E-Mail übermittelt. Die Übermittlung in die USA erfolgt auf
        Grundlage von EU-Standardvertragsklauseln. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
      </p>

      <h2>9. KI-Assistent</h2>
      <p>
        Wenn du den KI-Assistenten nutzt, wird deine Frage an Google (Gemini API, Google Ireland Limited bzw. Google LLC, USA) gesendet,
        um eine Antwort zu erzeugen. Bitte gib dort keine sensiblen personenbezogenen Daten ein. Der Assistent wird nur auf deine Anfrage
        hin genutzt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
      </p>

      <h2>10. Adressvorschläge</h2>
      <p>
        Beim Eintippen einer Firmenadresse fragen wir Vorschläge bei Photon (komoot GmbH, Potsdam) und Zippopotam.us ab. Übermittelt wird
        nur der eingegebene Adresstext, nicht deine IP-Adresse. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.
      </p>

      <h2>11. Schriften</h2>
      <p>Alle Schriftarten liegen auf unserem eigenen Server. Es werden keine Daten an Google Fonts oder andere Schriftdienste gesendet.</p>

      <h2>12. Speicherdauer</h2>
      <p>
        Wir speichern Daten, solange das Konto besteht. Wird eine Firma gelöscht, löschen wir alle Daten dieser Firma sofort, soweit keine
        gesetzlichen Aufbewahrungspflichten (z. B. für Rechnungen) bestehen. Vorher kann der Inhaber alle Daten exportieren.
      </p>

      <h2>13. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
        Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Wende dich dafür an die oben genannte Adresse. Du kannst dich außerdem bei
        einer Datenschutz-Aufsichtsbehörde beschweren.
      </p>
    </LegalLayout>
  );
}
