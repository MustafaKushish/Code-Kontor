import { useEffect, useState } from "react";
import { ApiError } from "../api";
import { useI18n, type Lang } from "../i18n";
import { formatMoney } from "../money";
import { de, type PosDict } from "./lang/de";

// Eigene Texte der Kasse. Deutsch ist eingebaut, andere Sprachen werden bei Bedarf nachgeladen.

const loaders: Record<Exclude<Lang, "de">, () => Promise<PosDict>> = {
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

const cache = new Map<Lang, PosDict>([["de", de]]);

function lookup(dict: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), dict);
}

export function usePosI18n() {
  const core = useI18n();
  const [dict, setDict] = useState<PosDict | null>(cache.get(core.lang) ?? null);

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

  const p = (path: string, vars?: Record<string, string | number>) => {
    const value = lookup(dict ?? de, path) ?? lookup(de, path);
    let text = typeof value === "string" ? value : path;
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  };

  /** Fehler der Kasse und der angebundenen Systeme mit eigenen Texten, sonst wie in der Plattform. */
  const posError = (error: unknown) => {
    if (error instanceof ApiError && error.code?.startsWith("pos.")) return p(`errors.${error.code.slice(4)}`);
    // Fehler der Systeme kommen mit Vorsilbe, z. B. „repairs.loanerOut“ oder „salon.notPayable“
    const moduleCode = error instanceof ApiError ? error.code?.split(".")[1] : undefined;
    if (moduleCode && lookup(de.moduleErrors, moduleCode)) return p(`moduleErrors.${moduleCode}`);
    return core.errorText(error);
  };

  const money = (cents: number, code?: string) => formatMoney(cents, core.lang, code);
  const day = (iso: string) =>
    iso ? new Intl.DateTimeFormat(core.lang, { day: "2-digit", month: "2-digit", year: "numeric", ...(iso.length === 10 ? { timeZone: "UTC" } : {}) }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)) : "";
  const time = (iso: string) => new Intl.DateTimeFormat(core.lang, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const dateTime = (iso: string) => new Intl.DateTimeFormat(core.lang, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return { ...core, p, ready: !!dict, posError, money, day, time, dateTime };
}

/** Betrag für Eingabefelder, z. B. 4990 → „49,90“. */
export const centsToInput = (cents: number) => (cents ? (cents / 100).toFixed(2).replace(".", ",") : "");
