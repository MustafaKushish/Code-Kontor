import { Fragment, createElement, type ReactNode } from "react";
import { currencySymbol, formatMoney } from "../../money";
import { ApiError } from "../../api";
import { createModuleI18n, type Loaders } from "../moduleI18n";
import { de, type OfficeDict } from "./lang/de";

// Eigene Texte des Systems „Büro & Dienstleister“. Deutsch ist eingebaut, andere Sprachen werden bei Bedarf nachgeladen.

export type { OfficeDict };
/** Alter Name des deutschen Wörterbuchs, bleibt für bestehende Importe erhalten. */
export const officeDictDe = de;

const loaders: Loaders<OfficeDict> = {
  en: () => import("./lang/en").then((m) => m.en),
  tr: () => import("./lang/tr").then((m) => m.tr),
  ar: () => import("./lang/ar").then((m) => m.ar),
  fr: () => import("./lang/fr").then((m) => m.fr),
  es: () => import("./lang/es").then((m) => m.es),
  it: () => import("./lang/it").then((m) => m.it),
  pl: () => import("./lang/pl").then((m) => m.pl),
  ru: () => import("./lang/ru").then((m) => m.ru),
  uk: () => import("./lang/uk").then((m) => m.uk),
};

const useOfficeTexts = createModuleI18n(de, loaders);

/** Gespeicherte Zahlungsarten (Werte in der Datenbank) → Schlüssel der Texte. */
const PAY_METHOD_KEYS: Record<string, string> = {
  Überweisung: "transfer",
  Lastschrift: "debit",
  Bar: "cash",
  Karte: "card",
  PayPal: "paypal",
};

export function useOfficeI18n() {
  const { core, t, has, ready } = useOfficeTexts();

  const o = t;

  /** Wie `o`, setzt aber React-Elemente (z. B. <strong>) für die Platzhalter ein. */
  const oRich = (path: string, vars: Record<string, ReactNode>): ReactNode =>
    t(path)
      .split(/(\{\w+\})/)
      .map((part, i) => {
        const m = /^\{(\w+)\}$/.exec(part);
        return createElement(Fragment, { key: i }, m && m[1] in vars ? vars[m[1]] : part);
      });

  /** Fehler aus dem System zuerst mit eigenen Texten, sonst wie in der Plattform. */
  const officeError = (error: unknown) => {
    if (error instanceof ApiError && error.code?.startsWith("office.")) {
      const path = `errors.${error.code.slice(7)}`;
      if (has(path)) return t(path);
    }
    return core.errorText(error);
  };

  // Name „euro“ bleibt, rechnet aber in der Währung der Firma
  const euro = (cents: number, code?: string) => formatMoney(cents, core.lang, code);

  /** Währungszeichen der Firma in der Schreibweise der Sprache. */
  const cur = () => currencySymbol(core.lang);

  /** Zahl in der Schreibweise der Sprache, z. B. 1.5 → „1,5“. */
  const num = (n: number, digits = 2) =>
    new Intl.NumberFormat(core.lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

  const day = (iso: string) =>
    iso
      ? new Intl.DateTimeFormat(core.lang, { day: "2-digit", month: "2-digit", year: "numeric", ...(iso.length === 10 ? { timeZone: "UTC" } : {}) }).format(
          new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso),
        )
      : "";

  /** Einheit einer Position (gespeichert als „Std“, „Tag“ …) in der Sprache anzeigen. */
  const unitLabel = (unit: string) => (has(`units.${unit}`) ? t(`units.${unit}`) : unit);

  /** Gespeicherte Zahlungsart (z. B. „Überweisung“) in der Sprache anzeigen. */
  const payMethodLabel = (method: string) => {
    const key = PAY_METHOD_KEYS[method];
    return key ? t(`invoices.paidMethods.${key}`) : method;
  };

  return { ...core, o, t, has, oRich, ready, euro, cur, num, day, unitLabel, payMethodLabel, officeError };
}
