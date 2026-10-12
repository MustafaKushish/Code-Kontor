import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { de, type Dict } from "./de";
import { ApiError } from "../api";

export const LANGUAGES = [
  { code: "de", name: "Deutsch", dir: "ltr" },
  { code: "en", name: "English", dir: "ltr" },
  { code: "tr", name: "Türkçe", dir: "ltr" },
  { code: "ar", name: "العربية", dir: "rtl" },
  { code: "fr", name: "Français", dir: "ltr" },
  { code: "es", name: "Español", dir: "ltr" },
  { code: "it", name: "Italiano", dir: "ltr" },
  { code: "pl", name: "Polski", dir: "ltr" },
  { code: "ru", name: "Русский", dir: "ltr" },
  { code: "uk", name: "Українська", dir: "ltr" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];

// Nur Deutsch steckt im Hauptpaket, die anderen Sprachen werden bei Bedarf nachgeladen.
const loaders: Record<Exclude<Lang, "de">, () => Promise<Dict>> = {
  en: () => import("./en").then((m) => m.en),
  tr: () => import("./tr").then((m) => m.tr),
  ar: () => import("./ar").then((m) => m.ar),
  fr: () => import("./fr").then((m) => m.fr),
  es: () => import("./es").then((m) => m.es),
  it: () => import("./it").then((m) => m.it),
  pl: () => import("./pl").then((m) => m.pl),
  ru: () => import("./ru").then((m) => m.ru),
  uk: () => import("./uk").then((m) => m.uk),
};

const KEY = "ck-lang";

function isLang(value: unknown): value is Lang {
  return LANGUAGES.some((l) => l.code === value);
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {
    // Speicher gesperrt: Gerätesprache verwenden
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag.slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return "de";
}

type Vars = Record<string, string | number>;

interface I18n {
  lang: Lang;
  dict: Dict;
  setLang: (lang: Lang) => void;
  t: (path: string, vars?: Vars) => string;
  /** Fehlermeldung zu einem Fehler aus api() in der aktuellen Sprache. */
  errorText: (error: unknown) => string;
  /** Texte eines Systems aus dem Katalog (Name, Beschreibung, Funktionen). */
  appText: (id: string) => Dict["apps"][keyof Dict["apps"]];
  money: (value: number) => string;
}

const Context = createContext<I18n | null>(null);

function lookup(dict: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), dict);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [dict, setDict] = useState<Dict>(de);
  // Beim ersten Laden erst anzeigen, wenn die Sprache da ist, damit nichts kurz auf Deutsch aufblitzt.
  const [ready, setReady] = useState(lang === "de");

  useEffect(() => {
    let cancelled = false;
    const meta = LANGUAGES.find((l) => l.code === lang)!;
    document.documentElement.lang = lang;
    document.documentElement.dir = meta.dir;
    if (lang === "de") setDict(de);
    else
      loaders[lang]()
        .then((d) => !cancelled && setDict(d))
        .catch(() => console.error("Sprache konnte nicht geladen werden", lang))
        .finally(() => !cancelled && setReady(true));
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // nur für diese Sitzung
    }
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const t = (path: string, vars?: Vars) => {
    const value = lookup(dict, path) ?? lookup(de, path);
    let text = typeof value === "string" ? value : path;
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  };

  const errorText = (error: unknown) => {
    if (error instanceof ApiError) {
      if (error.code === "noConnection") return t("common.noConnection");
      if (error.code && lookup(de, `errors.${error.code}`)) return t(`errors.${error.code}`);
      return error.message;
    }
    return t("common.noConnection");
  };

  const appText = (id: string) => {
    const apps = dict.apps as Record<string, Dict["apps"][keyof Dict["apps"]]>;
    return apps[id] ?? (de.apps as Record<string, Dict["apps"][keyof Dict["apps"]]>)[id]!;
  };

  const money = (value: number) =>
    new Intl.NumberFormat(lang, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

  if (!ready) return null;
  return <Context.Provider value={{ lang, dict, setLang: setLangState, t, errorText, appText, money }}>{children}</Context.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useI18n außerhalb von I18nProvider");
  return ctx;
}
