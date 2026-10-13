import { describe, expect, it } from "vitest";
import {
  canChangeStatus, computeTotals, invoiceNumber, isValidImei, parseEuro, sanitizeIntake, sanitizeItem, sanitizeRepairSettings,
  validateCustomer, validateIntake, warrantyEnd,
} from "../shared/repairs";
import { de } from "../src/modules/repairs/lang/de";
import { en } from "../src/modules/repairs/lang/en";
import { tr } from "../src/modules/repairs/lang/tr";
import { ar } from "../src/modules/repairs/lang/ar";
import { fr } from "../src/modules/repairs/lang/fr";
import { es } from "../src/modules/repairs/lang/es";
import { it as itLang } from "../src/modules/repairs/lang/it";
import { pl } from "../src/modules/repairs/lang/pl";
import { ru } from "../src/modules/repairs/lang/ru";
import { uk } from "../src/modules/repairs/lang/uk";

describe("Reparaturen: Rechnen", () => {
  it("rechnet die MwSt. aus Endpreisen heraus", () => {
    const t = computeTotals([{ qty: 1, unitCents: 11900, vatRate: 19 }, { qty: 2, unitCents: 1070, vatRate: 7 }]);
    expect(t.grossCents).toBe(14040);
    expect(t.vat).toEqual([
      { rate: 19, netCents: 10000, vatCents: 1900 },
      { rate: 7, netCents: 2000, vatCents: 140 },
    ]);
    expect(t.netCents).toBe(12000);
  });
  it("weist für Kleinunternehmer keine Steuer aus", () => {
    const t = computeTotals([{ qty: 1, unitCents: 5000, vatRate: 19 }], true);
    expect(t.vat).toEqual([{ rate: 0, netCents: 5000, vatCents: 0 }]);
  });
  it("berechnet das Garantie-Ende auch am Monatsende", () => {
    expect(warrantyEnd("2026-10-13", 6)).toBe("2027-04-13");
    expect(warrantyEnd("2026-08-31", 6)).toBe("2027-02-28");
    expect(warrantyEnd("2026-08-31", 0)).toBe("");
  });
  it("nummeriert Rechnungen je Jahr", () => {
    expect(invoiceNumber(2026, 7)).toBe("RE-2026-0007");
  });
  it("liest Euro-Eingaben", () => {
    expect(parseEuro("49,90")).toBe(4990);
    expect(parseEuro("1.234,50 €")).toBe(123450);
    expect(parseEuro("12.5")).toBe(1250);
    expect(parseEuro("")).toBe(0);
    expect(parseEuro("abc")).toBeNull();
    expect(parseEuro("CHF 12.50")).toBe(1250);
  });
});

describe("Reparaturen: Prüfungen", () => {
  it("prüft die IMEI-Prüfziffer", () => {
    expect(isValidImei("490154203237518")).toBe(true);
    expect(isValidImei("49-015420-323751-8")).toBe(true);
    expect(isValidImei("490154203237519")).toBe(false);
  });
  it("verlangt Name, Kontakt, Gerät und Fehler", () => {
    expect(validateCustomer({ name: "", phone: "", email: "x" })).toEqual({ customerName: "required", email: "invalid" });
    expect(validateCustomer({ name: "Ali", phone: "", email: "" })).toEqual({ contact: "required" });
    const intake = sanitizeIntake({ device: { serial: "490154203237519" } });
    expect(validateIntake(intake)).toEqual({ model: "required", problem: "required", serial: "imei" });
    expect(validateIntake(sanitizeIntake({ device: { model: "iPhone 13", serial: "C02XK0ABJGH5" }, problem: "Akku" }))).toEqual({});
  });
  it("bereinigt Eingaben", () => {
    const intake = sanitizeIntake({ device: { type: "toaster" }, accessories: ["charger", "hack"], approvedUpToCents: -5, customerLang: "xx1" });
    expect(intake.device.type).toBe("phone");
    expect(intake.accessories).toEqual(["charger"]);
    expect(intake.approvedUpToCents).toBe(0);
    expect(intake.customerLang).toBe("de");
    expect(sanitizeItem({ name: "", qty: 1 })).toBeNull();
    expect(sanitizeItem({ name: "Display", qty: 1, unitCents: 9900, vatRate: 8.1 })?.vatRate).toBe(8.1);
    expect(sanitizeItem({ name: "Display", qty: 1, unitCents: 9900, vatRate: 150 })?.vatRate).toBe(19);
    expect(sanitizeRepairSettings({ warrantyMonths: 999 }).warrantyMonths).toBe(60);
  });
  it("erlaubt nur sinnvolle Statuswechsel", () => {
    expect(canChangeStatus("received", "diagnosis")).toBe(true);
    expect(canChangeStatus("pickedUp", "repairing")).toBe(false);
    expect(canChangeStatus("ready", "canceled")).toBe(false);
    expect(canChangeStatus("canceled", "received")).toBe(true);
  });
});

const DICTS = { de, en, tr, ar, fr, es, it: itLang, pl, ru, uk };
function paths(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
}
const get = (d: unknown, p: string) => p.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], d);

describe("Reparaturen: Übersetzungen", () => {
  for (const [code, dict] of Object.entries(DICTS)) {
    it(`${code}: vollständig, mit denselben Platzhaltern`, () => {
      expect(paths(dict).sort()).toEqual(paths(de).sort());
      for (const p of paths(de)) {
        const value = get(dict, p) as string;
        expect(value.trim(), `${code}.${p}`).not.toBe("");
        for (const v of (get(de, p) as string).match(/\{\w+\}/g) ?? []) expect(value, `${code}.${p}`).toContain(v);
      }
    });
  }
});
