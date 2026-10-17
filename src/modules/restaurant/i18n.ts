import { ApiError } from "../../api";
import { formatMoney, currencySymbol } from "../../money";
import { createModuleI18n, type Loaders } from "../moduleI18n";
import { de, type RestaurantDict } from "./lang/de";

// Eigene Texte des Restaurant-Systems. Deutsch ist eingebaut, andere Sprachen werden bei Bedarf nachgeladen.

const loaders: Loaders<RestaurantDict> = {
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

// Werte, die so in der Datenbank stehen und an den Server gehen; angezeigt wird der Text der Sprache.
const CATEGORY: Record<string, keyof RestaurantDict["categories"]> = {
  Vorspeisen: "starters",
  Hauptspeisen: "mains",
  "Pizza & Pasta": "pizzaPasta",
  Desserts: "desserts",
  "Heißgetränke": "hotDrinks",
  Alkoholfrei: "softDrinks",
  "Bier & Wein": "beerWine",
  Cocktails: "cocktails",
};
const COURSE: Record<string, keyof RestaurantDict["courses"]> = {
  Sofort: "now",
  "1. Gang": "first",
  "2. Gang": "second",
  Dessert: "dessert",
  "Getränke": "drinks",
};
const AREA: Record<string, keyof RestaurantDict["areas"]> = { innen: "inside", terrasse: "terrace", bar: "bar", lounge: "lounge" };
const ITEM_STATUS: Record<string, keyof RestaurantDict["itemStatus"]> = { bestellt: "ordered", in_arbeit: "cooking", fertig: "ready", serviert: "served" };
const PAYMENT: Record<string, keyof RestaurantDict["payment"]> = { bar: "cash", karte: "card", rechnung: "invoice", pos: "pos" };

export function useRestaurantI18n() {
  const { core, t, has, ready } = useTexts();

  const label = (group: string, map: Record<string, string>, value?: string) =>
    value && map[value] ? t(`${group}.${map[value]}`) : value ?? "";

  /** Fehler aus dem System zuerst mit eigenen Texten, sonst wie in der Plattform. */
  const restaurantError = (error: unknown) => {
    if (error instanceof ApiError && error.code?.startsWith("restaurant.")) {
      const key = `errors.${error.code.slice("restaurant.".length)}`;
      if (has(key)) return t(key);
    }
    return core.errorText(error);
  };

  // Beträge im Restaurant stehen in Euro (bzw. Firmenwährung) mit Nachkommastellen, nicht in Cent.
  const euro = (amount?: number) => formatMoney(Math.round((amount || 0) * 100), core.lang);
  const symbol = () => currencySymbol(core.lang);
  const time = (iso: string | Date) => new Date(iso).toLocaleTimeString(core.lang, { hour: "2-digit", minute: "2-digit" });
  const day = (iso: string | Date) => new Date(iso).toLocaleDateString(core.lang);

  return {
    ...core,
    t,
    has,
    ready,
    euro,
    symbol,
    time,
    day,
    restaurantError,
    category: (value?: string) => label("categories", CATEGORY, value),
    course: (value?: string) => label("courses", COURSE, value),
    area: (value?: string) => label("areas", AREA, value),
    itemStatus: (value?: string) => label("itemStatus", ITEM_STATUS, value),
    payment: (value?: string) => label("payment", PAYMENT, value),
  };
}
