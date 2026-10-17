import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { RETAIL_MIGRATIONS, RetailStore } from "../worker/retail/store";

// Einzelhandel: Wareneingang bucht die neu gelieferte Menge zu, nicht die Gesamtmenge.

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

describe("Einzelhandel: Wareneingang", () => {
  it("addiert Teillieferungen und schließt die Bestellung bei voller Menge", () => {
    const s = new RetailStore(memorySql(RETAIL_MIGRATIONS), tx);
    const p = s.saveProduct({ name: "Kaffee", stockQty: 2 });
    const o = s.saveOrder({
      supplierName: "Röster",
      status: "ordered",
      items: [{ productId: p.id, name: "Kaffee", ean: p.ean, qtyOrdered: 10, qtyReceived: 0, purchasePriceCents: 500 }],
    });

    const first = s.receiveOrder(o.id, [{ productId: p.id, qtyDelivered: 4 }]);
    expect(first.items[0].qtyReceived).toBe(4);
    expect(first.status).toBe("partially_received");
    expect(s.getProduct(p.id)!.stockQty).toBe(6);

    const second = s.receiveOrder(o.id, [{ productId: p.id, qtyDelivered: 6 }]);
    expect(second.items[0].qtyReceived).toBe(10);
    expect(second.status).toBe("received");
    expect(s.getProduct(p.id)!.stockQty).toBe(12);
  });

  it("ignoriert negative oder fehlende Mengen", () => {
    const s = new RetailStore(memorySql(RETAIL_MIGRATIONS), tx);
    const p = s.saveProduct({ name: "Tee", stockQty: 1 });
    const o = s.saveOrder({
      supplierName: "Teehaus",
      status: "ordered",
      items: [{ productId: p.id, name: "Tee", ean: p.ean, qtyOrdered: 3, qtyReceived: 0, purchasePriceCents: 100 }],
    });
    const r = s.receiveOrder(o.id, [{ productId: p.id, qtyDelivered: -5 }]);
    expect(r.items[0].qtyReceived).toBe(0);
    expect(r.status).toBe("ordered");
    expect(s.getProduct(p.id)!.stockQty).toBe(1);
  });
});
