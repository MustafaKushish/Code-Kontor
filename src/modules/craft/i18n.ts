import { ApiError } from "../../api";
import { formatMoney, currencySymbol } from "../../money";
import { createModuleI18n, type Loaders } from "../moduleI18n";
import { de, type CraftDict } from "./lang/de";

// Eigene Texte des Handwerk-Systems. Deutsch ist eingebaut, andere Sprachen werden nachgeladen.

const loaders: Loaders<CraftDict> = {
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

// Gespeicherte (deutsche) Werte → Schlüssel der Übersetzung; unbekannte Werte bleiben, wie sie sind.
const TRADES: Record<string, keyof CraftDict["trades"]> = {
  Elektro: "electrical",
  "Sanitär & Heizung": "plumbingHeating",
  Sanitär: "plumbing",
  "Maler & Lackierer": "paintersVarnishers",
  Maler: "painters",
  "Tischler & Holzbau": "joineryTimber",
  Trockenbau: "drywall",
  Dachdecker: "roofing",
  Fliesenleger: "tiling",
  Estrichleger: "screed",
  Zimmerer: "carpentry",
  Rohbau: "shell",
  Allgemein: "general",
};
const CATEGORIES: Record<string, keyof CraftDict["categories"]> = {
  Fläche: "area",
  "Länge / Umfang": "length",
  Volumen: "volume",
  Stückzahl: "count",
};
const WEATHER: Record<string, keyof CraftDict["weather"]> = {
  Sonnig: "sunny",
  Bewölkt: "cloudy",
  Regen: "rain",
  Frost: "frost",
  Schnee: "snow",
};
const UNITS: Record<string, keyof CraftDict["units"]> = {
  "Std.": "hours",
  "Stk.": "pieces",
  stk: "pieces",
  "Psch.": "flatRate",
};

export function useCraftI18n() {
  const { core, t, has, ready } = useTexts();

  const fromMap = (group: string, map: Record<string, string>, value?: string) =>
    value && map[value] ? t(`${group}.${map[value]}`) : value ?? "";
  const fromKey = (group: string, value?: string) => (value && has(`${group}.${value}`) ? t(`${group}.${value}`) : value ?? "");

  /** Fehler des Systems zuerst mit eigenen Texten, sonst wie in der Plattform. */
  const craftError = (error: unknown) => {
    if (error instanceof ApiError && error.code?.startsWith("craft.")) {
      const key = `errors.${error.code.slice(6)}`;
      if (has(key)) return t(key);
    }
    return core.errorText(error);
  };

  /** Beträge des Systems sind ganze Währungseinheiten (nicht Cent). */
  const money = (amount?: number) => formatMoney(Math.round((amount || 0) * 100), core.lang);
  const symbol = () => currencySymbol(core.lang);
  const num = (value: number, digits = 2) => new Intl.NumberFormat(core.lang, { maximumFractionDigits: digits }).format(value);

  const day = (iso?: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }) => {
    if (!iso) return "";
    const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(core.lang, { ...opts, ...(iso.length === 10 ? { timeZone: "UTC" } : {}) }).format(date);
  };

  return {
    ...core,
    t,
    has,
    ready,
    craftError,
    money,
    symbol,
    num,
    day,
    tradeLabel: (v?: string) => fromMap("trades", TRADES, v),
    categoryLabel: (v?: string) => fromMap("categories", CATEGORIES, v),
    weatherLabel: (v?: string) => fromMap("weather", WEATHER, v),
    unitLabel: (v?: string) => fromMap("units", UNITS, v),
    projectStatusLabel: (v?: string) => fromKey("projectStatus", v),
    reportStatusLabel: (v?: string) => fromKey("reportStatus", v),
    itemTypeLabel: (v?: string) => fromKey("itemTypes", v),
    paymentLabel: (v?: string) => fromKey("payment", v),
  };
}
