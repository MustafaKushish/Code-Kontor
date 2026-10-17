import { ApiError } from "../../api";
import { formatMoney, currencySymbol } from "../../money";
import { createModuleI18n, type Loaders } from "../moduleI18n";
import type { InspectionItem, OrderPosition, SparePart, WorkshopOrder } from "../../../shared/workshop";
import { de, type WorkshopDict } from "./lang/de";

// Eigene Texte der Kfz-Werkstatt; Deutsch ist eingebaut, andere Sprachen werden bei Bedarf nachgeladen.

const loaders: Loaders<WorkshopDict> = {
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

const useWorkshopTexts = createModuleI18n(de, loaders);

/** Gespeicherte Werte der Hebebühnen (gehen so an den Server) → Schlüssel der Texte. */
export const LIFT_KEYS: Record<WorkshopOrder["liftBay"], keyof WorkshopDict["lifts"]> = {
  "Bühne 1": "b1",
  "Bühne 2": "b2",
  "Bühne 3": "b3",
  "Bühne 4 (Achsmessung)": "b4",
  "Prüfstraße": "test",
  "Hof / Parkplatz": "yard",
};

const UNIT_KEYS: Record<OrderPosition["unit"], keyof WorkshopDict["units"]> = {
  AW: "AW",
  Std: "Std",
  "Stück": "Stueck",
  Liter: "Liter",
  Satz: "Satz",
  Pauschal: "Pauschal",
};

const CATEGORY_KEYS: Record<SparePart["category"], keyof WorkshopDict["parts"]["categories"]> = {
  Filter: "filter",
  Bremsen: "brakes",
  "Zündung": "ignition",
  Fahrwerk: "chassis",
  Elektrik: "electrics",
  "Öle & Chemie": "oils",
  Karosserie: "body",
  Sonstiges: "other",
};

export function useWorkshopI18n() {
  const { core, t, has, ready } = useWorkshopTexts();

  /** Fehler der Werkstatt mit eigenen Texten, sonst wie in der Plattform; `fallback` für Fehler ohne Serverantwort. */
  const workshopError = (error: unknown, fallback?: string) => {
    if (error instanceof ApiError && error.code?.startsWith("workshop.")) {
      const key = `errors.${error.code.slice(9)}`;
      if (has(key)) return t(key);
    }
    if (!(error instanceof ApiError) && fallback) return fallback;
    return core.errorText(error);
  };

  /** Beträge der Werkstatt liegen in ganzen Einheiten (nicht Cent) vor. */
  const euro = (amount: number, code?: string) => formatMoney(Math.round(amount * 100), core.lang, code);
  const symbol = () => currencySymbol(core.lang);
  const num = (value: number, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(core.lang, opts).format(value);
  const day = (iso: string) =>
    iso ? new Intl.DateTimeFormat(core.lang, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "";

  const lift = (value: string) => {
    const key = LIFT_KEYS[value as WorkshopOrder["liftBay"]];
    return key ? t(`lifts.${key}.name`) : value;
  };
  const unit = (value: string) => {
    const key = UNIT_KEYS[value as OrderPosition["unit"]];
    return key ? t(`units.${key}`) : value;
  };
  const category = (value: string) => {
    const key = CATEGORY_KEYS[value as SparePart["category"]];
    return key ? t(`parts.categories.${key}`) : value;
  };
  /** Standard-Prüfpunkte sind mit deutschem Namen gespeichert und werden übersetzt angezeigt; eigene Namen bleiben. */
  const inspectionName = (item: Pick<InspectionItem, "id" | "name">) => {
    const key = `i${item.id}` as keyof WorkshopDict["inspection"]["defaults"];
    if (de.inspection.defaults[key] === item.name) return t(`inspection.defaults.${key}`);
    if (item.name === de.inspection.checkpoint) return t("inspection.checkpoint");
    return item.name;
  };
  const inspectionCategory = (value: string) => (has(`inspection.categories.${value}`) ? t(`inspection.categories.${value}`) : value);
  const payment = (value?: string) => (value && has(`payment.${value}`) ? t(`payment.${value}`) : (value ?? "").toUpperCase());

  return { ...core, t, has, ready, workshopError, euro, symbol, num, day, lift, unit, category, payment, inspectionName, inspectionCategory };
}
