import { describe, expect, it } from "vitest";
import {
  canChangeStatus, computeTotals, invoiceNumber, isValidImei, parseEuro, sanitizeIntake, sanitizeItem, sanitizeRepairSettings,
  sanitizeSaleLine, sanitizeUsed, validateCustomer, validateIntake, validateUsed, warrantyEnd,
  CHECKS_FOR, priceMatches, sanitizeChecks, sanitizeCustomerCard, sanitizePrice,
  fillTemplate, freeSlots, internationalPhone, isPhotoDataUrl, isSignatureDataUrl, sanitizeBooking, sanitizeBookingSettings, sanitizePurchaseLines,
  sanitizeSupplier, sanitizeTemplates, slotTimes, validateBooking, DEFAULT_BOOKING,
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
    expect(sanitizeItem({ name: "Display", qty: 1, unitCents: 9900, vatRate: 5 })?.vatRate).toBe(19);
    expect(sanitizeRepairSettings({ warrantyMonths: 999 }).warrantyMonths).toBe(60);
  });
  it("erlaubt nur sinnvolle Statuswechsel", () => {
    expect(canChangeStatus("received", "diagnosis")).toBe(true);
    expect(canChangeStatus("pickedUp", "repairing")).toBe(false);
    expect(canChangeStatus("ready", "canceled")).toBe(false);
    expect(canChangeStatus("canceled", "received")).toBe(true);
  });
});

describe("Reparaturen: An- und Verkauf", () => {
  it("weist bei Gebrauchtgeräten (§ 25a) keine Steuer aus, bei Zubehör schon", () => {
    const t = computeTotals([{ qty: 1, unitCents: 29900, vatRate: 19, margin: true }, { qty: 1, unitCents: 1190, vatRate: 19 }]);
    expect(t.grossCents).toBe(31090);
    expect(t.vat).toEqual([
      { rate: 19, netCents: 1000, vatCents: 190 },
      { rate: 0, netCents: 29900, vatCents: 0 },
    ]);
  });
  it("verlangt beim Ankauf Verkäufer, Anschrift und Eigentumsbestätigung", () => {
    const empty = sanitizeUsed({ device: { brand: "Apple", model: "iPhone 12" } });
    expect(Object.keys(validateUsed(empty, true)).sort()).toEqual(["ownership", "sellerAddress", "sellerName"]);
    expect(validateUsed(empty, false)).toEqual({});
    const ok = sanitizeUsed({
      device: { brand: "Apple", model: "iPhone 12", serial: "490154203237518" }, seller: { name: "Max", address: "Hauptstr. 1", idType: "passport" },
      ownership: true, purchaseCents: 15000, priceCents: 24900, grade: "nope", payout: "bitcoin",
    });
    expect(validateUsed(ok, true)).toEqual({});
    expect(ok.grade).toBe("good");
    expect(ok.payout).toBe("cash");
    expect(validateUsed(sanitizeUsed({ device: { model: "X", serial: "490154203237519" } }), false).serial).toBe("imei");
  });
  it("prüft Verkaufspositionen", () => {
    expect(sanitizeSaleLine({ kind: "used", refId: "a", name: "iPhone", qty: 3, unitCents: 100, vatRate: 19 })?.qty).toBe(1);
    expect(sanitizeSaleLine({ kind: "part", name: "Hülle", qty: 1, unitCents: 100, vatRate: 19 })).toBeNull();
    expect(sanitizeSaleLine({ kind: "other", refId: "x", name: "Einrichtung", qty: 1, unitCents: 1000, vatRate: 19 })?.refId).toBeNull();
    expect(sanitizeSaleLine({ kind: "other", name: "", qty: 1, unitCents: 1000, vatRate: 19 })).toBeNull();
  });
  it("begrenzt die Gewährleistung auf Gebrauchtgeräte", () => {
    expect(sanitizeRepairSettings({}).usedWarrantyMonths).toBe(12);
    expect(sanitizeRepairSettings({ usedWarrantyMonths: -3 }).usedWarrantyMonths).toBe(0);
  });
});

describe("Reparaturen: Werkstatt-Alltag", () => {
  it("übernimmt nur gültige Prüfergebnisse", () => {
    expect(sanitizeChecks({ display: "ok", touch: "fail", power: "untested", wifi: "kaputt", hack: "ok" })).toEqual({ display: "ok", touch: "fail", power: "untested" });
    expect(sanitizeIntake({ checks: { display: "ok" } }).checks).toEqual({ display: "ok" });
    expect(sanitizeIntake({}).checks).toEqual({});
    for (const items of Object.values(CHECKS_FOR)) expect(items).toContain("power");
  });
  it("merkt höchstens zehn Leistungen mit Namen vor", () => {
    const planned = Array.from({ length: 12 }, (_, i) => ({ priceId: `p${i}`, name: `L${i}`, cents: 1000 }));
    expect(sanitizeIntake({ planned }).planned).toHaveLength(10);
    expect(sanitizeIntake({ planned: [{ priceId: "x", name: "", cents: 1 }, { name: "ohne Id" }] }).planned).toEqual([]);
  });
  it("findet passende Preise für ein Gerät", () => {
    const device = { type: "phone" as const, brand: "Apple", model: "iPhone 13 Pro" };
    expect(priceMatches({ deviceType: "phone", brand: "apple", model: "iPhone 13" }, device)).toBe(true);
    expect(priceMatches({ deviceType: "phone", brand: "Apple", model: "" }, device)).toBe(true);
    expect(priceMatches({ deviceType: "phone", brand: "Samsung", model: "" }, device)).toBe(false);
    expect(priceMatches({ deviceType: "tablet", brand: "Apple", model: "" }, device)).toBe(false);
    expect(priceMatches({ deviceType: "phone", brand: "Apple", model: "iPhone 14" }, device)).toBe(false);
  });
  it("prüft Preise und Kundendaten", () => {
    expect(sanitizePrice({ service: "" })).toBeNull();
    const p = sanitizePrice({ service: "Display tauschen", priceCents: 14900, vatRate: 5, deviceType: "toaster", minutes: -5, partId: "" });
    expect(p).toMatchObject({ deviceType: "phone", vatRate: 19, minutes: 0, partId: null, priceCents: 14900 });
    expect(sanitizeCustomerCard({ name: " Ali ", email: "ALI@X.DE", note: "Stammkunde" })).toEqual({ name: "Ali", phone: "", email: "ali@x.de", address: "", note: "Stammkunde" });
  });
});

const DICTS = { de, en, tr, ar, fr, es, it: itLang, pl, ru, uk };
function paths(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
}
const get = (d: unknown, p: string) => p.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], d);

describe("Reparaturen: Laden-Extras", () => {
  it("füllt Platzhalter in Nachrichten und lässt unbekannte stehen", () => {
    expect(fillTemplate("Hallo {name}, {device} ist fertig ({x})", { name: "Ali", device: "iPhone 13" })).toBe("Hallo Ali, iPhone 13 ist fertig ({x})");
  });

  it("macht aus Telefonnummern internationale WhatsApp-Nummern", () => {
    expect(internationalPhone("0176 123 456 78")).toBe("4917612345678");
    expect(internationalPhone("+49 (176) 1234-5678")).toBe("4917612345678");
    expect(internationalPhone("0043 660 1234567")).toBe("436601234567");
    expect(internationalPhone("0660 1234567", "43")).toBe("436601234567");
    expect(internationalPhone("123")).toBeNull();
  });

  it("behält nur vollständige Vorlagen", () => {
    expect(sanitizeTemplates([{ name: "A", text: "x" }, { name: "", text: "y" }, "kaputt"]).map((t) => t.name)).toEqual(["A"]);
  });

  it("berechnet Terminzeiten und freie Termine", () => {
    expect(slotTimes({ from: "10:00", to: "11:00", slotMinutes: 30 })).toEqual(["10:00", "10:30", "11:00"]);
    // 2026-10-12 ist ein Montag, 2026-10-18 ein Sonntag
    const s = { ...DEFAULT_BOOKING, enabled: true, from: "10:00", to: "11:00", slotMinutes: 30, perSlot: 1, daysAhead: 7, weekdays: [1, 2, 3, 4, 5, 6] };
    const free = freeSlots(s, "2026-10-12", "09:45", { "2026-10-13 10:30": 1 });
    expect(free[0]).toEqual({ day: "2026-10-12", times: ["11:00"] }); // heute erst ab einer Stunde Vorlauf
    expect(free[1]).toEqual({ day: "2026-10-13", times: ["10:00", "11:00"] });
    expect(free.map((d) => d.day)).not.toContain("2026-10-18");
    expect(free).toHaveLength(6);
  });

  it("prüft Termin-Einstellungen", () => {
    const s = sanitizeBookingSettings({ enabled: true, from: "18:00", to: "09:00", slotMinutes: 1, perSlot: 99, weekdays: [1, 1, 9, 6] });
    expect(s.to).toBe("19:00");
    expect(s.slotMinutes).toBe(10);
    expect(s.perSlot).toBe(20);
    expect(s.weekdays).toEqual([1, 6]);
    expect(sanitizeRepairSettings({}).booking.enabled).toBe(false);
  });

  it("prüft Buchungen von der Buchungsseite", () => {
    const b = sanitizeBooking({ day: "2026-10-13", time: "10:30", name: " Ali ", phone: "0176", device: { type: "laptop", brand: "HP" }, lang: "xx-evil" });
    expect(b).toMatchObject({ name: "Ali", device: { type: "laptop", brand: "HP", model: "" }, lang: "de" });
    expect(validateBooking(b)).toEqual({});
    expect(validateBooking({ ...b, time: "" }).slot).toBe("required");
    expect(validateBooking({ ...b, phone: "", email: "" }).contact).toBe("required");
    expect(sanitizeBooking({ time: "25:00" }).time).toBe("");
  });

  it("prüft Lieferanten und Bestellpositionen", () => {
    expect(sanitizeSupplier({ name: "" })).toBeNull();
    expect(sanitizeSupplier({ name: " Teile AG ", email: "A@B.DE" })).toMatchObject({ name: "Teile AG", email: "a@b.de" });
    const lines = sanitizePurchaseLines([{ name: "Display", qty: 0, unitCents: 4500, orderNumber: 1001 }, { name: "" }, { name: "Akku", qty: 3.4, orderNumber: -1 }]);
    expect(lines).toEqual([
      { partId: null, name: "Display", qty: 1, unitCents: 4500, orderNumber: 1001 },
      { partId: null, name: "Akku", qty: 3, unitCents: 0, orderNumber: null },
    ]);
  });

  it("nimmt nur echte Bilder als Foto oder Unterschrift an", () => {
    expect(isPhotoDataUrl("data:image/jpeg;base64,/9j/4AAQ==")).toBe(true);
    expect(isPhotoDataUrl("data:text/html;base64,PGh0bWw+")).toBe(false);
    expect(isPhotoDataUrl("data:image/jpeg;base64," + "A".repeat(1_000_000))).toBe(false);
    expect(isSignatureDataUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isSignatureDataUrl("data:image/jpeg;base64,/9j/")).toBe(false);
  });
});

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
