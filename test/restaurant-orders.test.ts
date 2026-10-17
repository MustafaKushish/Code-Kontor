import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { RESTAURANT_MIGRATIONS, RestaurantStore, averagePrepMinutes, orderTotals } from "../worker/restaurant/store";

// Restaurant: Bestellliste für das Abfragen im Hintergrund (nur laufende und heutige) und Steuer je Satz.

function database() {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(query: string, ...params: (string | number | null)[]) {
      if (!params.length && query.split(";").filter((x) => x.trim()).length > 1) {
        db.exec(query);
        return cursor([], 0);
      }
      const stmt = db.prepare(query);
      if (/^\s*(SELECT|WITH)/i.test(query)) return cursor(stmt.all(...params) as Record<string, unknown>[], 0);
      return cursor([], Number(stmt.run(...params).changes));
    },
  } as unknown as SqlStorage;
  function cursor(rows: Record<string, unknown>[], written: number) {
    return {
      toArray: () => rows.map((r) => ({ ...r })),
      one: () => {
        if (!rows.length) throw new Error("no rows");
        return { ...rows[0] };
      },
      raw: () => rows.map((r) => Object.values(r)),
      rowsWritten: written,
    };
  }
  let depth = 0;
  const transaction = <T,>(fn: () => T): T => {
    if (depth) return fn();
    depth++;
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      depth--;
    }
  };
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
  for (const step of RESTAURANT_MIGRATIONS) db.exec(step);
  return { db, restaurant: new RestaurantStore(sql, transaction) };
}

const line = (restaurant: RestaurantStore, name: string, quantity: number, priceGross: number, taxRate: number) => {
  const m = restaurant.saveMenuItem({ itemNumber: name, name, priceGross, taxRate });
  return { id: name, menuItemId: m.id, name, quantity, unitPriceGross: 0, taxRate: 0, course: "Sofort" as const, status: "bestellt" as const, destination: "kueche" as const };
};

describe("Restaurant-Bestellungen", () => {
  it("listOrders mit since: laufende immer, abgeschlossene nur ab dem Zeitpunkt", () => {
    const { db, restaurant } = database();
    const oldOpen = restaurant.createOrder({ type: "theke", items: [line(restaurant, "A", 1, 3, 19)] });
    const oldClosed = restaurant.createOrder({ type: "theke", items: [line(restaurant, "B", 1, 3, 19)] });
    const oldCancelled = restaurant.createOrder({ type: "theke", items: [line(restaurant, "C", 1, 3, 19)] });
    const todayClosed = restaurant.createOrder({ type: "theke", items: [line(restaurant, "D", 1, 3, 19)] });
    db.prepare("UPDATE restaurant_orders SET created_at = '2026-01-02 10:00:00' WHERE id IN (?, ?, ?)").run(oldOpen.id, oldClosed.id, oldCancelled.id);
    db.prepare("UPDATE restaurant_orders SET status = 'abgeschlossen' WHERE id IN (?, ?)").run(oldClosed.id, todayClosed.id);
    db.prepare("UPDATE restaurant_orders SET status = 'storniert' WHERE id = ?").run(oldCancelled.id);

    expect(restaurant.listOrders()).toHaveLength(4);
    const since = new Date(Date.now() - 3600_000).toISOString();
    const ids = restaurant.listOrders({ since }).map((o) => o.id).sort();
    expect(ids).toEqual([oldOpen.id, todayClosed.id].sort());
    // SQLite-Format wird ebenso verstanden, ungültige Werte liefern alles
    expect(restaurant.listOrders({ since: "2026-01-02 09:00:00" })).toHaveLength(4);
    expect(restaurant.listOrders({ since: "kaputt" })).toHaveLength(4);
  });

  it("Summen rechnen die Steuer je Satz heraus, auch für 0 % und andere Sätze", () => {
    expect(orderTotals([
      { quantity: 2, unitPriceGross: 10.7, taxRate: 7 },
      { quantity: 1, unitPriceGross: 11.9, taxRate: 19 },
    ])).toEqual({ totalGross: 33.3, totalTax7: 1.4, totalTax19: 1.9, totalNet: 30 });
    // 0 %: keine Steuer (früher wurden 19 % herausgerechnet)
    expect(orderTotals([{ quantity: 1, unitPriceGross: 5, taxRate: 0 }])).toEqual({ totalGross: 5, totalTax7: 0, totalTax19: 0, totalNet: 5 });
    // 10 % (z. B. Österreich)
    const at = orderTotals([{ quantity: 1, unitPriceGross: 11, taxRate: 10 }]);
    expect(at.totalNet).toBe(10);
    expect(at.totalTax7 + at.totalTax19).toBe(1);
  });

  it("Bestellung mit 0-%-Speise: Netto gleich Brutto", () => {
    const { restaurant } = database();
    const order = restaurant.createOrder({ type: "theke", items: [line(restaurant, "Wasser", 2, 2, 0)] });
    expect(order.totalGross).toBe(4);
    expect(order.totalNet).toBe(4);
  });

  it("Ø Zubereitungszeit aus echten Zeitpunkten, null ohne fertige Bestellungen", () => {
    expect(averagePrepMinutes([])).toBeNull();
    expect(averagePrepMinutes([{ createdAt: "2026-10-17 10:00:00" }])).toBeNull();
    expect(
      averagePrepMinutes([
        { createdAt: "2026-10-17 10:00:00", kitchenStartedAt: "2026-10-17 10:00:00", readyAt: "2026-10-17T10:10:00.000Z" },
        { createdAt: "2026-10-17 11:00:00", readyAt: "2026-10-17T11:20:00.000Z" },
      ]),
    ).toBe(15);

    const { restaurant } = database();
    expect(restaurant.getStats().averagePrepTimeMinutes).toBeNull();
    const order = restaurant.createOrder({ type: "theke", items: [line(restaurant, "A", 1, 3, 19)] });
    restaurant.updateOrderStatus(order.id, "fertig");
    expect(restaurant.getStats().averagePrepTimeMinutes).toBe(0);
  });
});
