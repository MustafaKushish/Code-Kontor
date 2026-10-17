import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";
import { LanguageSwitch } from "../layout/LanguageSwitch";
import { Logo } from "../components";
import { type CompanyErrors, type CompanyProfile } from "../../shared/company";
import { CompanyFields, partErrors, useCompanyState, withDefaults, PART_FIELDS, type CompanyPart } from "./CompanyForm";

const STEPS: { key: "step1" | "step2" | "step3"; parts: CompanyPart[] }[] = [
  { key: "step1", parts: ["address"] },
  { key: "step2", parts: ["tax"] },
  { key: "step3", parts: ["bank", "logo"] },
];

export function SetupWizard(props: {
  firstRun: boolean;
  /** Adressvorschläge erlaubt (Datenschutz-Schalter der Firma) */
  addressLookup: boolean;
  onDone: () => void;
  onCancel?: () => void;
  onLogout: () => void;
}) {
  const [step, setStep] = useState(0);
  const { company, setCompany, replace, errors, setErrors } = useCompanyState();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { t, errorText } = useI18n();

  useEffect(() => {
    api<{ company: CompanyProfile | null }>("/company").then(({ company }) => company && replace(withDefaults(company)));
  }, []);

  const next = async () => {
    const found = partErrors(company, STEPS[step].parts);
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
        setErrors(err.errors as CompanyErrors);
        const first = STEPS.findIndex((s) => s.parts.some((p) => PART_FIELDS[p].some((f) => err.errors![f])));
        if (first >= 0) setStep(first);
      }
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const current = STEPS[step];
  return (
    <main className="page wizard-page">
      <header className="wizard-top">
        <Logo />
        <div className="row">
          <LanguageSwitch compact />
          {props.onCancel ? (
            <button className="link" onClick={props.onCancel}>{t("common.cancel")}</button>
          ) : (
            <button className="link" onClick={props.onLogout}>{t("common.logout")}</button>
          )}
        </div>
      </header>

      <div className="card wizard">
        {props.firstRun && <p className="eyebrow">{t("wizard.setup")}</p>}
        <ol className="progress" aria-label={t("wizard.progress")}>
          {STEPS.map((s, i) => (
            <li key={s.key} className={i === step ? "active" : i < step ? "done" : undefined}>
              <span>{i + 1}</span> {t(`wizard.${s.key}Title`)}
            </li>
          ))}
        </ol>
        <h1 className="display">{t(`wizard.${current.key}Title`)}</h1>
        <p className="muted">{t(`wizard.${current.key}Intro`)}</p>

        {current.parts.map((part) => (
          <CompanyFields key={part} part={part} company={company} setCompany={setCompany} errors={errors} setErrors={setErrors} addressLookup={props.addressLookup} />
        ))}

        {message && <p className="error" role="alert">{message}</p>}
        <div className="actions">
          {step > 0 && <button className="button" onClick={() => { setErrors({}); setStep(step - 1); }}>{t("common.back")}</button>}
          <button className="button primary" onClick={next} disabled={busy}>
            {step < STEPS.length - 1 ? t("wizard.next") : busy ? t("wizard.saving") : t("wizard.finish")}
          </button>
        </div>
      </div>
    </main>
  );
}
