import {
  CLOSED_STATUSES, DEFAULT_REPAIR_SETTINGS, PICKUP_STATUSES, STATUS_GROUPS, canChangeStatus, normalizeSerial,
  warrantyEnd,
  type InvoiceSnapshot, type PaymentMethod, type QuoteDecision, type RepairCustomer, type RepairEvent, type RepairIntake, type RepairInvoice,
  type RepairItem, type RepairOrder, type RepairOrderRow, type RepairPart, type RepairSettings, type RepairStatus, type StatusGroup,
  type InvoiceKind, type UsedDevice, type UsedDeviceInput, type WarrantyRow,
  type CheckList, type Loaner, type RepairOrderRow as OrderRow, type RepairPrice, type RepairStats,
  MAX_PHOTOS, type BookingInput, type BookingStatus, type OrderPartOrder, type PhotoStage, type PurchaseLineInput, type PurchaseOrder,
  type PurchaseStatus, type RepairBooking, type RepairPhoto, type Supplier,
} from "../../shared/repairs";
import { receiptNumber, type PayMethod, type PosArticle, type PosLine, type Receipt } from "../../shared/pos";
import { PosError, type PosContext, type PosModule, type PosStore } from "../pos/store";

// Daten des Systems „Handy- & IT-Service“ in der Datenbank der Firma.
// Läuft im Durable Object der Firma; der Kern ruft alles über TenantDatabase.repairs() auf.

export const REPAIR_MIGRATIONS: (string | ((sql: SqlStorage) => void))[] = [
  `CREATE TABLE repair_customers (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX repair_customers_name ON repair_customers(name);
   CREATE TABLE repair_orders (
     id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, customer_id TEXT NOT NULL, status TEXT NOT NULL,
     intake TEXT NOT NULL, serial TEXT NOT NULL DEFAULT '', quote TEXT, unlock_code TEXT,
     public_token TEXT NOT NULL UNIQUE, created_by TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX repair_orders_status ON repair_orders(status, updated_at);
   CREATE INDEX repair_orders_customer ON repair_orders(customer_id);
   CREATE INDEX repair_orders_serial ON repair_orders(serial);
   CREATE TABLE repair_items (
     id TEXT PRIMARY KEY, order_id TEXT NOT NULL, kind TEXT NOT NULL, part_id TEXT, name TEXT NOT NULL,
     qty REAL NOT NULL, unit_cents INTEGER NOT NULL, vat_rate INTEGER NOT NULL, position INTEGER NOT NULL
   );
   CREATE INDEX repair_items_order ON repair_items(order_id, position);
   CREATE TABLE repair_events (
     id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, status TEXT, event TEXT NOT NULL DEFAULT '',
     note TEXT NOT NULL DEFAULT '', user_name TEXT,
     at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX repair_events_order ON repair_events(order_id, id);
   CREATE TABLE repair_parts (
     id TEXT PRIMARY KEY, sku TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, category TEXT NOT NULL, fits TEXT NOT NULL DEFAULT '',
     stock INTEGER NOT NULL DEFAULT 0, min_stock INTEGER NOT NULL DEFAULT 0, purchase_cents INTEGER NOT NULL DEFAULT 0,
     price_cents INTEGER NOT NULL DEFAULT 0, vat_rate INTEGER NOT NULL DEFAULT 19, active INTEGER NOT NULL DEFAULT 1
   );
   CREATE TABLE repair_stock_moves (
     id INTEGER PRIMARY KEY AUTOINCREMENT, part_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL,
     order_id TEXT, user_name TEXT, at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX repair_stock_moves_part ON repair_stock_moves(part_id, id);
   CREATE TABLE repair_invoices (
     number TEXT PRIMARY KEY, year INTEGER NOT NULL, seq INTEGER NOT NULL, order_id TEXT NOT NULL UNIQUE,
     total_cents INTEGER NOT NULL, payment_method TEXT NOT NULL, warranty_until TEXT NOT NULL DEFAULT '', snapshot TEXT NOT NULL,
     issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     UNIQUE (year, seq)
   );`,
  // An- und Verkauf: Rechnungen gibt es jetzt auch für Verkäufe (gleicher Nummernkreis)
  `ALTER TABLE repair_invoices ADD COLUMN kind TEXT NOT NULL DEFAULT 'repair';
   CREATE TABLE repair_used_devices (
     id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'inStock',
     device TEXT NOT NULL, serial TEXT NOT NULL DEFAULT '', grade TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
     purchase_cents INTEGER NOT NULL, price_cents INTEGER NOT NULL, seller TEXT NOT NULL, id_number TEXT,
     payout TEXT NOT NULL, purchased_by TEXT,
     purchased_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     sold_at TEXT, sale_invoice TEXT, buyer_name TEXT, warranty_until TEXT NOT NULL DEFAULT ''
   );
   CREATE INDEX repair_used_status ON repair_used_devices(status, number);
   CREATE INDEX repair_used_serial ON repair_used_devices(serial);`,
  // Werkstatt-Alltag: Preisliste, Leihgeräte, Ausgangs-Check, Kundenkartei
  `ALTER TABLE repair_orders ADD COLUMN out_checks TEXT;
   ALTER TABLE repair_customers ADD COLUMN address TEXT NOT NULL DEFAULT '';
   ALTER TABLE repair_customers ADD COLUMN note TEXT NOT NULL DEFAULT '';
   ALTER TABLE repair_invoices ADD COLUMN customer_id TEXT;
   ALTER TABLE repair_used_devices ADD COLUMN sold_cents INTEGER NOT NULL DEFAULT 0;
   UPDATE repair_invoices SET customer_id = (SELECT o.customer_id FROM repair_orders o WHERE o.id = repair_invoices.order_id) WHERE kind = 'repair';
   CREATE INDEX repair_invoices_customer ON repair_invoices(customer_id);
   CREATE TABLE repair_prices (
     id TEXT PRIMARY KEY, device_type TEXT NOT NULL, brand TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
     service TEXT NOT NULL, price_cents INTEGER NOT NULL, vat_rate INTEGER NOT NULL DEFAULT 19, part_id TEXT,
     minutes INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX repair_prices_device ON repair_prices(device_type, brand, model);
   CREATE TABLE repair_loaners (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, serial TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
     order_id TEXT, lent_at TEXT, active INTEGER NOT NULL DEFAULT 1
   );`,
  // Laden-Extras: Fotos, Unterschriften, Lieferanten und Bestellungen, Online-Termine
  `ALTER TABLE repair_orders ADD COLUMN signature TEXT;
   ALTER TABLE repair_orders ADD COLUMN pickup_signature TEXT;
   CREATE TABLE repair_photos (
     id TEXT PRIMARY KEY, order_id TEXT NOT NULL, stage TEXT NOT NULL, data TEXT NOT NULL, user_name TEXT,
     at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX repair_photos_order ON repair_photos(order_id, at);
   CREATE TABLE repair_suppliers (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
     email TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '', customer_no TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT ''
   );
   CREATE TABLE repair_purchases (
     id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, supplier_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
     note TEXT NOT NULL DEFAULT '', created_by TEXT, ordered_at TEXT, received_at TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX repair_purchases_status ON repair_purchases(status, number);
   CREATE TABLE repair_purchase_lines (
     id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL, part_id TEXT, name TEXT NOT NULL, qty INTEGER NOT NULL,
     received INTEGER NOT NULL DEFAULT 0, unit_cents INTEGER NOT NULL DEFAULT 0, order_id TEXT, position INTEGER NOT NULL
   );
   CREATE INDEX repair_purchase_lines_purchase ON repair_purchase_lines(purchase_id, position);
   CREATE INDEX repair_purchase_lines_order ON repair_purchase_lines(order_id);
   CREATE TABLE repair_bookings (
     id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'new', source TEXT NOT NULL DEFAULT 'online',
     day TEXT NOT NULL, time TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
     device TEXT NOT NULL, problem TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'de', order_id TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX repair_bookings_day ON repair_bookings(day, time);
   CREATE INDEX repair_bookings_status ON repair_bookings(status, day);`,
  // Zentrale Kasse: Rechnungen kommen aus der Kasse der Plattform, bisherige werden dorthin übernommen
  (sql) => {
    // Neu aufbauen: ein Auftrag kann nach einem Storno erneut abgerechnet werden (order_id nicht mehr eindeutig)
    sql.exec(`CREATE TABLE repair_invoices_new (
       number TEXT PRIMARY KEY, year INTEGER NOT NULL, seq INTEGER NOT NULL, order_id TEXT NOT NULL,
       total_cents INTEGER NOT NULL, payment_method TEXT NOT NULL, warranty_until TEXT NOT NULL DEFAULT '', snapshot TEXT NOT NULL,
       issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), kind TEXT NOT NULL DEFAULT 'repair', customer_id TEXT,
       canceled_by TEXT, UNIQUE (year, seq)
     );
     INSERT INTO repair_invoices_new (number, year, seq, order_id, total_cents, payment_method, warranty_until, snapshot, issued_at, kind, customer_id)
       SELECT number, year, seq, order_id, total_cents, payment_method, warranty_until, snapshot, issued_at, kind, customer_id FROM repair_invoices;
     DROP TABLE repair_invoices;
     ALTER TABLE repair_invoices_new RENAME TO repair_invoices;
     CREATE INDEX repair_invoices_customer ON repair_invoices(customer_id);
     CREATE INDEX repair_invoices_order ON repair_invoices(order_id);`);
    const tax = sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'tax'").toArray()[0];
    const currency = tax ? ((JSON.parse(tax.value) as { currency?: string }).currency ?? "EUR") : "EUR";
    for (const r of sql.exec<Row>("SELECT * FROM repair_invoices ORDER BY year, seq").toArray()) {
      if (sql.exec("SELECT 1 FROM pos_receipts WHERE number = ?", S(r.number)).toArray().length) continue;
      const snap = JSON.parse(S(r.snapshot)) as InvoiceSnapshot;
      const total = Number(r.total_cents);
      const deposit = snap.depositCents ?? 0;
      const payment = S(r.payment_method) as PayMethod;
      const repair = S(r.kind) !== "sale";
      const refs = repair ? [{ source: "repairs" as const, kind: "order", refId: S(r.order_id), label: snap.orderNumber ? `#${snap.orderNumber}` : "" }] : [];
      const receipt: Receipt = {
        number: S(r.number), kind: "sale", issuedAt: S(r.issued_at), cashier: null, company: snap.company, currency,
        customer: { id: r.customer_id === null ? null : S(r.customer_id), name: snap.customer.name, address: snap.customer.address ?? "", phone: snap.customer.phone, email: snap.customer.email },
        lines: snap.items.map((i) => ({
          source: "repairs", kind: repair ? `order:${i.kind}` : i.margin ? "used" : i.partId ? "part" : "other", refId: repair ? S(r.order_id) : i.partId,
          name: i.name, qty: i.qty, unitCents: i.unitCents, vatRate: i.vatRate, ...(i.margin ? { margin: true } : {}), ...(i.warrantyUntil ? { warrantyUntil: i.warrantyUntil } : {}),
        })),
        refs, totals: snap.totals, depositCents: deposit, dueCents: total - deposit, payments: total - deposit ? [{ method: payment, cents: total - deposit }] : [],
        givenCents: 0, changeCents: 0, smallBusiness: snap.smallBusiness, cancels: null, canceledBy: null, closing: 0, tse: null,
      };
      // Abschluss 0 = vor Einführung der Kasse, zählt in keinem Kassenstand mit
      sql.exec(
        `INSERT INTO pos_receipts (number, year, seq, kind, issued_at, cashier, total_cents, due_cents, payments, customer_name, label, data, closing)
         VALUES (?, ?, ?, 'sale', ?, NULL, ?, ?, ?, ?, ?, ?, 0)`,
        receipt.number, Number(r.year), Number(r.seq), receipt.issuedAt, total, receipt.dueCents, JSON.stringify(receipt.payments),
        snap.customer.name, refs.map((x) => x.label).join(", ") || snap.items.slice(0, 3).map((i) => i.name).join(", "), JSON.stringify(receipt),
      );
      for (const ref of refs) sql.exec("INSERT INTO pos_refs (number, source, kind, ref_id) VALUES (?, 'repairs', 'order', ?)", receipt.number, ref.refId);
    }
  },
];

type Row = Record<string, string | number | null>;
export class RepairError extends Error {
  constructor(public code: "notFound" | "statusNotAllowed" | "orderClosed" | "hasInvoice" | "alreadySold" | "emptySale" | "loanerOut" | "loanerBusy" | "tooManyPhotos" | "slotTaken" | "supplierUsed" | "purchaseLocked" | "emptyPurchase" | "oneOrderPerReceipt" | "depositUsed") {
    super(code);
  }
}

const S = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export interface Actor {
  id: string | null;
  name: string | null;
}

export class RepairStore {
  constructor(private sql: SqlStorage, private transaction: <T>(fn: () => T) => T, private pos: PosStore) {}

  // ---------- Einstellungen ----------

  settings(): RepairSettings {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'repairs'").toArray()[0];
    const settings = row ? { ...DEFAULT_REPAIR_SETTINGS, ...(JSON.parse(row.value) as Partial<RepairSettings>) } : DEFAULT_REPAIR_SETTINGS;
    // Kleinunternehmer gilt für die ganze Firma und steht in der Kasse; ältere Einstellung bleibt, bis die Kasse eine hat
    const pos = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'pos'").toArray()[0];
    return pos ? { ...settings, smallBusiness: this.pos.settings().smallBusiness } : settings;
  }

  saveSettings(settings: RepairSettings): RepairSettings {
    this.sql.exec(
      `INSERT INTO settings (key, value) VALUES ('repairs', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      JSON.stringify(settings),
    );
    if (this.pos.settings().smallBusiness !== settings.smallBusiness) this.pos.saveSettings({ ...this.pos.settings(), smallBusiness: settings.smallBusiness });
    return settings;
  }

  // ---------- Kunden ----------

  customers(query: string, limit = 20): RepairCustomer[] {
    const q = `%${query.trim().toLowerCase()}%`;
    return this.sql
      .exec<Row>(
        `SELECT c.*, (SELECT COUNT(*) FROM repair_orders o WHERE o.customer_id = c.id) AS orders FROM repair_customers c
          WHERE lower(c.name) LIKE ? OR c.phone LIKE ? OR lower(c.email) LIKE ? ORDER BY c.name LIMIT ?`,
        q, q, q, Math.min(Math.max(limit, 1), 100),
      )
      .toArray()
      .map((r) => ({ ...customerFromRow(r), orders: Number(r.orders) }));
  }

  private customer(id: string): RepairCustomer | null {
    const r = this.sql.exec<Row>("SELECT * FROM repair_customers WHERE id = ?", id).toArray()[0];
    return r ? customerFromRow(r) : null;
  }

  // ---------- Aufträge ----------

  list(group: StatusGroup, query: string, limit = 200): { orders: RepairOrderRow[]; counts: Record<StatusGroup, number> } {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (group !== "all") {
      const statuses = STATUS_GROUPS[group];
      where.push(`o.status IN (${statuses.map(() => "?").join(",")})`);
      args.push(...statuses);
    }
    const q = query.trim();
    if (q) {
      const like = `%${q.toLowerCase()}%`;
      where.push("(CAST(o.number AS TEXT) = ? OR lower(c.name) LIKE ? OR c.phone LIKE ? OR o.serial LIKE ? OR lower(o.intake) LIKE ?)");
      args.push(q.replace(/^#/, ""), like, like, `%${normalizeSerial(q)}%`, like);
    }
    const rows = this.sql
      .exec<Row>(
        `SELECT o.id, o.number, o.status, o.intake, o.created_at, o.updated_at, c.name AS customer_name, c.phone AS customer_phone,
                (SELECT COALESCE(SUM(ROUND(i.qty * i.unit_cents)), 0) FROM repair_items i WHERE i.order_id = o.id) AS total
           FROM repair_orders o JOIN repair_customers c ON c.id = o.customer_id
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY ${group === "done" || group === "all" ? "o.updated_at DESC" : "o.number ASC"} LIMIT ?`,
        ...args, Math.min(Math.max(limit, 1), 500),
      )
      .toArray();
    const orders = rows.map((r) => {
      const intake = parseIntake(S(r.intake));
      return {
        id: S(r.id), number: Number(r.number), status: S(r.status) as RepairStatus, customerName: S(r.customer_name), customerPhone: S(r.customer_phone),
        device: intake.device, problem: intake.problem.slice(0, 140), dueDay: intake.dueDay, totalCents: Number(r.total),
        createdAt: S(r.created_at), updatedAt: S(r.updated_at),
      };
    });
    const counts = { open: 0, waiting: 0, pickup: 0, done: 0, all: 0 } as Record<StatusGroup, number>;
    for (const r of this.sql.exec<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM repair_orders GROUP BY status").toArray()) {
      counts.all += r.n;
      for (const [g, statuses] of Object.entries(STATUS_GROUPS)) if ((statuses as readonly string[]).includes(r.status)) counts[g as StatusGroup] += r.n;
    }
    return { orders, counts };
  }

  create(
    customer: { id: string | null; data: Omit<RepairCustomer, "id"> },
    intake: RepairIntake,
    unlockCode: string | null,
    actor: Actor,
    pos: PosContext | null = null,
    depositMethod: PayMethod = "cash",
  ): RepairOrder {
    const id = crypto.randomUUID();
    this.transaction(() => {
      let customerId = customer.id && this.customer(customer.id) ? customer.id : null;
      if (customerId) {
        this.sql.exec("UPDATE repair_customers SET name = ?, phone = ?, email = ? WHERE id = ?", customer.data.name, customer.data.phone, customer.data.email, customerId);
      } else {
        customerId = crypto.randomUUID();
        this.sql.exec("INSERT INTO repair_customers (id, name, phone, email) VALUES (?, ?, ?, ?)", customerId, customer.data.name, customer.data.phone, customer.data.email);
      }
      const number = (this.sql.exec<{ n: number | null }>("SELECT MAX(number) AS n FROM repair_orders").one().n ?? 1000) + 1;
      this.sql.exec(
        `INSERT INTO repair_orders (id, number, customer_id, status, intake, serial, unlock_code, public_token, created_by)
         VALUES (?, ?, ?, 'received', ?, ?, ?, ?, ?)`,
        id, number, customerId, JSON.stringify(intake), normalizeSerial(intake.device.serial), unlockCode, randomToken(), actor.name,
      );
      this.event(id, "received", "", intake.depositCents ? `deposit:${intake.depositCents}` : "", actor);
      if (intake.depositCents > 0 && pos) this.bookDeposit(id, number, intake, depositMethod, pos);
    });
    return this.get(id)!;
  }

  get(id: string): RepairOrder | null {
    const r = this.sql.exec<Row>("SELECT * FROM repair_orders WHERE id = ?", id).toArray()[0];
    if (!r) return null;
    const customer = this.customer(S(r.customer_id)) ?? { id: S(r.customer_id), name: "", phone: "", email: "" };
    const invoiceRow = this.sql.exec<Row>("SELECT * FROM repair_invoices WHERE order_id = ? ORDER BY canceled_by IS NULL DESC, issued_at DESC LIMIT 1", id).toArray()[0];
    const invoice: RepairInvoice | null = invoiceRow
      ? {
          number: S(invoiceRow.number), issuedAt: S(invoiceRow.issued_at), totalCents: Number(invoiceRow.total_cents),
          paymentMethod: S(invoiceRow.payment_method) as PayMethod, warrantyUntil: S(invoiceRow.warranty_until),
          snapshot: JSON.parse(S(invoiceRow.snapshot)) as InvoiceSnapshot, canceledBy: invoiceRow.canceled_by ? S(invoiceRow.canceled_by) : null,
        }
      : null;
    return {
      id: S(r.id), number: Number(r.number), status: S(r.status) as RepairStatus, customer,
      intake: parseIntake(S(r.intake)), quote: r.quote ? (S(r.quote) as QuoteDecision) : null,
      items: this.items(id), history: this.history(id), invoice, hasUnlockCode: !!r.unlock_code, publicToken: S(r.public_token),
      createdAt: S(r.created_at), updatedAt: S(r.updated_at), createdBy: r.created_by === null ? null : S(r.created_by),
      outChecks: r.out_checks ? (JSON.parse(S(r.out_checks)) as CheckList) : null,
      loaner: this.loanerOf(id),
      photos: this.photos(id),
      signature: { intake: r.signature ? S(r.signature) : null, pickup: r.pickup_signature ? S(r.pickup_signature) : null },
      partOrders: this.partOrders(id),
    };
  }

  byToken(token: string): RepairOrder | null {
    const r = this.sql.exec<{ id: string }>("SELECT id FROM repair_orders WHERE public_token = ?", token).toArray()[0];
    return r ? this.get(r.id) : null;
  }

  /** Frühere Aufträge mit derselben IMEI / Seriennummer (für Garantiefälle). */
  sameDevice(id: string): { id: string; number: number; status: RepairStatus; createdAt: string; warrantyUntil: string }[] {
    const order = this.sql.exec<{ serial: string }>("SELECT serial FROM repair_orders WHERE id = ?", id).toArray()[0];
    if (!order || order.serial.length < 5) return [];
    return this.sql
      .exec<Row>(
        `SELECT o.id, o.number, o.status, o.created_at, COALESCE(i.warranty_until, '') AS warranty_until
           FROM repair_orders o LEFT JOIN repair_invoices i ON i.order_id = o.id
          WHERE o.serial = ? AND o.id != ? ORDER BY o.number DESC LIMIT 10`,
        order.serial, id,
      )
      .toArray()
      .map((r) => ({ id: S(r.id), number: Number(r.number), status: S(r.status) as RepairStatus, createdAt: S(r.created_at), warrantyUntil: S(r.warranty_until) }));
  }

  unlockCode(id: string): string | null {
    const r = this.sql.exec<{ unlock_code: string | null }>("SELECT unlock_code FROM repair_orders WHERE id = ?", id).toArray()[0];
    if (!r) throw new RepairError("notFound");
    return r.unlock_code;
  }

  update(id: string, customer: Omit<RepairCustomer, "id">, intake: RepairIntake, unlockCode: string | null | undefined, actor: Actor, pos: PosContext | null = null): RepairOrder {
    const order = this.open(id);
    // Eine gebuchte Anzahlung ändert sich nur über die Kasse (Storno); neu dazu kommt sie mit Beleg
    const addDeposit = order.intake.depositCents === 0 && intake.depositCents > 0 && pos;
    if (order.intake.depositCents > 0 || !pos) intake = { ...intake, depositCents: order.intake.depositCents };
    this.transaction(() => {
      if (addDeposit) this.bookDeposit(id, order.number, intake, "cash", pos);
      this.sql.exec("UPDATE repair_customers SET name = ?, phone = ?, email = ? WHERE id = ?", customer.name, customer.phone, customer.email, order.customer.id);
      this.sql.exec(
        "UPDATE repair_orders SET intake = ?, serial = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        JSON.stringify(intake), normalizeSerial(intake.device.serial), id,
      );
      // undefined = unverändert, null = löschen
      if (unlockCode !== undefined) this.sql.exec("UPDATE repair_orders SET unlock_code = ? WHERE id = ?", unlockCode, id);
      this.event(id, null, "edited", "", actor);
    });
    return this.get(id)!;
  }

  setStatus(id: string, status: RepairStatus, note: string, actor: Actor): RepairOrder {
    const order = this.get(id);
    if (!order) throw new RepairError("notFound");
    if (!canChangeStatus(order.status, status)) throw new RepairError("statusNotAllowed");
    this.transaction(() => {
      // Ein neuer Kostenvoranschlag wartet auf die Antwort des Kunden
      const quote = status === "quote" ? "pending" : order.quote;
      this.sql.exec(
        "UPDATE repair_orders SET status = ?, quote = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        status, quote, id,
      );
      // Storniert: Teile gehen zurück ins Lager
      if (status === "canceled") for (const item of order.items) if (item.partId) this.moveStock(item.partId, Math.ceil(item.qty), "orderCanceled", id, actor);
      if (order.status === "canceled") for (const item of order.items) if (item.partId) this.moveStock(item.partId, -Math.ceil(item.qty), "orderReopened", id, actor);
      this.event(id, status, "", note, actor);
    });
    return this.get(id)!;
  }

  /** Kunde stimmt dem Kostenvoranschlag zu oder lehnt ab (online oder am Telefon). */
  decideQuote(id: string, approve: boolean, note: string, actor: Actor): RepairOrder {
    const order = this.get(id);
    if (!order) throw new RepairError("notFound");
    if (order.status !== "quote" || order.quote !== "pending") throw new RepairError("statusNotAllowed");
    const status: RepairStatus = approve ? "repairing" : "notRepaired";
    this.transaction(() => {
      this.sql.exec(
        "UPDATE repair_orders SET status = ?, quote = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        status, approve ? "approved" : "rejected", id,
      );
      this.event(id, status, approve ? "quoteApproved" : "quoteRejected", note, actor);
    });
    return this.get(id)!;
  }

  addItem(id: string, item: Omit<RepairItem, "id">, actor: Actor): RepairOrder {
    this.open(id);
    this.transaction(() => {
      if (item.partId) {
        const part = this.part(item.partId);
        if (!part) throw new RepairError("notFound");
        this.moveStock(part.id, -Math.ceil(item.qty), "usedInOrder", id, actor);
      }
      const pos = this.sql.exec<{ n: number | null }>("SELECT MAX(position) AS n FROM repair_items WHERE order_id = ?", id).one().n ?? 0;
      this.sql.exec(
        "INSERT INTO repair_items (id, order_id, kind, part_id, name, qty, unit_cents, vat_rate, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(), id, item.kind, item.partId, item.name, item.qty, item.unitCents, item.vatRate, pos + 1,
      );
      this.touch(id);
    });
    return this.get(id)!;
  }

  removeItem(id: string, itemId: string, actor: Actor): RepairOrder {
    this.open(id);
    const item = this.items(id).find((i) => i.id === itemId);
    if (!item) throw new RepairError("notFound");
    this.transaction(() => {
      if (item.partId && this.part(item.partId)) this.moveStock(item.partId, Math.ceil(item.qty), "returnedFromOrder", id, actor);
      this.sql.exec("DELETE FROM repair_items WHERE id = ? AND order_id = ?", itemId, id);
      this.touch(id);
    });
    return this.get(id)!;
  }

  /** Auftrag löschen, nur ohne Rechnung. Teile gehen zurück ins Lager. */
  remove(id: string, actor: Actor): void {
    const order = this.get(id);
    if (!order) throw new RepairError("notFound");
    if (order.invoice || this.pos.hasReceipts("repairs", id)) throw new RepairError("hasInvoice");
    this.transaction(() => {
      if (order.status !== "canceled") for (const item of order.items) if (item.partId && this.part(item.partId)) this.moveStock(item.partId, Math.ceil(item.qty), "orderDeleted", id, actor);
      this.sql.exec("UPDATE repair_loaners SET order_id = NULL, lent_at = NULL WHERE order_id = ?", id);
      this.sql.exec("DELETE FROM repair_items WHERE order_id = ?", id);
      this.sql.exec("DELETE FROM repair_events WHERE order_id = ?", id);
      this.sql.exec("DELETE FROM repair_photos WHERE order_id = ?", id);
      this.sql.exec("UPDATE repair_purchase_lines SET order_id = NULL WHERE order_id = ?", id);
      this.sql.exec("UPDATE repair_bookings SET order_id = NULL WHERE order_id = ?", id);
      this.sql.exec("DELETE FROM repair_orders WHERE id = ?", id);
      // Kunden ohne weitere Aufträge nicht aufheben (Datensparsamkeit)
      this.sql.exec("DELETE FROM repair_customers WHERE id = ? AND NOT EXISTS (SELECT 1 FROM repair_orders WHERE customer_id = ?)", order.customer.id, order.customer.id);
    });
  }

  invoices(year: number): { number: string; kind: InvoiceKind; issuedAt: string; totalCents: number; paymentMethod: PayMethod; orderId: string; orderNumber: number | null; customerName: string; canceledBy: string | null }[] {
    return this.sql
      .exec<Row>(
        `SELECT i.number, i.kind, i.issued_at, i.total_cents, i.payment_method, i.order_id, i.snapshot, i.canceled_by FROM repair_invoices i WHERE i.year = ? ORDER BY i.seq DESC`,
        year,
      )
      .toArray()
      .map((r) => {
        const snap = JSON.parse(S(r.snapshot)) as InvoiceSnapshot;
        return {
          number: S(r.number), kind: S(r.kind) as InvoiceKind, issuedAt: S(r.issued_at), totalCents: Number(r.total_cents), paymentMethod: S(r.payment_method) as PayMethod,
          orderId: S(r.order_id), orderNumber: snap.orderNumber, customerName: snap.customer.name, canceledBy: r.canceled_by ? S(r.canceled_by) : null,
        };
      });
  }

  // ---------- Lager ----------

  parts(query: string): RepairPart[] {
    const like = `%${query.trim().toLowerCase()}%`;
    return this.sql
      .exec<Row>(
        "SELECT * FROM repair_parts WHERE active = 1 AND (lower(name) LIKE ? OR lower(sku) LIKE ? OR lower(fits) LIKE ?) ORDER BY category, name LIMIT 500",
        like, like, like,
      )
      .toArray()
      .map(partFromRow);
  }

  part(id: string): RepairPart | null {
    const r = this.sql.exec<Row>("SELECT * FROM repair_parts WHERE id = ? AND active = 1", id).toArray()[0];
    return r ? partFromRow(r) : null;
  }

  savePart(id: string | null, data: Omit<RepairPart, "id">, actor: Actor): RepairPart {
    if (id) {
      const before = this.part(id);
      if (!before) throw new RepairError("notFound");
      this.transaction(() => {
        this.sql.exec(
          "UPDATE repair_parts SET sku = ?, name = ?, category = ?, fits = ?, min_stock = ?, purchase_cents = ?, price_cents = ?, vat_rate = ? WHERE id = ?",
          data.sku, data.name, data.category, data.fits, data.minStock, data.purchaseCents, data.priceCents, data.vatRate, id,
        );
        if (data.stock !== before.stock) this.moveStock(id, data.stock - before.stock, "counted", null, actor);
      });
      return this.part(id)!;
    }
    const newId = crypto.randomUUID();
    this.transaction(() => {
      this.sql.exec(
        "INSERT INTO repair_parts (id, sku, name, category, fits, stock, min_stock, purchase_cents, price_cents, vat_rate) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)",
        newId, data.sku, data.name, data.category, data.fits, data.minStock, data.purchaseCents, data.priceCents, data.vatRate,
      );
      if (data.stock) this.moveStock(newId, data.stock, "received", null, actor);
    });
    return this.part(newId)!;
  }

  /** Wareneingang (+) oder Ausbuchung (−) mit Grund. */
  adjustStock(id: string, delta: number, reason: "received" | "counted" | "damaged" | "sold", actor: Actor): RepairPart {
    if (!this.part(id)) throw new RepairError("notFound");
    this.moveStock(id, delta, reason, null, actor);
    return this.part(id)!;
  }

  /** Teil ausblenden; Buchungen und alte Aufträge bleiben erhalten. */
  removePart(id: string): void {
    this.sql.exec("UPDATE repair_parts SET active = 0 WHERE id = ?", id);
  }

  stockMoves(partId: string): { at: string; delta: number; reason: string; orderNumber: number | null; userName: string | null }[] {
    return this.sql
      .exec<Row>(
        `SELECT m.at, m.delta, m.reason, m.user_name, o.number FROM repair_stock_moves m LEFT JOIN repair_orders o ON o.id = m.order_id
          WHERE m.part_id = ? ORDER BY m.id DESC LIMIT 50`,
        partId,
      )
      .toArray()
      .map((r) => ({ at: S(r.at), delta: Number(r.delta), reason: S(r.reason), orderNumber: r.number === null ? null : Number(r.number), userName: r.user_name === null ? null : S(r.user_name) }));
  }

  lowStockCount(): number {
    return this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM repair_parts WHERE active = 1 AND min_stock > 0 AND stock <= min_stock").one().n;
  }

  /** Eine Rechnung mit allen Angaben (zum erneuten Drucken). */
  invoice(number: string): (RepairInvoice & { kind: InvoiceKind; orderId: string }) | null {
    const r = this.sql.exec<Row>("SELECT * FROM repair_invoices WHERE number = ?", number).toArray()[0];
    return r
      ? {
          number: S(r.number), kind: S(r.kind) as InvoiceKind, orderId: S(r.order_id), issuedAt: S(r.issued_at), totalCents: Number(r.total_cents),
          paymentMethod: S(r.payment_method) as PayMethod, warrantyUntil: S(r.warranty_until), snapshot: JSON.parse(S(r.snapshot)) as InvoiceSnapshot,
          canceledBy: r.canceled_by ? S(r.canceled_by) : null,
        }
      : null;
  }

  // ---------- An- und Verkauf ----------

  usedDevices(status: "inStock" | "sold" | "all", query: string): UsedDevice[] {
    const like = `%${query.trim().toLowerCase()}%`;
    return this.sql
      .exec<Row>(
        `SELECT * FROM repair_used_devices WHERE (? = 'all' OR status = ?)
           AND (lower(device) LIKE ? OR serial LIKE ? OR CAST(number AS TEXT) = ? OR lower(seller) LIKE ? OR lower(COALESCE(buyer_name, '')) LIKE ?)
          ORDER BY ${status === "sold" ? "sold_at DESC" : "number DESC"} LIMIT 300`,
        status, status, like, `%${normalizeSerial(query)}%`, query.trim().replace(/^A-?/i, ""), like, like,
      )
      .toArray()
      .map(usedFromRow);
  }

  usedDevice(id: string): UsedDevice | null {
    const r = this.sql.exec<Row>("SELECT * FROM repair_used_devices WHERE id = ?", id).toArray()[0];
    return r ? usedFromRow(r) : null;
  }

  usedIdNumber(id: string): string | null {
    const r = this.sql.exec<{ id_number: string | null }>("SELECT id_number FROM repair_used_devices WHERE id = ?", id).toArray()[0];
    if (!r) throw new RepairError("notFound");
    return r.id_number;
  }

  /** Ankauf: Gerät kommt in den Bestand. idNumber kommt bereits verschlüsselt. */
  buyDevice(input: UsedDeviceInput, idNumber: string | null, actor: Actor): UsedDevice {
    const id = crypto.randomUUID();
    const number = (this.sql.exec<{ n: number | null }>("SELECT MAX(number) AS n FROM repair_used_devices").one().n ?? 1000) + 1;
    const { idNumber: _, ownership: __, ...rest } = input;
    this.sql.exec(
      `INSERT INTO repair_used_devices (id, number, device, serial, grade, note, purchase_cents, price_cents, seller, id_number, payout, purchased_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, number, JSON.stringify(rest.device), normalizeSerial(rest.device.serial), rest.grade, rest.note, rest.purchaseCents, rest.priceCents,
      JSON.stringify(rest.seller), idNumber, rest.payout, actor.name,
    );
    // Auszahlung an den Verkäufer gehört ins Kassenbuch (bar aus der Kasse)
    if (rest.purchaseCents > 0)
      this.pos.addMove({ kind: "payout", method: rest.payout, cents: -rest.purchaseCents, note: usedLabel(rest.device), ref: `A-${number}`, source: "repairs", refId: id }, actor);
    return this.usedDevice(id)!;
  }

  /** Gerät, Zustand, Preise und Notiz ändern; Verkäuferdaten bleiben wie beim Ankauf. */
  updateUsed(id: string, input: UsedDeviceInput): UsedDevice {
    const before = this.usedDevice(id);
    if (!before) throw new RepairError("notFound");
    if (before.status === "sold") throw new RepairError("alreadySold");
    this.sql.exec(
      "UPDATE repair_used_devices SET device = ?, serial = ?, grade = ?, note = ?, purchase_cents = ?, price_cents = ? WHERE id = ?",
      JSON.stringify(input.device), normalizeSerial(input.device.serial), input.grade, input.note, input.purchaseCents, input.priceCents, id,
    );
    this.pos.updateModuleMove("repairs", id, { cents: -input.purchaseCents, method: before.payout, note: usedLabel(input.device) });
    return this.usedDevice(id)!;
  }

  removeUsed(id: string): void {
    const before = this.usedDevice(id);
    if (!before) throw new RepairError("notFound");
    if (before.status === "sold") throw new RepairError("alreadySold");
    this.sql.exec("DELETE FROM repair_used_devices WHERE id = ?", id);
  }

  // ---------- Kasse ----------

  /** Anzahlung bei der Annahme: eigener Beleg in der Kasse, wird bei der Abholung abgezogen. */
  private bookDeposit(id: string, number: number, intake: RepairIntake, method: PayMethod, pos: PosContext) {
    const label = `#${number}${usedLabel(intake.device) ? ` · ${usedLabel(intake.device)}` : ""}`;
    this.pos.book(
      {
        kind: "deposit",
        lines: [{ source: "repairs", kind: "deposit", refId: id, name: label, qty: 1, unitCents: intake.depositCents, vatRate: 0 }],
        refs: [{ source: "repairs", kind: "deposit", refId: id, label }],
        depositCents: 0,
        payments: [{ method, cents: intake.depositCents }],
        customer: null,
      },
      pos,
    );
  }

  /** Anbindung an die Kasse der Plattform: Zubehör, Gebrauchtgeräte und Abholungen werden dort bezahlt. */
  posModule(): PosModule {
    return {
      articles: (query) => this.posArticles(query),
      scan: (code) => this.posScan(code),
      prepare: (line, ctx) => {
        const settings = this.settings();
        if (line.kind === "part") {
          const part = line.refId ? this.part(line.refId) : null;
          if (!part) throw new RepairError("notFound");
          return { lines: [{ ...line, name: line.name || part.name, qty: Math.max(1, Math.round(line.qty)) }] };
        }
        if (line.kind === "used") {
          const used = line.refId ? this.usedDevice(line.refId) : null;
          if (!used) throw new RepairError("notFound");
          if (used.status === "sold") throw new RepairError("alreadySold");
          const warranty = warrantyEnd(ctx.today, settings.usedWarrantyMonths);
          return { lines: [{ ...line, name: line.name || `${usedLabel(used.device)} · A-${used.number}`, qty: 1, vatRate: 0, margin: true, ...(warranty ? { warrantyUntil: warranty } : {}) }] };
        }
        if (line.kind === "order") {
          const order = line.refId ? this.get(line.refId) : null;
          if (!order) throw new RepairError("notFound");
          if (!PICKUP_STATUSES.includes(order.status)) throw new RepairError("statusNotAllowed");
          if (order.loaner && ctx.options?.loanerReturned !== true) throw new RepairError("loanerOut");
          const label = `#${order.number}${usedLabel(order.intake.device) ? ` · ${usedLabel(order.intake.device)}` : ""}`;
          return {
            lines: order.items.map((i): PosLine => ({ source: "repairs", kind: `order:${i.kind}`, refId: order.id, name: i.name, qty: i.qty, unitCents: i.unitCents, vatRate: i.vatRate })),
            refs: [{ source: "repairs", kind: "order", refId: order.id, label }],
            depositCents: order.intake.depositCents,
            customer: { id: order.customer.id, name: order.customer.name, address: order.customer.address ?? "", phone: order.customer.phone, email: order.customer.email },
          };
        }
        throw new RepairError("notFound");
      },
      booked: (receipt, lines, refs, ctx) => this.posBooked(receipt, lines, refs, ctx),
      canceled: (original, cancel, actor) => this.posCanceled(original, cancel, actor),
    };
  }

  private posArticles(query: string): PosArticle[] {
    const parts = this.parts(query)
      .sort((a, b) => (a.category === b.category ? 0 : a.category === "accessory" ? -1 : 1))
      .slice(0, 40)
      .map(partArticle);
    const used = this.usedDevices("inStock", query).slice(0, 20).map(usedArticle);
    const orders = this.list("pickup", query, 20).orders.map((row) => orderArticle(this.get(row.id)!));
    return [...orders, ...used, ...parts];
  }

  /** Gescannter Code: Artikelnummer eines Teils, Seriennummer/IMEI eines Gebrauchtgeräts oder Auftragsnummer. */
  private posScan(code: string): PosArticle[] {
    const parts = this.sql
      .exec<Row>("SELECT * FROM repair_parts WHERE active = 1 AND sku <> '' AND lower(sku) = lower(?)", code)
      .toArray()
      .map((r) => partArticle(partFromRow(r)));
    const serial = normalizeSerial(code);
    const used = serial
      ? this.sql.exec<Row>("SELECT * FROM repair_used_devices WHERE status = 'inStock' AND serial = ?", serial).toArray().map((r) => usedArticle(usedFromRow(r)))
      : [];
    const number = /^#?\d{1,9}$/.test(code) ? Number(code.replace("#", "")) : 0;
    const order = number ? this.sql.exec<Row>("SELECT id FROM repair_orders WHERE number = ?", number).toArray()[0] : undefined;
    const found = order ? this.get(S(order.id)) : null;
    const orders = found && PICKUP_STATUSES.includes(found.status) ? [orderArticle(found)] : [];
    return [...orders, ...used, ...parts];
  }

  /** Nach dem Bezahlen: Lager, Gebrauchtgeräte, Abholung und die Rechnung für Kundenkartei und Garantie. */
  private posBooked(receipt: Receipt | null, lines: PosLine[], refs: { kind: string; refId: string }[], ctx: PosContext) {
    const orderRefs = refs.filter((r) => r.kind === "order");
    if (orderRefs.length > 1) throw new RepairError("oneOrderPerReceipt");
    const settings = this.settings();
    const order = orderRefs[0] ? this.get(orderRefs[0].refId) : null;
    if (orderRefs[0] && (!order || !PICKUP_STATUSES.includes(order.status))) throw new RepairError("statusNotAllowed");

    if (receipt && (order || lines.some((l) => l.kind === "part" || l.kind === "used"))) {
      const used = lines.find((l) => l.kind === "used");
      const warranty = order ? (order.status === "ready" ? warrantyEnd(ctx.today, settings.warrantyMonths) : "") : used?.warrantyUntil ?? "";
      const others = receipt.lines.filter((l) => !(l.source === "repairs" && l.kind.startsWith("order:")));
      const items: InvoiceSnapshot["items"] = [
        ...(order?.items ?? []),
        ...others.map((l) => ({
          id: crypto.randomUUID(), kind: l.kind === "part" ? ("part" as const) : ("other" as const), partId: l.kind === "part" ? l.refId : null,
          name: l.name, qty: l.qty, unitCents: l.unitCents, vatRate: l.vatRate, ...(l.margin ? { margin: true } : {}), ...(l.warrantyUntil ? { warrantyUntil: l.warrantyUntil } : {}),
        })),
      ];
      const c = receipt.customer;
      const snapshot: InvoiceSnapshot = {
        company: receipt.company, customer: { name: c?.name ?? "", phone: c?.phone ?? "", email: c?.email ?? "", address: c?.address ?? "" },
        orderNumber: order?.number ?? null, device: order?.intake.device ?? null, items, totals: receipt.totals, depositCents: receipt.depositCents,
        smallBusiness: receipt.smallBusiness, payments: receipt.payments, changeCents: receipt.changeCents,
      };
      const main = [...receipt.payments].sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents))[0]?.method ?? "cash";
      const customerId = order?.customer.id ?? (c?.id && this.customer(c.id) ? c.id : null);
      this.sql.exec(
        "INSERT INTO repair_invoices (number, year, seq, order_id, total_cents, payment_method, warranty_until, snapshot, kind, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        receipt.number, Number(receipt.number.slice(3, 7)), Number(receipt.number.slice(8)), order?.id ?? crypto.randomUUID(), receipt.totals.grossCents, main,
        warranty, JSON.stringify(snapshot), order ? "repair" : "sale", customerId,
      );
    }

    for (const line of lines) {
      if (line.kind === "part" && line.refId && this.part(line.refId)) this.moveStock(line.refId, -Math.ceil(line.qty), "sold", order?.id ?? null, ctx.actor);
      if (line.kind === "used") {
        const done = this.sql.exec(
          "UPDATE repair_used_devices SET status = 'sold', sold_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), sale_invoice = ?, buyer_name = ?, warranty_until = ?, sold_cents = ? WHERE id = ? AND status != 'sold'",
          receipt?.number ?? null, receipt?.customer?.name ?? "", line.warrantyUntil ?? "", line.unitCents, line.refId,
        );
        if (!done.rowsWritten) throw new RepairError("alreadySold");
      }
    }

    if (order) {
      if (order.loaner) {
        this.sql.exec("UPDATE repair_loaners SET order_id = NULL, lent_at = NULL WHERE id = ?", order.loaner.id);
        this.event(order.id, null, "loanerBack", order.loaner.name, ctx.actor);
      }
      // Der Entsperr-Code wird nicht mehr gebraucht
      this.sql.exec("UPDATE repair_orders SET status = 'pickedUp', unlock_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", order.id);
      this.event(order.id, "pickedUp", "", receipt?.number ?? "", ctx.actor);
    }
  }

  /** Storno in der Kasse: Ware zurück ins Lager, Gebrauchtgerät wieder zu verkaufen, Auftrag wieder abholbereit. */
  private posCanceled(original: Receipt, cancel: Receipt, actor: Actor) {
    for (const line of original.lines) {
      if (line.source !== "repairs") continue;
      if (line.kind === "part" && line.refId && this.part(line.refId)) this.moveStock(line.refId, Math.ceil(line.qty), "returned", null, actor);
      if (line.kind === "used")
        this.sql.exec(
          "UPDATE repair_used_devices SET status = 'inStock', sold_at = NULL, sale_invoice = NULL, buyer_name = NULL, warranty_until = '', sold_cents = 0 WHERE id = ? AND sale_invoice = ?",
          line.refId, original.number,
        );
    }
    for (const ref of original.refs) {
      if (ref.source !== "repairs") continue;
      const order = this.get(ref.refId);
      if (!order) continue;
      if (ref.kind === "order" && order.status === "pickedUp") {
        const before = [...order.history].reverse().find((e) => e.status && e.status !== "pickedUp")?.status ?? "ready";
        this.sql.exec("UPDATE repair_orders SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", before, order.id);
        this.event(order.id, before, "receiptCanceled", cancel.number, actor);
      }
      if (ref.kind === "deposit") {
        // Schon mit der Rechnung verrechnet: erst die Rechnung stornieren
        if (order.status === "pickedUp" && order.intake.depositCents > 0) throw new RepairError("depositUsed");
        this.sql.exec("UPDATE repair_orders SET intake = ? WHERE id = ?", JSON.stringify({ ...order.intake, depositCents: 0 }), order.id);
        this.event(order.id, null, "depositCanceled", cancel.number, actor);
      }
    }
    this.sql.exec("UPDATE repair_invoices SET canceled_by = ? WHERE number = ?", cancel.number, original.number);
  }

  // ---------- Garantie ----------

  /** Alle Garantien: reparierte Geräte und verkaufte Gebrauchtgeräte. */
  warranties(query: string): WarrantyRow[] {
    const q = query.trim().toLowerCase();
    const repairs = this.sql
      .exec<Row>(
        `SELECT i.number, i.order_id, i.issued_at, i.warranty_until, i.snapshot FROM repair_invoices i
          WHERE i.kind = 'repair' AND i.warranty_until != '' AND i.canceled_by IS NULL ORDER BY i.warranty_until DESC LIMIT 500`,
      )
      .toArray()
      .map((r): WarrantyRow => {
        const snap = JSON.parse(S(r.snapshot)) as InvoiceSnapshot;
        return {
          source: "repair", refId: S(r.order_id), invoice: S(r.number), label: snap.items.map((i) => i.name).join(", "),
          device: snap.device!, customer: { name: snap.customer.name, phone: snap.customer.phone, email: snap.customer.email },
          from: S(r.issued_at), until: S(r.warranty_until),
        };
      });
    const sold = this.sql
      .exec<Row>("SELECT * FROM repair_used_devices WHERE status = 'sold' AND warranty_until != '' ORDER BY warranty_until DESC LIMIT 500")
      .toArray()
      .map((r): WarrantyRow => {
        const u = usedFromRow(r);
        const snap = this.invoice(u.saleInvoice ?? "")?.snapshot;
        return {
          source: "sale", refId: u.id, invoice: u.saleInvoice ?? "", label: `A-${u.number}`, device: u.device,
          customer: { name: u.buyerName ?? "", phone: snap?.customer.phone ?? "", email: snap?.customer.email ?? "" },
          from: u.soldAt ?? "", until: u.warrantyUntil,
        };
      });
    return [...repairs, ...sold]
      .filter((w) => !q || [w.customer.name, w.customer.phone, w.device.brand, w.device.model, w.invoice, w.label].join(" ").toLowerCase().includes(q)
        || normalizeSerial(w.device.serial).includes(normalizeSerial(q)))
      .sort((a, b) => b.until.localeCompare(a.until));
  }

  // ---------- Funktions-Check bei Ausgabe ----------

  saveOutChecks(id: string, checks: CheckList, actor: Actor): RepairOrder {
    this.open(id);
    this.sql.exec("UPDATE repair_orders SET out_checks = ? WHERE id = ?", JSON.stringify(checks), id);
    this.event(id, null, "outChecked", "", actor);
    this.touch(id);
    return this.get(id)!;
  }

  // ---------- Preisliste ----------

  prices(query: string): RepairPrice[] {
    const like = `%${query.trim().toLowerCase()}%`;
    return this.sql
      .exec<Row>(
        `SELECT * FROM repair_prices WHERE lower(brand || ' ' || model || ' ' || service) LIKE ?
          ORDER BY device_type, lower(brand), lower(model), lower(service) LIMIT 1000`,
        like,
      )
      .toArray()
      .map(priceFromRow);
  }

  savePrice(id: string | null, data: Omit<RepairPrice, "id">): RepairPrice {
    const priceId = id ?? crypto.randomUUID();
    if (id && !this.sql.exec("SELECT 1 FROM repair_prices WHERE id = ?", id).toArray().length) throw new RepairError("notFound");
    this.sql.exec(
      `INSERT INTO repair_prices (id, device_type, brand, model, service, price_cents, vat_rate, part_id, minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET device_type = excluded.device_type, brand = excluded.brand, model = excluded.model, service = excluded.service,
         price_cents = excluded.price_cents, vat_rate = excluded.vat_rate, part_id = excluded.part_id, minutes = excluded.minutes`,
      priceId, data.deviceType, data.brand, data.model, data.service, data.priceCents, data.vatRate, data.partId, data.minutes,
    );
    return priceFromRow(this.sql.exec<Row>("SELECT * FROM repair_prices WHERE id = ?", priceId).one());
  }

  removePrice(id: string): void {
    this.sql.exec("DELETE FROM repair_prices WHERE id = ?", id);
  }

  /**
   * Leistung aus der Preisliste in den Auftrag übernehmen. Ist ein Teil verknüpft und vorhanden,
   * wird es als eigene Position gebucht und die Arbeit macht den Rest des Preises aus.
   */
  applyPrice(id: string, priceId: string, actor: Actor): RepairOrder {
    const r = this.sql.exec<Row>("SELECT * FROM repair_prices WHERE id = ?", priceId).toArray()[0];
    if (!r) throw new RepairError("notFound");
    const price = priceFromRow(r);
    const part = price.partId ? this.part(price.partId) : null;
    if (part) {
      const partCents = Math.min(part.priceCents, price.priceCents);
      this.addItem(id, { kind: "part", partId: part.id, name: part.name, qty: 1, unitCents: partCents, vatRate: part.vatRate }, actor);
      if (price.priceCents > partCents) this.addItem(id, { kind: "labor", partId: null, name: price.service, qty: 1, unitCents: price.priceCents - partCents, vatRate: price.vatRate }, actor);
    } else {
      this.addItem(id, { kind: "labor", partId: null, name: price.service, qty: 1, unitCents: price.priceCents, vatRate: price.vatRate }, actor);
    }
    return this.get(id)!;
  }

  // ---------- Leihgeräte ----------

  loaners(): Loaner[] {
    return this.sql
      .exec<Row>(
        `SELECT l.*, o.number AS order_number, c.name AS customer_name FROM repair_loaners l
           LEFT JOIN repair_orders o ON o.id = l.order_id LEFT JOIN repair_customers c ON c.id = o.customer_id
          WHERE l.active = 1 ORDER BY lower(l.name)`,
      )
      .toArray()
      .map((r) => ({
        id: S(r.id), name: S(r.name), serial: S(r.serial), note: S(r.note), orderId: r.order_id === null ? null : S(r.order_id),
        orderNumber: r.order_number === null ? null : Number(r.order_number), customerName: r.customer_name === null ? null : S(r.customer_name),
        lentAt: r.lent_at === null ? null : S(r.lent_at),
      }));
  }

  saveLoaner(id: string | null, data: { name: string; serial: string; note: string }): Loaner[] {
    if (id) this.sql.exec("UPDATE repair_loaners SET name = ?, serial = ?, note = ? WHERE id = ?", data.name, data.serial, data.note, id);
    else this.sql.exec("INSERT INTO repair_loaners (id, name, serial, note) VALUES (?, ?, ?, ?)", crypto.randomUUID(), data.name, data.serial, data.note);
    return this.loaners();
  }

  removeLoaner(id: string): Loaner[] {
    const r = this.sql.exec<{ order_id: string | null }>("SELECT order_id FROM repair_loaners WHERE id = ?", id).toArray()[0];
    if (r?.order_id) throw new RepairError("loanerBusy");
    this.sql.exec("UPDATE repair_loaners SET active = 0 WHERE id = ?", id);
    return this.loaners();
  }

  /** Leihgerät an einen Auftrag geben (loanerId) oder zurücknehmen (null). */
  lend(id: string, loanerId: string | null, actor: Actor): RepairOrder {
    const order = this.open(id);
    this.transaction(() => {
      if (order.loaner) {
        this.sql.exec("UPDATE repair_loaners SET order_id = NULL, lent_at = NULL WHERE id = ?", order.loaner.id);
        this.event(id, null, "loanerBack", order.loaner.name, actor);
      }
      if (loanerId) {
        const l = this.sql.exec<Row>("SELECT * FROM repair_loaners WHERE id = ? AND active = 1", loanerId).toArray()[0];
        if (!l) throw new RepairError("notFound");
        if (l.order_id) throw new RepairError("loanerBusy");
        this.sql.exec("UPDATE repair_loaners SET order_id = ?, lent_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", id, loanerId);
        this.event(id, null, "loanerOut", S(l.name), actor);
      }
      this.touch(id);
    });
    return this.get(id)!;
  }

  private loanerOf(orderId: string): RepairOrder["loaner"] {
    const r = this.sql.exec<Row>("SELECT id, name, serial, lent_at FROM repair_loaners WHERE order_id = ?", orderId).toArray()[0];
    return r ? { id: S(r.id), name: S(r.name), serial: S(r.serial), lentAt: S(r.lent_at) } : null;
  }

  // ---------- Kundenkartei ----------

  customerList(query: string): (RepairCustomer & { orders: number; lastAt: string; totalCents: number })[] {
    const q = `%${query.trim().toLowerCase()}%`;
    return this.sql
      .exec<Row>(
        `SELECT c.*,
                (SELECT COUNT(*) FROM repair_orders o WHERE o.customer_id = c.id) AS orders,
                (SELECT COALESCE(SUM(total_cents), 0) FROM repair_invoices i WHERE i.customer_id = c.id AND i.canceled_by IS NULL) AS total,
                MAX(c.created_at, COALESCE((SELECT MAX(created_at) FROM repair_orders o WHERE o.customer_id = c.id), ''),
                    COALESCE((SELECT MAX(issued_at) FROM repair_invoices i WHERE i.customer_id = c.id), '')) AS last_at
           FROM repair_customers c
          WHERE lower(c.name) LIKE ? OR c.phone LIKE ? OR lower(c.email) LIKE ? OR lower(c.address) LIKE ?
          ORDER BY last_at DESC LIMIT 300`,
        q, q, q, q,
      )
      .toArray()
      .map((r) => ({ ...customerFromRow(r), orders: Number(r.orders), lastAt: S(r.last_at), totalCents: Number(r.total) }));
  }

  /** Alles zu einem Kunden: Aufträge, Rechnungen, Geräte. */
  customerCard(id: string): { customer: RepairCustomer; orders: OrderRow[]; invoices: { number: string; kind: InvoiceKind; issuedAt: string; totalCents: number; orderId: string; warrantyUntil: string }[] } | null {
    const r = this.sql.exec<Row>("SELECT * FROM repair_customers WHERE id = ?", id).toArray()[0];
    if (!r) return null;
    const orders = this.sql
      .exec<Row>(
        `SELECT o.id, o.number, o.status, o.intake, o.created_at, o.updated_at,
                (SELECT COALESCE(SUM(ROUND(i.qty * i.unit_cents)), 0) FROM repair_items i WHERE i.order_id = o.id) AS total
           FROM repair_orders o WHERE o.customer_id = ? ORDER BY o.number DESC LIMIT 200`,
        id,
      )
      .toArray()
      .map((o): OrderRow => {
        const intake = parseIntake(S(o.intake));
        return {
          id: S(o.id), number: Number(o.number), status: S(o.status) as RepairStatus, customerName: S(r.name), customerPhone: S(r.phone),
          device: intake.device, problem: intake.problem.slice(0, 140), dueDay: intake.dueDay, totalCents: Number(o.total),
          createdAt: S(o.created_at), updatedAt: S(o.updated_at),
        };
      });
    const invoices = this.sql
      .exec<Row>("SELECT number, kind, issued_at, total_cents, order_id, warranty_until FROM repair_invoices WHERE customer_id = ? ORDER BY issued_at DESC LIMIT 200", id)
      .toArray()
      .map((i) => ({ number: S(i.number), kind: S(i.kind) as InvoiceKind, issuedAt: S(i.issued_at), totalCents: Number(i.total_cents), orderId: S(i.order_id), warrantyUntil: S(i.warranty_until) }));
    return { customer: customerFromRow(r), orders, invoices };
  }

  saveCustomer(id: string, data: { name: string; phone: string; email: string; address: string; note: string }): RepairCustomer {
    if (!this.customer(id)) throw new RepairError("notFound");
    this.sql.exec("UPDATE repair_customers SET name = ?, phone = ?, email = ?, address = ?, note = ? WHERE id = ?", data.name, data.phone, data.email, data.address, data.note, id);
    return customerFromRow(this.sql.exec<Row>("SELECT * FROM repair_customers WHERE id = ?", id).one());
  }

  /** Neuer Kunde ohne Auftrag, z. B. für einen Verkauf. */
  addCustomer(data: { name: string; phone: string; email: string; address: string; note: string }): RepairCustomer {
    const id = crypto.randomUUID();
    this.sql.exec("INSERT INTO repair_customers (id, name, phone, email, address, note) VALUES (?, ?, ?, ?, ?, ?)", id, data.name, data.phone, data.email, data.address, data.note);
    return customerFromRow(this.sql.exec<Row>("SELECT * FROM repair_customers WHERE id = ?", id).one());
  }

  /** Kunde löschen: nur ohne Rechnungen (Aufbewahrungspflicht). Aufträge ohne Rechnung werden mit gelöscht. */
  removeCustomer(id: string, actor: Actor): void {
    if (!this.customer(id)) throw new RepairError("notFound");
    const hasInvoice = this.sql.exec(
      "SELECT 1 FROM repair_invoices WHERE customer_id = ? OR order_id IN (SELECT id FROM repair_orders WHERE customer_id = ?) LIMIT 1", id, id,
    ).toArray().length;
    if (hasInvoice) throw new RepairError("hasInvoice");
    for (const o of this.sql.exec<{ id: string }>("SELECT id FROM repair_orders WHERE customer_id = ?", id).toArray()) this.remove(o.id, actor);
    this.sql.exec("DELETE FROM repair_customers WHERE id = ?", id);
  }

  // ---------- Auswertung ----------

  /** Monatsauswertung. `month` = YYYY-MM, Tage nach deutscher Ortszeit. */
  stats(month: string): RepairStats {
    const local = berlinDay;
    const from = new Date(Date.parse(`${month}-01T00:00:00Z`) - 86_400_000).toISOString();
    const next = new Date(Date.parse(`${month}-01T00:00:00Z`));
    next.setUTCMonth(next.getUTCMonth() + 1);
    const to = new Date(next.getTime() + 86_400_000).toISOString();
    const inMonth = (iso: string | null) => !!iso && local(iso).startsWith(month);

    const revenue = { repairCents: 0, saleCents: 0, invoices: 0 };
    const daily = new Map<string, number>();
    const services = new Map<string, { n: number; cents: number }>();
    for (const r of this.sql.exec<Row>("SELECT kind, issued_at, total_cents, snapshot FROM repair_invoices WHERE issued_at >= ? AND issued_at < ? AND canceled_by IS NULL", from, to).toArray()) {
      if (!inMonth(S(r.issued_at))) continue;
      const cents = Number(r.total_cents);
      revenue.invoices++;
      if (S(r.kind) === "sale") revenue.saleCents += cents;
      else {
        revenue.repairCents += cents;
        for (const item of (JSON.parse(S(r.snapshot)) as InvoiceSnapshot).items) {
          if (item.kind !== "labor") continue;
          const s = services.get(item.name) ?? { n: 0, cents: 0 };
          s.n++;
          s.cents += Math.round(item.qty * item.unitCents);
          services.set(item.name, s);
        }
      }
      const d = local(S(r.issued_at));
      daily.set(d, (daily.get(d) ?? 0) + cents);
    }

    const orders = { received: 0, pickedUp: 0, open: 0, avgDays: null as number | null };
    const models = new Map<string, number>();
    for (const r of this.sql.exec<Row>("SELECT intake, created_at FROM repair_orders WHERE created_at >= ? AND created_at < ?", from, to).toArray()) {
      if (!inMonth(S(r.created_at))) continue;
      orders.received++;
      const d = (parseIntake(S(r.intake))).device;
      const label = [d.brand, d.model].filter(Boolean).join(" ");
      if (label) models.set(label, (models.get(label) ?? 0) + 1);
    }
    let days = 0;
    for (const r of this.sql
      .exec<Row>(
        `SELECT e.at, o.created_at FROM repair_events e JOIN repair_orders o ON o.id = e.order_id
          WHERE e.status = 'pickedUp' AND e.at >= ? AND e.at < ?`,
        from, to,
      )
      .toArray()) {
      if (!inMonth(S(r.at))) continue;
      orders.pickedUp++;
      days += (Date.parse(S(r.at)) - Date.parse(S(r.created_at))) / 86_400_000;
    }
    if (orders.pickedUp) orders.avgDays = Math.round((days / orders.pickedUp) * 10) / 10;
    orders.open = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM repair_orders WHERE status NOT IN ('pickedUp', 'canceled')").one().n;

    const used = { bought: 0, boughtCents: 0, sold: 0, soldCents: 0, profitCents: 0 };
    for (const r of this.sql.exec<Row>("SELECT purchased_at, sold_at, purchase_cents, sold_cents FROM repair_used_devices WHERE purchased_at >= ? OR sold_at >= ?", from, from).toArray()) {
      if (inMonth(S(r.purchased_at))) {
        used.bought++;
        used.boughtCents += Number(r.purchase_cents);
      }
      if (r.sold_at !== null && inMonth(S(r.sold_at))) {
        used.sold++;
        used.soldCents += Number(r.sold_cents);
        used.profitCents += Number(r.sold_cents) - Number(r.purchase_cents);
      }
    }

    const top = <T,>(m: Map<string, T>, key: (v: T) => number) => [...m.entries()].sort((a, b) => key(b[1]) - key(a[1])).slice(0, 5);
    return {
      month,
      revenue,
      orders,
      used,
      topModels: top(models, (n) => n).map(([label, n]) => ({ label, n })),
      topServices: top(services, (s) => s.n).map(([label, s]) => ({ label, ...s })),
      daily: [...daily.entries()].sort().map(([day, cents]) => ({ day, cents })),
    };
  }

  // ---------- intern ----------

  // ---------- Fotos und Unterschriften ----------

  photos(orderId: string): RepairPhoto[] {
    return this.sql
      .exec<Row>("SELECT id, stage, at, user_name FROM repair_photos WHERE order_id = ? ORDER BY at", orderId)
      .toArray()
      .map((r) => ({ id: S(r.id), stage: S(r.stage) as PhotoStage, at: S(r.at), userName: r.user_name === null ? null : S(r.user_name) }));
  }

  photo(orderId: string, photoId: string): string | null {
    const r = this.sql.exec<{ data: string }>("SELECT data FROM repair_photos WHERE id = ? AND order_id = ?", photoId, orderId).toArray()[0];
    return r ? r.data : null;
  }

  addPhoto(orderId: string, stage: PhotoStage, data: string, actor: Actor): RepairPhoto[] {
    this.existing(orderId);
    const n = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM repair_photos WHERE order_id = ?", orderId).one().n;
    if (n >= MAX_PHOTOS) throw new RepairError("tooManyPhotos");
    this.sql.exec("INSERT INTO repair_photos (id, order_id, stage, data, user_name) VALUES (?, ?, ?, ?, ?)", crypto.randomUUID(), orderId, stage, data, actor.name);
    this.touch(orderId);
    return this.photos(orderId);
  }

  removePhoto(orderId: string, photoId: string): RepairPhoto[] {
    this.sql.exec("DELETE FROM repair_photos WHERE id = ? AND order_id = ?", photoId, orderId);
    return this.photos(orderId);
  }

  /** Unterschrift des Kunden bei Annahme oder Abholung speichern (null = entfernen). */
  sign(orderId: string, kind: "intake" | "pickup", data: string | null, actor: Actor): RepairOrder {
    this.existing(orderId);
    this.transaction(() => {
      this.sql.exec(`UPDATE repair_orders SET ${kind === "intake" ? "signature" : "pickup_signature"} = ? WHERE id = ?`, data, orderId);
      if (data) this.event(orderId, null, kind === "intake" ? "signed" : "signedPickup", "", actor);
      this.touch(orderId);
    });
    return this.get(orderId)!;
  }

  /** Nachricht per WhatsApp oder SMS im Verlauf vermerken (gesendet wird auf dem Gerät des Mitarbeiters). */
  logMessage(orderId: string, channel: "whatsapp" | "sms" | "copy", name: string, actor: Actor): RepairOrder {
    this.existing(orderId);
    this.event(orderId, null, "message", `${channel}:${name}`, actor);
    return this.get(orderId)!;
  }

  // ---------- Online-Termine ----------

  bookings(scope: "open" | "all", today: string): RepairBooking[] {
    const rows = scope === "open"
      ? this.sql.exec<Row>(
          `SELECT b.*, o.number AS order_number FROM repair_bookings b LEFT JOIN repair_orders o ON o.id = b.order_id
            WHERE b.status = 'new' OR (b.status = 'confirmed' AND b.day >= ?) ORDER BY b.day, b.time LIMIT 300`, today,
        ).toArray()
      : this.sql.exec<Row>(
          `SELECT b.*, o.number AS order_number FROM repair_bookings b LEFT JOIN repair_orders o ON o.id = b.order_id
            ORDER BY b.day DESC, b.time DESC LIMIT 300`,
        ).toArray();
    return rows.map(bookingFromRow);
  }

  booking(id: string): RepairBooking | null {
    const r = this.sql.exec<Row>("SELECT b.*, o.number AS order_number FROM repair_bookings b LEFT JOIN repair_orders o ON o.id = b.order_id WHERE b.id = ?", id).toArray()[0];
    return r ? bookingFromRow(r) : null;
  }

  bookingByToken(token: string): RepairBooking | null {
    const r = this.sql.exec<{ id: string }>("SELECT id FROM repair_bookings WHERE token = ?", token).toArray()[0];
    return r ? this.booking(r.id) : null;
  }

  bookingToken(id: string): string | null {
    const r = this.sql.exec<{ token: string }>("SELECT token FROM repair_bookings WHERE id = ?", id).toArray()[0];
    return r ? r.token : null;
  }

  /** Belegte Termine ab einem Tag: „Tag Uhrzeit“ → Anzahl. */
  bookingTaken(fromDay: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.sql.exec<{ day: string; time: string; n: number }>(
      "SELECT day, time, COUNT(*) AS n FROM repair_bookings WHERE day >= ? AND status IN ('new', 'confirmed') GROUP BY day, time", fromDay,
    ).toArray()) out[`${r.day} ${r.time}`] = r.n;
    return out;
  }

  /** Neuer Termin. perSlot = 0: der Laden darf auch einen vollen Termin doppelt vergeben. */
  addBooking(input: BookingInput, source: "online" | "shop", perSlot: number): RepairBooking {
    const id = crypto.randomUUID();
    this.transaction(() => {
      if (perSlot > 0) {
        const n = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM repair_bookings WHERE day = ? AND time = ? AND status IN ('new', 'confirmed')", input.day, input.time).one().n;
        if (n >= perSlot) throw new RepairError("slotTaken");
      }
      this.sql.exec(
        `INSERT INTO repair_bookings (id, token, status, source, day, time, name, phone, email, device, problem, lang)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, randomToken() + randomToken().slice(0, 4), source === "shop" ? "confirmed" : "new", source, input.day, input.time,
        input.name, input.phone, input.email, JSON.stringify(input.device), input.problem, input.lang,
      );
    });
    return this.booking(id)!;
  }

  updateBooking(id: string, input: BookingInput): RepairBooking {
    if (!this.booking(id)) throw new RepairError("notFound");
    this.sql.exec(
      "UPDATE repair_bookings SET day = ?, time = ?, name = ?, phone = ?, email = ?, device = ?, problem = ?, lang = ? WHERE id = ?",
      input.day, input.time, input.name, input.phone, input.email, JSON.stringify(input.device), input.problem, input.lang, id,
    );
    return this.booking(id)!;
  }

  setBookingStatus(id: string, status: BookingStatus): RepairBooking {
    const booking = this.booking(id);
    if (!booking) throw new RepairError("notFound");
    if (booking.status === "done" && status !== "done") throw new RepairError("statusNotAllowed");
    this.sql.exec("UPDATE repair_bookings SET status = ? WHERE id = ?", status, id);
    return this.booking(id)!;
  }

  /** Aus dem Termin wurde ein Auftrag. */
  linkBooking(id: string, orderId: string): void {
    this.sql.exec("UPDATE repair_bookings SET status = 'done', order_id = ? WHERE id = ?", orderId, id);
  }

  removeBooking(id: string): void {
    this.sql.exec("DELETE FROM repair_bookings WHERE id = ?", id);
  }

  bookingCounts(today: string): { new: number; today: number } {
    const r = this.sql.exec<{ fresh: number; today: number }>(
      `SELECT SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS fresh,
              SUM(CASE WHEN status IN ('new', 'confirmed') AND day = ? THEN 1 ELSE 0 END) AS today FROM repair_bookings`, today,
    ).one();
    return { new: r.fresh ?? 0, today: r.today ?? 0 };
  }

  // ---------- Lieferanten und Bestellungen ----------

  suppliers(): (Supplier & { open: number })[] {
    return this.sql
      .exec<Row>(
        `SELECT s.*, (SELECT COUNT(*) FROM repair_purchases p WHERE p.supplier_id = s.id AND p.status IN ('draft', 'ordered')) AS open
           FROM repair_suppliers s ORDER BY lower(s.name)`,
      )
      .toArray()
      .map((r) => ({ ...supplierFromRow(r), open: Number(r.open) }));
  }

  saveSupplier(id: string | null, data: Omit<Supplier, "id">): (Supplier & { open: number })[] {
    if (id) {
      this.sql.exec(
        "UPDATE repair_suppliers SET name = ?, contact = ?, phone = ?, email = ?, website = ?, customer_no = ?, note = ? WHERE id = ?",
        data.name, data.contact, data.phone, data.email, data.website, data.customerNo, data.note, id,
      );
    } else {
      this.sql.exec(
        "INSERT INTO repair_suppliers (id, name, contact, phone, email, website, customer_no, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        crypto.randomUUID(), data.name, data.contact, data.phone, data.email, data.website, data.customerNo, data.note,
      );
    }
    return this.suppliers();
  }

  removeSupplier(id: string): (Supplier & { open: number })[] {
    const used = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM repair_purchases WHERE supplier_id = ?", id).one().n;
    if (used) throw new RepairError("supplierUsed");
    this.sql.exec("DELETE FROM repair_suppliers WHERE id = ?", id);
    return this.suppliers();
  }

  purchases(scope: "open" | "done" | "all"): PurchaseOrder[] {
    const where = scope === "open" ? "WHERE p.status IN ('draft', 'ordered')" : scope === "done" ? "WHERE p.status IN ('received', 'canceled')" : "";
    return this.sql
      .exec<Row>(
        `SELECT p.*, COALESCE(s.name, '') AS supplier_name FROM repair_purchases p LEFT JOIN repair_suppliers s ON s.id = p.supplier_id
          ${where} ORDER BY p.number DESC LIMIT 200`,
      )
      .toArray()
      .map((r) => this.purchaseFromRow(r));
  }

  purchase(id: string): PurchaseOrder | null {
    const r = this.sql.exec<Row>(
      "SELECT p.*, COALESCE(s.name, '') AS supplier_name FROM repair_purchases p LEFT JOIN repair_suppliers s ON s.id = p.supplier_id WHERE p.id = ?", id,
    ).toArray()[0];
    return r ? this.purchaseFromRow(r) : null;
  }

  /** Neue Bestellung oder Änderung, solange noch nichts geliefert wurde. */
  savePurchase(id: string | null, supplierId: string, note: string, lines: PurchaseLineInput[], actor: Actor): PurchaseOrder {
    if (!this.sql.exec("SELECT 1 FROM repair_suppliers WHERE id = ?", supplierId).toArray().length) throw new RepairError("notFound");
    if (id) {
      const existing = this.purchase(id);
      if (!existing) throw new RepairError("notFound");
      if (!["draft", "ordered"].includes(existing.status) || existing.lines.some((l) => l.received > 0)) throw new RepairError("purchaseLocked");
    }
    const purchaseId = id ?? crypto.randomUUID();
    this.transaction(() => {
      if (id) {
        this.sql.exec("UPDATE repair_purchases SET supplier_id = ?, note = ? WHERE id = ?", supplierId, note, id);
        this.sql.exec("DELETE FROM repair_purchase_lines WHERE purchase_id = ?", id);
      } else {
        const number = (this.sql.exec<{ n: number | null }>("SELECT MAX(number) AS n FROM repair_purchases").one().n ?? 0) + 1;
        this.sql.exec("INSERT INTO repair_purchases (id, number, supplier_id, note, created_by) VALUES (?, ?, ?, ?, ?)", purchaseId, number, supplierId, note, actor.name);
      }
      lines.forEach((l, position) => {
        const orderId = l.orderNumber
          ? this.sql.exec<{ id: string }>("SELECT id FROM repair_orders WHERE number = ?", l.orderNumber).toArray()[0]?.id ?? null
          : null;
        const partId = l.partId && this.part(l.partId) ? l.partId : null;
        this.sql.exec(
          "INSERT INTO repair_purchase_lines (id, purchase_id, part_id, name, qty, unit_cents, order_id, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          crypto.randomUUID(), purchaseId, partId, l.name, l.qty, l.unitCents, orderId, position,
        );
      });
    });
    return this.purchase(purchaseId)!;
  }

  setPurchaseStatus(id: string, status: "draft" | "ordered" | "canceled", actor: Actor): PurchaseOrder {
    const p = this.purchase(id);
    if (!p) throw new RepairError("notFound");
    if (p.status === "received" || (status !== "ordered" && p.lines.some((l) => l.received > 0))) throw new RepairError("purchaseLocked");
    if (status === "ordered" && !p.lines.length) throw new RepairError("emptyPurchase");
    this.transaction(() => {
      this.sql.exec(
        `UPDATE repair_purchases SET status = ?, ordered_at = CASE WHEN ? = 'ordered' THEN COALESCE(ordered_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE ordered_at END WHERE id = ?`,
        status, status, id,
      );
      if (status === "ordered" && p.status !== "ordered") {
        for (const l of p.lines) if (l.orderId) (this.event(l.orderId, null, "partOrdered", `${l.name} · ${p.supplierName}`, actor), this.touch(l.orderId));
      }
    });
    return this.purchase(id)!;
  }

  /** Wareneingang: Menge je Position, bucht ins Lager und meldet wartende Aufträge. */
  receivePurchase(id: string, quantities: Record<string, number>, actor: Actor): PurchaseOrder {
    const p = this.purchase(id);
    if (!p) throw new RepairError("notFound");
    if (p.status !== "ordered" && p.status !== "draft") throw new RepairError("purchaseLocked");
    this.transaction(() => {
      for (const l of p.lines) {
        const n = Math.min(Math.max(Math.round(quantities[l.id] ?? 0), 0), l.qty - l.received);
        if (!n) continue;
        this.sql.exec("UPDATE repair_purchase_lines SET received = received + ? WHERE id = ?", n, l.id);
        if (l.partId && this.part(l.partId)) {
          this.moveStock(l.partId, n, "received", null, actor);
          if (l.unitCents) this.sql.exec("UPDATE repair_parts SET purchase_cents = ? WHERE id = ?", l.unitCents, l.partId);
        }
        if (l.orderId) (this.event(l.orderId, null, "partArrived", `${n} × ${l.name}`, actor), this.touch(l.orderId));
      }
      const open = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM repair_purchase_lines WHERE purchase_id = ? AND received < qty", id).one().n;
      this.sql.exec(
        `UPDATE repair_purchases SET status = ?, ordered_at = COALESCE(ordered_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                received_at = CASE WHEN ? = 'received' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END WHERE id = ?`,
        open ? "ordered" : "received", open ? "ordered" : "received", id,
      );
    });
    return this.purchase(id)!;
  }

  removePurchase(id: string): void {
    const p = this.purchase(id);
    if (!p) return;
    if (p.status === "received" || p.lines.some((l) => l.received > 0)) throw new RepairError("purchaseLocked");
    this.transaction(() => {
      this.sql.exec("DELETE FROM repair_purchase_lines WHERE purchase_id = ?", id);
      this.sql.exec("DELETE FROM repair_purchases WHERE id = ?", id);
    });
  }

  private purchaseFromRow(r: Row): PurchaseOrder {
    const lines = this.sql
      .exec<Row>(
        `SELECT l.*, o.number AS order_number FROM repair_purchase_lines l LEFT JOIN repair_orders o ON o.id = l.order_id
          WHERE l.purchase_id = ? ORDER BY l.position`, S(r.id),
      )
      .toArray()
      .map((l) => ({
        id: S(l.id), partId: l.part_id === null ? null : S(l.part_id), name: S(l.name), qty: Number(l.qty), received: Number(l.received),
        unitCents: Number(l.unit_cents), orderId: l.order_id === null ? null : S(l.order_id), orderNumber: l.order_number === null ? null : Number(l.order_number),
      }));
    return {
      id: S(r.id), number: Number(r.number), supplierId: S(r.supplier_id), supplierName: S(r.supplier_name), status: S(r.status) as PurchaseStatus,
      note: S(r.note), lines, totalCents: lines.reduce((s, l) => s + l.qty * l.unitCents, 0), createdAt: S(r.created_at),
      createdBy: r.created_by === null ? null : S(r.created_by), orderedAt: r.ordered_at === null ? null : S(r.ordered_at),
      receivedAt: r.received_at === null ? null : S(r.received_at),
    };
  }

  private partOrders(orderId: string): OrderPartOrder[] {
    return this.sql
      .exec<Row>(
        `SELECT p.id, p.number, p.status, COALESCE(s.name, '') AS supplier_name, l.name, l.qty, l.received
           FROM repair_purchase_lines l JOIN repair_purchases p ON p.id = l.purchase_id LEFT JOIN repair_suppliers s ON s.id = p.supplier_id
          WHERE l.order_id = ? AND p.status != 'canceled' ORDER BY p.number`, orderId,
      )
      .toArray()
      .map((r) => ({
        purchaseId: S(r.id), purchaseNumber: Number(r.number), supplierName: S(r.supplier_name), status: S(r.status) as PurchaseStatus,
        name: S(r.name), qty: Number(r.qty), received: Number(r.received),
      }));
  }

  /** Auftrag muss existieren (auch abgeschlossene). */
  private existing(id: string) {
    if (!this.sql.exec("SELECT 1 FROM repair_orders WHERE id = ?", id).toArray().length) throw new RepairError("notFound");
  }

  private open(id: string): RepairOrder {
    const order = this.get(id);
    if (!order) throw new RepairError("notFound");
    if (CLOSED_STATUSES.includes(order.status)) throw new RepairError("orderClosed");
    return order;
  }

  private items(orderId: string): RepairItem[] {
    return this.sql
      .exec<Row>("SELECT * FROM repair_items WHERE order_id = ? ORDER BY position", orderId)
      .toArray()
      .map((r) => ({
        id: S(r.id), kind: S(r.kind) as RepairItem["kind"], partId: r.part_id === null ? null : S(r.part_id), name: S(r.name),
        qty: Number(r.qty), unitCents: Number(r.unit_cents), vatRate: Number(r.vat_rate),
      }));
  }

  private history(orderId: string): RepairEvent[] {
    return this.sql
      .exec<Row>("SELECT * FROM repair_events WHERE order_id = ? ORDER BY id", orderId)
      .toArray()
      .map((r) => ({
        id: Number(r.id), at: S(r.at), status: r.status === null ? null : (S(r.status) as RepairStatus), event: S(r.event), note: S(r.note),
        userName: r.user_name === null ? null : S(r.user_name),
      }));
  }

  private event(orderId: string, status: RepairStatus | null, event: string, note: string, actor: Actor) {
    this.sql.exec("INSERT INTO repair_events (order_id, status, event, note, user_name) VALUES (?, ?, ?, ?, ?)", orderId, status, event, note, actor.name);
  }

  private touch(id: string) {
    this.sql.exec("UPDATE repair_orders SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", id);
  }

  private moveStock(partId: string, delta: number, reason: string, orderId: string | null, actor: Actor) {
    if (!delta) return;
    this.sql.exec("UPDATE repair_parts SET stock = stock + ? WHERE id = ?", delta, partId);
    this.sql.exec("INSERT INTO repair_stock_moves (part_id, delta, reason, order_id, user_name) VALUES (?, ?, ?, ?, ?)", partId, delta, reason, orderId, actor.name);
  }
}

/** Tag nach deutscher Ortszeit, damit ein Verkauf um 0:30 Uhr zum richtigen Tag gehört. */
const partArticle = (p: RepairPart): PosArticle => ({
  source: "repairs", kind: "part", refId: p.id, name: p.name, detail: p.sku, priceCents: p.priceCents, vatRate: p.vatRate, stock: p.stock,
});

const usedArticle = (d: UsedDevice): PosArticle => ({
  source: "repairs", kind: "used", refId: d.id, name: [usedLabel(d.device), d.device.storage].filter(Boolean).join(" · "), detail: `A-${d.number}`,
  priceCents: d.priceCents, vatRate: 0, margin: true, single: true,
});

const orderArticle = (o: RepairOrder): PosArticle => ({
  source: "repairs", kind: "order", refId: o.id, name: `#${o.number}${usedLabel(o.intake.device) ? ` · ${usedLabel(o.intake.device)}` : ""}`, detail: o.customer.name,
  priceCents: o.items.reduce((sum, i) => sum + Math.round(i.qty * i.unitCents), 0), vatRate: 0, single: true,
  depositCents: o.intake.depositCents, ...(o.loaner ? { loaner: o.loaner.name } : {}),
});

export const berlinDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });

/** Ältere Aufträge kennen manche Felder noch nicht. */
function parseIntake(json: string): RepairIntake {
  return { warrantyRef: "", checks: {}, planned: [], ...(JSON.parse(json) as Partial<RepairIntake>) } as RepairIntake;
}

function customerFromRow(r: Row): RepairCustomer {
  return { id: S(r.id), name: S(r.name), phone: S(r.phone), email: S(r.email), address: S(r.address ?? ""), note: S(r.note ?? "") };
}

function bookingFromRow(r: Row): RepairBooking {
  return {
    id: S(r.id), status: S(r.status) as BookingStatus, source: S(r.source) as RepairBooking["source"], day: S(r.day), time: S(r.time),
    name: S(r.name), phone: S(r.phone), email: S(r.email), device: JSON.parse(S(r.device)) as RepairBooking["device"], problem: S(r.problem),
    lang: S(r.lang), orderId: r.order_id === null ? null : S(r.order_id), orderNumber: r.order_number === null || r.order_number === undefined ? null : Number(r.order_number),
    createdAt: S(r.created_at),
  };
}

function supplierFromRow(r: Row): Supplier {
  return {
    id: S(r.id), name: S(r.name), contact: S(r.contact), phone: S(r.phone), email: S(r.email), website: S(r.website),
    customerNo: S(r.customer_no), note: S(r.note),
  };
}

function priceFromRow(r: Row): RepairPrice {
  return {
    id: S(r.id), deviceType: S(r.device_type) as RepairPrice["deviceType"], brand: S(r.brand), model: S(r.model), service: S(r.service),
    priceCents: Number(r.price_cents), vatRate: Number(r.vat_rate), partId: r.part_id === null ? null : S(r.part_id), minutes: Number(r.minutes),
  };
}

function partFromRow(r: Row): RepairPart {
  return {
    id: S(r.id), sku: S(r.sku), name: S(r.name), category: S(r.category) as RepairPart["category"], fits: S(r.fits),
    stock: Number(r.stock), minStock: Number(r.min_stock), purchaseCents: Number(r.purchase_cents), priceCents: Number(r.price_cents), vatRate: Number(r.vat_rate),
  };
}

function usedFromRow(r: Row): UsedDevice {
  return {
    id: S(r.id), number: Number(r.number), status: S(r.status) as UsedDevice["status"], device: JSON.parse(S(r.device)) as UsedDevice["device"],
    grade: S(r.grade) as UsedDevice["grade"], note: S(r.note), purchaseCents: Number(r.purchase_cents), priceCents: Number(r.price_cents),
    seller: { ...(JSON.parse(S(r.seller)) as Omit<UsedDevice["seller"], "hasIdNumber">), hasIdNumber: !!r.id_number },
    payout: S(r.payout) as PaymentMethod, purchasedAt: S(r.purchased_at), purchasedBy: r.purchased_by === null ? null : S(r.purchased_by),
    soldAt: r.sold_at === null ? null : S(r.sold_at), saleInvoice: r.sale_invoice === null ? null : S(r.sale_invoice),
    buyerName: r.buyer_name === null ? null : S(r.buyer_name), warrantyUntil: S(r.warranty_until),
  };
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Gerät kurz, z. B. „Apple iPhone 13“. */
function usedLabel(device: { brand: string; model: string }) {
  return [device.brand, device.model].filter(Boolean).join(" ");
}
