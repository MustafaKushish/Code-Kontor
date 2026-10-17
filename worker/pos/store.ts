import {
  DEFAULT_POS_SETTINGS, MAIN_REGISTER, PAY_METHODS, POS_APP_ID, addVat, computeTotals, emptyByMethod, receiptNumber, sanitizePosSettings, settlePayments,
  type CashMove, type CashMoveKind, type CashState, type Closing, type PayMethod, type Payment, type PosArticle, type PosCustomer, type PosLine,
  type PosItem, type PosRef, type PosRegister, type PosSettings, type PosSource, type Receipt, type Totals, type ReceiptCompany, type ReceiptKind, type ReceiptRow,
} from "../../shared/pos";
import { bucketKeys, type InsightBucket, type Range, type SalesStats } from "../../shared/insights";

// Die Kasse der Firma: ein Nummernkreis, ein Kassenbuch, ein Tagesabschluss für alle Systeme.
// Läuft im Durable Object der Firma; Module melden sich mit register() an und bekommen
// ihre Posten beim Bezahlen und beim Storno zurück (in derselben Transaktion).

export const POS_MIGRATIONS = `
  CREATE TABLE pos_receipts (
    number TEXT PRIMARY KEY, year INTEGER NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL,
    issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), cashier TEXT,
    total_cents INTEGER NOT NULL, due_cents INTEGER NOT NULL, payments TEXT NOT NULL,
    customer_name TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '', data TEXT NOT NULL,
    cancels TEXT, canceled_by TEXT, closing INTEGER,
    UNIQUE (year, seq)
  );
  CREATE INDEX pos_receipts_issued ON pos_receipts(issued_at);
  CREATE INDEX pos_receipts_closing ON pos_receipts(closing);
  CREATE TABLE pos_refs (number TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, ref_id TEXT NOT NULL);
  CREATE INDEX pos_refs_ref ON pos_refs(source, ref_id);
  CREATE INDEX pos_refs_number ON pos_refs(number);
  CREATE TABLE pos_cash_moves (
    id TEXT PRIMARY KEY, at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    kind TEXT NOT NULL, method TEXT NOT NULL, cents INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '',
    source TEXT, ref_id TEXT, user_name TEXT, closing INTEGER
  );
  CREATE INDEX pos_cash_moves_closing ON pos_cash_moves(closing);
  CREATE INDEX pos_cash_moves_ref ON pos_cash_moves(source, ref_id);
  CREATE TABLE pos_closings (
    number INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), data TEXT NOT NULL, user_name TEXT
  );`;

/** Kassenplätze und Artikelstamm, als eigene Schritte nach den Grundtabellen (Modul „pos“). */
export const POS_MODULE_MIGRATIONS: (string | ((sql: SqlStorage) => void))[] = [
  `CREATE TABLE pos_registers (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
   INSERT INTO pos_registers (id, name) VALUES ('main', 'Kasse 1');
   ALTER TABLE pos_receipts ADD COLUMN register_id TEXT NOT NULL DEFAULT 'main';
   ALTER TABLE pos_cash_moves ADD COLUMN register_id TEXT NOT NULL DEFAULT 'main';
   ALTER TABLE pos_closings ADD COLUMN register_id TEXT NOT NULL DEFAULT 'main';
   CREATE INDEX pos_receipts_register ON pos_receipts(register_id, closing);
   CREATE INDEX pos_cash_moves_register ON pos_cash_moves(register_id, closing);
   CREATE TABLE pos_items (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, barcode TEXT NOT NULL DEFAULT '', item_group TEXT NOT NULL DEFAULT '',
     price_cents INTEGER NOT NULL, vat_rate REAL NOT NULL, tile INTEGER NOT NULL DEFAULT 0, stock INTEGER,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE UNIQUE INDEX pos_items_barcode ON pos_items(barcode) WHERE barcode <> '';
   CREATE INDEX pos_items_name ON pos_items(name);`,
  // Schnellartikel aus den Einstellungen werden Kacheln im Artikelstamm; wer den Handy- & IT-Service
  // schon nutzt, behält die Kasse (sie war bisher dabei).
  (sql) => {
    const row = sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'pos'").toArray()[0];
    if (row) {
      const { quickItems, ...rest } = JSON.parse(row.value) as { quickItems?: { id?: string; name?: string; priceCents?: number; vatRate?: number }[] };
      for (const q of quickItems ?? []) {
        if (!q.name) continue;
        sql.exec(
          "INSERT INTO pos_items (id, name, price_cents, vat_rate, tile) VALUES (?, ?, ?, ?, 1)",
          q.id || crypto.randomUUID(), q.name, Math.round(q.priceCents ?? 0), q.vatRate ?? 19,
        );
      }
      sql.exec("UPDATE settings SET value = ? WHERE key = 'pos'", JSON.stringify(rest));
    }
    if (sql.exec("SELECT 1 FROM installed_apps WHERE app_id = 'handy-it'").toArray().length)
      sql.exec("INSERT OR IGNORE INTO installed_apps (app_id) VALUES (?)", POS_APP_ID);
  },
  // Kurze Artikelnummer zum Eintippen an der Kasse
  `ALTER TABLE pos_items ADD COLUMN code TEXT NOT NULL DEFAULT '';
   CREATE UNIQUE INDEX pos_items_code ON pos_items(code) WHERE code <> '';`,
];

export type PosErrorCode =
  | "notFound" | "emptyCart" | "unknownSource" | "alreadyCanceled" | "cannotCancel" | "paymentMissing" | "paymentTooLow"
  | "changeWithoutCash" | "paymentMethod" | "bankTooHigh" | "nothingToClose" | "barcodeTaken" | "codeTaken" | "registerInUse" | "checkFields";

export class PosError extends Error {
  constructor(public code: PosErrorCode) {
    super(code);
  }
}

export interface Actor {
  id: string | null;
  name: string | null;
  /** Kassenplatz des Geräts, an dem gebucht wird; ohne Angabe Kasse 1 */
  register?: string;
}

/** Was die Kasse zum Buchen braucht und nicht selbst kennt. */
export interface PosContext {
  actor: Actor;
  company: ReceiptCompany;
  currency: string;
  /** Heute (YYYY-MM-DD), für Nummernkreis und Garantie */
  today: string;
  /** Zusätze für Module, z. B. { loanerReturned: true } */
  options?: Record<string, unknown>;
}

/** Ergebnis, wenn ein Modul einen Posten aufbereitet. */
export interface Prepared {
  lines: PosLine[];
  refs?: PosRef[];
  depositCents?: number;
  customer?: PosCustomer;
}

/** Schnittstelle eines Moduls zur Kasse. Alle Aufrufe laufen in der Transaktion des Belegs. */
export interface PosModule {
  /** Posten prüfen: Preise, Bestand, Aufträge werden zu ihren Positionen. Wirft Fehler des Moduls. */
  prepare(line: PosLine, ctx: PosContext): Prepared;
  /** Nach dem Buchen (receipt = null, wenn nichts zu zahlen war). */
  booked(receipt: Receipt | null, lines: PosLine[], refs: PosRef[], ctx: PosContext): void;
  /** Beleg wurde storniert: Bestand zurück, Status zurück. */
  canceled(original: Receipt, cancel: Receipt, actor: Actor): void;
  /** Artikel für die Suche in der Kasse. */
  articles(query: string): PosArticle[];
  /** Alles, was das Modul an der Kasse anbietet, mit Warengruppe (für die Leiste und das Raster). */
  catalog?(): PosArticle[];
  /** Artikel zu einem gescannten Code (Barcode, IMEI, Auftragsnummer), genau passend. */
  scan?(code: string): PosArticle[];
}

type Row = Record<string, string | number | null>;
const S = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

const itemOf = (r: Row): PosItem => ({
  id: S(r.id), name: S(r.name), barcode: S(r.barcode), code: S(r.code), group: S(r.item_group), priceCents: Number(r.price_cents),
  vatRate: Number(r.vat_rate), tile: Number(r.tile) === 1, stock: r.stock === null ? null : Number(r.stock),
});

const itemArticle = (i: PosItem): PosArticle => ({
  source: "pos", kind: "item", refId: i.id, name: i.name, detail: [i.code ? `Nr. ${i.code}` : "", i.group, i.barcode].filter(Boolean).join(" · "),
  priceCents: i.priceCents, vatRate: i.vatRate, tile: i.tile, group: i.group, ...(i.code ? { code: i.code } : {}), ...(i.stock === null ? {} : { stock: i.stock }),
});

export interface BookInput {
  kind: ReceiptKind;
  lines: PosLine[];
  refs: PosRef[];
  depositCents: number;
  payments: Payment[];
  customer: PosCustomer | null;
  cancels?: string | null;
  note?: string;
}

export class PosStore {
  private modules = new Map<PosSource, PosModule>();

  constructor(private sql: SqlStorage, private transaction: <T>(fn: () => T) => T) {}

  register(source: PosSource, module: PosModule) {
    this.modules.set(source, module);
  }

  // ---------- Einstellungen ----------

  settings(): PosSettings {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'pos'").toArray()[0];
    return row ? { ...DEFAULT_POS_SETTINGS, ...(JSON.parse(row.value) as Partial<PosSettings>) } : DEFAULT_POS_SETTINGS;
  }

  saveSettings(settings: PosSettings): PosSettings {
    const clean = sanitizePosSettings(settings);
    this.sql.exec(
      `INSERT INTO settings (key, value) VALUES ('pos', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      JSON.stringify(clean),
    );
    return clean;
  }

  // ---------- Verkaufen ----------

  /** Kacheln und Artikel der Kasse sowie der installierten Module, passend zur Suche. */
  articles(query: string, sources: PosSource[]): PosArticle[] {
    const q = query.trim();
    const own = q
      ? this.items(q, 60)
      : this.sql.exec<Row>("SELECT * FROM pos_items WHERE tile = 1 ORDER BY item_group, name LIMIT 60").toArray().map(itemOf);
    const fromModules = sources.flatMap((s) => this.modules.get(s)?.articles(query) ?? []);
    return [...own.map(itemArticle), ...fromModules];
  }

  /** Alles zum Antippen: der ganze Artikelstamm und was die installierten Module anbieten, mit Warengruppen. */
  catalog(sources: PosSource[]): PosArticle[] {
    const own = this.sql.exec<Row>("SELECT * FROM pos_items ORDER BY item_group, name LIMIT 2000").toArray().map(itemOf).map(itemArticle);
    return [...own, ...sources.flatMap((s) => this.modules.get(s)?.catalog?.() ?? [])];
  }

  /** Gescannter oder eingetippter Code: Barcode oder Artikelnummer im Artikelstamm, sonst fragen die Module (z. B. IMEI). */
  scan(code: string, sources: PosSource[]): PosArticle[] {
    const own = this.sql
      .exec<Row>("SELECT * FROM pos_items WHERE barcode = ? OR (code <> '' AND code = upper(?))", code, code)
      .toArray().map(itemOf).map(itemArticle);
    return [...own, ...sources.flatMap((s) => this.modules.get(s)?.scan?.(code) ?? [])];
  }

  // ---------- Artikelstamm ----------

  items(query = "", limit = 500): PosItem[] {
    const q = `%${query.trim().toLowerCase()}%`;
    return this.sql
      .exec<Row>(
        "SELECT * FROM pos_items WHERE lower(name) LIKE ? OR barcode LIKE ? OR lower(code) LIKE ? OR lower(item_group) LIKE ? ORDER BY item_group, name LIMIT ?",
        q, q, q, q, Math.min(Math.max(limit, 1), 2000),
      )
      .toArray()
      .map(itemOf);
  }

  item(id: string): PosItem | null {
    const r = this.sql.exec<Row>("SELECT * FROM pos_items WHERE id = ?", id).toArray()[0];
    return r ? itemOf(r) : null;
  }

  saveItem(id: string | null, data: Omit<PosItem, "id">): PosItem {
    if (data.barcode) {
      const taken = this.sql.exec<Row>("SELECT id FROM pos_items WHERE barcode = ? AND id <> ?", data.barcode, id ?? "").toArray()[0];
      if (taken) throw new PosError("barcodeTaken");
    }
    if (data.code) {
      const taken = this.sql.exec<Row>("SELECT id FROM pos_items WHERE code = ? AND id <> ?", data.code, id ?? "").toArray()[0];
      if (taken) throw new PosError("codeTaken");
    }
    if (id && !this.item(id)) throw new PosError("notFound");
    const itemId = id ?? crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO pos_items (id, name, barcode, code, item_group, price_cents, vat_rate, tile, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, barcode = excluded.barcode, code = excluded.code, item_group = excluded.item_group,
         price_cents = excluded.price_cents, vat_rate = excluded.vat_rate, tile = excluded.tile, stock = excluded.stock`,
      itemId, data.name, data.barcode, data.code, data.group, data.priceCents, data.vatRate, data.tile ? 1 : 0, data.stock,
    );
    return this.item(itemId)!;
  }

  /** Löschen ist unkritisch: Belege enthalten Name und Preis selbst. */
  removeItem(id: string): void {
    this.sql.exec("DELETE FROM pos_items WHERE id = ?", id);
  }

  private moveStock(lines: PosLine[], sign: 1 | -1) {
    for (const l of lines) {
      if (l.source !== "pos" || !l.refId) continue;
      this.sql.exec("UPDATE pos_items SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL", sign * l.qty, l.refId);
    }
  }

  // ---------- Kassenplätze ----------

  registers(): PosRegister[] {
    return this.sql.exec<Row>("SELECT id, name FROM pos_registers ORDER BY created_at").toArray().map((r) => ({ id: S(r.id), name: S(r.name) }));
  }

  /** Kassenplatz nach ID; unbekannt (z. B. gelöscht) = Kasse 1. */
  registerOf(id: string | undefined): PosRegister {
    const r = id ? this.sql.exec<Row>("SELECT id, name FROM pos_registers WHERE id = ?", id).toArray()[0] : undefined;
    if (r) return { id: S(r.id), name: S(r.name) };
    const main = this.sql.exec<Row>("SELECT id, name FROM pos_registers WHERE id = 'main'").toArray()[0];
    return main ? { id: S(main.id), name: S(main.name) } : MAIN_REGISTER;
  }

  saveRegister(id: string | null, name: string): PosRegister {
    if (!name) throw new PosError("checkFields");
    if (id) {
      if (!this.sql.exec("SELECT 1 FROM pos_registers WHERE id = ?", id).toArray().length) throw new PosError("notFound");
      this.sql.exec("UPDATE pos_registers SET name = ? WHERE id = ?", name, id);
      return { id, name };
    }
    const newId = crypto.randomUUID();
    this.sql.exec("INSERT INTO pos_registers (id, name) VALUES (?, ?)", newId, name);
    return { id: newId, name };
  }

  /** Nur leere Kassenplätze lassen sich entfernen; Kasse 1 bleibt immer. */
  removeRegister(id: string): void {
    if (id === "main") throw new PosError("registerInUse");
    const used = ["pos_receipts", "pos_cash_moves", "pos_closings"].some(
      (t) => this.sql.exec(`SELECT 1 FROM ${t} WHERE register_id = ? LIMIT 1`, id).toArray().length > 0,
    );
    if (used) throw new PosError("registerInUse");
    this.sql.exec("DELETE FROM pos_registers WHERE id = ?", id);
  }

  /**
   * Bezahlen: Posten prüfen (Module rechnen selbst), Beleg mit fortlaufender Nummer buchen,
   * Module abschließen lassen. Gibt null zurück, wenn nichts zu zahlen war (z. B. Abholung ohne Kosten).
   */
  /** Wie checkout, aber ohne zu buchen: was die Systeme aus ihren Posten machen und was zu zahlen ist. */
  quote(input: PosLine[], ctx: PosContext): { lines: PosLine[]; totals: Totals; depositCents: number; dueCents: number; customer: PosCustomer | null } {
    const lines: PosLine[] = [];
    let depositCents = 0;
    let customer: PosCustomer | null = null;
    for (const line of input) {
      const module = this.modules.get(line.source);
      if (!module) throw new PosError("unknownSource");
      const prepared = module.prepare(line, ctx);
      lines.push(...prepared.lines);
      depositCents += prepared.depositCents ?? 0;
      customer ??= prepared.customer ?? null;
    }
    const totals = computeTotals(lines, this.settings().smallBusiness);
    return { lines, totals, depositCents, dueCents: totals.grossCents - depositCents, customer };
  }

  checkout(input: { lines: PosLine[]; payments: Payment[]; customer: PosCustomer | null; note?: string }, ctx: PosContext): Receipt | null {
    if (!input.lines.length) throw new PosError("emptyCart");
    return this.transaction(() => {
      const lines: PosLine[] = [];
      const refs: PosRef[] = [];
      let depositCents = 0;
      let customer = input.customer;
      for (const line of input.lines) {
        if (line.source === "pos") {
          if (line.refId && !this.item(line.refId)) throw new PosError("notFound");
          lines.push({ ...line, kind: "item" });
          continue;
        }
        const module = this.modules.get(line.source);
        if (!module) throw new PosError("unknownSource");
        const prepared = module.prepare(line, ctx);
        lines.push(...prepared.lines);
        refs.push(...(prepared.refs ?? []));
        depositCents += prepared.depositCents ?? 0;
        if (prepared.customer && !customer?.name) customer = { ...prepared.customer, ...(customer?.address ? { address: customer.address } : {}) };
      }
      const empty = lines.every((l) => Math.round(l.qty * l.unitCents) === 0) && depositCents === 0;
      const receipt = empty ? null : this.book({ kind: "sale", lines, refs, depositCents, payments: input.payments, customer, note: input.note }, ctx);
      this.moveStock(lines, -1);
      for (const source of new Set([...lines.map((l) => l.source), ...refs.map((r) => r.source)])) {
        if (source === "pos") continue;
        this.modules.get(source)!.booked(receipt, lines.filter((l) => l.source === source), refs.filter((r) => r.source === source), ctx);
      }
      return receipt;
    });
  }

  /** Beleg buchen (auch für Module, z. B. Anzahlung bei der Annahme). Nur innerhalb einer Transaktion aufrufen. */
  book(input: BookInput, ctx: PosContext): Receipt {
    const settings = this.settings();
    const totals = computeTotals(input.lines, settings.smallBusiness);
    const dueCents = totals.grossCents - input.depositCents;
    const settled = settlePayments(dueCents, input.payments, input.kind === "cancel" ? PAY_METHODS : settings.methods);
    if (!settled.ok) throw new PosError(settled.problem);
    const year = Number(ctx.today.slice(0, 4));
    const seq = (this.sql.exec<{ n: number | null }>("SELECT MAX(seq) AS n FROM pos_receipts WHERE year = ?", year).one().n ?? 0) + 1;
    const number = receiptNumber(year, seq);
    const issuedAt = new Date().toISOString();
    const register = this.registerOf(ctx.actor.register);
    const receipt: Receipt = {
      number, kind: input.kind, issuedAt, cashier: ctx.actor.name, company: ctx.company, currency: ctx.currency, customer: input.customer,
      lines: input.lines, refs: input.refs, totals, depositCents: input.depositCents, dueCents,
      payments: settled.payments, givenCents: settled.givenCents, changeCents: settled.changeCents,
      smallBusiness: settings.smallBusiness, cancels: input.cancels ?? null, canceledBy: null, closing: null, register, tse: null,
      ...(input.note ? { note: input.note } : {}),
    };
    const label = input.refs.map((r) => r.label).filter(Boolean).join(", ") || input.lines.slice(0, 3).map((l) => l.name).join(", ");
    this.sql.exec(
      `INSERT INTO pos_receipts (number, year, seq, kind, issued_at, cashier, total_cents, due_cents, payments, customer_name, label, data, cancels, register_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      number, year, seq, input.kind, issuedAt, ctx.actor.name, totals.grossCents, dueCents, JSON.stringify(receipt.payments),
      input.customer?.name ?? "", label.slice(0, 200), JSON.stringify(receipt), input.cancels ?? null, register.id,
    );
    for (const ref of input.refs) this.sql.exec("INSERT INTO pos_refs (number, source, kind, ref_id) VALUES (?, ?, ?, ?)", number, ref.source, ref.kind, ref.refId);
    return receipt;
  }

  // ---------- Belege ----------

  receipt(number: string): Receipt | null {
    const r = this.sql.exec<Row>("SELECT data, canceled_by, closing FROM pos_receipts WHERE number = ?", number).toArray()[0];
    return r ? { ...(JSON.parse(S(r.data)) as Receipt), canceledBy: r.canceled_by === null ? null : S(r.canceled_by), closing: r.closing === null ? null : Number(r.closing) } : null;
  }

  /** Belege eines Tages (Ortszeit) oder passend zur Suche, neueste zuerst. */
  receipts(filter: { day?: string; query?: string; closing?: number; register?: string }): ReceiptRow[] {
    const local = berlinDay;
    let rows: Row[];
    if (filter.closing !== undefined) {
      rows = this.sql.exec<Row>("SELECT * FROM pos_receipts WHERE closing = ? ORDER BY issued_at DESC", filter.closing).toArray();
    } else if (filter.query?.trim()) {
      const q = `%${filter.query.trim().toLowerCase()}%`;
      rows = this.sql
        .exec<Row>("SELECT * FROM pos_receipts WHERE lower(number) LIKE ? OR lower(customer_name) LIKE ? OR lower(label) LIKE ? ORDER BY issued_at DESC LIMIT 200", q, q, q)
        .toArray();
    } else {
      const day = filter.day ?? local(new Date().toISOString());
      const from = new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString();
      const to = new Date(Date.parse(`${day}T00:00:00Z`) + 2 * 86_400_000).toISOString();
      rows = this.sql
        .exec<Row>("SELECT * FROM pos_receipts WHERE issued_at >= ? AND issued_at < ? ORDER BY issued_at DESC", from, to)
        .toArray()
        .filter((r) => local(S(r.issued_at)) === day);
    }
    if (filter.register) rows = rows.filter((r) => S(r.register_id) === filter.register);
    return rows.map((r) => ({
      number: S(r.number), kind: S(r.kind) as ReceiptKind, registerId: S(r.register_id), issuedAt: S(r.issued_at), cashier: r.cashier === null ? null : S(r.cashier),
      totalCents: Number(r.total_cents), dueCents: Number(r.due_cents), payments: JSON.parse(S(r.payments)) as Payment[],
      customerName: S(r.customer_name), label: S(r.label), cancels: r.cancels === null ? null : S(r.cancels),
      canceledBy: r.canceled_by === null ? null : S(r.canceled_by), closing: r.closing === null ? null : Number(r.closing),
    }));
  }

  /** Gibt es Belege zu einem Vorgang eines Moduls (z. B. Anzahlung zu einem Auftrag)? */
  hasReceipts(source: PosSource, refId: string): boolean {
    return this.sql.exec("SELECT 1 FROM pos_refs WHERE source = ? AND ref_id = ? LIMIT 1", source, refId).toArray().length > 0;
  }

  /**
   * Storno: Gegenbeleg mit umgekehrten Beträgen, das Geld geht über dieselben Zahlarten zurück.
   * Nichts wird gelöscht; das Original bekommt nur den Verweis auf den Stornobeleg.
   */
  cancel(number: string, ctx: PosContext): Receipt {
    return this.transaction(() => {
      const original = this.receipt(number);
      if (!original) throw new PosError("notFound");
      if (original.kind === "cancel") throw new PosError("cannotCancel");
      if (original.canceledBy) throw new PosError("alreadyCanceled");
      const lines = original.lines.map((l) => ({ ...l, qty: -l.qty }));
      const payments = original.payments.map((p) => ({ ...p, cents: -p.cents }));
      const cancel = this.book(
        { kind: "cancel", lines, refs: original.refs, depositCents: -original.depositCents, payments, customer: original.customer, cancels: original.number },
        { ...ctx, company: original.company, currency: original.currency },
      );
      this.sql.exec("UPDATE pos_receipts SET canceled_by = ? WHERE number = ?", cancel.number, number);
      this.moveStock(original.lines, 1);
      for (const source of new Set([...original.lines.map((l) => l.source), ...original.refs.map((r) => r.source)])) {
        if (source === "pos") continue;
        this.modules.get(source)?.canceled(original, cancel, ctx.actor);
      }
      return cancel;
    });
  }

  // ---------- Auswertung ----------

  /** Umsatz im Zeitraum (Tage nach deutscher Ortszeit) für die zentrale Auswertung. */
  salesStats(range: Range, bucket: InsightBucket): SalesStats {
    const from = new Date(Date.parse(`${range.from}T00:00:00Z`) - 86_400_000).toISOString();
    const to = new Date(Date.parse(`${range.to}T00:00:00Z`) + 2 * 86_400_000).toISOString();
    const itemGroups = new Map(this.sql.exec<Row>("SELECT id, item_group FROM pos_items").toArray().map((r) => [S(r.id), S(r.item_group)]));
    const series = new Map(bucketKeys(range, bucket).map((k) => [k, 0]));
    const hours = Array.from({ length: 24 }, () => 0);
    const groups = new Map<string, { cents: number; qty: number }>();
    const articles = new Map<string, { name: string; group: string; cents: number; qty: number }>();
    const sources = new Map<PosSource, number>();
    const byMethod = emptyByMethod();
    const stats = { revenueCents: 0, receipts: 0, cancels: 0, cancelCents: 0 };

    for (const r of this.sql.exec<Row>("SELECT issued_at, kind, data, canceled_by FROM pos_receipts WHERE issued_at >= ? AND issued_at < ?", from, to).toArray()) {
      const at = S(r.issued_at);
      const day = berlinDay(at);
      if (day < range.from || day > range.to) continue;
      const receipt = JSON.parse(S(r.data)) as Receipt;
      for (const p of receipt.payments) byMethod[p.method] += p.cents;
      if (receipt.kind === "deposit") continue;
      if (receipt.kind === "cancel") {
        stats.cancels++;
        stats.cancelCents -= receipt.totals.grossCents;
      } else if (r.canceled_by === null) stats.receipts++;
      const gross = receipt.totals.grossCents;
      stats.revenueCents += gross;
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(new Date(at)));
      hours[hour] = (hours[hour] ?? 0) + gross;
      const key = bucket === "hour" ? String(hour).padStart(2, "0") : bucket === "day" ? day : day.slice(0, 7);
      series.set(key, (series.get(key) ?? 0) + gross);
      for (const l of receipt.lines) {
        const cents = Math.round(l.qty * l.unitCents);
        const group = l.source === "pos" ? (l.refId ? itemGroups.get(l.refId) ?? "" : "") : moduleGroup(l);
        const g = groups.get(group) ?? { cents: 0, qty: 0 };
        g.cents += cents;
        g.qty += l.qty;
        groups.set(group, g);
        const a = articles.get(`${group}\n${l.name}`) ?? { name: l.name, group, cents: 0, qty: 0 };
        a.cents += cents;
        a.qty += l.qty;
        articles.set(`${group}\n${l.name}`, a);
        sources.set(l.source, (sources.get(l.source) ?? 0) + cents);
      }
    }

    const ranked = <T extends { cents: number }>(list: T[], n: number) => list.filter((x) => x.cents !== 0).sort((a, b) => b.cents - a.cents).slice(0, n);
    return {
      ...stats, byMethod, hours,
      series: [...series.entries()].map(([key, cents]) => ({ key, cents })),
      groups: ranked([...groups.entries()].map(([group, g]) => ({ group, ...g })), 8),
      articles: ranked([...articles.values()], 8),
      sources: ranked([...sources.entries()].map(([source, cents]) => ({ source, cents })), 10),
    };
  }

  // ---------- Kassenbuch ----------

  /** Bewegung ohne Beleg. Positiv = in die Kasse. */
  addMove(move: { kind: CashMoveKind; method: PayMethod; cents: number; note: string; ref?: string; source?: PosSource; refId?: string }, actor: Actor): CashMove {
    const id = crypto.randomUUID();
    this.sql.exec(
      "INSERT INTO pos_cash_moves (id, kind, method, cents, note, ref, source, ref_id, user_name, register_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, move.kind, move.method, move.cents, move.note, move.ref ?? "", move.source ?? null, move.refId ?? null, actor.name,
      this.registerOf(actor.register).id,
    );
    return this.moves("id = ?", id)[0]!;
  }

  /** Bewegung eines Moduls nachträglich ändern, solange sie in keinem Abschluss steckt (z. B. Ankaufpreis korrigiert). */
  updateModuleMove(source: PosSource, refId: string, change: { cents: number; method: PayMethod; note: string }): void {
    this.sql.exec(
      "UPDATE pos_cash_moves SET cents = ?, method = ?, note = ? WHERE source = ? AND ref_id = ? AND closing IS NULL",
      change.cents, change.method, change.note, source, refId,
    );
  }

  /** Stand eines Kassenplatzes seit seinem letzten Abschluss (X-Bericht). */
  state(registerId?: string): CashState {
    const register = this.registerOf(registerId);
    const last = this.sql.exec<Row>("SELECT data, at FROM pos_closings WHERE register_id = ? ORDER BY number DESC LIMIT 1", register.id).toArray()[0];
    const lastClosing = last ? (JSON.parse(S(last.data)) as Closing) : null;
    const byMethod = emptyByMethod();
    let vat: CashState["vat"] = [];
    let receipts = 0;
    let cancels = 0;
    let salesCents = 0;
    for (const r of this.sql.exec<Row>("SELECT number, kind, data FROM pos_receipts WHERE closing IS NULL AND register_id = ?", register.id).toArray()) {
      const receipt = JSON.parse(S(r.data)) as Receipt;
      for (const p of receipt.payments) byMethod[p.method] += p.cents;
      if (receipt.kind === "cancel") cancels++;
      else receipts++;
      if (receipt.kind !== "deposit") {
        vat = addVat(vat, receipt.totals.vat);
        salesCents += receipt.totals.grossCents;
      }
    }
    const moves = this.moves("closing IS NULL AND register_id = ?", register.id);
    const otherPayouts = emptyByMethod();
    let movesCents = 0;
    for (const m of moves) {
      if (m.method === "cash") movesCents += m.cents;
      else otherPayouts[m.method] += m.cents;
    }
    const openingCents = lastClosing?.closingCents ?? 0;
    return {
      register, since: last ? S(last.at) : null, openingCents, receipts, cancels, byMethod, vat, salesCents, movesCents,
      expectedCents: openingCents + byMethod.cash + movesCents, otherPayouts, moves,
    };
  }

  /**
   * Tagesabschluss (Z-Bericht): gezähltes Bargeld, Differenz und Abschöpfung zur Bank werden gebucht,
   * alle offenen Belege und Bewegungen gehören danach zu diesem Abschluss.
   */
  close(input: { countedCents: number; bankCents: number; note: string }, actor: Actor): Closing {
    return this.transaction(() => {
      const state = this.state(actor.register);
      const register = state.register;
      if (state.receipts + state.cancels === 0 && state.moves.length === 0 && input.countedCents === state.expectedCents && input.bankCents === 0)
        throw new PosError("nothingToClose");
      if (input.bankCents < 0 || input.bankCents > input.countedCents) throw new PosError("bankTooHigh");
      const number = (this.sql.exec<{ n: number | null }>("SELECT MAX(number) AS n FROM pos_closings").one().n ?? 0) + 1;
      const differenceCents = input.countedCents - state.expectedCents;
      const here = { ...actor, register: register.id };
      if (differenceCents) this.addMove({ kind: "difference", method: "cash", cents: differenceCents, note: input.note }, here);
      if (input.bankCents) this.addMove({ kind: "bank", method: "cash", cents: -input.bankCents, note: "" }, here);
      const { moves: _, ...rest } = state;
      const closing: Closing = {
        ...rest, number, at: new Date().toISOString(), countedCents: input.countedCents, differenceCents, bankCents: input.bankCents,
        closingCents: input.countedCents - input.bankCents, userName: actor.name, note: input.note,
      };
      this.sql.exec(
        "INSERT INTO pos_closings (number, at, data, user_name, register_id) VALUES (?, ?, ?, ?, ?)",
        number, closing.at, JSON.stringify(closing), actor.name, register.id,
      );
      this.sql.exec("UPDATE pos_receipts SET closing = ? WHERE closing IS NULL AND register_id = ?", number, register.id);
      this.sql.exec("UPDATE pos_cash_moves SET closing = ? WHERE closing IS NULL AND register_id = ?", number, register.id);
      return closing;
    });
  }

  closings(limit = 60, registerId?: string): Closing[] {
    return this.sql
      .exec<{ data: string }>(
        `SELECT data FROM pos_closings ${registerId ? "WHERE register_id = ?" : ""} ORDER BY number DESC LIMIT ?`,
        ...(registerId ? [registerId] : []), Math.min(Math.max(limit, 1), 500),
      )
      .toArray()
      .map((r) => JSON.parse(r.data) as Closing);
  }

  closing(number: number): { closing: Closing; moves: CashMove[] } | null {
    const r = this.sql.exec<{ data: string }>("SELECT data FROM pos_closings WHERE number = ?", number).toArray()[0];
    return r ? { closing: JSON.parse(r.data) as Closing, moves: this.moves("closing = ?", number) } : null;
  }

  private moves(where: string, ...params: (string | number)[]): CashMove[] {
    return this.sql
      .exec<Row>(`SELECT * FROM pos_cash_moves WHERE ${where} ORDER BY at`, ...params)
      .toArray()
      .map((r) => ({
        id: S(r.id), at: S(r.at), kind: S(r.kind) as CashMoveKind, method: S(r.method) as PayMethod, cents: Number(r.cents), note: S(r.note),
        ref: S(r.ref), userName: r.user_name === null ? null : S(r.user_name), closing: r.closing === null ? null : Number(r.closing),
      }));
  }
}

/** Warengruppe eines Postens aus einem Modul, passend zu den Gruppen an der Kasse (z. B. „@repairs.part“). */
function moduleGroup(l: PosLine): string {
  if (l.source === "repairs") {
    if (l.kind.startsWith("order")) return "@repairs.repair";
    if (l.kind === "used" || l.kind === "part") return `@repairs.${l.kind}`;
    return "@repairs.other";
  }
  // Andere Systeme: Art des Postens vor dem Doppelpunkt, z. B. „appointment:service“ → „@salon.appointment“
  return `@${l.source}.${l.kind.split(":")[0] || "other"}`;
}

/** Tag nach deutscher Ortszeit, damit ein Verkauf um 0:30 Uhr zum richtigen Tag gehört. */
export const berlinDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
