import {
  DEFAULT_RETAIL_SETTINGS,
  generateInternalEan,
  type MovementReason,
  type OrderStatus,
  type ProductCategory,
  type ProductUnit,
  type RetailOrderItem,
  type RetailProduct,
  type RetailPurchaseOrder,
  type RetailSettings,
  type RetailStockMovement,
  type RetailSupplier,
} from "../../shared/retail";
import type { PosArticle, PosLine } from "../../shared/pos";
import type { PosModule } from "../pos/store";

export class RetailError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const RETAIL_MIGRATIONS: string[] = [
  `CREATE TABLE retail_products (
     id TEXT PRIMARY KEY,
     number INTEGER NOT NULL UNIQUE,
     ean TEXT NOT NULL DEFAULT '',
     name TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT 'sonstiges',
     brand TEXT NOT NULL DEFAULT '',
     supplier_id TEXT,
     supplier_name TEXT NOT NULL DEFAULT '',
     supplier_article_no TEXT NOT NULL DEFAULT '',
     purchase_price_cents INTEGER NOT NULL DEFAULT 0,
     selling_price_cents INTEGER NOT NULL DEFAULT 0,
     vat_rate REAL NOT NULL DEFAULT 19.0,
     stock_qty INTEGER NOT NULL DEFAULT 0,
     min_stock_qty INTEGER NOT NULL DEFAULT 5,
     unit TEXT NOT NULL DEFAULT 'Stk',
     location TEXT NOT NULL DEFAULT '',
     active INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX retail_products_name ON retail_products(name);
   CREATE INDEX retail_products_ean ON retail_products(ean);
   CREATE INDEX retail_products_category ON retail_products(category);
   CREATE INDEX retail_products_supplier ON retail_products(supplier_id);

   CREATE TABLE retail_suppliers (
     id TEXT PRIMARY KEY,
     number INTEGER NOT NULL UNIQUE,
     name TEXT NOT NULL,
     contact_person TEXT NOT NULL DEFAULT '',
     email TEXT NOT NULL DEFAULT '',
     phone TEXT NOT NULL DEFAULT '',
     street TEXT NOT NULL DEFAULT '',
     postal_code TEXT NOT NULL DEFAULT '',
     city TEXT NOT NULL DEFAULT '',
     country TEXT NOT NULL DEFAULT 'DE',
     vat_id TEXT NOT NULL DEFAULT '',
     payment_terms_days INTEGER NOT NULL DEFAULT 14,
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX retail_suppliers_name ON retail_suppliers(name);

   CREATE TABLE retail_purchase_orders (
     id TEXT PRIMARY KEY,
     number INTEGER NOT NULL UNIQUE,
     supplier_id TEXT NOT NULL,
     supplier_name TEXT NOT NULL,
     supplier_email TEXT NOT NULL DEFAULT '',
     date TEXT NOT NULL,
     expected_delivery_date TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'draft',
     items_json TEXT NOT NULL DEFAULT '[]',
     total_cents INTEGER NOT NULL DEFAULT 0,
     notes TEXT NOT NULL DEFAULT '',
     received_at TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX retail_purchase_orders_supplier ON retail_purchase_orders(supplier_id);
   CREATE INDEX retail_purchase_orders_status ON retail_purchase_orders(status);

   CREATE TABLE retail_stock_movements (
     id TEXT PRIMARY KEY,
     product_id TEXT NOT NULL,
     product_name TEXT NOT NULL,
     delta_qty INTEGER NOT NULL,
     previous_qty INTEGER NOT NULL,
     new_qty INTEGER NOT NULL,
     reason TEXT NOT NULL DEFAULT 'correction',
     reference_id TEXT NOT NULL DEFAULT '',
     note TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     created_by_name TEXT NOT NULL DEFAULT ''
   );
   CREATE INDEX retail_stock_movements_product ON retail_stock_movements(product_id);
   CREATE INDEX retail_stock_movements_created ON retail_stock_movements(created_at);

   CREATE TABLE retail_settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
];

type Row = Record<string, string | number | null>;

export class RetailStore {
  constructor(
    private sql: SqlStorage,
    private transaction: <T>(fn: () => T) => T
  ) {}

  // ==========================================
  // EINSTELLUNGEN
  // ==========================================

  getSettings(): RetailSettings {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM retail_settings WHERE key = 'settings'").toArray()[0];
    return row ? { ...DEFAULT_RETAIL_SETTINGS, ...(JSON.parse(row.value) as Partial<RetailSettings>) } : DEFAULT_RETAIL_SETTINGS;
  }

  saveSettings(settings: RetailSettings): RetailSettings {
    this.sql.exec(
      `INSERT INTO retail_settings (key, value) VALUES ('settings', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(settings)
    );
    return settings;
  }

  // ==========================================
  // ARTIKEL / PRODUKTE
  // ==========================================

  listProducts(query = "", category = "all", lowStockOnly = false): RetailProduct[] {
    let sql = `SELECT * FROM retail_products WHERE active = 1`;
    const params: unknown[] = [];

    if (query.trim()) {
      const q = `%${query.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(name) LIKE ? OR LOWER(brand) LIKE ? OR ean LIKE ? OR CAST(number AS TEXT) LIKE ?)`;
      params.push(q, q, q, q);
    }

    if (category && category !== "all") {
      sql += ` AND category = ?`;
      params.push(category);
    }

    if (lowStockOnly) {
      sql += ` AND stock_qty <= min_stock_qty`;
    }

    sql += ` ORDER BY name ASC`;
    const rows = this.sql.exec<Row>(sql, ...params).toArray();
    return rows.map((r) => this.mapProduct(r));
  }

  getProduct(id: string): RetailProduct | null {
    const row = this.sql.exec<Row>(`SELECT * FROM retail_products WHERE id = ?`, id).toArray()[0];
    return row ? this.mapProduct(row) : null;
  }

  getProductByEan(ean: string): RetailProduct | null {
    const row = this.sql.exec<Row>(`SELECT * FROM retail_products WHERE ean = ? AND active = 1`, ean.trim()).toArray()[0];
    return row ? this.mapProduct(row) : null;
  }

  saveProduct(input: Partial<RetailProduct>): RetailProduct {
    return this.transaction(() => {
      const now = new Date().toISOString();
      const id = input.id || crypto.randomUUID();
      const existing = this.getProduct(id);

      if (existing) {
        this.sql.exec(
          `UPDATE retail_products SET
             ean = ?, name = ?, category = ?, brand = ?, supplier_id = ?, supplier_name = ?,
             supplier_article_no = ?, purchase_price_cents = ?, selling_price_cents = ?,
             vat_rate = ?, stock_qty = ?, min_stock_qty = ?, unit = ?, location = ?,
             active = ?, updated_at = ?
           WHERE id = ?`,
          input.ean ?? existing.ean,
          input.name ?? existing.name,
          input.category ?? existing.category,
          input.brand ?? existing.brand,
          input.supplierId ?? existing.supplierId ?? null,
          input.supplierName ?? existing.supplierName ?? "",
          input.supplierArticleNo ?? existing.supplierArticleNo ?? "",
          input.purchasePriceCents ?? existing.purchasePriceCents,
          input.sellingPriceCents ?? existing.sellingPriceCents,
          input.vatRate ?? existing.vatRate,
          // Bestand ändert sich nur über Buchungen (adjustStock): das Formular hat einen alten Stand
          existing.stockQty,
          input.minStockQty ?? existing.minStockQty,
          input.unit ?? existing.unit,
          input.location ?? existing.location ?? "",
          input.active !== undefined ? (input.active ? 1 : 0) : existing.active ? 1 : 0,
          now,
          id
        );

        return this.getProduct(id)!;
      }

      // Nächste Artikelnummer ermitteln
      const nextNumRow = this.sql.exec<{ max_num: number | null }>("SELECT MAX(number) AS max_num FROM retail_products").toArray()[0];
      const number = (nextNumRow?.max_num || 1000) + 1;

      // Falls keine EAN eingegeben wurde: Generiere interne EAN
      const ean = input.ean?.trim() || generateInternalEan("200", number);
      const initialStock = input.stockQty ?? 0;

      this.sql.exec(
        `INSERT INTO retail_products (
           id, number, ean, name, category, brand, supplier_id, supplier_name,
           supplier_article_no, purchase_price_cents, selling_price_cents, vat_rate,
           stock_qty, min_stock_qty, unit, location, active, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        number,
        ean,
        input.name || "Artikel",
        input.category || "sonstiges",
        input.brand || "",
        input.supplierId || null,
        input.supplierName || "",
        input.supplierArticleNo || "",
        input.purchasePriceCents ?? 0,
        input.sellingPriceCents ?? 0,
        input.vatRate ?? 19.0,
        initialStock,
        input.minStockQty ?? 5,
        input.unit || "Stk",
        input.location || "",
        1,
        now,
        now
      );

      if (initialStock > 0) {
        this.logStockMovement(id, input.name || "Artikel", initialStock, 0, initialStock, "correction", "", "Anfangsbestand");
      }

      return this.getProduct(id)!;
    });
  }

  deleteProduct(id: string): void {
    this.sql.exec(`UPDATE retail_products SET active = 0, updated_at = datetime('now') WHERE id = ?`, id);
  }

  adjustStock(
    productId: string,
    deltaQty: number,
    reason: MovementReason = "correction",
    note = "",
    createdByName = "Mitarbeiter"
  ): RetailProduct {
    return this.transaction(() => {
      const product = this.getProduct(productId);
      if (!product) throw new RetailError("productNotFound");

      if (!Number.isFinite(deltaQty) || Math.round(deltaQty) !== deltaQty) throw new RetailError("invalidQty");
      const previousQty = product.stockQty;
      const newQty = Math.max(0, previousQty + deltaQty);

      this.sql.exec(`UPDATE retail_products SET stock_qty = ?, updated_at = datetime('now') WHERE id = ?`, newQty, productId);
      // Im Journal die tatsächliche Änderung, damit die Summe der Buchungen zum Bestand passt
      this.logStockMovement(productId, product.name, newQty - previousQty, previousQty, newQty, reason, "", note, createdByName);

      return this.getProduct(productId)!;
    });
  }

  // ==========================================
  // LIEFERANTEN
  // ==========================================

  listSuppliers(query = ""): RetailSupplier[] {
    let sql = `SELECT * FROM retail_suppliers WHERE 1=1`;
    const params: unknown[] = [];
    if (query.trim()) {
      const q = `%${query.trim().toLowerCase()}%`;
      sql += ` AND (LOWER(name) LIKE ? OR LOWER(contact_person) LIKE ? OR LOWER(email) LIKE ? OR LOWER(city) LIKE ?)`;
      params.push(q, q, q, q);
    }
    sql += ` ORDER BY name ASC`;
    const rows = this.sql.exec<Row>(sql, ...params).toArray();
    return rows.map((r) => this.mapSupplier(r));
  }

  getSupplier(id: string): RetailSupplier | null {
    const row = this.sql.exec<Row>(`SELECT * FROM retail_suppliers WHERE id = ?`, id).toArray()[0];
    return row ? this.mapSupplier(row) : null;
  }

  saveSupplier(input: Partial<RetailSupplier>): RetailSupplier {
    return this.transaction(() => {
      const now = new Date().toISOString();
      const id = input.id || crypto.randomUUID();
      const existing = this.getSupplier(id);

      if (existing) {
        this.sql.exec(
          `UPDATE retail_suppliers SET
             name = ?, contact_person = ?, email = ?, phone = ?, street = ?, postal_code = ?,
             city = ?, country = ?, vat_id = ?, payment_terms_days = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
          input.name ?? existing.name,
          input.contactPerson ?? existing.contactPerson,
          input.email ?? existing.email,
          input.phone ?? existing.phone,
          input.street ?? existing.street,
          input.postalCode ?? existing.postalCode,
          input.city ?? existing.city,
          input.country ?? existing.country,
          input.vatId ?? existing.vatId ?? "",
          input.paymentTermsDays ?? existing.paymentTermsDays,
          input.notes ?? existing.notes,
          now,
          id
        );
        return this.getSupplier(id)!;
      }

      const nextNumRow = this.sql.exec<{ max_num: number | null }>("SELECT MAX(number) AS max_num FROM retail_suppliers").toArray()[0];
      const number = (nextNumRow?.max_num || 5000) + 1;

      this.sql.exec(
        `INSERT INTO retail_suppliers (
           id, number, name, contact_person, email, phone, street, postal_code,
           city, country, vat_id, payment_terms_days, notes, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        number,
        input.name || "Lieferant",
        input.contactPerson || "",
        input.email || "",
        input.phone || "",
        input.street || "",
        input.postalCode || "",
        input.city || "",
        input.country || "DE",
        input.vatId || "",
        input.paymentTermsDays ?? 14,
        input.notes || "",
        now,
        now
      );

      return this.getSupplier(id)!;
    });
  }

  deleteSupplier(id: string): void {
    this.sql.exec(`DELETE FROM retail_suppliers WHERE id = ?`, id);
  }

  // ==========================================
  // BESTELLWESEN & WARENEINGANG
  // ==========================================

  listOrders(status?: string): RetailPurchaseOrder[] {
    let sql = `SELECT * FROM retail_purchase_orders WHERE 1=1`;
    const params: unknown[] = [];
    if (status && status !== "all") {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY date DESC, created_at DESC`;
    const rows = this.sql.exec<Row>(sql, ...params).toArray();
    return rows.map((r) => this.mapOrder(r));
  }

  getOrder(id: string): RetailPurchaseOrder | null {
    const row = this.sql.exec<Row>(`SELECT * FROM retail_purchase_orders WHERE id = ?`, id).toArray()[0];
    return row ? this.mapOrder(row) : null;
  }

  saveOrder(input: Partial<RetailPurchaseOrder>): RetailPurchaseOrder {
    return this.transaction(() => {
      const now = new Date().toISOString();
      const id = input.id || crypto.randomUUID();
      const existing = this.getOrder(id);

      const items = input.items || [];
      const totalCents = items.reduce((sum, item) => sum + item.qtyOrdered * item.purchasePriceCents, 0);

      if (existing) {
        this.sql.exec(
          `UPDATE retail_purchase_orders SET
             supplier_id = ?, supplier_name = ?, supplier_email = ?, date = ?,
             expected_delivery_date = ?, status = ?, items_json = ?, total_cents = ?,
             notes = ?, updated_at = ?
           WHERE id = ?`,
          input.supplierId ?? existing.supplierId,
          input.supplierName ?? existing.supplierName,
          input.supplierEmail ?? existing.supplierEmail ?? "",
          input.date ?? existing.date,
          input.expectedDeliveryDate ?? existing.expectedDeliveryDate ?? "",
          input.status ?? existing.status,
          JSON.stringify(items),
          totalCents,
          input.notes ?? existing.notes,
          now,
          id
        );
        return this.getOrder(id)!;
      }

      const nextNumRow = this.sql.exec<{ max_num: number | null }>("SELECT MAX(number) AS max_num FROM retail_purchase_orders").toArray()[0];
      const number = (nextNumRow?.max_num || 3000) + 1;

      this.sql.exec(
        `INSERT INTO retail_purchase_orders (
           id, number, supplier_id, supplier_name, supplier_email, date,
           expected_delivery_date, status, items_json, total_cents, notes,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        number,
        input.supplierId || "",
        input.supplierName || "",
        input.supplierEmail || "",
        input.date || now.slice(0, 10),
        input.expectedDeliveryDate || "",
        input.status || "draft",
        JSON.stringify(items),
        totalCents,
        input.notes || "",
        now,
        now
      );

      return this.getOrder(id)!;
    });
  }

  /**
   * Bucht den Wareneingang zu einer Bestellung ein:
   * Aktualisiert Mengen, setzt Status auf received/partially_received,
   * und bucht die Produkte automatisch im Lager auf.
   */
  receiveOrder(
    orderId: string,
    receivedItems: { productId: string; qtyReceived: number }[],
    user = { name: "Mitarbeiter" }
  ): RetailPurchaseOrder {
    return this.transaction(() => {
      const order = this.getOrder(orderId);
      if (!order) throw new RetailError("orderNotFound");

      const now = new Date().toISOString();
      let allFulfilled = true;

      const updatedItems = order.items.map((item) => {
        const matching = receivedItems.find((r) => r.productId === item.productId);
        if (!matching) {
          if (item.qtyReceived < item.qtyOrdered) allFulfilled = false;
          return item;
        }

        const delta = matching.qtyReceived - item.qtyReceived;
        if (delta > 0) {
          // Bestand für dieses Produkt aufbuchen
          const prod = this.getProduct(item.productId);
          if (prod) {
            const prev = prod.stockQty;
            const next = prev + delta;
            this.sql.exec(`UPDATE retail_products SET stock_qty = ?, updated_at = datetime('now') WHERE id = ?`, next, item.productId);
            this.logStockMovement(item.productId, item.name, delta, prev, next, "purchase", orderId, `Wareneingang Bestellung #${order.number}`, user.name);
          }
        }

        const newReceived = matching.qtyReceived;
        if (newReceived < item.qtyOrdered) allFulfilled = false;

        return {
          ...item,
          qtyReceived: newReceived,
        };
      });

      const nextStatus: OrderStatus = allFulfilled ? "received" : "partially_received";

      this.sql.exec(
        `UPDATE retail_purchase_orders SET
           status = ?, items_json = ?, received_at = ?, updated_at = ?
         WHERE id = ?`,
        nextStatus,
        JSON.stringify(updatedItems),
        now,
        now,
        orderId
      );

      return this.getOrder(orderId)!;
    });
  }

  deleteOrder(id: string): void {
    this.sql.exec(`DELETE FROM retail_purchase_orders WHERE id = ?`, id);
  }

  // ==========================================
  // LAGERBEWEGUNGEN & HISTORIE
  // ==========================================

  listStockMovements(productId?: string, limit = 100): RetailStockMovement[] {
    let sql = `SELECT * FROM retail_stock_movements WHERE 1=1`;
    const params: unknown[] = [];
    if (productId) {
      sql += ` AND product_id = ?`;
      params.push(productId);
    }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = this.sql.exec<Row>(sql, ...params).toArray();
    return rows.map((r) => this.mapStockMovement(r));
  }

  private logStockMovement(
    productId: string,
    productName: string,
    deltaQty: number,
    previousQty: number,
    newQty: number,
    reason: MovementReason,
    referenceId = "",
    note = "",
    createdByName = "System"
  ) {
    this.sql.exec(
      `INSERT INTO retail_stock_movements (
         id, product_id, product_name, delta_qty, previous_qty, new_qty,
         reason, reference_id, note, created_at, created_by_name
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
      crypto.randomUUID(),
      productId,
      productName,
      deltaQty,
      previousQty,
      newQty,
      reason,
      referenceId,
      note,
      createdByName
    );
  }

  // ==========================================
  // KASSE: Artikel werden in der Kasse der Plattform verkauft, der Bestand folgt
  // ==========================================

  posModule(): PosModule {
    const article = (p: RetailProduct): PosArticle => ({
      source: "retail", kind: "product", refId: p.id, name: p.name, detail: [p.brand, p.ean].filter(Boolean).join(" · "),
      priceCents: p.sellingPriceCents, vatRate: p.vatRate, stock: p.stockQty, group: "@retail.product", code: String(p.number),
    });
    const move = (lines: PosLine[], sign: 1 | -1, reason: MovementReason, note: string, by: string) => {
      for (const l of lines) {
        if (l.source !== "retail" || l.kind !== "product" || !l.refId || !this.getProduct(l.refId)) continue;
        this.adjustStock(l.refId, sign * Math.ceil(l.qty), reason, note, by);
      }
    };
    return {
      articles: (query) => this.listProducts(query).slice(0, 60).map(article),
      catalog: () => this.listProducts().slice(0, 1000).map(article),
      scan: (code) => {
        const p = this.getProductByEan(code);
        return p ? [article(p)] : [];
      },
      prepare: (line) => {
        const p = line.refId ? this.getProduct(line.refId) : null;
        if (!p || !p.active) throw new RetailError("notFound");
        return { lines: [{ ...line, kind: "product", name: line.name || p.name, qty: Math.max(1, Math.round(line.qty)), vatRate: p.vatRate }] };
      },
      booked: (receipt, lines, _refs, ctx) => move(lines, -1, "sale", `Kasse ${receipt?.number ?? ""}`.trim(), ctx.actor.name ?? "Kasse"),
      canceled: (original, cancel, actor) => move(original.lines, 1, "return", `Storno ${cancel.number}`, actor.name ?? "Kasse"),
    };
  }

  // ==========================================
  // DEMODATEN SEEDING
  // ==========================================

  seedIfEmpty(): void {
    const existing = this.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM retail_products").toArray()[0];
    if (existing && existing.count > 0) return;

    this.transaction(() => {
      // 1. Lieferanten anlegen
      const s1 = this.saveSupplier({
        name: "Bio-Genuss & Manufaktur Süd",
        contactPerson: "Stefanie Bergmann",
        email: "order@biogenuss-sued.de",
        phone: "+49 89 4523910",
        street: "Alpenstraße 18",
        postalCode: "83022",
        city: "Rosenheim",
        country: "DE",
        vatId: "DE812345678",
        paymentTermsDays: 14,
        notes: "Lieferung immer Dienstags und Freitags per Spedition.",
      });

      const s2 = this.saveSupplier({
        name: "Nordic Living & Lifestyle Wholesale",
        contactPerson: "Lars Lindqvist",
        email: "wholesale@nordicliving.de",
        phone: "+49 40 8899221",
        street: "Speicherstadt 4",
        postalCode: "20457",
        city: "Hamburg",
        country: "DE",
        vatId: "DE987654321",
        paymentTermsDays: 30,
        notes: "Mindestbestellwert 150 €, frei Haus ab 350 €.",
      });

      // 2. Artikel / Sortiment anlegen
      const p1 = this.saveProduct({
        name: "Kaltgepresstes Bio-Olivenöl Extra Vergine",
        brand: "Terre Di Olio",
        category: "lebensmittel",
        supplierId: s1.id,
        supplierName: s1.name,
        supplierArticleNo: "TDO-500",
        purchasePriceCents: 850,
        sellingPriceCents: 1490,
        vatRate: 7.0,
        stockQty: 24,
        minStockQty: 8,
        unit: "l",
        location: "Regal A-01",
      });

      const p2 = this.saveProduct({
        name: "Bio-Espresso Bohnen 'Crema Bar'",
        brand: "Rösterei Kaffeekontor",
        category: "getraenke",
        supplierId: s1.id,
        supplierName: s1.name,
        supplierArticleNo: "ROEST-1000",
        purchasePriceCents: 1350,
        sellingPriceCents: 2290,
        vatRate: 7.0,
        stockQty: 18,
        minStockQty: 6,
        unit: "kg",
        location: "Regal A-02",
      });

      const p3 = this.saveProduct({
        name: "Handgegossene Duftkerze 'Nordic Wood & Cedar'",
        brand: "Skandi Glow",
        category: "wohnen",
        supplierId: s2.id,
        supplierName: s2.name,
        supplierArticleNo: "SK-GLOW-250",
        purchasePriceCents: 980,
        sellingPriceCents: 2450,
        vatRate: 19.0,
        stockQty: 4, // Niedriger Bestand -> löst Nachbestell-Alarm aus
        minStockQty: 10,
        unit: "Stk",
        location: "Regal B-04",
      });

      const p4 = this.saveProduct({
        name: "Gewaschenes Leinen-Geschirrtuch 'Salbeigrün'",
        brand: "LinenCraft",
        category: "wohnen",
        supplierId: s2.id,
        supplierName: s2.name,
        supplierArticleNo: "LC-TEA-SG",
        purchasePriceCents: 490,
        sellingPriceCents: 1290,
        vatRate: 19.0,
        stockQty: 32,
        minStockQty: 12,
        unit: "Stk",
        location: "Regal B-01",
      });

      const p5 = this.saveProduct({
        name: "Notizbuch Hardcover Punktraster A5 (FSC)",
        brand: "Paper & Thought",
        category: "schreibwaren",
        supplierId: s2.id,
        supplierName: s2.name,
        supplierArticleNo: "PT-NOTE-A5",
        purchasePriceCents: 520,
        sellingPriceCents: 1350,
        vatRate: 19.0,
        stockQty: 15,
        minStockQty: 5,
        unit: "Stk",
        location: "Regal C-02",
      });

      // 3. Eine beispielhafte Bestellung anlegen
      this.saveOrder({
        supplierId: s2.id,
        supplierName: s2.name,
        supplierEmail: s2.email,
        date: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10),
        expectedDeliveryDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
        status: "ordered",
        items: [
          {
            productId: p3.id,
            name: p3.name,
            ean: p3.ean,
            qtyOrdered: 20,
            qtyReceived: 0,
            purchasePriceCents: p3.purchasePriceCents,
          },
          {
            productId: p4.id,
            name: p4.name,
            ean: p4.ean,
            qtyOrdered: 15,
            qtyReceived: 0,
            purchasePriceCents: p4.purchasePriceCents,
          },
        ],
        notes: "Nachbestellung wegen hoher Nachfrage. Bitte auf Palette anliefern.",
      });
    });
  }

  // ==========================================
  // MAPPER
  // ==========================================

  private mapProduct(r: Row): RetailProduct {
    return {
      id: String(r.id),
      number: Number(r.number),
      ean: String(r.ean || ""),
      name: String(r.name),
      category: String(r.category || "sonstiges") as ProductCategory,
      brand: String(r.brand || ""),
      supplierId: r.supplier_id ? String(r.supplier_id) : undefined,
      supplierName: String(r.supplier_name || ""),
      supplierArticleNo: String(r.supplier_article_no || ""),
      purchasePriceCents: Number(r.purchase_price_cents || 0),
      sellingPriceCents: Number(r.selling_price_cents || 0),
      vatRate: Number(r.vat_rate || 19.0),
      stockQty: Number(r.stock_qty || 0),
      minStockQty: Number(r.min_stock_qty || 0),
      unit: String(r.unit || "Stk") as ProductUnit,
      location: r.location ? String(r.location) : undefined,
      active: Boolean(r.active),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  private mapSupplier(r: Row): RetailSupplier {
    return {
      id: String(r.id),
      number: Number(r.number),
      name: String(r.name),
      contactPerson: String(r.contact_person || ""),
      email: String(r.email || ""),
      phone: String(r.phone || ""),
      street: String(r.street || ""),
      postalCode: String(r.postal_code || ""),
      city: String(r.city || ""),
      country: String(r.country || "DE"),
      vatId: r.vat_id ? String(r.vat_id) : undefined,
      paymentTermsDays: Number(r.payment_terms_days || 14),
      notes: String(r.notes || ""),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  private mapOrder(r: Row): RetailPurchaseOrder {
    let items: RetailOrderItem[] = [];
    try {
      items = JSON.parse(String(r.items_json || "[]"));
    } catch {
      items = [];
    }
    return {
      id: String(r.id),
      number: Number(r.number),
      supplierId: String(r.supplier_id),
      supplierName: String(r.supplier_name),
      supplierEmail: r.supplier_email ? String(r.supplier_email) : undefined,
      date: String(r.date),
      expectedDeliveryDate: r.expected_delivery_date ? String(r.expected_delivery_date) : undefined,
      status: String(r.status || "draft") as OrderStatus,
      items,
      totalCents: Number(r.total_cents || 0),
      notes: String(r.notes || ""),
      receivedAt: r.received_at ? String(r.received_at) : undefined,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  private mapStockMovement(r: Row): RetailStockMovement {
    return {
      id: String(r.id),
      productId: String(r.product_id),
      productName: String(r.product_name),
      deltaQty: Number(r.delta_qty),
      previousQty: Number(r.previous_qty),
      newQty: Number(r.new_qty),
      reason: String(r.reason || "correction") as MovementReason,
      referenceId: r.reference_id ? String(r.reference_id) : undefined,
      note: r.note ? String(r.note) : undefined,
      createdAt: String(r.created_at),
      createdByName: r.created_by_name ? String(r.created_by_name) : undefined,
    };
  }
}
