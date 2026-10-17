import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { SALON_MIGRATIONS, SalonError, SalonStore } from "../worker/salon/store";
import { WORKSHOP_MIGRATIONS, WorkshopError, WorkshopStore } from "../worker/workshop/store";

// Seiten für Endkunden ohne Anmeldung: Online-Termine (Friseur) und Statusseite (Werkstatt).
// Was der Kunde schickt, darf Preis, Dauer oder fremde Daten nicht bestimmen.

function memorySql(migrations: string[]) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
  for (const step of migrations) db.exec(step);
  return {
    exec(query: string, ...params: (string | number | null)[]) {
      const stmt = db.prepare(query);
      if (/^\s*(SELECT|WITH)/i.test(query)) {
        const rows = stmt.all(...params) as Record<string, unknown>[];
        return {
          toArray: () => rows,
          one: () => {
            if (!rows.length) throw new Error("Expected exactly one result from SQL query, but got no results.");
            return rows[0];
          },
          raw: () => rows.map((r) => Object.values(r)),
        };
      }
      const res = stmt.run(...params);
      return { rowsWritten: Number(res.changes), toArray: () => [], one: () => ({}), raw: () => [] };
    },
  } as unknown as SqlStorage;
}

const tx = <T>(fn: () => T): T => fn();
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof SalonError || e instanceof WorkshopError ? e.code : String(e);
  }
  return "kein Fehler";
};

// 2026-10-19 ist ein Montag
const MONDAY = "2026-10-19";

function salon() {
  const s = new SalonStore(memorySql(SALON_MIGRATIONS), tx);
  const cut = s.saveService({ name: "Schnitt", durationMinutes: 30, priceCents: 3200, vatRate: 19 });
  const color = s.saveService({ name: "Farbe", durationMinutes: 60, priceCents: 6800, vatRate: 19 });
  const anna = s.saveStaff({ name: "Anna", workingDays: [1, 2, 3, 4, 5], workStart: "09:00", workEnd: "18:00" });
  s.saveSettings({ ...s.getSettings(), openTime: "09:00", closeTime: "18:00", slotIntervalMinutes: 15, onlineBookingEnabled: true });
  return { s, cut, color, anna };
}

const booking = (over: Partial<Parameters<SalonStore["bookOnline"]>[0]> = {}) => ({
  serviceIds: [] as string[], staffId: "", day: MONDAY, startTime: "10:00", name: "Lena Berg", phone: "0171 1234567", email: "", notes: "", ...over,
});

describe("Friseur: Online-Termine", () => {
  it("nimmt Preis und Dauer aus den Dienstleistungen, nicht vom Browser", () => {
    const { s, cut, color, anna } = salon();
    const a = s.bookOnline(booking({ serviceIds: [cut.id, color.id], staffId: anna.id }), "2026-10-17", "12:00", "2026-12-01");
    expect(a).toMatchObject({ totalCents: 10000, durationMinutes: 90, startTime: "10:00", endTime: "11:30", staffName: "Anna", source: "online", status: "booked", paid: false });
  });

  it("bucht nur freie Zeiten innerhalb der Öffnungszeit und des Buchungszeitraums", () => {
    const { s, cut, anna } = salon();
    const book = (over: Partial<ReturnType<typeof booking>>) => code(() => s.bookOnline(booking({ serviceIds: [cut.id], staffId: anna.id, ...over }), "2026-10-17", "12:00", "2026-11-30"));
    expect(book({})).toBe("kein Fehler");
    expect(book({ phone: "0172 999" })).toBe("slotTaken");
    expect(book({ startTime: "10:07" })).toBe("slotTaken");
    expect(book({ startTime: "17:45" })).toBe("slotTaken");
    expect(book({ day: "2026-10-16" })).toBe("dayNotAllowed");
    expect(book({ day: "2026-12-07" })).toBe("dayNotAllowed");
    expect(book({ serviceIds: ["gibt-es-nicht"] })).toBe("serviceNotFound");
  });

  it("bietet heute keine Zeiten an, die schon vorbei sind", () => {
    const { s, anna } = salon();
    const slots = s.getFreeSlots(MONDAY, 30, anna.id, "14:10").map((x) => x.time);
    expect(slots[0]).toBe("14:15");
    expect(s.getFreeSlots(MONDAY, 30, anna.id).map((x) => x.time)[0]).toBe("09:00");
  });

  it("gibt Kunden ohne passende Telefonnummer oder E-Mail keine fremde Kundenkarte", () => {
    const { s, cut, anna } = salon();
    const stranger = s.saveClient({ name: "Fremde Person", phone: "", email: "", allergies: "PPD" });
    const a = s.bookOnline(booking({ serviceIds: [cut.id], staffId: anna.id, phone: "0160 5550000" }), "2026-10-17", "12:00", "2026-12-01");
    expect(a.clientId).not.toBe(stranger.id);
    const regular = s.saveClient({ name: "Stammkundin", phone: "0151 1112222" });
    const b = s.bookOnline(booking({ serviceIds: [cut.id], staffId: anna.id, startTime: "12:00", name: "Mia", phone: "0151 1112222" }), "2026-10-17", "12:00", "2026-12-01");
    expect(b.clientId).toBe(regular.id);
  });

  it("lässt sich ausschalten", () => {
    const { s, cut, anna } = salon();
    s.saveSettings({ ...s.getSettings(), onlineBookingEnabled: false });
    expect(code(() => s.bookOnline(booking({ serviceIds: [cut.id], staffId: anna.id }), "2026-10-17", "12:00", "2026-12-01"))).toBe("bookingDisabled");
  });

  it("speichert keinen Terminabstand, der die Suche endlos laufen ließe", () => {
    const { s } = salon();
    const saved = s.saveSettings({ ...s.getSettings(), slotIntervalMinutes: -5, openDays: [1, 9, 7], closeTime: "08:00", bookingAdvanceDays: 0 });
    expect(saved.slotIntervalMinutes).toBe(15);
    expect(saved.openDays).toEqual([1, 7]);
    expect(saved.closeTime).toBe("18:00");
    expect(saved.bookingAdvanceDays).toBeGreaterThan(0);
  });
});

describe("Werkstatt: Statusseite für Kunden", () => {
  const order = (s: WorkshopStore) =>
    s.createOrder({ licensePlate: "HH-AB 123", mileage: 1000, customerName: "Max Muster", customerPhone: "0170", issueDescription: "Bremsen",
      positions: [{ id: "p1", type: "labor", name: "Bremsen", quantity: 1, unit: "Std", unitPriceNet: 100, taxRate: 19 }] });

  it("hat einen Link ohne Kennzeichen, der nicht zu erraten ist", () => {
    const s = new WorkshopStore(memorySql(WORKSHOP_MIGRATIONS), tx);
    const o = order(s);
    expect(o.statusToken).toMatch(/^[0-9a-f]{32}$/);
    expect(o.statusToken).not.toContain("hh");
    expect(code(() => s.getOrderByStatusToken("falsch"))).toBe("orderNotFound");
  });

  it("gibt den Kostenvoranschlag einmal frei, aber nicht mehr nach dem Bezahlen", () => {
    const s = new WorkshopStore(memorySql(WORKSHOP_MIGRATIONS), tx);
    const a = order(s);
    expect(s.approveEstimateByToken(a.statusToken).estimateStatus).toBe("approved");
    expect(code(() => s.approveEstimateByToken(a.statusToken))).toBe("estimateDecided");
    const b = order(s);
    s.updateOrder(b.id, { paymentStatus: "bezahlt" });
    expect(code(() => s.approveEstimateByToken(b.statusToken))).toBe("orderClosed");
  });
});
