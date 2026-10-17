import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { SALON_MIGRATIONS, SalonStore } from "../worker/salon/store";
import { RETAIL_MIGRATIONS, RetailStore } from "../worker/retail/store";
import { WORKSHOP_MIGRATIONS, WorkshopStore } from "../worker/workshop/store";
import { RESTAURANT_MIGRATIONS, RestaurantStore } from "../worker/restaurant/store";
import { CRAFT_MIGRATIONS, CraftStore } from "../worker/craft/store";
import { FITNESS_MIGRATIONS, FitnessStore } from "../worker/fitness/store";
import { AUTOHAUS_MIGRATIONS, AutohausError, AutohausStore } from "../worker/autohaus/store";

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
  { name: "Autohaus", migrations: AUTOHAUS_MIGRATIONS, table: "autohaus_vehicles", make: (sql: SqlStorage) => new AutohausStore(sql, tx) },
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

describe("Autohaus", () => {
  const setup = () => new AutohausStore(memorySql(AUTOHAUS_MIGRATIONS).sql, tx);
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof AutohausError ? e.code : String(e);
    }
    return "kein Fehler";
  };

  it("vergibt fortlaufende Bestandsnummern", () => {
    const s = setup();
    const a = s.saveVehicle({ make: "VW", model: "Golf", price: 15000 });
    const b = s.saveVehicle({ make: "BMW", model: "320d", price: 22000 });
    expect([a.stockNumber, b.stockNumber]).toEqual(["FZ-1001", "FZ-1002"]);
    expect(code(() => s.saveVehicle({ make: "", model: "X" }))).toBe("vehicleMissingFields");
  });

  it("Kaufvertrag reserviert, verkauft und gibt bei Storno wieder frei", () => {
    const s = setup();
    const car = s.saveVehicle({ make: "VW", model: "Golf", price: 20000 });
    const lead = s.saveLead({ name: "Jonas", vehicleId: car.id });
    const trade = s.saveTradeIn({ make: "VW", model: "Polo", offeredPrice: 5000 });
    const contract = s.createContract({ vehicleId: car.id, buyerName: "Jonas", leadId: lead.id, tradeInId: trade.id, discount: 500, deposit: 1000 });
    expect(contract.contractNumber).toMatch(/^KV-\d{4}-0001$/);
    expect(contract.price).toBe(20000);
    expect(contract.tradeInAmount).toBe(5000);
    expect(s.getVehicle(car.id).status).toBe("reserviert");
    expect(s.getTradeIn(trade.id).status).toBe("angenommen");
    // Ein reserviertes Fahrzeug kann nicht ein zweites Mal verkauft werden
    expect(code(() => s.createContract({ vehicleId: car.id, buyerName: "Andere" }))).toBe("vehicleNotAvailable");

    s.setContractStatus(contract.id, "unterschrieben");
    expect(s.getVehicle(car.id).status).toBe("verkauft");
    expect(s.getLead(lead.id).status).toBe("gewonnen");
    expect(s.getStats().salesThisMonth).toBe(1);
    expect(s.getStats().revenueThisMonth).toBe(19500);
    expect(code(() => s.setContractStatus(contract.id, "entwurf"))).toBe("contractWrongStatus");

    s.setContractStatus(contract.id, "storniert");
    expect(s.getVehicle(car.id).status).toBe("verfuegbar");
    expect(s.getTradeIn(trade.id)).toMatchObject({ status: "bewertet", contractId: null });
  });

  it("lehnt Verträge ab, bei denen Anzahlung und Inzahlungnahme den Preis übersteigen", () => {
    const s = setup();
    const car = s.saveVehicle({ make: "VW", model: "Up", price: 8000 });
    const trade = s.saveTradeIn({ make: "Opel", model: "Corsa", offeredPrice: 6000 });
    expect(code(() => s.createContract({ vehicleId: car.id, buyerName: "Max", tradeInId: trade.id, deposit: 3000 }))).toBe("contractOverpaid");
    expect(s.getVehicle(car.id).status).toBe("verfuegbar");
  });

  it("verhindert doppelt gebuchte Probefahrten und verlangt einen Führerschein", () => {
    const s = setup();
    const car = s.saveVehicle({ make: "Tesla", model: "Model 3", mileage: 1000, price: 30000 });
    const drive = s.scheduleTestDrive({ vehicleId: car.id, customerName: "Selin", scheduledAt: "2026-10-17T15:00", durationMin: 60 });
    expect(code(() => s.scheduleTestDrive({ vehicleId: car.id, customerName: "Max", scheduledAt: "2026-10-17T15:30" }))).toBe("testDriveConflict");
    s.scheduleTestDrive({ vehicleId: car.id, customerName: "Max", scheduledAt: "2026-10-17T16:00" });

    expect(code(() => s.startTestDrive(drive.id))).toBe("testDriveNoLicense");
    expect(s.startTestDrive(drive.id, "b072xyz").mileageStart).toBe(1000);
    expect(code(() => s.finishTestDrive(drive.id, 900))).toBe("testDriveMileage");
    s.finishTestDrive(drive.id, 1042);
    expect(s.getVehicle(car.id).mileage).toBe(1042);
  });

  it("übernimmt eine angenommene Inzahlungnahme in den Bestand", () => {
    const s = setup();
    const car = s.saveVehicle({ make: "VW", model: "Golf", price: 20000 });
    const trade = s.saveTradeIn({ make: "VW", model: "Polo", mileage: 90000, offeredPrice: 5000 });
    expect(code(() => s.tradeInToStock(trade.id))).toBe("tradeInNotAccepted");
    s.createContract({ vehicleId: car.id, buyerName: "Jonas", tradeInId: trade.id });
    const stocked = s.tradeInToStock(trade.id);
    expect(stocked).toMatchObject({ make: "VW", model: "Polo", status: "aufbereitung", source: "inzahlungnahme", purchasePrice: 5000 });
    expect(code(() => s.tradeInToStock(trade.id))).toBe("tradeInInStock");
  });

  it("nimmt nur kleine Bilder an, höchstens acht je Fahrzeug", () => {
    const s = setup();
    const car = s.saveVehicle({ make: "VW", model: "Golf" });
    const photo = "data:image/jpeg;base64,AAAA";
    expect(code(() => s.addPhoto(car.id, "data:text/html;base64,AAAA"))).toBe("photoInvalid");
    for (let i = 0; i < 8; i++) s.addPhoto(car.id, photo);
    expect(code(() => s.addPhoto(car.id, photo))).toBe("photoLimit");
    const photos = s.listPhotos(car.id);
    const reordered = s.coverPhoto(car.id, photos[3]!.id);
    expect(reordered[0]!.id).toBe(photos[3]!.id);
    expect(s.getVehicle(car.id).photoCount).toBe(8);
  });
});
