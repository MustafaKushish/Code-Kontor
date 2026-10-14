import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";
import { LanguageSwitch } from "../layout/LanguageSwitch";
import { AddressInput } from "./AddressInput";
import { Field, Logo } from "../components";
import { COUNTRY_CODES, countryTax, sortedCountries } from "../../shared/countries";
import { BASIC_METHODS, countryMethods, defaultMethods, parseMethods, PAYMENT_METHOD_NAMES } from "../../shared/payments";
import { emptyCompanyProfile, validateCompany, type CompanyErrors, type CompanyProfile } from "../../shared/company";

const STEPS: { key: "step1" | "step2" | "step3"; fields: (keyof CompanyProfile)[] }[] = [
  { key: "step1", fields: ["name", "legalForm", "street", "postalCode", "city", "country", "email", "phone"] },
  { key: "step2", fields: ["taxNumber", "vatId"] },
  { key: "step3", fields: ["iban", "bic", "bankName", "paymentMethods", "paymentAccount", "logoDataUrl"] },
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
  const [company, setCompany] = useState<CompanyProfile>(emptyCompanyProfile);
  const [errors, setErrors] = useState<CompanyErrors>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { t, lang, errorText } = useI18n();
  const err = (key: keyof CompanyProfile) => (errors[key] ? t(`validation.${errors[key]}`) : undefined);
  const countryName = (code: string) => {
    try {
      return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  useEffect(() => {
    api<{ company: CompanyProfile | null }>("/company").then(({ company }) => {
      if (company) setCompany({ ...emptyCompanyProfile, ...company, paymentMethods: company.paymentMethods || defaultMethods(company.country).join(",") });
    });
  }, []);

  const set = (key: keyof CompanyProfile) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setCompany({ ...company, [key]: e.target.value });

  // Neues Land: Zahlarten neu vorschlagen, solange noch die Vorschläge des alten Landes gewählt sind
  const changeCountry = (country: string) =>
    setCompany((c) => {
      const untouched = !c.paymentMethods || c.paymentMethods === defaultMethods(c.country).join(",");
      return { ...c, country, paymentMethods: untouched ? defaultMethods(country).join(",") : c.paymentMethods };
    });

  const methods = parseMethods(company.paymentMethods);
  const toggleMethod = (id: string) =>
    setCompany((c) => {
      const current = parseMethods(c.paymentMethods);
      return { ...c, paymentMethods: (current.includes(id) ? current.filter((m) => m !== id) : [...current, id]).join(",") };
    });
  const methodName = (id: string) => PAYMENT_METHOD_NAMES[id] ?? t(`payments.${id}`);
  const offered = [...new Set([...BASIC_METHODS, ...countryMethods(company.country), ...methods])];
  const usesIban = countryTax(company.country).iban;

  // PLZ eingegeben: Ort automatisch eintragen, solange er leer ist oder selbst eingetragen wurde.
  const autoCity = useRef("");
  const changePostalCode = (postalCode: string) => {
    setCompany((c) => ({ ...c, postalCode }));
    const code = postalCode.trim();
    const complete = company.country === "DE" ? /^\d{5}$/.test(code) : code.length >= 4;
    if (!props.addressLookup || !complete || (company.city && company.city !== autoCity.current)) return;
    const params = new URLSearchParams({ country: company.country, code });
    api<{ city: string | null }>(`/geo/postal?${params}`)
      .then(({ city }) => {
        if (!city) return;
        const previous = autoCity.current;
        autoCity.current = city;
        setCompany((c) => (c.postalCode.trim() === code && (!c.city || c.city === previous) ? { ...c, city } : c));
      })
      .catch(() => {});
  };

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
        setErrors(err.errors as CompanyErrors);
        const first = STEPS.findIndex((s) => s.fields.some((f) => err.errors![f]));
        if (first >= 0) setStep(first);
      }
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const pickLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200_000) return setErrors({ ...errors, logoDataUrl: "logoSize" });
    const reader = new FileReader();
    reader.onload = () => setCompany((c) => ({ ...c, logoDataUrl: String(reader.result) }));
    reader.readAsDataURL(file);
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

        <div className="grid">
          {step === 0 && (
            <>
              <Field label={t("wizard.name")} error={err("name")} wide>
                <input value={company.name} onChange={set("name")} autoComplete="organization" />
              </Field>
              <Field label={t("wizard.legalForm")} hint={t("wizard.legalFormHint")}>
                <input value={company.legalForm} onChange={set("legalForm")} />
              </Field>
              <Field label={t("wizard.country")} error={err("country")}>
                <select value={company.country} onChange={(e) => changeCountry(e.target.value)}>
                  {!COUNTRY_CODES.includes(company.country) && <option value={company.country}>{countryName(company.country)}</option>}
                  {sortedCountries(lang).map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("wizard.street")} error={err("street")} hint={props.addressLookup ? t("wizard.streetHint") : undefined} wide>
                <AddressInput
                  value={company.street}
                  country={company.country}
                  lang={lang}
                  enabled={props.addressLookup}
                  onChange={(street) => setCompany((c) => ({ ...c, street }))}
                  onPick={(a) =>
                    setCompany((c) => ({
                      ...c,
                      street: a.street,
                      postalCode: a.postalCode || c.postalCode,
                      city: a.city || c.city,
                      country: COUNTRY_CODES.includes(a.country) ? a.country : c.country,
                      paymentMethods:
                        COUNTRY_CODES.includes(a.country) && a.country !== c.country && (!c.paymentMethods || c.paymentMethods === defaultMethods(c.country).join(","))
                          ? defaultMethods(a.country).join(",")
                          : c.paymentMethods,
                    }))
                  }
                />
              </Field>
              <Field label={t("wizard.postalCode")} error={err("postalCode")}>
                <input value={company.postalCode} onChange={(e) => changePostalCode(e.target.value)} autoComplete="postal-code" inputMode="numeric" />
              </Field>
              <Field label={t("wizard.city")} error={err("city")}>
                <input value={company.city} onChange={set("city")} autoComplete="address-level2" />
              </Field>
              <Field label={t("wizard.invoiceEmail")} error={err("email")}>
                <input type="email" value={company.email} onChange={set("email")} autoComplete="email" />
              </Field>
              <Field label={t("wizard.phone")}>
                <input type="tel" value={company.phone} onChange={set("phone")} autoComplete="tel" />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label={t("wizard.taxNumber")} error={err("taxNumber")} hint={t("wizard.taxNumberHint")} wide>
                <input value={company.taxNumber} onChange={set("taxNumber")} inputMode="numeric" />
              </Field>
              <Field label={t("wizard.vatId")} error={err("vatId")} hint={t("wizard.vatIdHint")} wide>
                <input value={company.vatId} onChange={set("vatId")} />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              {!usesIban && <p className="notice wide">{t("wizard.noIban", { country: countryName(company.country) })}</p>}
              <Field label={usesIban ? t("wizard.iban") : t("wizard.accountNumber")} error={err("iban")} hint={usesIban ? undefined : t("wizard.accountNumberHint")} wide>
                <input value={company.iban} onChange={set("iban")} placeholder={usesIban ? `${company.country}00 0000 0000 0000 0000 00` : ""} />
              </Field>
              <Field label={usesIban ? t("wizard.bic") : t("wizard.swift")} error={err("bic")}>
                <input value={company.bic} onChange={set("bic")} />
              </Field>
              <Field label={t("wizard.bankName")}>
                <input value={company.bankName} onChange={set("bankName")} />
              </Field>
              <div className="field wide" role="group" aria-labelledby="pay-methods">
                <span className="field-label" id="pay-methods">{t("wizard.paymentMethods")}</span>
                <div className="chips wrap">
                  {offered.map((id) => {
                    const on = methods.includes(id);
                    return <button type="button" key={id} aria-pressed={on} className={on ? "chip active" : "chip"} onClick={() => toggleMethod(id)}>{methodName(id)}</button>;
                  })}
                </div>
                <small className="muted">{t("wizard.paymentMethodsHint")}</small>
              </div>
              <Field label={t("wizard.paymentAccount")} error={err("paymentAccount")} hint={t("wizard.paymentAccountHint")} wide>
                <input value={company.paymentAccount} onChange={set("paymentAccount")} autoComplete="off" />
              </Field>
              <Field label={t("wizard.logo")} error={err("logoDataUrl")} hint={t("wizard.logoHint")} wide>
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={pickLogo} />
              </Field>
              {company.logoDataUrl && (
                <div className="logo-preview wide">
                  <img src={company.logoDataUrl} alt={t("wizard.logoPreview")} />
                  <button className="link" onClick={() => setCompany({ ...company, logoDataUrl: "" })}>{t("wizard.removeLogo")}</button>
                </div>
              )}
            </>
          )}
        </div>

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
