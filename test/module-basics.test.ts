import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { WORKSHOP_MIGRATIONS, WorkshopError, WorkshopStore } from "../worker/workshop/store";
import { RESTAURANT_MIGRATIONS, RestaurantStore } from "../worker/restaurant/store";
import { CRAFT_MIGRATIONS, CraftStore } from "../worker/craft/store";
import { FITNESS_MIGRATIONS, FitnessStore } from "../worker/fitness/store";
import { RETAIL_MIGRATIONS, RetailStore } from "../worker/retail/store";
import { berlinDayOf } from "../worker/numbers";

// Grundlagen der Google-AI-Module: Nummern nach dem Löschen, „nicht gefunden“ statt Absturz, Bestand.

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
    return e instanceof WorkshopError ? e.code : String(e);
  }
  return "kein Fehler";
};

describe("Nummernkreise nach dem Löschen", () => {
  it("Werkstatt vergibt nach einem gelöschten Auftrag eine neue Nummer", () => {
    const s = new WorkshopStore(memorySql(WORKSHOP_MIGRATIONS), tx);
    const make = (plate: string) => s.createOrder({ licensePlate: plate, mileage: 1, customerName: "A", customerPhone: "1", issueDescription: "x" });
    const a = make("HH-A 1");
    const b = make("HH-A 2");
    s.deleteOrder(a.id);
    const c = make("HH-A 3");
    expect(a.orderNumber).toMatch(/^WO-\d{4}-0001$/);
    expect(b.orderNumber).toMatch(/-0002$/);
    expect(c.orderNumber).toMatch(/-0003$/);
  });

  it("Handwerk vergibt Projekt- und Rapportnummern ohne Doppel", () => {
    const s = new CraftStore(memorySql(CRAFT_MIGRATIONS));
    const p1 = s.saveProject({ title: "Bad", customerName: "A", siteAddress: "X" });
    const p2 = s.saveProject({ title: "Küche", customerName: "B", siteAddress: "Y" });
    s.deleteProject(p1.id);
    const p3 = s.saveProject({ title: "Flur", customerName: "C", siteAddress: "Z" });
    expect(new Set([p2.projectNumber, p3.projectNumber]).size).toBe(2);
    const r1 = s.createReport({ projectId: p2.id, date: "2026-10-17", workerName: "M", hoursWorked: 1, workDescription: "x" });
    const r2 = s.createReport({ projectId: p2.id, date: "2026-10-17", workerName: "M", hoursWorked: 1, workDescription: "y" });
    s.deleteReport(r1.id);
    const r3 = s.createReport({ projectId: p2.id, date: "2026-10-17", workerName: "M", hoursWorked: 1, workDescription: "z" });
    expect(r3.reportNumber).not.toBe(r2.reportNumber);
  });

  it("Fitness zählt Mitgliedsnummern als Zahl weiter, auch über M-9999", () => {
    const s = new FitnessStore(memorySql(FITNESS_MIGRATIONS));
    s.createMember({ memberNumber: "M-9999", firstName: "A", lastName: "B" });
    s.createMember({ memberNumber: "M-10000", firstName: "C", lastName: "D" });
    expect(s.createMember({ firstName: "E", lastName: "F" }).memberNumber).toBe("M-10001");
  });

  it("Restaurant: Abholnummer läuft nach 99 wieder ab 1 weiter", () => {
    const s = new RestaurantStore(memorySql(RESTAURANT_MIGRATIONS), tx);
    const numbers = Array.from({ length: 101 }, () => s.createOrder({ type: "theke", items: [] }).pickupNumber);
    expect(numbers.slice(0, 2)).toEqual([1, 2]);
    expect(numbers.slice(97, 101)).toEqual([98, 99, 1, 2]);
  });

  it("liest Zeitstempel aus SQLite als UTC", () => {
    expect(berlinDayOf("2026-10-17 22:30:00")).toBe("2026-10-18");
    expect(berlinDayOf("2026-10-17T21:30:00.000Z")).toBe("2026-10-17");
  });
});

describe("Werkstatt: verständliche Fehler statt Absturz", () => {
  it("meldet unbekannte Aufträge und doppelte Kennzeichen", () => {
    const s = new WorkshopStore(memorySql(WORKSHOP_MIGRATIONS), tx);
    expect(code(() => s.getOrder("gibt-es-nicht"))).toBe("orderNotFound");
    expect(code(() => s.getVehicle("gibt-es-nicht"))).toBe("vehicleNotFound");
    s.saveVehicle({ licensePlate: "HH-X 1", customerName: "A" });
    expect(code(() => s.saveVehicle({ licensePlate: "hh-x 1", customerName: "B" }))).toBe("plateTaken");
    s.savePart({ partNumber: "0 986", name: "Filter" });
    expect(code(() => s.savePart({ partNumber: "0 986", name: "Anderer" }))).toBe("partNumberTaken");
  });
});

describe("Einzelhandel: Artikel bearbeiten", () => {
  it("überschreibt den Bestand nicht mit dem alten Stand aus dem Formular", () => {
    const s = new RetailStore(memorySql(RETAIL_MIGRATIONS), tx);
    const p = s.saveProduct({ name: "Seife", stockQty: 10, sellingPriceCents: 1490 });
    s.adjustStock(p.id, -3, "sale");
    const edited = s.saveProduct({ ...p, name: "Seife Lavendel", stockQty: 10 });
    expect(edited.stockQty).toBe(7);
    expect(edited.name).toBe("Seife Lavendel");
  });
});
