import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { evaluateFormula } from "../shared/formula";
import { CRAFT_MIGRATIONS, CraftError, CraftStore } from "../worker/craft/store";
import { FITNESS_MIGRATIONS, FitnessStore, nextClassDay } from "../worker/fitness/store";
import { RESTAURANT_MIGRATIONS, RestaurantError, RestaurantStore } from "../worker/restaurant/store";

// Fachliche Fehler der Google-AI-Module: Aufmaß, Rapporte, Check-in, Kurse, Tischbestellungen.

function memorySql(migrations: string[]) {
  const db = new DatabaseSync(":memory:");
  for (const step of migrations) db.exec(step);
  return {
    exec(query: string, ...params: (string | number | null)[]) {
      const stmt = db.prepare(query);
      if (/^\s*(SELECT|WITH)/i.test(query)) {
        const rows = stmt.all(...params) as Record<string, unknown>[];
        return { toArray: () => rows, one: () => rows[0], raw: () => rows.map((r) => Object.values(r)) };
      }
      const res = stmt.run(...params);
      return { rowsWritten: Number(res.changes), toArray: () => [], one: () => ({}), raw: () => [] };
    },
  } as unknown as SqlStorage;
}
const tx = <T,>(fn: () => T): T => fn();
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
  return "kein Fehler";
};

describe("Aufmaß-Formeln ohne eval", () => {
  it("rechnet Punkt vor Strich, Klammern, Komma und x", () => {
    expect(evaluateFormula("4,5 x 3,2 - 0,9 * 2,1")).toBe(12.51);
    expect(evaluateFormula("(2+3) × 2,5")).toBe(12.5);
    expect(evaluateFormula("-2 + 10 / 4")).toBe(0.5);
    expect(evaluateFormula("12")).toBe(12);
  });
  it("lehnt Unsinn ab statt Code auszuführen", () => {
    expect(evaluateFormula("alert(1)")).toBeNull();
    expect(evaluateFormula("2 +")).toBeNull();
    expect(evaluateFormula("1/0")).toBeNull();
    expect(evaluateFormula("")).toBeNull();
  });
  it("speichert das Ergebnis der Formel auf dem Server", () => {
    const s = new CraftStore(memorySql(CRAFT_MIGRATIONS));
    const p = s.saveProject({ title: "Bad", customerName: "A", siteAddress: "B" });
    expect(s.saveMeasurement({ projectId: p.id, roomName: "Bad", formula: "3 x 2,5", result: 999 }).result).toBe(7.5);
    expect(code(() => s.saveMeasurement({ projectId: p.id, roomName: "Bad", formula: "3 x" }))).toBe("invalidFormula");
  });
});

describe("Handwerk: Rapporte", () => {
  const setup = () => {
    const s = new CraftStore(memorySql(CRAFT_MIGRATIONS));
    const p = s.saveProject({ title: "Bad", customerName: "A", siteAddress: "B" });
    const base = { projectId: p.id, date: "2026-10-17", workerName: "Tom", hoursWorked: 0, workDescription: "x" };
    return { s, base };
  };
  it("rechnet Summen selbst, mit Steuer je Position", () => {
    const { s, base } = setup();
    const r = s.createReport({ ...base, items: [
      { id: "a", type: "lohn", name: "Arbeit", quantity: 2, unit: "Std.", unitPriceNet: 50, totalNet: 1, taxRate: 19 },
      { id: "b", type: "material", name: "Fliesen", quantity: 1, unit: "Psch.", unitPriceNet: 100, totalNet: 1, taxRate: 7 },
    ] });
    expect(r.totalWageNet).toBe(100);
    expect(r.totalMaterialNet).toBe(100);
    expect(r.totalTax).toBe(26);
    expect(r.totalGross).toBe(226);
  });
  it("lehnt negative Mengen ab und sperrt unterschriebene Rapporte", () => {
    const { s, base } = setup();
    expect(code(() => s.createReport({ ...base, items: [{ id: "a", type: "lohn", name: "A", quantity: -2, unit: "Std.", unitPriceNet: 50, totalNet: 0, taxRate: 19 }] }))).toBe("invalidItem");
    const r = s.createReport({ ...base, hoursWorked: 1 });
    s.signReport(r.id, "data:image/png;base64,AAAA", "Kunde");
    expect(code(() => s.signReport(r.id, "data:image/png;base64,BBBB", "Fremd"))).toBe("reportLocked");
    expect(code(() => s.deleteReport(r.id))).toBe("reportLocked");
  });
  it("speichert 0 °C im Bautagebuch", () => {
    const { s, base } = setup();
    expect(s.saveSiteDiaryEntry({ projectId: base.projectId, author: "Tom", activitiesSummary: "Frost", temperatureCelsius: 0 }).temperatureCelsius).toBe(0);
  });
});

describe("Fitness: Check-in", () => {
  it("lässt abgelaufene Verträge nicht rein und zieht bei Doppel-Scan keine Einheit ab", () => {
    const s = new FitnessStore(memorySql(FITNESS_MIGRATIONS));
    s.createMember({ memberNumber: "M-1", firstName: "Alt", lastName: "Ab", validUntil: "2020-01-01" });
    expect(s.checkIn("M-1")).toMatchObject({ success: false, alertLevel: "error" });
    s.createMember({ memberNumber: "M-2", firstName: "Zehn", lastName: "Karte", remainingUnits: 5 });
    expect(s.checkIn("M-2").remainingUnits).toBe(4);
    expect(s.checkIn("M-2")).toMatchObject({ success: true, alertLevel: "warning" });
    expect(s.listMembers().find((m) => m.memberNumber === "M-2")!.remainingUnits).toBe(4);
  });
  it("nimmt bei zwei gleichen Nachnamen keinen zufällig", () => {
    const s = new FitnessStore(memorySql(FITNESS_MIGRATIONS));
    s.createMember({ memberNumber: "M-1", firstName: "Anna", lastName: "Müller" });
    s.createMember({ memberNumber: "M-2", firstName: "Ben", lastName: "Müller" });
    expect(s.checkIn("Müller")).toMatchObject({ success: false, alertLevel: "warning" });
    expect(s.checkIn("M-2").member?.firstName).toBe("Ben");
  });
  it("findet den nächsten Kurstag", () => {
    // Samstag, 17.10.2026, 18:00 deutscher Zeit
    const now = new Date("2026-10-17T16:00:00Z");
    expect(nextClassDay("Samstag", "19:00", now)).toBe("2026-10-17");
    expect(nextClassDay("Samstag", "17:00", now)).toBe("2026-10-24");
    expect(nextClassDay("Montag", "19:00", now)).toBe("2026-10-19");
  });
});

describe("Restaurant: Tischbestellungen", () => {
  it("hängt Positionen an, nimmt Preise aus der Karte und gibt den Tisch beim Stornieren frei", () => {
    const s = new RestaurantStore(memorySql(RESTAURANT_MIGRATIONS), tx);
    const pizza = s.saveMenuItem({ itemNumber: "P1", name: "Pizza", priceGross: 9.5, taxRate: 7 });
    const cola = s.saveMenuItem({ itemNumber: "G1", name: "Cola", priceGross: 3, taxRate: 19, destination: "bar" });
    const table = s.saveTable({ tableNumber: "1", name: "Tisch 1" });
    const order = s.createOrder({ type: "tisch", tableId: table.id, items: [{ menuItemId: pizza.id, quantity: 1, unitPriceGross: 0.01, taxRate: 0 } as never] });
    expect(order.items[0]).toMatchObject({ unitPriceGross: 9.5, taxRate: 7 });
    // Zweiter Kellner hängt an, der erste verliert nichts
    const a = s.addOrderItems(order.id, [{ menuItemId: cola.id, quantity: 2 }]);
    expect(a.items.map((i) => i.name)).toEqual(["Pizza", "Cola"]);
    expect(a.totalGross).toBe(15.5);
    expect(code(() => s.addOrderItems(order.id, [{ menuItemId: "gibt-es-nicht", quantity: 1 }]))).toBe("menuItemNotFound");
    s.removeOrderItem(order.id, a.items[0]!.id);
    const last = s.removeOrderItem(order.id, a.items[1]!.id);
    expect(last.status).toBe("storniert");
    expect(s.listTables().find((t) => t.id === table.id)!.status).toBe("frei");
    expect(code(() => s.addOrderItems(order.id, [{ menuItemId: cola.id, quantity: 1 }]))).toBe("orderClosed");
    expect(RestaurantError).toBeDefined();
    expect(CraftError).toBeDefined();
  });
});
