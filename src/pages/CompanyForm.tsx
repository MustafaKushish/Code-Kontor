import { useRef, useState, type ChangeEvent } from "react";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { api } from "../api";
import { useI18n } from "../i18n";
import { AddressInput } from "./AddressInput";
import { Field } from "../components";
import { COUNTRY_CODES, countryTax, sortedCountries } from "../../shared/countries";
import { BASIC_METHODS, countryMethods, defaultMethods, parseMethods, PAYMENT_METHOD_NAMES } from "../../shared/payments";
import { emptyCompanyProfile, validateCompany, type CompanyErrors, type CompanyProfile } from "../../shared/company";

// Firmendaten-Felder: genutzt vom Einrichtungs-Assistenten und von der Seite „Firma“.

export type CompanyPart = "address" | "tax" | "bank" | "logo";

export const PART_FIELDS: Record<CompanyPart, (keyof CompanyProfile)[]> = {
  address: ["name", "legalForm", "street", "postalCode", "city", "country", "email", "phone"],
  tax: ["taxNumber", "vatId"],
  bank: ["iban", "bic", "bankName", "paymentMethods", "paymentAccount"],
  logo: ["logoDataUrl"],
};

/** Gespeicherte Firmendaten mit vorgeschlagenen Zahlarten, falls noch keine gewählt sind. */
export function withDefaults(company: CompanyProfile | null): CompanyProfile {
  if (!company) return emptyCompanyProfile;
  return { ...emptyCompanyProfile, ...company, paymentMethods: company.paymentMethods || defaultMethods(company.country).join(",") };
}

/** Fehler der Prüfung, nur für die Felder der genannten Bereiche. */
export function partErrors(company: CompanyProfile, parts: CompanyPart[]): CompanyErrors {
  const all = validateCompany(company);
  const fields = parts.flatMap((p) => PART_FIELDS[p]);
  return Object.fromEntries(fields.filter((f) => all[f]).map((f) => [f, all[f]])) as CompanyErrors;
}

export function useCountryName() {
  const { lang } = useI18n();
  return (code: string) => {
    try {
      return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? code;
    } catch {
      return code;
    }
  };
}

/** Eingabefelder eines Bereichs der Firmendaten. */
export function CompanyFields({ part, company, setCompany, errors, setErrors, addressLookup, disabled }: {
  part: CompanyPart;
  company: CompanyProfile;
  setCompany: (update: (c: CompanyProfile) => CompanyProfile) => void;
  errors: CompanyErrors;
  setErrors: (errors: CompanyErrors) => void;
  addressLookup: boolean;
  disabled?: boolean;
}) {
  const { t, lang } = useI18n();
  const countryName = useCountryName();
  const err = (key: keyof CompanyProfile) => (errors[key] ? t(`validation.${errors[key]}`) : undefined);
  const set = (key: keyof CompanyProfile) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setCompany((c) => ({ ...c, [key]: value }));
  };

  // Neues Land: Zahlarten neu vorschlagen, solange noch die Vorschläge des alten Landes gewählt sind
  const changeCountry = (country: string) =>
    setCompany((c) => {
      const untouched = !c.paymentMethods || c.paymentMethods === defaultMethods(c.country).join(",");
      return { ...c, country, paymentMethods: untouched ? defaultMethods(country).join(",") : c.paymentMethods };
    });

  // PLZ eingegeben: Ort automatisch eintragen, solange er leer ist oder selbst eingetragen wurde.
  const autoCity = useRef("");
  const changePostalCode = (postalCode: string) => {
    setCompany((c) => ({ ...c, postalCode }));
    const code = postalCode.trim();
    const complete = company.country === "DE" ? /^\d{5}$/.test(code) : code.length >= 4;
    if (!addressLookup || !complete || (company.city && company.city !== autoCity.current)) return;
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

  const methods = parseMethods(company.paymentMethods);
  const toggleMethod = (id: string) =>
    setCompany((c) => {
      const current = parseMethods(c.paymentMethods);
      return { ...c, paymentMethods: (current.includes(id) ? current.filter((m) => m !== id) : [...current, id]).join(",") };
    });
  const methodName = (id: string) => PAYMENT_METHOD_NAMES[id] ?? t(`payments.${id}`);
  const offered = [...new Set([...BASIC_METHODS, ...countryMethods(company.country), ...methods])];
  const usesIban = countryTax(company.country).iban;

  const pickLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200_000) return setErrors({ ...errors, logoDataUrl: "logoSize" });
    setErrors({ ...errors, logoDataUrl: undefined });
    const reader = new FileReader();
    reader.onload = () => setCompany((c) => ({ ...c, logoDataUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  if (part === "address")
    return (
      <fieldset className="grid" disabled={disabled}>
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
        <Field label={t("wizard.street")} error={err("street")} hint={addressLookup ? t("wizard.streetHint") : undefined} wide>
          <AddressInput
            value={company.street}
            country={company.country}
            lang={lang}
            enabled={addressLookup && !disabled}
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
      </fieldset>
    );

  if (part === "tax")
    return (
      <fieldset className="grid" disabled={disabled}>
        <Field label={t("wizard.taxNumber")} error={err("taxNumber")} hint={t("wizard.taxNumberHint")}>
          <input value={company.taxNumber} onChange={set("taxNumber")} inputMode="numeric" />
        </Field>
        <Field label={t("wizard.vatId")} error={err("vatId")} hint={t("wizard.vatIdHint")}>
          <input value={company.vatId} onChange={set("vatId")} />
        </Field>
      </fieldset>
    );

  if (part === "bank")
    return (
      <fieldset className="grid" disabled={disabled}>
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
      </fieldset>
    );

  return (
    <fieldset className="grid" disabled={disabled}>
      <div className="field wide">
        <span className="field-label">{t("wizard.logo")}</span>
        <div className="logo-upload">
          <span className="logo-box">{company.logoDataUrl ? <img src={company.logoDataUrl} alt={t("wizard.logoPreview")} /> : <ImageIcon size={28} aria-hidden />}</span>
          <div className="row wrap gap">
            <label className="button">
              <Upload size={17} aria-hidden /> {t("wizard.chooseLogo")}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={pickLogo} disabled={disabled} />
            </label>
            {company.logoDataUrl && !disabled && (
              <button type="button" className="button" onClick={() => setCompany((c) => ({ ...c, logoDataUrl: "" }))}><Trash2 size={17} aria-hidden /> {t("wizard.removeLogo")}</button>
            )}
          </div>
        </div>
        {err("logoDataUrl") ? <small className="error">{err("logoDataUrl")}</small> : <small className="muted">{t("wizard.logoHint")}</small>}
      </div>
    </fieldset>
  );
}

/** Zustand eines Firmendaten-Formulars. */
export function useCompanyState(initial: CompanyProfile = emptyCompanyProfile) {
  const [company, setCompanyState] = useState<CompanyProfile>(initial);
  const [errors, setErrors] = useState<CompanyErrors>({});
  const setCompany = (update: (c: CompanyProfile) => CompanyProfile) => setCompanyState(update);
  return { company, setCompany, replace: setCompanyState, errors, setErrors };
}
