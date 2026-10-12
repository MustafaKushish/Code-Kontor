// Firmendaten, die ein Kunde im Einrichtungs-Assistenten einträgt.
// Wird im Browser (Formular) und im Worker (Speichern) gleich geprüft.

export interface CompanyProfile {
  name: string;
  legalForm: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  taxNumber: string;
  vatId: string;
  iban: string;
  bic: string;
  bankName: string;
  logoDataUrl: string;
}

export const emptyCompanyProfile: CompanyProfile = {
  name: "",
  legalForm: "",
  street: "",
  postalCode: "",
  city: "",
  country: "DE",
  email: "",
  phone: "",
  taxNumber: "",
  vatId: "",
  iban: "",
  bic: "",
  bankName: "",
  logoDataUrl: "",
};

/** Fehler je Feld als Code; die App übersetzt ihn in die gewählte Sprache. */
export type ValidationCode =
  | "companyNameRequired" | "streetRequired" | "postalCodeRequired" | "postalCodeDe" | "cityRequired"
  | "countryRequired" | "emailInvalid" | "taxRequired" | "taxNumberInvalid" | "vatIdInvalid"
  | "ibanRequired" | "ibanInvalid" | "bicInvalid" | "logoType" | "logoSize";

export type CompanyErrors = Partial<Record<keyof CompanyProfile, ValidationCode>>;

const MAX_LOGO_BYTES = 200_000;

export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Prüfsumme nach ISO 13616 (Modulo 97). */
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("DE") && iban.length !== 22) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function isValidBic(value: string): boolean {
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(value.replace(/\s+/g, "").toUpperCase());
}

/** USt-IdNr.: Ländercode + 2 bis 12 Zeichen, für Deutschland genau 9 Ziffern. */
export function isValidVatId(value: string): boolean {
  const vat = value.replace(/\s+/g, "").toUpperCase();
  if (vat.startsWith("DE")) return /^DE\d{9}$/.test(vat);
  return /^[A-Z]{2}[A-Z0-9]{2,12}$/.test(vat);
}

/** Steuernummer: Format je Bundesland verschieden, daher nur 10 bis 13 Ziffern prüfen. */
export function isValidTaxNumber(value: string): boolean {
  const digits = value.replace(/[\s/]/g, "");
  return /^\d{10,13}$/.test(digits);
}

export function validateCompany(profile: CompanyProfile): CompanyErrors {
  const errors: CompanyErrors = {};
  if (!profile.name.trim()) errors.name = "companyNameRequired";
  if (!profile.street.trim()) errors.street = "streetRequired";
  if (!profile.postalCode.trim()) errors.postalCode = "postalCodeRequired";
  else if (profile.country === "DE" && !/^\d{5}$/.test(profile.postalCode.trim()))
    errors.postalCode = "postalCodeDe";
  if (!profile.city.trim()) errors.city = "cityRequired";
  if (!/^[A-Z]{2}$/.test(profile.country)) errors.country = "countryRequired";
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
    errors.email = "emailInvalid";
  if (!profile.taxNumber.trim() && !profile.vatId.trim())
    errors.taxNumber = "taxRequired";
  if (profile.taxNumber.trim() && !isValidTaxNumber(profile.taxNumber))
    errors.taxNumber = "taxNumberInvalid";
  if (profile.vatId.trim() && !isValidVatId(profile.vatId))
    errors.vatId = "vatIdInvalid";
  if (!profile.iban.trim()) errors.iban = "ibanRequired";
  else if (!isValidIban(profile.iban)) errors.iban = "ibanInvalid";
  if (profile.bic.trim() && !isValidBic(profile.bic)) errors.bic = "bicInvalid";
  if (profile.logoDataUrl) {
    if (!/^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(profile.logoDataUrl))
      errors.logoDataUrl = "logoType";
    else if (profile.logoDataUrl.length > MAX_LOGO_BYTES * 1.4)
      errors.logoDataUrl = "logoSize";
  }
  return errors;
}

/** Übernimmt nur bekannte Felder als Text, damit nichts Fremdes gespeichert wird. */
export function sanitizeCompany(input: unknown): CompanyProfile {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const profile = { ...emptyCompanyProfile };
  for (const key of Object.keys(emptyCompanyProfile) as (keyof CompanyProfile)[]) {
    const value = source[key];
    if (typeof value === "string") profile[key] = key === "logoDataUrl" ? value : value.trim();
  }
  profile.iban = normalizeIban(profile.iban);
  profile.bic = profile.bic.replace(/\s+/g, "").toUpperCase();
  profile.vatId = profile.vatId.replace(/\s+/g, "").toUpperCase();
  profile.country = profile.country.toUpperCase();
  return profile;
}
