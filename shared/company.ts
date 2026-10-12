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

export type CompanyErrors = Partial<Record<keyof CompanyProfile, string>>;

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
  if (!profile.name.trim()) errors.name = "Bitte den Firmennamen angeben.";
  if (!profile.street.trim()) errors.street = "Bitte Straße und Hausnummer angeben.";
  if (!profile.postalCode.trim()) errors.postalCode = "Bitte die PLZ angeben.";
  else if (profile.country === "DE" && !/^\d{5}$/.test(profile.postalCode.trim()))
    errors.postalCode = "Eine deutsche PLZ hat 5 Ziffern.";
  if (!profile.city.trim()) errors.city = "Bitte den Ort angeben.";
  if (!/^[A-Z]{2}$/.test(profile.country)) errors.country = "Bitte ein Land wählen.";
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
    errors.email = "Diese E-Mail-Adresse sieht nicht richtig aus.";
  if (!profile.taxNumber.trim() && !profile.vatId.trim())
    errors.taxNumber = "Für Rechnungen ist eine Steuernummer oder USt-IdNr. nötig.";
  if (profile.taxNumber.trim() && !isValidTaxNumber(profile.taxNumber))
    errors.taxNumber = "Die Steuernummer hat 10 bis 13 Ziffern.";
  if (profile.vatId.trim() && !isValidVatId(profile.vatId))
    errors.vatId = "Die USt-IdNr. hat das Format DE123456789.";
  if (!profile.iban.trim()) errors.iban = "Bitte die IBAN angeben.";
  else if (!isValidIban(profile.iban)) errors.iban = "Diese IBAN ist ungültig. Bitte prüfen.";
  if (profile.bic.trim() && !isValidBic(profile.bic)) errors.bic = "Diese BIC ist ungültig.";
  if (profile.logoDataUrl) {
    if (!/^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(profile.logoDataUrl))
      errors.logoDataUrl = "Das Logo muss ein PNG-, JPG-, SVG- oder WebP-Bild sein.";
    else if (profile.logoDataUrl.length > MAX_LOGO_BYTES * 1.4)
      errors.logoDataUrl = "Das Logo darf höchstens 200 KB groß sein.";
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
