import { formatMoney } from "../../money";
import { ApiError } from "../../api";
import { createModuleI18n, type Loaders } from "../moduleI18n";
import { de, type RetailDict } from "./lang/de";

// Eigene Texte des Einzelhandels; Deutsch ist eingebaut, andere Sprachen werden bei Bedarf nachgeladen.

const loaders: Loaders<RetailDict> = {
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

export function useRetailI18n() {
  const { core, t, has, ready } = useTexts();
  const r = t;
  // Mit Cent und in der Währung der Firma (vorher gerundet auf ganze Euro: 14,90 € wurde 15 €)
  const euro = (cents: number) => formatMoney(cents, core.lang);
  const day = (d: string) => new Date(d).toLocaleDateString(core.lang);
  /** Einheit wie „Stk“ in der Sprache der Oberfläche; unbekannte Einheiten bleiben wie gespeichert. */
  const unit = (u: string) => (has(`units.short.${u}`) ? t(`units.short.${u}`) : u);

  /** Fehler aus dem Modul zuerst mit eigenen Texten, sonst wie in der Plattform. */
  const retailError = (error: unknown, fallback?: string) => {
    if (error instanceof ApiError && error.code?.startsWith("retail.")) {
      const key = `errors.${error.code.slice(7)}`;
      if (has(key)) return t(key);
    }
    if (fallback && !(error instanceof ApiError)) return fallback;
    return core.errorText(error);
  };

  return { ...core, r, t, has, ready, euro, day, unit, retailError };
}
