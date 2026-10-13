import {
  CLOSED_STATUSES, DEFAULT_REPAIR_SETTINGS, PICKUP_STATUSES, STATUS_GROUPS, canChangeStatus, computeTotals, invoiceNumber, normalizeSerial,
  warrantyEnd,
  type InvoiceSnapshot, type PaymentMethod, type QuoteDecision, type RepairCustomer, type RepairEvent, type RepairIntake, type RepairInvoice,
  type RepairItem, type RepairOrder, type RepairOrderRow, type RepairPart, type RepairSettings, type RepairStatus, type StatusGroup,
  type InvoiceKind, type SaleLine, type UsedDevice, type UsedDeviceInput, type WarrantyRow,
} from "../../shared/repairs";

// Daten des Systems „Handy- & IT-Service“ in der Datenbank der Firma.
// Läuft im Durable Object der Firma; der Kern ruft alles über TenantDatabase.repairs() auf.

export const REPAIR_MIGRATIONS: string[] = [
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
];

type Row = Record<string, string | number | null>;
export class RepairError extends Error {
  constructor(public code: "notFound" | "statusNotAllowed" | "orderClosed" | "hasInvoice" | "alreadySold" | "emptySale") {
    super(code);
  }
}

const S = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export interface Actor {
  id: string | null;
  name: string | null;
}

export class RepairStore {
  constructor(private sql: SqlStorage, private transaction: <T>(fn: () => T) => T) {}

  // ---------- Einstellungen ----------

  settings(): RepairSettings {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'repairs'").toArray()[0];
    return row ? { ...DEFAULT_REPAIR_SETTINGS, ...(JSON.parse(row.value) as Partial<RepairSettings>) } : DEFAULT_REPAIR_SETTINGS;
  }

  saveSettings(settings: RepairSettings): RepairSettings {
    this.sql.exec(
      `INSERT INTO settings (key, value) VALUES ('repairs', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      JSON.stringify(settings),
    );
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
      .map((r) => ({ id: S(r.id), name: S(r.name), phone: S(r.phone), email: S(r.email), orders: Number(r.orders) }));
  }

  private customer(id: string): RepairCustomer | null {
    const r = this.sql.exec<Row>("SELECT * FROM repair_customers WHERE id = ?", id).toArray()[0];
    return r ? { id: S(r.id), name: S(r.name), phone: S(r.phone), email: S(r.email) } : null;
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
      const intake = JSON.parse(S(r.intake)) as RepairIntake;
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
    });
    return this.get(id)!;
  }

  get(id: string): RepairOrder | null {
    const r = this.sql.exec<Row>("SELECT * FROM repair_orders WHERE id = ?", id).toArray()[0];
    if (!r) return null;
    const customer = this.customer(S(r.customer_id)) ?? { id: S(r.customer_id), name: "", phone: "", email: "" };
    const invoiceRow = this.sql.exec<Row>("SELECT * FROM repair_invoices WHERE order_id = ?", id).toArray()[0];
    const invoice: RepairInvoice | null = invoiceRow
      ? {
          number: S(invoiceRow.number), issuedAt: S(invoiceRow.issued_at), totalCents: Number(invoiceRow.total_cents),
          paymentMethod: S(invoiceRow.payment_method) as PaymentMethod, warrantyUntil: S(invoiceRow.warranty_until),
          snapshot: JSON.parse(S(invoiceRow.snapshot)) as InvoiceSnapshot,
        }
      : null;
    return {
      id: S(r.id), number: Number(r.number), status: S(r.status) as RepairStatus, customer,
      intake: JSON.parse(S(r.intake)) as RepairIntake, quote: r.quote ? (S(r.quote) as QuoteDecision) : null,
      items: this.items(id), history: this.history(id), invoice, hasUnlockCode: !!r.unlock_code, publicToken: S(r.public_token),
      createdAt: S(r.created_at), updatedAt: S(r.updated_at), createdBy: r.created_by === null ? null : S(r.created_by),
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

  update(id: string, customer: Omit<RepairCustomer, "id">, intake: RepairIntake, unlockCode: string | null | undefined, actor: Actor): RepairOrder {
    const order = this.open(id);
    this.transaction(() => {
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

  /**
   * Abholung: Rechnung mit fortlaufender Nummer, Garantie-Ende, Status „abgeholt“.
   * Der Entsperr-Code wird dabei gelöscht, er wird nicht mehr gebraucht.
   */
  pickUp(id: string, payment: PaymentMethod, company: InvoiceSnapshot["company"], actor: Actor, today: string): RepairOrder {
    const order = this.get(id);
    if (!order) throw new RepairError("notFound");
    if (!PICKUP_STATUSES.includes(order.status)) throw new RepairError("statusNotAllowed");
    const settings = this.settings();
    const totals = computeTotals(order.items, settings.smallBusiness);
    const repaired = order.status === "ready";
    this.transaction(() => {
      if (totals.grossCents > 0 || order.intake.depositCents > 0) {
        const { year, seq } = this.nextInvoice(today);
        const snapshot: InvoiceSnapshot = {
          company, customer: { name: order.customer.name, phone: order.customer.phone, email: order.customer.email }, orderNumber: order.number,
          device: order.intake.device, items: order.items, totals, depositCents: order.intake.depositCents, smallBusiness: settings.smallBusiness,
        };
        this.sql.exec(
          "INSERT INTO repair_invoices (number, year, seq, order_id, total_cents, payment_method, warranty_until, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          invoiceNumber(year, seq), year, seq, id, totals.grossCents, payment, repaired ? warrantyEnd(today, settings.warrantyMonths) : "", JSON.stringify(snapshot),
        );
      }
      this.sql.exec(
        "UPDATE repair_orders SET status = 'pickedUp', unlock_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        id,
      );
      this.event(id, "pickedUp", "", "", actor);
    });
    return this.get(id)!;
  }

  /** Auftrag löschen, nur ohne Rechnung. Teile gehen zurück ins Lager. */
  remove(id: string, actor: Actor): void {
    const order = this.get(id);
    if (!order) throw new RepairError("notFound");
    if (order.invoice) throw new RepairError("hasInvoice");
    this.transaction(() => {
      if (order.status !== "canceled") for (const item of order.items) if (item.partId && this.part(item.partId)) this.moveStock(item.partId, Math.ceil(item.qty), "orderDeleted", id, actor);
      this.sql.exec("DELETE FROM repair_items WHERE order_id = ?", id);
      this.sql.exec("DELETE FROM repair_events WHERE order_id = ?", id);
      this.sql.exec("DELETE FROM repair_orders WHERE id = ?", id);
      // Kunden ohne weitere Aufträge nicht aufheben (Datensparsamkeit)
      this.sql.exec("DELETE FROM repair_customers WHERE id = ? AND NOT EXISTS (SELECT 1 FROM repair_orders WHERE customer_id = ?)", order.customer.id, order.customer.id);
    });
  }

  invoices(year: number): { number: string; kind: InvoiceKind; issuedAt: string; totalCents: number; paymentMethod: PaymentMethod; orderId: string; orderNumber: number | null; customerName: string }[] {
    return this.sql
      .exec<Row>(
        `SELECT i.number, i.kind, i.issued_at, i.total_cents, i.payment_method, i.order_id, i.snapshot FROM repair_invoices i WHERE i.year = ? ORDER BY i.seq DESC`,
        year,
      )
      .toArray()
      .map((r) => {
        const snap = JSON.parse(S(r.snapshot)) as InvoiceSnapshot;
        return {
          number: S(r.number), kind: S(r.kind) as InvoiceKind, issuedAt: S(r.issued_at), totalCents: Number(r.total_cents), paymentMethod: S(r.payment_method) as PaymentMethod,
          orderId: S(r.order_id), orderNumber: snap.orderNumber, customerName: snap.customer.name,
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
          paymentMethod: S(r.payment_method) as PaymentMethod, warrantyUntil: S(r.warranty_until), snapshot: JSON.parse(S(r.snapshot)) as InvoiceSnapshot,
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
    return this.usedDevice(id)!;
  }

  removeUsed(id: string): void {
    const before = this.usedDevice(id);
    if (!before) throw new RepairError("notFound");
    if (before.status === "sold") throw new RepairError("alreadySold");
    this.sql.exec("DELETE FROM repair_used_devices WHERE id = ?", id);
  }

  /**
   * Verkauf von Zubehör, Teilen und Gebrauchtgeräten mit Rechnung im selben Nummernkreis.
   * Gebrauchtgeräte werden nach § 25a UStG (Differenzbesteuerung) ohne ausgewiesene Steuer berechnet.
   */
  sell(lines: SaleLine[], customer: InvoiceSnapshot["customer"], payment: PaymentMethod, company: InvoiceSnapshot["company"], actor: Actor, today: string): RepairInvoice & { kind: InvoiceKind; orderId: string } {
    if (!lines.length) throw new RepairError("emptySale");
    const settings = this.settings();
    const saleId = crypto.randomUUID();
    const warranty = warrantyEnd(today, settings.usedWarrantyMonths);
    let number = "";
    this.transaction(() => {
      const items: InvoiceSnapshot["items"] = [];
      for (const line of lines) {
        if (line.kind === "part") {
          if (!this.part(line.refId!)) throw new RepairError("notFound");
          this.moveStock(line.refId!, -Math.ceil(line.qty), "sold", null, actor);
        }
        if (line.kind === "used") {
          const used = this.usedDevice(line.refId!);
          if (!used) throw new RepairError("notFound");
          if (used.status === "sold") throw new RepairError("alreadySold");
        }
        items.push({
          id: crypto.randomUUID(), kind: line.kind === "other" ? "other" : "part", partId: line.kind === "part" ? line.refId : null, name: line.name,
          qty: line.qty, unitCents: line.unitCents, vatRate: line.kind === "used" ? 0 : line.vatRate,
          ...(line.kind === "used" ? { margin: true, warrantyUntil: warranty } : {}),
        });
      }
      const totals = computeTotals(items, settings.smallBusiness);
      const { year, seq } = this.nextInvoice(today);
      number = invoiceNumber(year, seq);
      const snapshot: InvoiceSnapshot = { company, customer, orderNumber: null, device: null, items, totals, depositCents: 0, smallBusiness: settings.smallBusiness };
      this.sql.exec(
        "INSERT INTO repair_invoices (number, year, seq, order_id, total_cents, payment_method, warranty_until, snapshot, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sale')",
        number, year, seq, saleId, totals.grossCents, payment, lines.some((l) => l.kind === "used") ? warranty : "", JSON.stringify(snapshot),
      );
      for (const line of lines)
        if (line.kind === "used")
          this.sql.exec(
            "UPDATE repair_used_devices SET status = 'sold', sold_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), sale_invoice = ?, buyer_name = ?, warranty_until = ? WHERE id = ?",
            number, customer.name, warranty, line.refId,
          );
    });
    return this.invoice(number)!;
  }

  // ---------- Garantie ----------

  /** Alle Garantien: reparierte Geräte und verkaufte Gebrauchtgeräte. */
  warranties(query: string): WarrantyRow[] {
    const q = query.trim().toLowerCase();
    const repairs = this.sql
      .exec<Row>(
        `SELECT i.number, i.order_id, i.issued_at, i.warranty_until, i.snapshot FROM repair_invoices i
          WHERE i.kind = 'repair' AND i.warranty_until != '' ORDER BY i.warranty_until DESC LIMIT 500`,
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

  // ---------- intern ----------

  private nextInvoice(today: string) {
    const year = Number(today.slice(0, 4));
    const seq = (this.sql.exec<{ n: number | null }>("SELECT MAX(seq) AS n FROM repair_invoices WHERE year = ?", year).one().n ?? 0) + 1;
    return { year, seq };
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
