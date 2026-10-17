import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { WORKSHOP_MIGRATIONS, WorkshopStore } from "../worker/workshop/store";
import { workshopTotals, type OrderPosition } from "../shared/workshop";

// Werkstatt: Umsatzsteuer je Positionssatz statt pauschal 19 %.

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

const pos = (id: string, unitPriceNet: number, taxRate: number, approvedByCustomer = true): OrderPosition =>
  ({ id, type: "labor", name: id, quantity: 1, unit: "Pauschal", unitPriceNet, taxRate, approvedByCustomer });

describe("Werkstatt: Steuer je Satz", () => {
  it("bildet eine Zeile je Satz, auch für 0 %", () => {
    const t = workshopTotals([pos("a", 100, 19), pos("b", 148, 0), pos("c", 50, 7), pos("d", 10, 19)]);
    expect(t.vat).toEqual([
      { rate: 19, net: 110, tax: 20.9 },
      { rate: 7, net: 50, tax: 3.5 },
      { rate: 0, net: 148, tax: 0 },
    ]);
    expect(t.totalNet).toBe(308);
    expect(t.totalTax).toBe(24.4);
    expect(t.totalGross).toBe(332.4);
  });

  it("rechnet Auftragssummen auf dem Server je Satz", () => {
    const s = new WorkshopStore(memorySql(WORKSHOP_MIGRATIONS), tx);
    const o = s.createOrder({ licensePlate: "HH-AB 1", mileage: 1, customerName: "A", customerPhone: "1", issueDescription: "HU",
      positions: [pos("hu", 148, 0), pos("aw", 100, 19)] });
    expect(o.totalTax).toBe(19);
    expect(o.totalGross).toBe(267);

    const u = s.updateOrder(o.id, { positions: [...o.positions, pos("x", 10, 7, false)] });
    expect(u.totalTax).toBe(19.7);

    // Nach Freigabe zählen nur freigegebene Positionen, wie in der Kasse
    const a = s.approveEstimateByToken(o.statusToken, ["hu", "aw"]);
    expect(a.totalNet).toBe(248);
    expect(a.totalTax).toBe(19);
  });
});
