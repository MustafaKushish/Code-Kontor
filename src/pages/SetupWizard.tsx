import { useEffect, useState, type ChangeEvent } from "react";
import { api, ApiError } from "../api";
import { Field, Logo } from "../components";
import { emptyCompanyProfile, validateCompany, type CompanyErrors, type CompanyProfile } from "../../shared/company";

const STEPS: { title: string; intro: string; fields: (keyof CompanyProfile)[] }[] = [
  {
    title: "Firma und Adresse",
    intro: "So erscheint deine Firma auf Rechnungen und Belegen.",
    fields: ["name", "legalForm", "street", "postalCode", "city", "country", "email", "phone"],
  },
  {
    title: "Steuern",
    intro: "Steuernummer oder USt-IdNr. sind Pflicht auf jeder Rechnung.",
    fields: ["taxNumber", "vatId"],
  },
  {
    title: "Bank und Logo",
    intro: "Die Bankverbindung steht unten auf deinen Rechnungen.",
    fields: ["iban", "bic", "bankName", "logoDataUrl"],
  },
];

const COUNTRIES: [string, string][] = [
  ["DE", "Deutschland"],
  ["AT", "Österreich"],
  ["CH", "Schweiz"],
  ["NL", "Niederlande"],
  ["BE", "Belgien"],
  ["FR", "Frankreich"],
  ["LU", "Luxemburg"],
  ["DK", "Dänemark"],
  ["PL", "Polen"],
  ["IT", "Italien"],
  ["ES", "Spanien"],
  ["TR", "Türkei"],
];

export function SetupWizard(props: {
  firstRun: boolean;
  onDone: () => void;
  onCancel?: () => void;
  onLogout: () => void;
}) {
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState<CompanyProfile>(emptyCompanyProfile);
  const [errors, setErrors] = useState<CompanyErrors>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ company: CompanyProfile | null }>("/company").then(({ company }) => {
      if (company) setCompany({ ...emptyCompanyProfile, ...company });
    });
  }, []);

  const set = (key: keyof CompanyProfile) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setCompany({ ...company, [key]: e.target.value });

  const stepErrors = (index: number) => {
    const all = validateCompany(company);
    return Object.fromEntries(STEPS[index].fields.filter((f) => all[f]).map((f) => [f, all[f]])) as CompanyErrors;
  };

  const next = async () => {
    const found = stepErrors(step);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (step < STEPS.length - 1) return setStep(step + 1);

    setBusy(true);
    setMessage("");
    try {
      await api("/company", { method: "PUT", body: company });
      props.onDone();
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setErrors(err.errors);
        const first = STEPS.findIndex((s) => s.fields.some((f) => err.errors![f]));
        if (first >= 0) setStep(first);
      }
      setMessage(err instanceof ApiError ? err.message : "Keine Verbindung zum Server.");
    } finally {
      setBusy(false);
    }
  };

  const pickLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200_000) return setErrors({ ...errors, logoDataUrl: "Das Logo darf höchstens 200 KB groß sein." });
    const reader = new FileReader();
    reader.onload = () => setCompany((c) => ({ ...c, logoDataUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const current = STEPS[step];
  return (
    <main className="page wizard-page">
      <header className="wizard-top">
        <Logo />
        {props.onCancel ? (
          <button className="link" onClick={props.onCancel}>Abbrechen</button>
        ) : (
          <button className="link" onClick={props.onLogout}>Abmelden</button>
        )}
      </header>

      <div className="card wizard">
        {props.firstRun && <p className="eyebrow">Einrichtung</p>}
        <ol className="progress" aria-label="Fortschritt">
          {STEPS.map((s, i) => (
            <li key={s.title} className={i === step ? "active" : i < step ? "done" : undefined}>
              <span>{i + 1}</span> {s.title}
            </li>
          ))}
        </ol>
        <h1>{current.title}</h1>
        <p className="muted">{current.intro}</p>

        <div className="grid">
          {step === 0 && (
            <>
              <Field label="Firmenname" error={errors.name} wide>
                <input value={company.name} onChange={set("name")} autoComplete="organization" />
              </Field>
              <Field label="Rechtsform" hint="z. B. Einzelunternehmen, GmbH, UG">
                <input value={company.legalForm} onChange={set("legalForm")} />
              </Field>
              <Field label="Land" error={errors.country}>
                <select value={company.country} onChange={set("country")}>
                  {COUNTRIES.map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Straße und Hausnummer" error={errors.street} wide>
                <input value={company.street} onChange={set("street")} autoComplete="street-address" />
              </Field>
              <Field label="PLZ" error={errors.postalCode}>
                <input value={company.postalCode} onChange={set("postalCode")} autoComplete="postal-code" inputMode="numeric" />
              </Field>
              <Field label="Ort" error={errors.city}>
                <input value={company.city} onChange={set("city")} autoComplete="address-level2" />
              </Field>
              <Field label="E-Mail für Rechnungen" error={errors.email}>
                <input type="email" value={company.email} onChange={set("email")} autoComplete="email" />
              </Field>
              <Field label="Telefon">
                <input type="tel" value={company.phone} onChange={set("phone")} autoComplete="tel" />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Steuernummer" error={errors.taxNumber} hint="vom Finanzamt, z. B. 12/345/67890" wide>
                <input value={company.taxNumber} onChange={set("taxNumber")} inputMode="numeric" />
              </Field>
              <Field label="USt-IdNr. (falls vorhanden)" error={errors.vatId} hint="z. B. DE123456789" wide>
                <input value={company.vatId} onChange={set("vatId")} />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="IBAN" error={errors.iban} wide>
                <input value={company.iban} onChange={set("iban")} placeholder="DE00 0000 0000 0000 0000 00" />
              </Field>
              <Field label="BIC (optional)" error={errors.bic}>
                <input value={company.bic} onChange={set("bic")} />
              </Field>
              <Field label="Bank (optional)">
                <input value={company.bankName} onChange={set("bankName")} />
              </Field>
              <Field label="Logo (optional)" error={errors.logoDataUrl} hint="PNG, JPG, SVG oder WebP, höchstens 200 KB" wide>
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={pickLogo} />
              </Field>
              {company.logoDataUrl && (
                <div className="logo-preview wide">
                  <img src={company.logoDataUrl} alt="Logo-Vorschau" />
                  <button className="link" onClick={() => setCompany({ ...company, logoDataUrl: "" })}>Logo entfernen</button>
                </div>
              )}
            </>
          )}
        </div>

        {message && <p className="error" role="alert">{message}</p>}
        <div className="actions">
          {step > 0 && <button className="button" onClick={() => { setErrors({}); setStep(step - 1); }}>Zurück</button>}
          <button className="button primary" onClick={next} disabled={busy}>
            {step < STEPS.length - 1 ? "Weiter" : busy ? "Speichert …" : "Speichern und fertig"}
          </button>
        </div>
      </div>
    </main>
  );
}
