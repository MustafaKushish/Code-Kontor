import { useEffect, useState } from "react";
import { useI18n, type Lang } from "../i18n";

// Eigene Texte eines Systems in allen Sprachen der Plattform. Deutsch ist eingebaut und Vorlage,
// die anderen Sprachen werden bei Bedarf nachgeladen; fehlt ein Text, steht der deutsche da.

export type Loaders<D> = Record<Exclude<Lang, "de">, () => Promise<D>>;

function lookup(dict: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), dict);
}

export function fill(text: string, vars?: Record<string, string | number>) {
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Baut den Übersetzungs-Hook eines Systems: `t("tabs.orders", { n: 3 })`, `has(path)`, `ready`. */
export function createModuleI18n<D extends object>(de: D, loaders: Loaders<D>) {
  const cache = new Map<Lang, D>([["de", de]]);

  return function useModuleTexts() {
    const core = useI18n();
    const [dict, setDict] = useState<D | null>(cache.get(core.lang) ?? null);

    useEffect(() => {
      const cached = cache.get(core.lang);
      if (cached) return setDict(cached);
      setDict(null);
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

    const value = (path: string) => lookup(dict ?? de, path) ?? lookup(de, path);
    const t = (path: string, vars?: Record<string, string | number>) => {
      const v = value(path);
      return fill(typeof v === "string" ? v : path, vars);
    };
    const has = (path: string) => typeof value(path) === "string";

    return { core, t, has, ready: !!dict, dict: dict ?? de };
  };
}
