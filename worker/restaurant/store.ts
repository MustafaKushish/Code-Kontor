import { berlinDayOf, nextNumber } from "../numbers";
import type {
  ItemStatus,
  MenuItem,
  OrderItem,
  OrderType,
  RestaurantOrder,
  RestaurantOrderStatus,
  RestaurantStats,
  RestaurantTable,
} from "../../shared/restaurant";

export class RestaurantError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const RESTAURANT_MIGRATIONS: string[] = [
  `CREATE TABLE restaurant_tables (
     id TEXT PRIMARY KEY,
     table_number TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     area TEXT NOT NULL DEFAULT 'innen',
     seats INTEGER NOT NULL DEFAULT 4,
     status TEXT NOT NULL DEFAULT 'frei',
     current_order_id TEXT,
     total_gross REAL NOT NULL DEFAULT 0,
     guest_count INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX restaurant_tables_area ON restaurant_tables(area);
   CREATE INDEX restaurant_tables_status ON restaurant_tables(status);

   CREATE TABLE restaurant_menu (
     id TEXT PRIMARY KEY,
     item_number TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT 'Hauptspeisen',
     description TEXT NOT NULL DEFAULT '',
     price_gross REAL NOT NULL DEFAULT 0,
     tax_rate REAL NOT NULL DEFAULT 19.0,
     destination TEXT NOT NULL DEFAULT 'kueche',
     allergens_json TEXT NOT NULL DEFAULT '[]',
     active INTEGER NOT NULL DEFAULT 1,
     is_favorite INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX restaurant_menu_cat ON restaurant_menu(category);

   CREATE TABLE restaurant_orders (
     id TEXT PRIMARY KEY,
     order_number TEXT NOT NULL UNIQUE,
     type TEXT NOT NULL DEFAULT 'tisch',
     table_id TEXT,
     table_name TEXT,
     pickup_number INTEGER,
     customer_name TEXT,
     customer_phone TEXT,
     status TEXT NOT NULL DEFAULT 'offen',
     items_json TEXT NOT NULL DEFAULT '[]',
     guest_count INTEGER NOT NULL DEFAULT 1,
     notes TEXT NOT NULL DEFAULT '',
     total_net REAL NOT NULL DEFAULT 0,
     total_tax7 REAL NOT NULL DEFAULT 0,
     total_tax19 REAL NOT NULL DEFAULT 0,
     total_gross REAL NOT NULL DEFAULT 0,
     payment_method TEXT,
     payment_status TEXT NOT NULL DEFAULT 'offen',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     kitchen_started_at TEXT,
     ready_at TEXT,
     completed_at TEXT
   );
   CREATE INDEX restaurant_orders_status ON restaurant_orders(status);
   CREATE INDEX restaurant_orders_type ON restaurant_orders(type);
   CREATE INDEX restaurant_orders_table ON restaurant_orders(table_id);`,
];

export class RestaurantStore {
  constructor(
    private sql: SqlStorage,
    private tx: <T>(fn: () => T) => T,
  ) {}

  /** Beispieldaten, nur für das Demo-Konto (nie für echte Firmen). */
  seedIfEmpty() {
    const tCount = this.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM restaurant_tables").one().c;
    if (tCount > 0) return;

    this.tx(() => {
      // 1. Tische
      const tables: { num: string; name: string; area: string; seats: number }[] = [
        { num: "T1", name: "Tisch 1 (Fenster)", area: "innen", seats: 2 },
        { num: "T2", name: "Tisch 2 (Mitte)", area: "innen", seats: 4 },
        { num: "T3", name: "Tisch 3 (Ecke)", area: "innen", seats: 4 },
        { num: "T4", name: "Tisch 4 (Große Tafel)", area: "innen", seats: 8 },
        { num: "T5", name: "Tisch 5 (Kuschelecke)", area: "innen", seats: 2 },
        { num: "Terrasse 1", name: "Terrasse 1 (Sonne)", area: "terrasse", seats: 4 },
        { num: "Terrasse 2", name: "Terrasse 2 (Schirm)", area: "terrasse", seats: 4 },
        { num: "Terrasse 3", name: "Terrasse 3 (Lounge)", area: "terrasse", seats: 6 },
        { num: "Bar 1", name: "Barhocker 1", area: "bar", seats: 1 },
        { num: "Bar 2", name: "Barhocker 2", area: "bar", seats: 1 },
        { num: "Theke", name: "Theke / Kundenschalter", area: "bar", seats: 1 },
      ];

      for (const t of tables) {
        this.sql.exec(
          `INSERT INTO restaurant_tables (id, table_number, name, area, seats, status)
           VALUES (?, ?, ?, ?, ?, 'frei')`,
          crypto.randomUUID(),
          t.num,
          t.name,
          t.area,
          t.seats,
        );
      }

      // 2. Speisekarte
      const menu: {
        num: string;
        name: string;
        cat: string;
        desc: string;
        price: number;
        tax: number;
        dest: string;
        allergens: string[];
        fav: number;
      }[] = [
        {
          num: "V-01",
          name: "Bruschetta Classico",
          cat: "Vorspeisen",
          desc: "Geröstetes Landbrot mit Tomaten, Knoblauch, Basilikum & Olivenöl",
          price: 8.5,
          tax: 7.0,
          dest: "kueche",
          allergens: ["A"],
          fav: 1,
        },
        {
          num: "V-02",
          name: "Burrata Pugliese",
          cat: "Vorspeisen",
          desc: "Cremige Burrata mit Kirschtomaten und hausgemachtem Pesto",
          price: 12.9,
          tax: 7.0,
          dest: "kueche",
          allergens: ["G"],
          fav: 0,
        },
        {
          num: "H-01",
          name: "Wiener Schnitzel vom Kalb",
          cat: "Hauptspeisen",
          desc: "Mit lauwarmem Kartoffel-Gurken-Salat und Preiselbeeren",
          price: 24.5,
          tax: 7.0,
          dest: "kueche",
          allergens: ["A", "C"],
          fav: 1,
        },
        {
          num: "H-02",
          name: "Lachsfilet auf Safran-Risotto",
          cat: "Hauptspeisen",
          desc: "Auf der Haut gebraten mit wildem Brokkoli & Zitronenbutter",
          price: 26.0,
          tax: 7.0,
          dest: "kueche",
          allergens: ["D", "G"],
          fav: 0,
        },
        {
          num: "P-01",
          name: "Pizza Margherita DOP",
          cat: "Pizza & Pasta",
          desc: "San Marzano Tomaten, Fior di Latte, Basilikum, extra natives Olivenöl",
          price: 11.5,
          tax: 7.0,
          dest: "kueche",
          allergens: ["A", "G"],
          fav: 1,
        },
        {
          num: "P-02",
          name: "Tagliolini al Tartufo",
          cat: "Pizza & Pasta",
          desc: "Frische Eiernudeln geschwenkt in Trüffelbutter mit frischem Trüffel",
          price: 18.5,
          tax: 7.0,
          dest: "kueche",
          allergens: ["A", "C", "G"],
          fav: 0,
        },
        {
          num: "D-01",
          name: "Hausgemachtes Tiramisu",
          cat: "Desserts",
          desc: "Mit Mascarpone, Savoiardi-Keksen, Espresso und Amaretto",
          price: 7.5,
          tax: 7.0,
          dest: "kueche",
          allergens: ["A", "C", "G"],
          fav: 1,
        },
        {
          num: "G-01",
          name: "Espresso Single Origin",
          cat: "Heißgetränke",
          desc: "100% Arabica Röstung aus Hamburg",
          price: 2.8,
          tax: 19.0,
          dest: "bar",
          allergens: [],
          fav: 1,
        },
        {
          num: "G-02",
          name: "Cappuccino Italiano",
          cat: "Heißgetränke",
          desc: "Mit cremigem Milchschaum (auch mit Hafermilch)",
          price: 3.8,
          tax: 19.0,
          dest: "bar",
          allergens: ["G"],
          fav: 1,
        },
        {
          num: "A-01",
          name: "Fritz-Kola (0.33l)",
          cat: "Alkoholfrei",
          desc: "Koffeinhaltige Limonade im Glas",
          price: 3.6,
          tax: 19.0,
          dest: "bar",
          allergens: [],
          fav: 1,
        },
        {
          num: "B-01",
          name: "Frisches Pils vom Fass (0.4l)",
          cat: "Bier & Wein",
          desc: "Herb-frisch gezapft",
          price: 4.8,
          tax: 19.0,
          dest: "bar",
          allergens: ["A"],
          fav: 1,
        },
        {
          num: "W-01",
          name: "Grauburgunder trocken (0.2l)",
          cat: "Bier & Wein",
          desc: "Weingut Becker, Pfalz - frisch, fruchtig, mineralisch",
          price: 6.9,
          tax: 19.0,
          dest: "bar",
          allergens: ["O"],
          fav: 0,
        },
      ];

      for (const m of menu) {
        this.sql.exec(
          `INSERT INTO restaurant_menu (id, item_number, name, category, description, price_gross, tax_rate, destination, allergens_json, active, is_favorite)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          crypto.randomUUID(),
          m.num,
          m.name,
          m.cat,
          m.desc,
          m.price,
          m.tax,
          m.dest,
          JSON.stringify(m.allergens),
          m.fav,
        );
      }

      // 3. Beispiel-Bestellungen
      // Order 1: Tisch 2 (in_zubereitung)
      const t2Row = this.sql.exec<{ id: string }>("SELECT id FROM restaurant_tables WHERE table_number = 'T2'").one();
      const o1Id = crypto.randomUUID();
      const o1Items: OrderItem[] = [
        {
          id: crypto.randomUUID(),
          menuItemId: "H-01",
          name: "Wiener Schnitzel vom Kalb",
          quantity: 2,
          unitPriceGross: 24.5,
          taxRate: 7.0,
          course: "Hauptspeisen" as any,
          note: "Extra Preiselbeeren",
          status: "in_arbeit",
          destination: "kueche",
        },
        {
          id: crypto.randomUUID(),
          menuItemId: "V-01",
          name: "Bruschetta Classico",
          quantity: 1,
          unitPriceGross: 8.5,
          taxRate: 7.0,
          course: "1. Gang",
          status: "serviert",
          destination: "kueche",
        },
        {
          id: crypto.randomUUID(),
          menuItemId: "B-01",
          name: "Frisches Pils vom Fass (0.4l)",
          quantity: 2,
          unitPriceGross: 4.8,
          taxRate: 19.0,
          course: "Getränke",
          status: "serviert",
          destination: "bar",
        },
      ];

      const o1Gross = o1Items.reduce((s, i) => s + i.quantity * i.unitPriceGross, 0);
      const o1Net = Math.round((2 * 24.5 / 1.07 + 8.5 / 1.07 + 9.6 / 1.19) * 100) / 100;

      this.sql.exec(
        `INSERT INTO restaurant_orders (id, order_number, type, table_id, table_name, status, items_json, guest_count, total_net, total_tax7, total_tax19, total_gross, payment_status, created_at, kitchen_started_at)
         VALUES (?, 'BON-101', 'tisch', ?, 'Tisch 2 (Mitte)', 'in_zubereitung', ?, 2, ?, ?, ?, ?, 'offen', datetime('now', '-25 minutes'), datetime('now', '-18 minutes'))`,
        o1Id,
        t2Row?.id,
        JSON.stringify(o1Items),
        o1Net,
        3.74,
        1.53,
        o1Gross,
      );

      if (t2Row) {
        this.sql.exec(
          "UPDATE restaurant_tables SET status = 'belegt', current_order_id = ?, total_gross = ?, guest_count = 2 WHERE id = ?",
          o1Id,
          o1Gross,
          t2Row.id,
        );
      }

      // Order 2: Abholschalter (Takeaway #42 in Zubereitung)
      const o2Id = crypto.randomUUID();
      const o2Items: OrderItem[] = [
        {
          id: crypto.randomUUID(),
          menuItemId: "P-01",
          name: "Pizza Margherita DOP",
          quantity: 2,
          unitPriceGross: 11.5,
          taxRate: 7.0,
          course: "Sofort",
          note: "Bitte knusprig backen",
          status: "in_arbeit",
          destination: "kueche",
        },
        {
          id: crypto.randomUUID(),
          menuItemId: "A-01",
          name: "Fritz-Kola (0.33l)",
          quantity: 2,
          unitPriceGross: 3.6,
          taxRate: 19.0,
          course: "Sofort",
          status: "fertig",
          destination: "bar",
        },
      ];
      const o2Gross = 2 * 11.5 + 2 * 3.6;

      this.sql.exec(
        `INSERT INTO restaurant_orders (id, order_number, type, pickup_number, customer_name, customer_phone, status, items_json, guest_count, total_net, total_tax7, total_tax19, total_gross, payment_method, payment_status, created_at, kitchen_started_at)
         VALUES (?, 'BON-102', 'abholung', 42, 'Julia Schneider', '+49 172 9988776', 'in_zubereitung', ?, 1, ?, 1.5, 1.15, ?, 'karte', 'bezahlt', datetime('now', '-12 minutes'), datetime('now', '-8 minutes'))`,
        o2Id,
        JSON.stringify(o2Items),
        27.55,
        o2Gross,
      );

      // Order 3: Abholschalter (Takeaway #41 bereit zur Abholung)
      const o3Id = crypto.randomUUID();
      const o3Items: OrderItem[] = [
        {
          id: crypto.randomUUID(),
          menuItemId: "P-02",
          name: "Tagliolini al Tartufo",
          quantity: 1,
          unitPriceGross: 18.5,
          taxRate: 7.0,
          course: "Sofort",
          status: "fertig",
          destination: "kueche",
        },
      ];
      this.sql.exec(
        `INSERT INTO restaurant_orders (id, order_number, type, pickup_number, customer_name, customer_phone, status, items_json, guest_count, total_net, total_tax7, total_tax19, total_gross, payment_method, payment_status, created_at, kitchen_started_at, ready_at)
         VALUES (?, 'BON-100', 'abholung', 41, 'Dennis Meier', '+49 160 1234567', 'fertig', ?, 1, 17.29, 1.21, 0, 18.5, 'bar', 'bezahlt', datetime('now', '-22 minutes'), datetime('now', '-18 minutes'), datetime('now', '-3 minutes'))`,
        o3Id,
        JSON.stringify(o3Items),
      );
    });
  }

  // ==================== TISCHE ====================

  listTables(): RestaurantTable[] {
    const rows = this.sql
      .exec<{
        id: string;
        table_number: string;
        name: string;
        area: RestaurantTable["area"];
        seats: number;
        status: RestaurantTable["status"];
        current_order_id: string | null;
        total_gross: number;
        guest_count: number;
      }>("SELECT * FROM restaurant_tables ORDER BY area, table_number ASC")
      .toArray();

    return rows.map((r) => ({
      id: r.id,
      tableNumber: r.table_number,
      name: r.name,
      area: r.area,
      seats: r.seats,
      status: r.status,
      currentOrderId: r.current_order_id ?? undefined,
      totalGross: r.total_gross,
      guestCount: r.guest_count,
    }));
  }

  saveTable(data: Partial<RestaurantTable> & { tableNumber: string; name: string }): RestaurantTable {
    return this.tx(() => {
      let id = data.id;
      if (id) {
        this.sql.exec(
          `UPDATE restaurant_tables SET
             table_number = ?, name = ?, area = ?, seats = ?, status = ?
           WHERE id = ?`,
          data.tableNumber,
          data.name,
          data.area ?? "innen",
          data.seats ?? 4,
          data.status ?? "frei",
          id,
        );
      } else {
        id = crypto.randomUUID();
        this.sql.exec(
          `INSERT INTO restaurant_tables (id, table_number, name, area, seats, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          id,
          data.tableNumber,
          data.name,
          data.area ?? "innen",
          data.seats ?? 4,
          data.status ?? "frei",
        );
      }
      return this.listTables().find((t) => t.id === id)!;
    });
  }

  deleteTable(id: string): { ok: true } {
    this.sql.exec("DELETE FROM restaurant_tables WHERE id = ?", id);
    return { ok: true };
  }

  // ==================== SPEISEKARTE ====================

  listMenu(): MenuItem[] {
    const rows = this.sql
      .exec<{
        id: string;
        item_number: string;
        name: string;
        category: MenuItem["category"];
        description: string;
        price_gross: number;
        tax_rate: number;
        destination: MenuItem["destination"];
        allergens_json: string;
        active: number;
        is_favorite: number;
      }>("SELECT * FROM restaurant_menu ORDER BY category, item_number ASC")
      .toArray();

    return rows.map((r) => ({
      id: r.id,
      itemNumber: r.item_number,
      name: r.name,
      category: r.category,
      description: r.description,
      priceGross: r.price_gross,
      taxRate: r.tax_rate,
      destination: r.destination,
      allergens: JSON.parse(r.allergens_json || "[]"),
      active: r.active === 1,
      isFavorite: r.is_favorite === 1,
    }));
  }

  saveMenuItem(data: Partial<MenuItem> & { itemNumber: string; name: string; priceGross: number }): MenuItem {
    return this.tx(() => {
      let id = data.id;
      if (id) {
        this.sql.exec(
          `UPDATE restaurant_menu SET
             item_number = ?, name = ?, category = ?, description = ?,
             price_gross = ?, tax_rate = ?, destination = ?,
             allergens_json = ?, active = ?, is_favorite = ?
           WHERE id = ?`,
          data.itemNumber,
          data.name,
          data.category ?? "Hauptspeisen",
          data.description ?? "",
          data.priceGross,
          data.taxRate ?? 19.0,
          data.destination ?? "kueche",
          JSON.stringify(data.allergens || []),
          data.active === false ? 0 : 1,
          data.isFavorite ? 1 : 0,
          id,
        );
      } else {
        id = crypto.randomUUID();
        this.sql.exec(
          `INSERT INTO restaurant_menu (
             id, item_number, name, category, description, price_gross,
             tax_rate, destination, allergens_json, active, is_favorite
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          data.itemNumber,
          data.name,
          data.category ?? "Hauptspeisen",
          data.description ?? "",
          data.priceGross,
          data.taxRate ?? 19.0,
          data.destination ?? "kueche",
          JSON.stringify(data.allergens || []),
          data.active === false ? 0 : 1,
          data.isFavorite ? 1 : 0,
        );
      }
      return this.listMenu().find((m) => m.id === id)!;
    });
  }

  deleteMenuItem(id: string): { ok: true } {
    this.sql.exec("DELETE FROM restaurant_menu WHERE id = ?", id);
    return { ok: true };
  }

  // ==================== BESTELLUNGEN (ORDERS) ====================

  listOrders(): RestaurantOrder[] {
    const rows = this.sql
      .exec<{
        id: string;
        order_number: string;
        type: OrderType;
        table_id: string | null;
        table_name: string | null;
        pickup_number: number | null;
        customer_name: string | null;
        customer_phone: string | null;
        status: RestaurantOrderStatus;
        items_json: string;
        guest_count: number;
        notes: string;
        total_net: number;
        total_tax7: number;
        total_tax19: number;
        total_gross: number;
        payment_method: string | null;
        payment_status: string;
        created_at: string;
        kitchen_started_at: string | null;
        ready_at: string | null;
        completed_at: string | null;
      }>("SELECT * FROM restaurant_orders ORDER BY created_at DESC")
      .toArray();

    return rows.map((r) => this.mapOrder(r));
  }

  getOrder(id: string): RestaurantOrder {
    const r = this.sql
      .exec<{
        id: string;
        order_number: string;
        type: OrderType;
        table_id: string | null;
        table_name: string | null;
        pickup_number: number | null;
        customer_name: string | null;
        customer_phone: string | null;
        status: RestaurantOrderStatus;
        items_json: string;
        guest_count: number;
        notes: string;
        total_net: number;
        total_tax7: number;
        total_tax19: number;
        total_gross: number;
        payment_method: string | null;
        payment_status: string;
        created_at: string;
        kitchen_started_at: string | null;
        ready_at: string | null;
        completed_at: string | null;
      }>("SELECT * FROM restaurant_orders WHERE id = ?", id)
      .toArray()[0];

    if (!r) throw new RestaurantError("orderNotFound");
    return this.mapOrder(r);
  }

  createOrder(data: {
    type: OrderType;
    tableId?: string;
    tableName?: string;
    customerName?: string;
    customerPhone?: string;
    guestCount?: number;
    items: OrderItem[];
    notes?: string;
    paymentMethod?: "bar" | "karte" | "rechnung" | "pos";
  }): RestaurantOrder {
    return this.tx(() => {
      const id = crypto.randomUUID();
      const orderNumber = `BON-${nextNumber(this.sql, "restaurant_orders", "order_number", "BON-", 101)}`;

      // Falls Theke/Abholung: Abholnummer 1..99, jeden Tag neu ab 1. Nach 99 geht es mit 1 weiter
      // (vorher blieb die Nummer nach 99 auf 1 stehen, weil das Maximum 99 blieb).
      let pickupNumber: number | undefined;
      if (data.type === "theke" || data.type === "abholung") {
        const last = this.sql
          .exec<{ p: number; c: string }>("SELECT pickup_number AS p, created_at AS c FROM restaurant_orders WHERE pickup_number IS NOT NULL ORDER BY rowid DESC LIMIT 1")
          .toArray()[0];
        const sameDay = last && berlinDayOf(last.c) === berlinDayOf(new Date().toISOString());
        pickupNumber = sameDay ? (last.p % 99) + 1 : 1;
      }

      // Summen kalkulieren
      let tax7 = 0;
      let tax19 = 0;
      let totalGross = 0;

      for (const item of data.items) {
        const itemGross = item.quantity * item.unitPriceGross;
        totalGross += itemGross;
        if (item.taxRate === 7.0) {
          tax7 += itemGross - itemGross / 1.07;
        } else {
          tax19 += itemGross - itemGross / 1.19;
        }
      }

      tax7 = Math.round(tax7 * 100) / 100;
      tax19 = Math.round(tax19 * 100) / 100;
      totalGross = Math.round(totalGross * 100) / 100;
      const totalNet = Math.round((totalGross - tax7 - tax19) * 100) / 100;

      const isPaid = !!data.paymentMethod;

      this.sql.exec(
        `INSERT INTO restaurant_orders (
           id, order_number, type, table_id, table_name, pickup_number,
           customer_name, customer_phone, status, items_json, guest_count,
           notes, total_net, total_tax7, total_tax19, total_gross,
           payment_method, payment_status, created_at, kitchen_started_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_zubereitung', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        id,
        orderNumber,
        data.type,
        data.tableId ?? null,
        data.tableName ?? null,
        pickupNumber ?? null,
        data.customerName ?? null,
        data.customerPhone ?? null,
        JSON.stringify(data.items),
        data.guestCount ?? 1,
        data.notes ?? "",
        totalNet,
        tax7,
        tax19,
        totalGross,
        data.paymentMethod ?? null,
        isPaid ? "bezahlt" : "offen",
      );

      // Falls Tisch zugewiesen: Tischstatus auf belegt setzen
      if (data.tableId) {
        this.sql.exec(
          "UPDATE restaurant_tables SET status = 'belegt', current_order_id = ?, total_gross = ?, guest_count = ? WHERE id = ?",
          id,
          totalGross,
          data.guestCount ?? 1,
          data.tableId,
        );
      }

      return this.getOrder(id);
    });
  }

  updateOrder(id: string, patch: Partial<RestaurantOrder>): RestaurantOrder {
    return this.tx(() => {
      const cur = this.getOrder(id);
      const updated = { ...cur, ...patch };

      if (patch.items) {
        let tax7 = 0;
        let tax19 = 0;
        let totalGross = 0;

        for (const item of patch.items) {
          const itemGross = item.quantity * item.unitPriceGross;
          totalGross += itemGross;
          if (item.taxRate === 7.0) {
            tax7 += itemGross - itemGross / 1.07;
          } else {
            tax19 += itemGross - itemGross / 1.19;
          }
        }

        updated.totalTax7 = Math.round(tax7 * 100) / 100;
        updated.totalTax19 = Math.round(tax19 * 100) / 100;
        updated.totalGross = Math.round(totalGross * 100) / 100;
        updated.totalNet = Math.round((updated.totalGross - updated.totalTax7 - updated.totalTax19) * 100) / 100;
      }

      this.sql.exec(
        `UPDATE restaurant_orders SET
           status = ?, items_json = ?, notes = ?, total_net = ?,
           total_tax7 = ?, total_tax19 = ?, total_gross = ?,
           payment_method = ?, payment_status = ?, ready_at = ?, completed_at = ?
         WHERE id = ?`,
        updated.status,
        JSON.stringify(updated.items),
        updated.notes ?? "",
        updated.totalNet,
        updated.totalTax7,
        updated.totalTax19,
        updated.totalGross,
        updated.paymentMethod ?? null,
        updated.paymentStatus,
        updated.readyAt ?? null,
        updated.completedAt ?? null,
        id,
      );

      if (updated.tableId) {
        if (updated.status === "abgeschlossen" || updated.paymentStatus === "bezahlt") {
          this.sql.exec(
            "UPDATE restaurant_tables SET status = 'frei', current_order_id = NULL, total_gross = 0, guest_count = 0 WHERE id = ?",
            updated.tableId,
          );
        } else {
          this.sql.exec(
            "UPDATE restaurant_tables SET total_gross = ? WHERE id = ?",
            updated.totalGross,
            updated.tableId,
          );
        }
      }

      return updated;
    });
  }

  updateOrderStatus(id: string, status: RestaurantOrderStatus): RestaurantOrder {
    const patch: Partial<RestaurantOrder> = { status };
    if (status === "fertig") {
      patch.readyAt = new Date().toISOString();
    } else if (status === "abgeschlossen") {
      patch.completedAt = new Date().toISOString();
      patch.paymentStatus = "bezahlt";
    }
    return this.updateOrder(id, patch);
  }

  updateOrderItemStatus(orderId: string, itemId: string, status: ItemStatus): RestaurantOrder {
    return this.tx(() => {
      const order = this.getOrder(orderId);
      const items = order.items.map((it) => (it.id === itemId ? { ...it, status } : it));

      // Wenn alle Positionen fertig sind, Status der Order auf 'fertig' setzen
      const allDone = items.every((i) => i.status === "fertig" || i.status === "serviert");
      const orderStatus = allDone && order.status === "in_zubereitung" ? "fertig" : order.status;

      return this.updateOrder(orderId, {
        items,
        status: orderStatus,
        readyAt: allDone ? new Date().toISOString() : order.readyAt,
      });
    });
  }

  checkoutOrder(id: string, paymentMethod: "bar" | "karte" | "rechnung" | "pos"): RestaurantOrder {
    return this.tx(() => {
      const order = this.getOrder(id);
      return this.updateOrder(id, {
        status: "abgeschlossen",
        paymentMethod,
        paymentStatus: "bezahlt",
        completedAt: new Date().toISOString(),
      });
    });
  }

  getPickupQueue(): { preparing: RestaurantOrder[]; ready: RestaurantOrder[] } {
    const rows = this.sql
      .exec<{
        id: string;
        order_number: string;
        type: OrderType;
        table_id: string | null;
        table_name: string | null;
        pickup_number: number | null;
        customer_name: string | null;
        customer_phone: string | null;
        status: RestaurantOrderStatus;
        items_json: string;
        guest_count: number;
        notes: string;
        total_net: number;
        total_tax7: number;
        total_tax19: number;
        total_gross: number;
        payment_method: string | null;
        payment_status: string;
        created_at: string;
        kitchen_started_at: string | null;
        ready_at: string | null;
        completed_at: string | null;
      }>("SELECT * FROM restaurant_orders WHERE status IN ('in_zubereitung', 'fertig') ORDER BY created_at ASC")
      .toArray();

    const orders = rows.map((r) => this.mapOrder(r));
    return {
      preparing: orders.filter((o) => o.status === "in_zubereitung"),
      ready: orders.filter((o) => o.status === "fertig"),
    };
  }

  getStats(): RestaurantStats {
    const tables = this.listTables();
    const orders = this.listOrders();

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter((o) => o.createdAt.startsWith(todayStr));

    const openTablesCount = tables.filter((t) => t.status !== "frei").length;
    const activeKitchenTicketsCount = orders.filter((o) => o.status === "in_zubereitung").length;
    const waitingPickupCount = orders.filter(
      (o) => (o.type === "theke" || o.type === "abholung") && o.status === "fertig",
    ).length;

    const billedToday = todayOrders.filter((o) => o.paymentStatus === "bezahlt");
    const revenueTodayGross = billedToday.reduce((sum, o) => sum + o.totalGross, 0);

    return {
      openTablesCount,
      totalTablesCount: tables.length,
      activeKitchenTicketsCount,
      waitingPickupCount,
      ordersTodayCount: todayOrders.length,
      revenueTodayGross: Math.round(revenueTodayGross * 100) / 100,
      averagePrepTimeMinutes: 14,
    };
  }

  private mapOrder(r: {
    id: string;
    order_number: string;
    type: OrderType;
    table_id: string | null;
    table_name: string | null;
    pickup_number: number | null;
    customer_name: string | null;
    customer_phone: string | null;
    status: RestaurantOrderStatus;
    items_json: string;
    guest_count: number;
    notes: string;
    total_net: number;
    total_tax7: number;
    total_tax19: number;
    total_gross: number;
    payment_method: string | null;
    payment_status: string;
    created_at: string;
    kitchen_started_at: string | null;
    ready_at: string | null;
    completed_at: string | null;
  }): RestaurantOrder {
    return {
      id: r.id,
      orderNumber: r.order_number,
      type: r.type,
      tableId: r.table_id ?? undefined,
      tableName: r.table_name ?? undefined,
      pickupNumber: r.pickup_number ?? undefined,
      customerName: r.customer_name ?? undefined,
      customerPhone: r.customer_phone ?? undefined,
      status: r.status,
      items: JSON.parse(r.items_json || "[]") as OrderItem[],
      guestCount: r.guest_count,
      notes: r.notes,
      totalNet: r.total_net,
      totalTax7: r.total_tax7,
      totalTax19: r.total_tax19,
      totalGross: r.total_gross,
      paymentMethod: (r.payment_method as RestaurantOrder["paymentMethod"]) || undefined,
      paymentStatus: (r.payment_status as RestaurantOrder["paymentStatus"]) || "offen",
      createdAt: r.created_at,
      kitchenStartedAt: r.kitchen_started_at ?? undefined,
      readyAt: r.ready_at ?? undefined,
      completedAt: r.completed_at ?? undefined,
    };
  }
}
