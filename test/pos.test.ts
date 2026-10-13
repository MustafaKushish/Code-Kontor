import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { computeTotals, parseAmount, sanitizeLine, sanitizePosSettings, settlePayments } from "../shared/pos";
import { POS_MIGRATIONS, POS_MODULE_MIGRATIONS, PosError, PosStore, type PosContext } from "../worker/pos/store";
import { REPAIR_MIGRATIONS, RepairError, RepairStore } from "../worker/repairs/store";
import { sanitizeIntake, sanitizePart, sanitizeUsed } from "../shared/repairs";

describe("Kasse: Zahlungen", () => {
  it("gibt Rückgeld nur aus Bargeld", () => {
    expect(settlePayments(1250, [{ method: "cash", cents: 2000 }])).toEqual({ ok: true, payments: [{ method: "cash", cents: 1250 }], givenCents: 2000, changeCents: 750 });
    expect(settlePayments(1250, [{ method: "card", cents: 2000 }])).toEqual({ ok: false, problem: "changeWithoutCash" });
    expect(settlePayments(1250, [{ method: "cash", cents: 1000 }])).toEqual({ ok: false, problem: "paymentTooLow" });
    expect(settlePayments(1250, [])).toEqual({ ok: false, problem: "paymentMissing" });
  });

  it("teilt eine Zahlung auf Bar und Karte", () => {
    const r = settlePayments(5000, [{ method: "card", cents: 3000 }, { method: "cash", cents: 2500 }]);
    expect(r).toEqual({ ok: true, payments: [{ method: "card", cents: 3000 }, { method: "cash", cents: 2000 }], givenCents: 2500, changeCents: 500 });
  });

  it("lehnt abgeschaltete Zahlarten ab und zahlt Negatives genau aus", () => {
    expect(settlePayments(100, [{ method: "voucher", cents: 100 }], ["cash", "card"])).toEqual({ ok: false, problem: "paymentMethod" });
    expect(settlePayments(-500, [{ method: "cash", cents: -500 }]).ok).toBe(true);
    expect(settlePayments(-500, [{ method: "cash", cents: -400 }]).ok).toBe(false);
    expect(settlePayments(0, [])).toEqual({ ok: true, payments: [], givenCents: 0, changeCents: 0 });
  });

  it("rechnet Steuern je Satz aus dem Brutto, Differenzbesteuerung ohne Steuer", () => {
    const t = computeTotals([{ qty: 2, unitCents: 1190, vatRate: 19 }, { qty: 1, unitCents: 10000, vatRate: 19, margin: true }]);
    expect(t.grossCents).toBe(12380);
    expect(t.vat).toEqual([{ rate: 19, netCents: 2000, vatCents: 380 }, { rate: 0, netCents: 10000, vatCents: 0 }]);
  });

  it("prüft Eingaben", () => {
    expect(sanitizeLine({ name: "" })).toBeNull();
    expect(sanitizeLine({ name: "Kaffee", qty: 2, unitCents: 250, vatRate: 7 })).toMatchObject({ source: "pos", kind: "item", qty: 2, unitCents: 250, vatRate: 7 });
    expect(sanitizePosSettings({ methods: ["card"] }).methods).toEqual(["cash", "card"]);
    expect(parseAmount("12,50")).toBe(1250);
    expect(parseAmount("abc")).toBeNull();
  });
});

// ---------- Kasse mit echter SQLite-Datenbank (wie im Durable Object) ----------

function database(seed?: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(query: string, ...params: (string | number | null)[]) {
      const statements = query.split(";").filter((x) => x.trim());
      if (!params.length && statements.length > 1) {
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
  seed?.(db);
  for (const step of REPAIR_MIGRATIONS) typeof step === "function" ? step(sql) : sql.exec(step);
  for (const step of POS_MODULE_MIGRATIONS) typeof step === "function" ? step(sql) : sql.exec(step);
  const pos = new PosStore(sql, transaction);
  const repairs = new RepairStore(sql, transaction, pos);
  pos.register("repairs", repairs.posModule());
  return { pos, repairs, db };
}

const actor = { id: "u1", name: "Mia" };
const company = { name: "Handy Doktor", street: "", postalCode: "", city: "", phone: "", email: "", taxNumber: "", vatId: "", iban: "", bic: "", bankName: "", logoDataUrl: "" };
const ctx = (options?: Record<string, unknown>): PosContext => ({ actor, company, currency: "EUR", today: "2026-10-13", options });
const line = (name: string, unitCents: number, qty = 1) => ({ source: "pos" as const, kind: "item", refId: null, name, qty, unitCents, vatRate: 19 });

describe("Kasse: Belege, Storno und Abschluss", () => {
  it("bucht Belege mit fortlaufender Nummer und Rückgeld", () => {
    const { pos } = database();
    const a = pos.checkout({ lines: [line("Kaffee", 250, 2)], payments: [{ method: "cash", cents: 1000 }], customer: null }, ctx())!;
    expect(a.number).toBe("RE-2026-0001");
    expect(a.changeCents).toBe(500);
    expect(a.payments).toEqual([{ method: "cash", cents: 500 }]);
    pos.saveSettings({ ...pos.settings(), methods: ["cash", "card"] });
    const b = pos.checkout({ lines: [line("Hülle", 2000)], payments: [{ method: "card", cents: 1500 }, { method: "cash", cents: 500 }], customer: null }, ctx())!;
    expect(b.number).toBe("RE-2026-0002");
    expect(() => pos.checkout({ lines: [line("Kabel", 900)], payments: [{ method: "cash", cents: 100 }], customer: null }, ctx())).toThrow(PosError);
    // Fehlgeschlagener Verkauf verbraucht keine Nummer
    expect(pos.checkout({ lines: [line("Kabel", 900)], payments: [{ method: "cash", cents: 900 }], customer: null }, ctx())!.number).toBe("RE-2026-0003");
  });

  it("storniert mit Gegenbeleg und zählt alles im Tagesabschluss", () => {
    const { pos } = database();
    pos.addMove({ kind: "in", method: "cash", cents: 10000, note: "Wechselgeld" }, actor);
    const sale = pos.checkout({ lines: [line("Display", 8900)], payments: [{ method: "cash", cents: 10000 }], customer: null }, ctx())!;
    pos.checkout({ lines: [line("Folie", 1500)], payments: [{ method: "cash", cents: 1500 }], customer: null }, ctx());
    const cancel = pos.cancel(sale.number, ctx());
    expect(cancel.kind).toBe("cancel");
    expect(cancel.cancels).toBe(sale.number);
    expect(cancel.payments).toEqual([{ method: "cash", cents: -8900 }]);
    expect(pos.receipt(sale.number)!.canceledBy).toBe(cancel.number);
    expect(() => pos.cancel(sale.number, ctx())).toThrow(PosError);

    const state = pos.state();
    expect(state.byMethod.cash).toBe(1500);
    expect(state.salesCents).toBe(1500);
    expect(state.expectedCents).toBe(11500);
    const closing = pos.close({ countedCents: 11400, bankCents: 6400, note: "" }, actor);
    expect(closing.number).toBe(1);
    expect(closing.differenceCents).toBe(-100);
    expect(closing.closingCents).toBe(5000);
    const after = pos.state();
    expect(after.openingCents).toBe(5000);
    expect(after.expectedCents).toBe(5000);
    expect(after.receipts).toBe(0);
    expect(() => pos.close({ countedCents: 5000, bankCents: 0, note: "" }, actor)).toThrow(PosError);
  });
});

describe("Kasse mit Handy- & IT-Service", () => {
  it("Anzahlung, Abholung über die Kasse, Storno und erneute Abholung", () => {
    const { pos, repairs } = database();
    const part = repairs.savePart(null, { ...sanitizePart({ name: "Display iPhone 13", category: "part", priceCents: 8900, vatRate: 19 }), stock: 3 }, actor);
    const order = repairs.create(
      { id: null, data: { name: "Ali", phone: "0170", email: "" } },
      sanitizeIntake({ device: { brand: "Apple", model: "iPhone 13" }, problem: "Display", depositCents: 2000 }),
      null, actor, ctx(),
    );
    const deposit = pos.receipts({ query: "iPhone" }).find((r) => r.kind === "deposit")!;
    expect(deposit.dueCents).toBe(2000);
    // Auftrag mit Anzahlung lässt sich nicht mehr löschen
    expect(() => repairs.remove(order.id, actor)).toThrow(RepairError);

    repairs.addItem(order.id, { kind: "part", partId: part.id, name: part.name, qty: 1, unitCents: 8900, vatRate: 19 }, actor);
    repairs.setStatus(order.id, "ready", "", actor);
    const receipt = pos.checkout(
      { lines: [{ source: "repairs", kind: "order", refId: order.id, name: "", qty: 1, unitCents: 0, vatRate: 0 }], payments: [{ method: "cash", cents: 10000 }], customer: null },
      ctx(),
    )!;
    expect(receipt.depositCents).toBe(2000);
    expect(receipt.dueCents).toBe(6900);
    expect(receipt.changeCents).toBe(3100);
    expect(receipt.customer?.name).toBe("Ali");
    let picked = repairs.get(order.id)!;
    expect(picked.status).toBe("pickedUp");
    expect(picked.invoice?.number).toBe(receipt.number);
    expect(picked.invoice?.warrantyUntil).not.toBe("");

    pos.cancel(receipt.number, ctx());
    picked = repairs.get(order.id)!;
    expect(picked.status).toBe("ready");
    expect(picked.invoice?.canceledBy).toBeTruthy();

    const again = pos.checkout(
      { lines: [{ source: "repairs", kind: "order", refId: order.id, name: "", qty: 1, unitCents: 0, vatRate: 0 }], payments: [{ method: "cash", cents: 6900 }], customer: null },
      ctx(),
    )!;
    expect(repairs.get(order.id)!.invoice?.number).toBe(again.number);
    // Anzahlung ist verrechnet und kann nicht mehr einzeln storniert werden
    expect(() => pos.cancel(deposit.number, ctx())).toThrow(RepairError);
  });

  it("verkauft Zubehör und Gebrauchtgeräte aus dem Modul", () => {
    const { pos, repairs } = database();
    const case_ = repairs.savePart(null, { ...sanitizePart({ name: "Hülle", category: "accessory", priceCents: 1990, vatRate: 19 }), stock: 5 }, actor);
    const used = repairs.buyDevice(sanitizeUsed({ device: { brand: "Samsung", model: "S22" }, purchaseCents: 15000, priceCents: 24900, payout: "cash", seller: { name: "Ben" } }), null, actor);
    expect(pos.state().movesCents).toBe(-15000);

    const articles = pos.articles("", ["repairs"]);
    expect(articles.some((a) => a.kind === "used" && a.refId === used.id)).toBe(true);
    expect(articles.some((a) => a.kind === "part" && a.refId === case_.id)).toBe(true);

    const receipt = pos.checkout(
      {
        lines: [
          { source: "repairs", kind: "part", refId: case_.id, name: "Hülle", qty: 2, unitCents: 1990, vatRate: 19 },
          { source: "repairs", kind: "used", refId: used.id, name: "", qty: 1, unitCents: 24900, vatRate: 19 },
        ],
        payments: [{ method: "cash", cents: 28880 }],
        customer: { id: null, name: "Cem", address: "", phone: "", email: "" },
      },
      ctx(),
    )!;
    expect(receipt.lines[1]!.margin).toBe(true);
    expect(receipt.totals.vat.find((v) => v.rate === 0)?.netCents).toBe(24900);
    expect(repairs.part(case_.id)!.stock).toBe(3);
    expect(repairs.usedDevice(used.id)!.status).toBe("sold");
    // Ein Gerät kann nicht zweimal verkauft werden
    expect(() => pos.checkout({ lines: [{ source: "repairs", kind: "used", refId: used.id, name: "", qty: 1, unitCents: 1, vatRate: 0 }], payments: [{ method: "cash", cents: 1 }], customer: null }, ctx())).toThrow(RepairError);

    pos.cancel(receipt.number, ctx());
    expect(repairs.part(case_.id)!.stock).toBe(5);
    expect(repairs.usedDevice(used.id)!.status).toBe("inStock");
  });
});

describe("Kasse: Sprachen", async () => {
  const names = ["de", "en", "tr", "ar", "fr", "es", "it", "pl", "ru", "uk"];
  const dicts = await Promise.all(names.map(async (n) => [n, (await import(`../src/pos/lang/${n}.ts`))[n]] as const));
  const paths = (node: unknown, prefix = ""): string[] =>
    typeof node === "string" ? [prefix] : Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
  const get = (d: unknown, p: string) => p.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], d);
  const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
  const base = paths(dicts[0][1]);

  it.each(dicts.slice(1))("%s hat alle Texte mit denselben Platzhaltern", (_, dict) => {
    expect(paths(dict).sort()).toEqual([...base].sort());
    for (const p of base) {
      const text = get(dict, p) as string;
      expect(text.trim(), p).not.toBe("");
      expect(vars(text), p).toBe(vars(get(dicts[0][1], p) as string));
    }
  });
});

describe("Kasse: Kassenplätze, Artikelstamm und Scanner", () => {
  const at = (register: string) => ({ ...ctx(), actor: { ...actor, register } });

  it("übernimmt Schnellartikel als Kacheln und behält die Kasse für Handy-Shops", () => {
    const { pos, db } = database((d) => {
      d.exec("INSERT INTO installed_apps (app_id) VALUES ('handy-it')");
      d.prepare("INSERT INTO settings (key, value) VALUES ('pos', ?)").run(
        JSON.stringify({ methods: ["cash", "card"], quickItems: [{ id: "q1", name: "Kaffee", priceCents: 250, vatRate: 19 }], footer: "Danke" }),
      );
    });
    expect(pos.items()).toMatchObject([{ id: "q1", name: "Kaffee", tile: true, stock: null }]);
    expect(pos.settings().footer).toBe("Danke");
    expect(pos.settings()).not.toHaveProperty("quickItems");
    expect(db.prepare("SELECT app_id FROM installed_apps ORDER BY app_id").all().map((r) => r.app_id)).toEqual(["handy-it", "kasse"]);
    expect(pos.articles("", []).map((a) => a.name)).toEqual(["Kaffee"]);
  });

  it("führt Bargeld und Abschluss je Kassenplatz, Belegnummern bleiben fortlaufend", () => {
    const { pos } = database();
    const second = pos.saveRegister(null, "Kasse 2");
    expect(pos.registers().map((r) => r.name)).toEqual(["Kasse 1", "Kasse 2"]);
    const a = pos.checkout({ lines: [line("Brot", 300)], payments: [{ method: "cash", cents: 300 }], customer: null }, at("main"))!;
    const b = pos.checkout({ lines: [line("Milch", 150)], payments: [{ method: "cash", cents: 150 }], customer: null }, at(second.id))!;
    expect([a.number, b.number]).toEqual(["RE-2026-0001", "RE-2026-0002"]);
    expect(b.register).toEqual(second);
    pos.addMove({ kind: "in", method: "cash", cents: 5000, note: "" }, { ...actor, register: second.id });
    expect(pos.state("main").expectedCents).toBe(300);
    expect(pos.state(second.id).expectedCents).toBe(5150);
    const z = pos.close({ countedCents: 5150, bankCents: 0, note: "" }, { ...actor, register: second.id });
    expect(z.register).toEqual(second);
    expect(pos.state(second.id).receipts).toBe(0);
    expect(pos.state("main").receipts).toBe(1);
    expect(pos.receipts({ register: second.id, query: "Milch" }).map((r) => r.number)).toEqual(["RE-2026-0002"]);
    expect(() => pos.removeRegister(second.id)).toThrow(PosError);
    expect(() => pos.removeRegister("main")).toThrow(PosError);
    const empty = pos.saveRegister(null, "Kasse 3");
    pos.removeRegister(empty.id);
    expect(pos.registers()).toHaveLength(2);
    // Unbekannter Kassenplatz bucht auf Kasse 1
    expect(pos.checkout({ lines: [line("Ei", 50)], payments: [{ method: "cash", cents: 50 }], customer: null }, at("weg"))!.register!.id).toBe("main");
  });

  it("findet Artikel per Barcode und führt den Bestand", () => {
    const { pos } = database();
    const cola = pos.saveItem(null, { name: "Cola 0,5 l", barcode: "4006381333931", code: "", group: "Getränke", priceCents: 199, vatRate: 19, tile: false, stock: 24 });
    expect(() => pos.saveItem(null, { name: "Doppelt", barcode: "4006381333931", code: "", group: "", priceCents: 1, vatRate: 19, tile: false, stock: null })).toThrow(PosError);
    const [hit] = pos.scan("4006381333931", []);
    expect(hit).toMatchObject({ source: "pos", kind: "item", refId: cola.id, priceCents: 199, stock: 24 });
    expect(pos.articles("", [])).toEqual([]);
    expect(pos.articles("getr", []).map((a) => a.name)).toEqual(["Cola 0,5 l"]);
    const sale = pos.checkout({ lines: [{ ...line("Cola 0,5 l", 199, 3), refId: cola.id }], payments: [{ method: "cash", cents: 597 }], customer: null }, ctx())!;
    expect(pos.item(cola.id)!.stock).toBe(21);
    pos.cancel(sale.number, ctx());
    expect(pos.item(cola.id)!.stock).toBe(24);
    pos.removeItem(cola.id);
    expect(() => pos.checkout({ lines: [{ ...line("Cola", 199), refId: cola.id }], payments: [{ method: "cash", cents: 199 }], customer: null }, ctx())).toThrow(PosError);
  });

  it("scannt Teile, Gebrauchtgeräte und Aufträge im Handy-Modul", () => {
    const { pos, repairs } = database();
    repairs.savePart(null, { ...sanitizePart({ name: "Panzerglas", sku: "PG-13", priceCents: 1990, category: "accessory" }), stock: 3 }, actor);
    repairs.buyDevice(sanitizeUsed({ device: { brand: "Apple", model: "iPhone 12", serial: "356938035643809" }, purchaseCents: 20000, priceCents: 34900, payout: "cash", seller: { name: "Ali" } }), null, actor);
    expect(pos.scan("pg-13", ["repairs"]).map((a) => a.name)).toEqual(["Panzerglas"]);
    expect(pos.scan("356938035643809", ["repairs"])[0]).toMatchObject({ kind: "used", single: true });
    expect(pos.scan("356938035643809", [])).toEqual([]);
  });

  it("liefert Warengruppen aller Module, Artikelnummern, Rücknahmen, Rabatt und Notiz", () => {
    const { pos, repairs } = database();
    const burger = pos.saveItem(null, { name: "Hamburger Chili Cheese", barcode: "", code: "101", group: "Burger", priceCents: 890, vatRate: 7, tile: true, stock: 10 });
    expect(() => pos.saveItem(null, { name: "Doppelt", barcode: "", code: "101", group: "", priceCents: 1, vatRate: 7, tile: false, stock: null })).toThrow(PosError);
    repairs.savePart(null, { ...sanitizePart({ name: "Ladekabel", sku: "LK-1", priceCents: 1500, category: "accessory" }), stock: 2 }, actor);
    const catalog = pos.catalog(["repairs"]);
    expect(catalog.map((a) => [a.name, a.group])).toEqual([["Hamburger Chili Cheese", "Burger"], ["Ladekabel", "@repairs.accessory"]]);
    expect(pos.catalog([]).map((a) => a.name)).toEqual(["Hamburger Chili Cheese"]);
    expect(pos.scan("101", [])[0]).toMatchObject({ refId: burger.id, code: "101" });
    // Rabatt: Preis ist schon reduziert, der Beleg merkt sich den Listenpreis
    const discounted = sanitizeLine({ source: "pos", kind: "item", refId: burger.id, name: "Hamburger Chili Cheese", qty: 2, unitCents: 801, vatRate: 7, discountPct: 10, listCents: 890 })!;
    const sale = pos.checkout({ lines: [discounted], payments: [{ method: "cash", cents: 1602 }], customer: null, note: "Ohne Zwiebeln" }, ctx())!;
    expect(sale.totals.grossCents).toBe(1602);
    expect(sale.lines[0]).toMatchObject({ discountPct: 10, listCents: 890 });
    expect(sale.note).toBe("Ohne Zwiebeln");
    expect(pos.item(burger.id)!.stock).toBe(8);
    // Rücknahme mit negativer Menge: Geld raus, Bestand zurück
    const back = sanitizeLine({ source: "pos", kind: "item", refId: burger.id, name: "Hamburger Chili Cheese", qty: -1, unitCents: 890, vatRate: 7 })!;
    const refund = pos.checkout({ lines: [back], payments: [{ method: "cash", cents: -890 }], customer: null }, ctx())!;
    expect(refund.dueCents).toBe(-890);
    expect(pos.item(burger.id)!.stock).toBe(9);
    // Module rechnen ihre Posten selbst: keine negative Menge
    expect(sanitizeLine({ source: "repairs", kind: "part", refId: "x", name: "Teil", qty: -2, unitCents: 100, vatRate: 19 })!.qty).toBe(0.001);
  });
});
