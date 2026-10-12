import { describe, expect, it } from "vitest";
import { de } from "../src/i18n/de";
import { en } from "../src/i18n/en";
import { tr } from "../src/i18n/tr";
import { ar } from "../src/i18n/ar";
import { fr } from "../src/i18n/fr";
import { es } from "../src/i18n/es";
import { it as itLang } from "../src/i18n/it";
import { pl } from "../src/i18n/pl";
import { ru } from "../src/i18n/ru";
import { uk } from "../src/i18n/uk";
import { ERROR_TEXT } from "../worker/errors";
import { CATALOG } from "../shared/apps";

const DICTS = { de, en, tr, ar, fr, es, it: itLang, pl, ru, uk };

/** Alle Schlüsselpfade mit Textwerten, z. B. "auth.login". */
function paths(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  if (Array.isArray(node)) return [`${prefix}[${node.length}]`];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
}

describe("Übersetzungen", () => {
  it("gibt es für genau 10 Sprachen", () => {
    expect(Object.keys(DICTS)).toHaveLength(10);
  });

  for (const [code, dict] of Object.entries(DICTS)) {
    it(`${code}: hat dieselben Texte wie Deutsch, keiner ist leer`, () => {
      expect(paths(dict).sort()).toEqual(paths(de).sort());
      for (const p of paths(dict)) {
        const value = p.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown>)[k.replace(/\[\d+\]$/, "")], dict);
        if (typeof value === "string") expect(value.trim(), `${code}.${p}`).not.toBe("");
      }
    });

    it(`${code}: behält Platzhalter wie {name} bei`, () => {
      for (const p of paths(de)) {
        const get = (d: unknown) => p.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], d);
        const source = get(de);
        if (typeof source !== "string") continue;
        const vars = source.match(/\{\w+\}/g) ?? [];
        for (const v of vars) expect(get(dict), `${code}.${p}`).toContain(v);
      }
    });
  }

  it("kennt jeden Fehlercode des Servers", () => {
    for (const code of Object.keys(ERROR_TEXT)) expect(de.errors).toHaveProperty(code);
  });

  it("hat Texte für jedes System im Katalog", () => {
    for (const app of CATALOG) {
      expect(de.apps).toHaveProperty(app.id);
      expect(de.catalog.categories).toHaveProperty(app.category);
    }
  });
});
