import { formatMoney } from "../../money";
import { ApiError } from "../../api";
import { createModuleI18n, type Loaders } from "../moduleI18n";
import { de, type SalonDict } from "./lang/de";

// Eigene Texte des Friseur-Systems. Deutsch ist eingebaut, andere Sprachen werden bei Bedarf nachgeladen.

const loaders: Loaders<SalonDict> = {
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

const useSalonTexts = createModuleI18n(de, loaders);

export function useSalonI18n() {
  const { core, t, has, ready } = useSalonTexts();
  const { lang, appText } = core;

  const s = t;

  // Währung der Firma; die öffentliche Buchungsseite gibt sie mit, weil dort niemand angemeldet ist
  const euro = (cents: number, code?: string): string => formatMoney(cents, lang, code);

  const day = (isoDate: string): string => {
    if (!isoDate) return "";
    try {
      const d = new Date(isoDate.length === 10 ? isoDate + "T12:00:00" : isoDate);
      return new Intl.DateTimeFormat(lang, {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(d);
    } catch {
      return isoDate;
    }
  };

  const time = (timeStr: string): string => timeStr || "";

  /** Fehler aus dem System zuerst mit eigenen Texten, sonst wie in der Plattform. */
  const errorText = (error: unknown): string => {
    if (error instanceof ApiError && error.code?.startsWith("salon.")) {
      const code = error.code.slice(6);
      if (has(`errors.${code}`)) return t(`errors.${code}`);
    }
    return core.errorText(error);
  };

  return { s, t, ready, euro, day, time, lang, appText, errorText };
}
