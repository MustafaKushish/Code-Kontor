import { formatMoney } from "../../money";
import { useEffect, useState } from "react";
import { ApiError } from "../../api";
import { useI18n, type Lang } from "../../i18n";
import { de, type RepairDict } from "./lang/de";

// Eigene Texte des Systems, damit die Übersetzungen der Plattform unberührt bleiben.
// Deutsch ist eingebaut, andere Sprachen werden bei Bedarf nachgeladen.

const loaders: Record<Exclude<Lang, "de">, () => Promise<RepairDict>> = {
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

const cache = new Map<Lang, RepairDict>([["de", de]]);

function lookup(dict: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), dict);
}

export function useRepairI18n() {
  const core = useI18n();
  const [dict, setDict] = useState<RepairDict | null>(cache.get(core.lang) ?? null);

  useEffect(() => {
    const cached = cache.get(core.lang);
    if (cached) return setDict(cached);
    let cancelled = false;
    loaders[core.lang as Exclude<Lang, "de">]()
      .then((d) => {
        cache.set(core.lang, d);
        if (!cancelled) setDict(d);
      })
      .catch(() => !cancelled && setDict(de));
    return () => {
      cancelled = true;
    };
  }, [core.lang]);

  const r = (path: string, vars?: Record<string, string | number>) => {
    const value = lookup(dict ?? de, path) ?? lookup(de, path);
    let text = typeof value === "string" ? value : path;
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  };

  /** Fehler aus dem System zuerst mit eigenen Texten, sonst wie in der Plattform. */
  const repairError = (error: unknown) => {
    if (error instanceof ApiError && error.code?.startsWith("repairs.")) return r(`errors.${error.code.slice(8)}`);
    return core.errorText(error);
  };

  // Name „euro“ bleibt, rechnet aber in der Währung der Firma
  const euro = (cents: number, code?: string) => formatMoney(cents, core.lang, code);

  const day = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }) =>
    iso ? new Intl.DateTimeFormat(core.lang, { ...opts, ...(iso.length === 10 ? { timeZone: "UTC" } : {}) }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)) : "";

  const dateTime = (iso: string) => new Intl.DateTimeFormat(core.lang, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return { ...core, r, ready: !!dict, repairError, euro, day, dateTime };
}

/** Euro-Betrag für Eingabefelder, z. B. 4990 → „49,90“. */
export const centsToInput = (cents: number) => (cents ? (cents / 100).toFixed(2).replace(".", ",") : "");
