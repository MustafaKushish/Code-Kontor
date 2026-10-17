import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { POS_MIGRATIONS, POS_MODULE_MIGRATIONS, PosStore, type PosContext } from "../worker/pos/store";
import { SALON_MIGRATIONS, SalonError, SalonStore } from "../worker/salon/store";
import { WORKSHOP_MIGRATIONS, WorkshopError, WorkshopStore } from "../worker/workshop/store";
import { RESTAURANT_MIGRATIONS, RestaurantError, RestaurantStore } from "../worker/restaurant/store";
import { CRAFT_MIGRATIONS, CraftError, CraftStore } from "../worker/craft/store";
import type { PosLine } from "../shared/pos";

// Die Google-AI-Module rechnen über die Kasse der Plattform ab: Preise und Steuersätze vom Server,
// Beleg mit Nummer, Storno setzt den Vorgang zurück.

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
  db.exec("CREATE TABLE installed_apps (app_id TEXT PRIMARY KEY, installed_at TEXT NOT NULL DEFAULT (datetime('now')))");
  db.exec(POS_MIGRATIONS);
  for (const step of [...SALON_MIGRATIONS, ...WORKSHOP_MIGRATIONS, ...RESTAURANT_MIGRATIONS, ...CRAFT_MIGRATIONS]) db.exec(step);
  for (const step of POS_MODULE_MIGRATIONS) typeof step === "function" ? step(sql) : sql.exec(step);
  const pos = new PosStore(sql, transaction);
  const salon = new SalonStore(sql, transaction);
  const workshop = new WorkshopStore(sql, transaction);
  const restaurant = new RestaurantStore(sql, transaction);
  const craft = new CraftStore(sql);
  pos.register("salon", salon.posModule());
  pos.register("workshop", workshop.posModule());
  pos.register("restaurant", restaurant.posModule());
  pos.register("craft", craft.posModule());
  return { pos, salon, workshop, restaurant, craft };
}

const actor = { id: "u1", name: "Mia" };
const company = { name: "Test", street: "", postalCode: "", city: "", phone: "", email: "", taxNumber: "", vatId: "", iban: "", bic: "", bankName: "", logoDataUrl: "" };
const ctx: PosContext = { actor, company, currency: "EUR", today: "2026-10-17" };
// So schickt der Bezahldialog den Vorgang: nur Quelle, Art und ID, alles andere rechnet der Server
const ref = (source: PosLine["source"], kind: string, refId: string): PosLine => ({ source, kind, refId, name: "", qty: 1, unitCents: 0, vatRate: 0 });
const pay = (pos: PosStore, line: PosLine) => {
  const { dueCents } = pos.quote([line], ctx);
  return pos.checkout({ lines: [line], payments: [{ method: "cash", cents: dueCents }], customer: null }, ctx)!;
};
const item = (name: string, quantity: number, unitPriceGross: number, taxRate: number) => ({
  id: name, menuItemId: name, name, quantity, unitPriceGross, taxRate, course: "hauptgang" as never, status: "bestellt" as const, destination: "kueche" as const,
});

describe("Restaurant über die Kasse", () => {
  it("Tisch: Steuersätze je Speise, Tisch frei, Storno öffnet die Rechnung wieder", () => {
    const { pos, restaurant } = database();
    const table = restaurant.saveTable({ tableNumber: "5", name: "Tisch 5" });
    const order = restaurant.createOrder({ type: "tisch", tableId: table.id, tableName: table.name, items: [item("Pizza", 2, 9.5, 19), item("Wasser", 1, 3, 19)] });
    const quote = pos.quote([ref("restaurant", "order", order.id)], ctx);
    expect(quote.totals.grossCents).toBe(2200);
    expect(quote.lines.map((l) => l.kind)).toEqual(["order:item", "order:item"]);

    const receipt = pay(pos, ref("restaurant", "order", order.id));
    expect(receipt.number).toBe("RE-2026-0001");
    const paid = restaurant.getOrder(order.id);
    expect(paid.paymentStatus).toBe("bezahlt");
    expect(paid.status).toBe("abgeschlossen");
    expect(restaurant.listTables().find((t) => t.id === table.id)!.status).toBe("frei");
    expect(() => pay(pos, ref("restaurant", "order", order.id))).toThrow(RestaurantError);

    pos.cancel(receipt.number, ctx);
    expect(restaurant.getOrder(order.id).paymentStatus).toBe("offen");
  });

  it("Theke: bezahlt, aber die Küche arbeitet weiter", () => {
    const { pos, restaurant } = database();
    const order = restaurant.createOrder({ type: "abholung", items: [item("Pasta", 1, 8, 7)] });
    const receipt = pay(pos, ref("restaurant", "order", order.id));
    expect(receipt.totals.vat).toEqual([{ rate: 7, netCents: 748, vatCents: 52 }]);
    const after = restaurant.getOrder(order.id);
    expect(after.paymentStatus).toBe("bezahlt");
    expect(after.status).toBe("in_zubereitung");
    // Abschließen allein macht nichts bezahlt
    const open = restaurant.createOrder({ type: "theke", items: [item("Kaffee", 1, 2.5, 19)] });
    expect(restaurant.updateOrderStatus(open.id, "abgeschlossen").paymentStatus).toBe("offen");
  });
});

describe("Handwerk über die Kasse", () => {
  it("rechnet den Rapport mit den Steuersätzen der Positionen ab", () => {
    const { pos, craft } = database();
    const project = craft.saveProject({ title: "Bad", customerName: "Frau Kurz", siteAddress: "Weg 1" });
    const report = craft.createReport({
      projectId: project.id, date: "2026-10-17", workerName: "Tom", hoursWorked: 0, workDescription: "Fliesen",
      items: [
        { id: "a", type: "lohn", name: "Arbeit", quantity: 2, unit: "Std.", unitPriceNet: 50, totalNet: 100, taxRate: 19 },
        { id: "b", type: "material", name: "Fliesen", quantity: 1, unit: "Psch.", unitPriceNet: 100, totalNet: 100, taxRate: 7 },
      ],
    });
    const receipt = pay(pos, ref("craft", "report", report.id));
    expect(receipt.totals.grossCents).toBe(11900 + 10700);
    expect(receipt.totals.vat.map((v) => v.rate).sort()).toEqual([19, 7]);
    expect(receipt.customer?.name).toBe("Frau Kurz");
    expect(craft.getReport(report.id).paymentStatus).toBe("bezahlt");
    expect(() => pay(pos, ref("craft", "report", report.id))).toThrow(CraftError);
    pos.cancel(receipt.number, ctx);
    expect(craft.getReport(report.id)).toMatchObject({ paymentStatus: "offen", status: "entwurf" });
  });
});

describe("Werkstatt und Friseur über die Kasse", () => {
  it("Werkstatt: Teile aus dem Lager, Storno bucht sie zurück", () => {
    const { pos, workshop } = database();
    const part = workshop.savePart({ partNumber: "BP-1", name: "Bremsbeläge", salePriceNet: 50, taxRate: 19, stock: 4 });
    const order = workshop.createOrder({
      licensePlate: "HH-A 1", mileage: 1, customerName: "Ali", customerPhone: "1", issueDescription: "Bremsen",
      positions: [
        { id: "p", type: "part", code: "BP-1", name: "Bremsbeläge", quantity: 2, unit: "Stück", unitPriceNet: 50, taxRate: 19 },
        { id: "l", type: "labor", name: "Einbau", quantity: 1, unit: "Std", unitPriceNet: 100, taxRate: 19 },
      ],
    });
    const receipt = pay(pos, ref("workshop", "order", order.id));
    expect(receipt.totals.grossCents).toBe(23800);
    expect(workshop.listParts().find((p) => p.id === part.id)!.stock).toBe(2);
    expect(workshop.getOrder(order.id).paymentStatus).toBe("bezahlt");
    expect(() => pay(pos, ref("workshop", "order", order.id))).toThrow(WorkshopError);
    pos.cancel(receipt.number, ctx);
    expect(workshop.listParts().find((p) => p.id === part.id)!.stock).toBe(4);
    expect(workshop.getOrder(order.id).paymentStatus).toBe("offen");
  });

  it("Friseur: Preise aus den Leistungen, nicht aus dem Browser", () => {
    const { pos, salon } = database();
    const anna = salon.saveStaff({ name: "Anna", workingDays: [1, 2, 3, 4, 5, 6], workStart: "09:00", workEnd: "18:00" });
    const cut = salon.saveService({ name: "Schnitt", priceCents: 3500, durationMinutes: 30, vatRate: 19 });
    const a = salon.saveAppointment({ day: "2026-10-17", startTime: "10:00", staffId: anna.id, staffName: "Anna", clientName: "Eva", serviceIds: [cut.id], serviceNames: ["Schnitt"], totalCents: 1 });
    const receipt = pay(pos, { ...ref("salon", "appointment", a.id), unitCents: 1 });
    expect(receipt.totals.grossCents).toBe(3500);
    expect(salon.getAppointment(a.id)).toMatchObject({ paid: true, billedInvoiceId: receipt.number });
    expect(() => pay(pos, ref("salon", "appointment", a.id))).toThrow(SalonError);
  });
});
