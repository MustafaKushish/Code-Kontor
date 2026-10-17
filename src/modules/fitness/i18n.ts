import { ApiError } from "../../api";
import { formatMoney } from "../../money";
import { createModuleI18n, type Loaders } from "../moduleI18n";
import { de, type FitnessDict } from "./lang/de";

// Eigene Texte des Systems „Fitnessstudio & Kurse“. Deutsch ist eingebaut, andere Sprachen werden bei Bedarf nachgeladen.

const loaders: Loaders<FitnessDict> = {
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

const useTexts = createModuleI18n(de, loaders);


export function useFitnessI18n() {
  const { core, t, has, ready } = useTexts();

  /** Fehler aus dem System zuerst mit eigenen Texten, sonst wie in der Plattform. */
  const fitnessError = (error: unknown) => {
    if (error instanceof ApiError && error.code?.startsWith("fitness.")) {
      const key = `errors.${error.code.slice(8)}`;
      if (has(key)) return t(key);
    }
    return core.errorText(error);
  };

  /** Beträge des Systems sind ganze Euro-Werte mit Nachkommastellen, angezeigt in der Währung der Firma. */
  const money = (amount: number) => formatMoney(Math.round(amount * 100), core.lang);

  /** Datum (JJJJ-MM-TT oder ISO) in der Sprache der Oberfläche; Unlesbares bleibt wie es ist. */
  const day = (iso?: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }) => {
    if (!iso) return "";
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    const date = new Date(dateOnly ? `${iso}T00:00:00Z` : iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(core.lang, { ...opts, ...(dateOnly ? { timeZone: "UTC" } : {}) }).format(date);
  };

  const dateTime = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(core.lang, { dateStyle: "short", timeStyle: "short" }).format(date);
  };

  const weekday = (w: string) => (has(`weekdays.${w}`) ? t(`weekdays.${w}`) : w);
  const statusLabel = (s: string) => (has(`status.${s}`) ? t(`status.${s}`) : s);

  /** Meldung des Servers zum Check-In in der Sprache der Oberfläche (ältere Server schicken nur den deutschen Satz). */
  const checkInMessage = (result: { message: string; code?: string; vars?: Record<string, string | number> }) => {
    if (!result.code || !has(`checkinMsg.${result.code}`)) return result.message;
    const vars = { ...result.vars };
    if (typeof vars.date === "string") vars.date = day(vars.date);
    return t(`checkinMsg.${result.code}`, vars);
  };

  return { ...core, t, has, ready, fitnessError, money, day, dateTime, weekday, statusLabel, checkInMessage };
}
