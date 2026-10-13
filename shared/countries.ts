// Länder, in denen Code Kontor genutzt werden kann: Währung und Umsatzsteuer-Sätze als Vorgabe.
// Die Sätze sind Startwerte (Stand Herbst 2026); jede Firma kann sie in „Firma → Steuern“ anpassen.
// Der erste Satz ist der Normalsatz, danach folgen ermäßigte Sätze. 0 % ist immer zusätzlich wählbar.

export interface CountryTax {
  currency: string;
  /** Umsatzsteuer / MwSt / VAT / GST in Prozent, Normalsatz zuerst. Leer = keine Umsatzsteuer. */
  vat: number[];
  /** Bankverbindung als IBAN üblich */
  iban: boolean;
  /** EU-Mitglied: USt-IdNr. mit Ländercode */
  eu?: boolean;
}

const eu = (vat: number[]): CountryTax => ({ currency: "EUR", vat, iban: true, eu: true });
const euOwn = (currency: string, vat: number[]): CountryTax => ({ currency, vat, iban: true, eu: true });
const c = (currency: string, vat: number[], iban = false): CountryTax => ({ currency, vat, iban });

export const COUNTRY_TAX: Record<string, CountryTax> = {
  // Europäische Union
  DE: eu([19, 7]),
  AT: eu([20, 13, 10]),
  BE: eu([21, 12, 6]),
  BG: euOwn("EUR", [20, 9]),
  HR: eu([25, 13, 5]),
  CY: eu([19, 9, 5]),
  CZ: euOwn("CZK", [21, 12]),
  DK: euOwn("DKK", [25]),
  EE: eu([24, 13, 9]),
  FI: eu([25.5, 13.5, 10]),
  FR: eu([20, 10, 5.5, 2.1]),
  GR: eu([24, 13, 6]),
  HU: euOwn("HUF", [27, 18, 5]),
  IE: eu([23, 13.5, 9]),
  IT: eu([22, 10, 5, 4]),
  LV: eu([21, 12, 5]),
  LT: eu([21, 9, 5]),
  LU: eu([17, 14, 8, 3]),
  MT: eu([18, 7, 5]),
  NL: eu([21, 9]),
  PL: euOwn("PLN", [23, 8, 5]),
  PT: eu([23, 13, 6]),
  RO: euOwn("RON", [21, 11]),
  SK: eu([23, 19, 5]),
  SI: eu([22, 9.5, 5]),
  ES: eu([21, 10, 4]),
  SE: euOwn("SEK", [25, 12, 6]),
  // Übriges Europa
  CH: c("CHF", [8.1, 3.8, 2.6], true),
  LI: c("CHF", [8.1, 3.8, 2.6], true),
  GB: c("GBP", [20, 5], true),
  NO: c("NOK", [25, 15, 12], true),
  IS: c("ISK", [24, 11], true),
  TR: c("TRY", [20, 10, 1], true),
  UA: c("UAH", [20, 14, 7], true),
  RS: c("RSD", [20, 10], true),
  BA: c("BAM", [17], true),
  MK: c("MKD", [18, 10, 5], true),
  AL: c("ALL", [20, 6], true),
  ME: c("EUR", [21, 7], true),
  XK: c("EUR", [18, 8], true),
  MD: c("MDL", [20, 8], true),
  // Naher Osten und Nordafrika
  AE: c("AED", [5], true),
  SA: c("SAR", [15], true),
  QA: c("QAR", [], true),
  KW: c("KWD", [], true),
  BH: c("BHD", [10], true),
  OM: c("OMR", [5], true),
  IQ: c("IQD", [], true),
  JO: c("JOD", [16], true),
  LB: c("LBP", [11], true),
  IL: c("ILS", [18], true),
  EG: c("EGP", [14], true),
  MA: c("MAD", [20, 10, 7], true),
  TN: c("TND", [19, 13, 7], true),
  // Amerika, Asien, Ozeanien
  US: c("USD", []),
  CA: c("CAD", [5]),
  MX: c("MXN", [16]),
  BR: c("BRL", []),
  AU: c("AUD", [10]),
  NZ: c("NZD", [15]),
  JP: c("JPY", [10, 8]),
  SG: c("SGD", [9]),
  HK: c("HKD", []),
  IN: c("INR", [18, 5]),
  CN: c("CNY", [13, 9, 6]),
};

/** Länder ohne eigene Einträge: keine Umsatzsteuer vorgegeben, Euro, Sätze frei einstellbar. */
export const DEFAULT_TAX: CountryTax = { currency: "EUR", vat: [], iban: false };

export const COUNTRY_CODES = Object.keys(COUNTRY_TAX);

export function countryTax(country: string): CountryTax {
  return COUNTRY_TAX[country.toUpperCase()] ?? DEFAULT_TAX;
}

/** Steuer-Einstellungen einer Firma. Leere Liste = keine Umsatzsteuer auf Rechnungen. */
export interface TaxSettings {
  currency: string;
  vatRates: number[];
}

export function defaultTaxSettings(country: string): TaxSettings {
  const tax = countryTax(country);
  return { currency: tax.currency, vatRates: [...tax.vat] };
}

/** Prüft Währung (ISO 4217) und Sätze (0 bis 100, höchstens 2 Nachkommastellen, höchstens 6 Stück). */
export function sanitizeTaxSettings(input: unknown, country: string): TaxSettings {
  const fallback = defaultTaxSettings(country);
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const currency = typeof source.currency === "string" && /^[A-Z]{3}$/.test(source.currency.toUpperCase()) ? source.currency.toUpperCase() : fallback.currency;
  const rates = Array.isArray(source.vatRates)
    ? [...new Set(source.vatRates.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n < 100).map((n) => Math.round(n * 100) / 100))].slice(0, 6)
    : fallback.vatRates;
  return { currency, vatRates: rates };
}

/** Alle wählbaren Sätze für eine Position: eingestellte Sätze und 0 %. */
export function selectableRates(settings: TaxSettings): number[] {
  return [...settings.vatRates, 0];
}

/** Land aus der Browsersprache raten, z. B. "de-CH" → "CH". */
export function guessCountry(locales: readonly string[], fallback = "DE"): string {
  for (const locale of locales) {
    const region = locale.split(/[-_]/)[1]?.toUpperCase();
    if (region && COUNTRY_TAX[region]) return region;
  }
  return fallback;
}

/** Alle Länder mit Namen in der gewählten Sprache, alphabetisch. */
export function sortedCountries(lang: string): [string, string][] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([lang], { type: "region" });
  } catch {
    names = null;
  }
  return COUNTRY_CODES.map((code) => [code, names?.of(code) ?? code] as [string, string]).sort((a, b) => a[1].localeCompare(b[1], lang));
}
