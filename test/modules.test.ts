import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { SALON_MIGRATIONS, SalonStore } from "../worker/salon/store";
import { RETAIL_MIGRATIONS, RetailStore } from "../worker/retail/store";
import { WORKSHOP_MIGRATIONS, WorkshopStore } from "../worker/workshop/store";
import { RESTAURANT_MIGRATIONS, RestaurantStore } from "../worker/restaurant/store";
import { CRAFT_MIGRATIONS, CraftStore } from "../worker/craft/store";
import { FITNESS_MIGRATIONS, FitnessStore } from "../worker/fitness/store";

// Die Firmen-Datenbank baut bei jedem Aufruf alle Modul-Stores. Ein Store darf dabei
// weder abstürzen noch Beispieldaten in echte Firmen schreiben.

function memorySql(migrations: string[]) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
  for (const step of migrations) db.exec(step);
  const sql = {
    exec(query: string, ...params: (string | number | null)[]) {
      const stmt = db.prepare(query);
      if (/^\s*(SELECT|WITH)/i.test(query)) {
        const rows = stmt.all(...params) as Record<string, unknown>[];
        return { toArray: () => rows, one: () => rows[0] ?? {}, raw: () => rows.map((r) => Object.values(r)) };
      }
      const res = stmt.run(...params);
      return { rowsWritten: Number(res.changes), toArray: () => [], one: () => ({}), raw: () => [] };
    },
  } as unknown as SqlStorage;
  const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
  return { sql, count };
}

const tx = <T>(fn: () => T): T => fn();

const MODULES = [
  { name: "Friseur", migrations: SALON_MIGRATIONS, table: "salon_services", make: (sql: SqlStorage) => new SalonStore(sql, tx) },
  { name: "Einzelhandel", migrations: RETAIL_MIGRATIONS, table: "retail_products", make: (sql: SqlStorage) => new RetailStore(sql, tx) },
  { name: "Werkstatt", migrations: WORKSHOP_MIGRATIONS, table: "workshop_vehicles", make: (sql: SqlStorage) => new WorkshopStore(sql, tx) },
  { name: "Restaurant", migrations: RESTAURANT_MIGRATIONS, table: "restaurant_orders", make: (sql: SqlStorage) => new RestaurantStore(sql, tx) },
  { name: "Handwerk", migrations: CRAFT_MIGRATIONS, table: "craft_projects", make: (sql: SqlStorage) => new CraftStore(sql) },
  { name: "Fitness", migrations: FITNESS_MIGRATIONS, table: "fitness_plans", make: (sql: SqlStorage) => new FitnessStore(sql) },
];

describe("Branchen-Module in der Firmen-Datenbank", () => {
  for (const m of MODULES) {
    it(`${m.name}: startet leer und füllt Beispieldaten nur auf Wunsch`, () => {
      const { sql, count } = memorySql(m.migrations);
      const store = m.make(sql);
      expect(count(m.table)).toBe(0);
      store.seedIfEmpty();
      expect(count(m.table)).toBeGreaterThan(0);
    });
  }
});
