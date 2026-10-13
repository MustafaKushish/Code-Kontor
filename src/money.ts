// Währung und Steuersätze der angemeldeten Firma. Wird nach dem Laden von /me gesetzt
// und von allen Systemen für Beträge und Steuer-Auswahl genutzt.
import { selectableRates, type TaxSettings } from "../shared/countries";

let current: TaxSettings = { currency: "EUR", vatRates: [19, 7] };

export function setTaxSettings(settings: TaxSettings | undefined) {
  if (settings) current = settings;
}

export const currency = () => current.currency;

/** Wählbare Steuersätze, Normalsatz zuerst, 0 % zuletzt. */
export const vatChoices = (extra?: number) => {
  const rates = selectableRates(current);
  return extra !== undefined && !rates.includes(extra) ? [...rates, extra] : rates;
};

/** Normalsatz für neue Positionen; 0, wenn das Land keine Umsatzsteuer hat. */
export const standardVat = () => current.vatRates[0] ?? 0;

export function formatMoney(cents: number, lang: string, code = current.currency) {
  try {
    return new Intl.NumberFormat(lang, { style: "currency", currency: code }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

/** Kurzes Zeichen der Währung, z. B. „€“, „CHF“, „$“. */
export function currencySymbol(lang: string, code = current.currency) {
  try {
    return new Intl.NumberFormat(lang, { style: "currency", currency: code }).formatToParts(0).find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

/** Satz schön anzeigen, z. B. 8.1 → „8,1 %“. */
export const formatRate = (rate: number, lang: string) => `${new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(rate)} %`;
