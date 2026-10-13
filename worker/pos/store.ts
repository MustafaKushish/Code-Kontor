import {
  DEFAULT_POS_SETTINGS, PAY_METHODS, addVat, computeTotals, emptyByMethod, receiptNumber, sanitizePosSettings, settlePayments,
  type CashMove, type CashMoveKind, type CashState, type Closing, type PayMethod, type Payment, type PosArticle, type PosCustomer, type PosLine,
  type PosRef, type PosSettings, type PosSource, type Receipt, type ReceiptCompany, type ReceiptKind, type ReceiptRow,
} from "../../shared/pos";

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

export type PosErrorCode =
  | "notFound" | "emptyCart" | "unknownSource" | "alreadyCanceled" | "cannotCancel" | "paymentMissing" | "paymentTooLow"
  | "changeWithoutCash" | "paymentMethod" | "bankTooHigh" | "nothingToClose";

export class PosError extends Error {
  constructor(public code: PosErrorCode) {
    super(code);
  }
}

export interface Actor {
  id: string | null;
  name: string | null;
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
}

type Row = Record<string, string | number | null>;
const S = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export interface BookInput {
  kind: ReceiptKind;
  lines: PosLine[];
  refs: PosRef[];
  depositCents: number;
  payments: Payment[];
  customer: PosCustomer | null;
  cancels?: string | null;
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

  /** Schnellartikel und Artikel der installierten Module, passend zur Suche. */
  articles(query: string, sources: PosSource[]): PosArticle[] {
    const q = query.trim().toLowerCase();
    const quick: PosArticle[] = this.settings()
      .quickItems.filter((i) => !q || i.name.toLowerCase().includes(q))
      .map((i) => ({ source: "pos", kind: "quick", refId: i.id, name: i.name, detail: "", priceCents: i.priceCents, vatRate: i.vatRate }));
    const fromModules = sources.flatMap((s) => this.modules.get(s)?.articles(query) ?? []);
    return [...quick, ...fromModules];
  }

  /**
   * Bezahlen: Posten prüfen (Module rechnen selbst), Beleg mit fortlaufender Nummer buchen,
   * Module abschließen lassen. Gibt null zurück, wenn nichts zu zahlen war (z. B. Abholung ohne Kosten).
   */
  checkout(input: { lines: PosLine[]; payments: Payment[]; customer: PosCustomer | null }, ctx: PosContext): Receipt | null {
    if (!input.lines.length) throw new PosError("emptyCart");
    return this.transaction(() => {
      const lines: PosLine[] = [];
      const refs: PosRef[] = [];
      let depositCents = 0;
      let customer = input.customer;
      for (const line of input.lines) {
        if (line.source === "pos") {
          lines.push({ ...line, kind: "item", refId: null });
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
      const receipt = empty ? null : this.book({ kind: "sale", lines, refs, depositCents, payments: input.payments, customer }, ctx);
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
    const receipt: Receipt = {
      number, kind: input.kind, issuedAt, cashier: ctx.actor.name, company: ctx.company, currency: ctx.currency, customer: input.customer,
      lines: input.lines, refs: input.refs, totals, depositCents: input.depositCents, dueCents,
      payments: settled.payments, givenCents: settled.givenCents, changeCents: settled.changeCents,
      smallBusiness: settings.smallBusiness, cancels: input.cancels ?? null, canceledBy: null, closing: null, tse: null,
    };
    const label = input.refs.map((r) => r.label).filter(Boolean).join(", ") || input.lines.slice(0, 3).map((l) => l.name).join(", ");
    this.sql.exec(
      `INSERT INTO pos_receipts (number, year, seq, kind, issued_at, cashier, total_cents, due_cents, payments, customer_name, label, data, cancels)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      number, year, seq, input.kind, issuedAt, ctx.actor.name, totals.grossCents, dueCents, JSON.stringify(receipt.payments),
      input.customer?.name ?? "", label.slice(0, 200), JSON.stringify(receipt), input.cancels ?? null,
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
  receipts(filter: { day?: string; query?: string; closing?: number }): ReceiptRow[] {
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
    return rows.map((r) => ({
      number: S(r.number), kind: S(r.kind) as ReceiptKind, issuedAt: S(r.issued_at), cashier: r.cashier === null ? null : S(r.cashier),
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
      for (const source of new Set([...original.lines.map((l) => l.source), ...original.refs.map((r) => r.source)])) {
        if (source === "pos") continue;
        this.modules.get(source)?.canceled(original, cancel, ctx.actor);
      }
      return cancel;
    });
  }

  // ---------- Kassenbuch ----------

  /** Bewegung ohne Beleg. Positiv = in die Kasse. */
  addMove(move: { kind: CashMoveKind; method: PayMethod; cents: number; note: string; ref?: string; source?: PosSource; refId?: string }, actor: Actor): CashMove {
    const id = crypto.randomUUID();
    this.sql.exec(
      "INSERT INTO pos_cash_moves (id, kind, method, cents, note, ref, source, ref_id, user_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, move.kind, move.method, move.cents, move.note, move.ref ?? "", move.source ?? null, move.refId ?? null, actor.name,
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

  /** Stand seit dem letzten Abschluss (X-Bericht). */
  state(): CashState {
    const last = this.sql.exec<Row>("SELECT data, at FROM pos_closings ORDER BY number DESC LIMIT 1").toArray()[0];
    const lastClosing = last ? (JSON.parse(S(last.data)) as Closing) : null;
    const byMethod = emptyByMethod();
    let vat: CashState["vat"] = [];
    let receipts = 0;
    let cancels = 0;
    let salesCents = 0;
    for (const r of this.sql.exec<Row>("SELECT number, kind, data FROM pos_receipts WHERE closing IS NULL").toArray()) {
      const receipt = JSON.parse(S(r.data)) as Receipt;
      for (const p of receipt.payments) byMethod[p.method] += p.cents;
      if (receipt.kind === "cancel") cancels++;
      else receipts++;
      if (receipt.kind !== "deposit") {
        vat = addVat(vat, receipt.totals.vat);
        salesCents += receipt.totals.grossCents;
      }
    }
    const moves = this.moves("closing IS NULL");
    const otherPayouts = emptyByMethod();
    let movesCents = 0;
    for (const m of moves) {
      if (m.method === "cash") movesCents += m.cents;
      else otherPayouts[m.method] += m.cents;
    }
    const openingCents = lastClosing?.closingCents ?? 0;
    return {
      since: last ? S(last.at) : null, openingCents, receipts, cancels, byMethod, vat, salesCents, movesCents,
      expectedCents: openingCents + byMethod.cash + movesCents, otherPayouts, moves,
    };
  }

  /**
   * Tagesabschluss (Z-Bericht): gezähltes Bargeld, Differenz und Abschöpfung zur Bank werden gebucht,
   * alle offenen Belege und Bewegungen gehören danach zu diesem Abschluss.
   */
  close(input: { countedCents: number; bankCents: number; note: string }, actor: Actor): Closing {
    return this.transaction(() => {
      const state = this.state();
      if (state.receipts + state.cancels === 0 && state.moves.length === 0 && input.countedCents === state.expectedCents && input.bankCents === 0)
        throw new PosError("nothingToClose");
      if (input.bankCents < 0 || input.bankCents > input.countedCents) throw new PosError("bankTooHigh");
      const number = (this.sql.exec<{ n: number | null }>("SELECT MAX(number) AS n FROM pos_closings").one().n ?? 0) + 1;
      const differenceCents = input.countedCents - state.expectedCents;
      if (differenceCents) this.addMove({ kind: "difference", method: "cash", cents: differenceCents, note: input.note }, actor);
      if (input.bankCents) this.addMove({ kind: "bank", method: "cash", cents: -input.bankCents, note: "" }, actor);
      const { moves: _, ...rest } = state;
      const closing: Closing = {
        ...rest, number, at: new Date().toISOString(), countedCents: input.countedCents, differenceCents, bankCents: input.bankCents,
        closingCents: input.countedCents - input.bankCents, userName: actor.name, note: input.note,
      };
      this.sql.exec("INSERT INTO pos_closings (number, at, data, user_name) VALUES (?, ?, ?, ?)", number, closing.at, JSON.stringify(closing), actor.name);
      this.sql.exec("UPDATE pos_receipts SET closing = ? WHERE closing IS NULL", number);
      this.sql.exec("UPDATE pos_cash_moves SET closing = ? WHERE closing IS NULL", number);
      return closing;
    });
  }

  closings(limit = 60): Closing[] {
    return this.sql
      .exec<{ data: string }>("SELECT data FROM pos_closings ORDER BY number DESC LIMIT ?", Math.min(Math.max(limit, 1), 500))
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

/** Tag nach deutscher Ortszeit, damit ein Verkauf um 0:30 Uhr zum richtigen Tag gehört. */
export const berlinDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
