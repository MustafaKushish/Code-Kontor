import { berlinYear, nextNumber } from "../numbers";
import type { PosArticle, PosLine } from "../../shared/pos";
import type { PosModule } from "./../pos/store";
import type {
  InspectionItem,
  OrderPosition,
  SparePart,
  TireStorage,
  Vehicle,
  WorkshopOrder,
  WorkshopOrderStatus,
  WorkshopStats,
} from "../../shared/workshop";

export class WorkshopError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const WORKSHOP_MIGRATIONS: string[] = [
  `CREATE TABLE workshop_vehicles (
     id TEXT PRIMARY KEY,
     license_plate TEXT NOT NULL UNIQUE,
     vin TEXT NOT NULL DEFAULT '',
     brand TEXT NOT NULL,
     model TEXT NOT NULL,
     year INTEGER NOT NULL DEFAULT 2020,
     mileage INTEGER NOT NULL DEFAULT 0,
     hsn TEXT NOT NULL DEFAULT '',
     tsn TEXT NOT NULL DEFAULT '',
     fuel_type TEXT NOT NULL DEFAULT 'Benzin',
     transmission TEXT NOT NULL DEFAULT 'Schaltgetriebe',
     power_hp INTEGER NOT NULL DEFAULT 150,
     next_inspection TEXT NOT NULL DEFAULT '',
     customer_name TEXT NOT NULL,
     customer_phone TEXT NOT NULL DEFAULT '',
     customer_email TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX workshop_vehicles_plate ON workshop_vehicles(license_plate);
   CREATE INDEX workshop_vehicles_customer ON workshop_vehicles(customer_name);

   CREATE TABLE workshop_orders (
     id TEXT PRIMARY KEY,
     order_number TEXT NOT NULL UNIQUE,
     vehicle_id TEXT NOT NULL,
     license_plate TEXT NOT NULL,
     vehicle_info TEXT NOT NULL,
     mileage INTEGER NOT NULL DEFAULT 0,
     customer_name TEXT NOT NULL,
     customer_phone TEXT NOT NULL DEFAULT '',
     customer_email TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'annahme',
     lift_bay TEXT NOT NULL DEFAULT 'Bühne 1',
     mechanic_name TEXT NOT NULL DEFAULT 'Meister',
     issue_description TEXT NOT NULL DEFAULT '',
     diagnostic_notes TEXT NOT NULL DEFAULT '',
     positions_json TEXT NOT NULL DEFAULT '[]',
     checklist_json TEXT NOT NULL DEFAULT '[]',
     estimate_status TEXT NOT NULL DEFAULT 'draft',
     estimate_total_gross REAL NOT NULL DEFAULT 0,
     status_token TEXT NOT NULL UNIQUE,
     payment_method TEXT,
     payment_status TEXT NOT NULL DEFAULT 'offen',
     total_net REAL NOT NULL DEFAULT 0,
     total_tax REAL NOT NULL DEFAULT 0,
     total_gross REAL NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     completed_at TEXT
   );
   CREATE INDEX workshop_orders_status ON workshop_orders(status);
   CREATE INDEX workshop_orders_plate ON workshop_orders(license_plate);
   CREATE INDEX workshop_orders_token ON workshop_orders(status_token);

   CREATE TABLE workshop_parts (
     id TEXT PRIMARY KEY,
     part_number TEXT NOT NULL UNIQUE,
     oem_number TEXT NOT NULL DEFAULT '',
     name TEXT NOT NULL,
     manufacturer TEXT NOT NULL DEFAULT '',
     category TEXT NOT NULL DEFAULT 'Sonstiges',
     stock INTEGER NOT NULL DEFAULT 0,
     min_stock INTEGER NOT NULL DEFAULT 2,
     purchase_price_net REAL NOT NULL DEFAULT 0,
     sale_price_net REAL NOT NULL DEFAULT 0,
     tax_rate REAL NOT NULL DEFAULT 19.0,
     storage_bin TEXT NOT NULL DEFAULT ''
   );
   CREATE INDEX workshop_parts_num ON workshop_parts(part_number);
   CREATE INDEX workshop_parts_name ON workshop_parts(name);

   CREATE TABLE workshop_tires (
     id TEXT PRIMARY KEY,
     vehicle_id TEXT,
     license_plate TEXT NOT NULL,
     customer_name TEXT NOT NULL,
     customer_phone TEXT NOT NULL DEFAULT '',
     type TEXT NOT NULL DEFAULT 'Sommer',
     brand TEXT NOT NULL,
     dimension TEXT NOT NULL,
     dot TEXT NOT NULL DEFAULT '',
     rim_type TEXT NOT NULL DEFAULT 'Alufelge',
     tread_depth_fl REAL NOT NULL DEFAULT 6.0,
     tread_depth_fr REAL NOT NULL DEFAULT 6.0,
     tread_depth_rl REAL NOT NULL DEFAULT 5.5,
     tread_depth_rr REAL NOT NULL DEFAULT 5.5,
     condition TEXT NOT NULL DEFAULT 'gut',
     storage_location TEXT NOT NULL DEFAULT '',
     stored_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX workshop_tires_plate ON workshop_tires(license_plate);
   CREATE INDEX workshop_tires_loc ON workshop_tires(storage_location);`,
];

export class WorkshopStore {
  constructor(
    private sql: SqlStorage,
    private tx: <T>(fn: () => T) => T,
  ) {}

  /** Beispieldaten, nur für das Demo-Konto (nie für echte Firmen). */
  seedIfEmpty() {
    const vCount = this.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM workshop_vehicles").one().c;
    if (vCount > 0) return;

    this.tx(() => {
      // 1. Fahrzeuge
      const v1Id = crypto.randomUUID();
      const v2Id = crypto.randomUUID();
      const v3Id = crypto.randomUUID();
      const v4Id = crypto.randomUUID();

      this.sql.exec(
        `INSERT INTO workshop_vehicles (id, license_plate, vin, brand, model, year, mileage, hsn, tsn, fuel_type, transmission, power_hp, next_inspection, customer_name, customer_phone, customer_email, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        v1Id,
        "HH-WM 2024",
        "WVWZZZAUZHP123456",
        "Volkswagen",
        "Golf VII Variant 2.0 TDI",
        2018,
        142500,
        "0603",
        "BPY",
        "Diesel",
        "DSG",
        150,
        "2026-08",
        "Maximilian Weber",
        "+49 171 4589210",
        "m.weber@beispiel-hh.de",
        "Kunde wünscht Longlife-Öl nach VW 507 00.",
      );

      this.sql.exec(
        `INSERT INTO workshop_vehicles (id, license_plate, vin, brand, model, year, mileage, hsn, tsn, fuel_type, transmission, power_hp, next_inspection, customer_name, customer_phone, customer_email, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        v2Id,
        "B-TK 8812",
        "WBA3D31080F654321",
        "BMW",
        "320d Touring (F31)",
        2019,
        118200,
        "0005",
        "BSE",
        "Diesel",
        "Automatik",
        190,
        "2026-04",
        "Tanja Krüger",
        "+49 176 8923411",
        "t.krueger@berlin-design.de",
        "Reifen eingelagert. HU/AU im April fällig.",
      );

      this.sql.exec(
        `INSERT INTO workshop_vehicles (id, license_plate, vin, brand, model, year, mileage, hsn, tsn, fuel_type, transmission, power_hp, next_inspection, customer_name, customer_phone, customer_email, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        v3Id,
        "M-AK 405",
        "WAUZZZF45HA987654",
        "Audi",
        "A4 Avant 2.0 TFSI",
        2020,
        64100,
        "0588",
        "BMG",
        "Benzin",
        "DSG",
        190,
        "2027-02",
        "Alexander Koch",
        "+49 160 3344556",
        "koch.alexander@mail.de",
        "Inspektion nach Herstellervorgabe + Bremsflüssigkeit.",
      );

      this.sql.exec(
        `INSERT INTO workshop_vehicles (id, license_plate, vin, brand, model, year, mileage, hsn, tsn, fuel_type, transmission, power_hp, next_inspection, customer_name, customer_phone, customer_email, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        v4Id,
        "K-SD 992",
        "WDD2050041F112233",
        "Mercedes-Benz",
        "C 220 d T-Modell",
        2017,
        185400,
        "1313",
        "EWQ",
        "Diesel",
        "Automatik",
        170,
        "2026-11",
        "Sabine Drews",
        "+49 152 7788990",
        "s.drews@koeln-art.de",
        "Klimaanlage kühlt nicht ausreichend.",
      );

      // 2. Ersatzteile
      const parts = [
        {
          num: "04L 115 562",
          oem: "04L 115 562",
          name: "Ölfiltereinsatz VAG 2.0 TDI",
          mfg: "Mann-Filter",
          cat: "Filter",
          stock: 14,
          min: 4,
          ek: 6.8,
          vk: 16.5,
          bin: "Regal A-02",
        },
        {
          num: "EDGE 5W-30 LL",
          oem: "VW 504 00 / 507 00",
          name: "Castrol EDGE Professional Longlife III 5W-30 (1L)",
          mfg: "Castrol",
          cat: "Öle & Chemie",
          stock: 48,
          min: 15,
          ek: 7.2,
          vk: 19.9,
          bin: "Öllager Fass 1",
        },
        {
          num: "13.0460-7294.2",
          oem: "5Q0 698 151 B",
          name: "Bremsbelagsatz Vorderachse",
          mfg: "ATE",
          cat: "Bremsen",
          stock: 3,
          min: 2,
          ek: 38.5,
          vk: 89.0,
          bin: "Regal B-14",
        },
        {
          num: "09.9772.11",
          oem: "5Q0 615 301 F",
          name: "Bremsscheibe COAT Z belüftet 312mm (Paar)",
          mfg: "Brembo",
          cat: "Bremsen",
          stock: 2,
          min: 2,
          ek: 65.0,
          vk: 149.0,
          bin: "Schwerlastregal 1",
        },
        {
          num: "3 397 118 938",
          oem: "A 938 S",
          name: "Aerotwin Scheibenwischer-Satz (Vorn)",
          mfg: "Bosch",
          cat: "Sonstiges",
          stock: 8,
          min: 3,
          ek: 14.5,
          vk: 34.9,
          bin: "Regal C-05",
        },
        {
          num: "DOT4-PLUS-1L",
          oem: "DIN ISO 4925",
          name: "Bremsflüssigkeit DOT 4 Plus (1 Liter)",
          mfg: "Ate",
          cat: "Öle & Chemie",
          stock: 12,
          min: 5,
          ek: 4.8,
          vk: 14.5,
          bin: "Gefahrstoffschrank",
        },
        {
          num: "FEBI-40812",
          oem: "1K0 411 315 R",
          name: "Koppelstange / Stabilisatorstange Vorderachse",
          mfg: "Febi Bilstein",
          cat: "Fahrwerk",
          stock: 1,
          min: 2,
          ek: 12.0,
          vk: 29.5,
          bin: "Regal B-08",
        },
        {
          num: "R1234yf-1KG",
          oem: "Klimagas",
          name: "Kältemittel R1234yf Klimaservice (je 100g)",
          mfg: "Honeywell",
          cat: "Öle & Chemie",
          stock: 24,
          min: 10,
          ek: 3.5,
          vk: 12.0,
          bin: "Klimastation",
        },
      ];

      for (const p of parts) {
        this.sql.exec(
          `INSERT INTO workshop_parts (id, part_number, oem_number, name, manufacturer, category, stock, min_stock, purchase_price_net, sale_price_net, tax_rate, storage_bin)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          crypto.randomUUID(),
          p.num,
          p.oem,
          p.name,
          p.mfg,
          p.cat,
          p.stock,
          p.min,
          p.ek,
          p.vk,
          19.0,
          p.bin,
        );
      }

      // 3. Reifendepot
      this.sql.exec(
        `INSERT INTO workshop_tires (id, vehicle_id, license_plate, customer_name, customer_phone, type, brand, dimension, dot, rim_type, tread_depth_fl, tread_depth_fr, tread_depth_rl, tread_depth_rr, condition, storage_location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        v2Id,
        "B-TK 8812",
        "Tanja Krüger",
        "+49 176 8923411",
        "Sommer",
        "Michelin Primacy 4",
        "225/50 R17 98Y",
        "2122",
        "Alufelge",
        6.2,
        6.1,
        5.8,
        5.9,
        "gut",
        "Reifenregal 3 - Fach B2",
      );

      this.sql.exec(
        `INSERT INTO workshop_tires (id, vehicle_id, license_plate, customer_name, customer_phone, type, brand, dimension, dot, rim_type, tread_depth_fl, tread_depth_fr, tread_depth_rl, tread_depth_rr, condition, storage_location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        v1Id,
        "HH-WM 2024",
        "Maximilian Weber",
        "+49 171 4589210",
        "Winter",
        "Continental WinterContact TS 870",
        "205/55 R16 91H",
        "3821",
        "Stahlfelge",
        5.0,
        5.2,
        4.8,
        4.9,
        "gut",
        "Reifenregal 1 - Fach A4",
      );

      // 4. Aufträge
      const order1Checklist: InspectionItem[] = [
        { id: "1", category: "motor_abgas", name: "Motorölstand & Dichtigkeit", status: "ok", value: "Neu befüllt" },
        { id: "2", category: "bremsen", name: "Bremsbeläge & Bremsscheiben vorn", status: "defect", note: "Belagstärke unter 2mm, Scheiben eingelaufen", value: "1.8 mm" },
        { id: "3", category: "bremsen", name: "Bremsbeläge hinten", status: "ok", value: "6.5 mm" },
        { id: "4", category: "fahrwerk", name: "Koppelstangen / Stoßdämpfer", status: "warning", note: "Koppelstange rechts leichtes Spiel" },
        { id: "5", category: "beleuchtung", name: "Scheinwerfer & Leuchtweitenregulierung", status: "ok" },
        { id: "6", category: "fluessigkeiten", name: "Kühlmittel & Frostschutz", status: "ok", value: "-32 °C" },
      ];

      const order1Positions: OrderPosition[] = [
        { id: "p1", type: "labor", code: "AW-INSP", name: "Große Inspektion nach Herstellervorgabe", quantity: 18, unit: "AW", unitPriceNet: 9.5, taxRate: 19, approvedByCustomer: true },
        { id: "p2", type: "part", code: "04L 115 562", name: "Ölfiltereinsatz VAG 2.0 TDI", quantity: 1, unit: "Stück", unitPriceNet: 16.5, taxRate: 19, approvedByCustomer: true },
        { id: "p3", type: "part", code: "EDGE 5W-30 LL", name: "Castrol EDGE 5W-30 Longlife III", quantity: 4.7, unit: "Liter", unitPriceNet: 19.9, taxRate: 19, approvedByCustomer: true },
        { id: "p4", type: "labor", code: "AW-BR-VA", name: "Bremsscheiben & Bremsbeläge Vorderachse erneuern", quantity: 12, unit: "AW", unitPriceNet: 9.5, taxRate: 19, approvedByCustomer: true },
        { id: "p5", type: "part", code: "13.0460-7294.2", name: "ATE Bremsbelagsatz Vorderachse", quantity: 1, unit: "Satz", unitPriceNet: 89.0, taxRate: 19, approvedByCustomer: true },
        { id: "p6", type: "part", code: "09.9772.11", name: "Brembo Bremsscheiben 312mm (2 Stück)", quantity: 1, unit: "Satz", unitPriceNet: 149.0, taxRate: 19, approvedByCustomer: true },
      ];

      const totalNet1 = order1Positions.reduce((sum, p) => sum + p.quantity * p.unitPriceNet, 0);
      const totalTax1 = Math.round(totalNet1 * 0.19 * 100) / 100;
      const totalGross1 = Math.round((totalNet1 + totalTax1) * 100) / 100;

      this.sql.exec(
        `INSERT INTO workshop_orders (id, order_number, vehicle_id, license_plate, vehicle_info, mileage, customer_name, customer_phone, customer_email, status, lift_bay, mechanic_name, issue_description, diagnostic_notes, positions_json, checklist_json, estimate_status, estimate_total_gross, status_token, payment_method, payment_status, total_net, total_tax, total_gross, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-3 hours'), datetime('now', '-20 minutes'))`,
        crypto.randomUUID(),
        "WO-2026-0041",
        v1Id,
        "HH-WM 2024",
        "VW Golf VII Variant 2.0 TDI",
        142500,
        "Maximilian Weber",
        "+49 171 4589210",
        "m.weber@beispiel-hh.de",
        "in_arbeit",
        "Bühne 1",
        "Meister Frank",
        "Große Inspektion fällig; Schleifgeräusch beim Bremsen vorne rechts.",
        "Bremsen vorne verschlissen (Träger berührt Scheibe). Kunde hat KVA freigegeben. Neuteile montiert, Entlüftung läuft.",
        JSON.stringify(order1Positions),
        JSON.stringify(order1Checklist),
        "approved",
        totalGross1,
        "status-hh-wm2024",
        null,
        "offen",
        totalNet1,
        totalTax1,
        totalGross1,
      );

      // Order 2: BMW 320d (wartet_teile mit KVA versendet)
      const order2Positions: OrderPosition[] = [
        { id: "b1", type: "labor", code: "AW-DIAG", name: "Fehlerspeicher auslesen & Fahrwerksprüfung", quantity: 6, unit: "AW", unitPriceNet: 9.5, taxRate: 19, approvedByCustomer: true },
        { id: "b2", type: "labor", code: "AW-STABI", name: "Koppelstangen Vorderachse beidseitig ersetzen", quantity: 8, unit: "AW", unitPriceNet: 9.5, taxRate: 19, approvedByCustomer: false },
        { id: "b3", type: "part", code: "FEBI-40812", name: "Febi Bilstein Koppelstange verstärkt (Paar)", quantity: 2, unit: "Stück", unitPriceNet: 29.5, taxRate: 19, approvedByCustomer: false },
      ];
      const totalNet2 = order2Positions.reduce((sum, p) => sum + p.quantity * p.unitPriceNet, 0);
      const totalTax2 = Math.round(totalNet2 * 0.19 * 100) / 100;
      const totalGross2 = Math.round((totalNet2 + totalTax2) * 100) / 100;

      this.sql.exec(
        `INSERT INTO workshop_orders (id, order_number, vehicle_id, license_plate, vehicle_info, mileage, customer_name, customer_phone, customer_email, status, lift_bay, mechanic_name, issue_description, diagnostic_notes, positions_json, checklist_json, estimate_status, estimate_total_gross, status_token, payment_method, payment_status, total_net, total_tax, total_gross, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-5 hours'), datetime('now', '-1 hour'))`,
        crypto.randomUUID(),
        "WO-2026-0042",
        v2Id,
        "B-TK 8812",
        "BMW 320d Touring (F31)",
        118200,
        "Tanja Krüger",
        "+49 176 8923411",
        "t.krueger@berlin-design.de",
        "wartet_teile",
        "Bühne 2",
        "Jan Mechanik",
        "Poltern an der Vorderachse bei Unebenheiten; Reifencheck vor Sommerurlaub.",
        "Koppelstange links Kugelgelenk ausgeschlagen. Expresslieferung Teile avisiert für 14:30 Uhr.",
        JSON.stringify(order2Positions),
        JSON.stringify([]),
        "sent",
        totalGross2,
        "status-b-tk8812",
        null,
        "offen",
        totalNet2,
        totalTax2,
        totalGross2,
      );

      // Order 3: Audi A4 (abholbereit)
      const order3Positions: OrderPosition[] = [
        { id: "a1", type: "labor", code: "AW-HUAU", name: "Haupt- und Abgasuntersuchung (TÜV Hanse)", quantity: 1, unit: "Pauschal", unitPriceNet: 148.0, taxRate: 0, approvedByCustomer: true },
        { id: "a2", type: "labor", code: "AW-VORB", name: "HU-Vorab-Check & Lichteinstellung", quantity: 4, unit: "AW", unitPriceNet: 9.5, taxRate: 19, approvedByCustomer: true },
        { id: "a3", type: "part", code: "3 397 118 938", name: "Bosch Aerotwin Wischerblätter Satz", quantity: 1, unit: "Satz", unitPriceNet: 34.9, taxRate: 19, approvedByCustomer: true },
      ];
      const totalNet3 = order3Positions.reduce((sum, p) => sum + p.quantity * p.unitPriceNet, 0);
      const totalTax3 = Math.round((4 * 9.5 + 34.9) * 0.19 * 100) / 100;
      const totalGross3 = Math.round((totalNet3 + totalTax3) * 100) / 100;

      this.sql.exec(
        `INSERT INTO workshop_orders (id, order_number, vehicle_id, license_plate, vehicle_info, mileage, customer_name, customer_phone, customer_email, status, lift_bay, mechanic_name, issue_description, diagnostic_notes, positions_json, checklist_json, estimate_status, estimate_total_gross, status_token, payment_method, payment_status, total_net, total_tax, total_gross, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 day'), datetime('now', '-30 minutes'))`,
        crypto.randomUUID(),
        "WO-2026-0040",
        v3Id,
        "M-AK 405",
        "Audi A4 Avant 2.0 TFSI",
        64100,
        "Alexander Koch",
        "+49 160 3344556",
        "koch.alexander@mail.de",
        "abholbereit",
        "Hof / Parkplatz",
        "Meister Frank",
        "TÜV / AU fällig. Bitte Scheinwerfer prüfen.",
        "HU/AU ohne Mängel bestanden. Prüfplakette 02/2028 zugeteilt. Wischerblätter erneuert. Fahrzeug gewaschen.",
        JSON.stringify(order3Positions),
        JSON.stringify([]),
        "approved",
        totalGross3,
        "status-m-ak405",
        null,
        "offen",
        totalNet3,
        totalTax3,
        totalGross3,
      );

      // Order 4: Mercedes C-Klasse (abgerechnet)
      const order4Positions: OrderPosition[] = [
        { id: "m1", type: "labor", code: "AW-KLIMA", name: "Klimaservice Komfort inkl. Dichtigkeitsprüfung", quantity: 8, unit: "AW", unitPriceNet: 9.5, taxRate: 19, approvedByCustomer: true },
        { id: "m2", type: "part", code: "R1234yf-1KG", name: "Kältemittel R1234yf (450g)", quantity: 4.5, unit: "Stück", unitPriceNet: 12.0, taxRate: 19, approvedByCustomer: true },
        { id: "m3", type: "part", code: "DESINF-KLIMA", name: "Verdampfer-Desinfektion & Ozonbehandlung", quantity: 1, unit: "Pauschal", unitPriceNet: 24.5, taxRate: 19, approvedByCustomer: true },
      ];
      const totalNet4 = order4Positions.reduce((sum, p) => sum + p.quantity * p.unitPriceNet, 0);
      const totalTax4 = Math.round(totalNet4 * 0.19 * 100) / 100;
      const totalGross4 = Math.round((totalNet4 + totalTax4) * 100) / 100;

      this.sql.exec(
        `INSERT INTO workshop_orders (id, order_number, vehicle_id, license_plate, vehicle_info, mileage, customer_name, customer_phone, customer_email, status, lift_bay, mechanic_name, issue_description, diagnostic_notes, positions_json, checklist_json, estimate_status, estimate_total_gross, status_token, payment_method, payment_status, total_net, total_tax, total_gross, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-2 days'), datetime('now', '-4 hours'), datetime('now', '-4 hours'))`,
        crypto.randomUUID(),
        "WO-2026-0039",
        v4Id,
        "K-SD 992",
        "Mercedes-Benz C 220 d T-Modell",
        185400,
        "Sabine Drews",
        "+49 152 7788990",
        "s.drews@koeln-art.de",
        "abgerechnet",
        "Hof / Parkplatz",
        "Jan Mechanik",
        "Klimaanlage kühlt nicht; muffiger Geruch bei Gebläsestufe 2.",
        "Klimaservice durchgeführt, 380g Kältemittel nachgefüllt, Verdampfer desinfiziert. Ausblastemperatur 6.2°C erreicht.",
        JSON.stringify(order4Positions),
        JSON.stringify([]),
        "approved",
        totalGross4,
        "status-k-sd992",
        "karte",
        "bezahlt",
        totalNet4,
        totalTax4,
        totalGross4,
      );
    });
  }

  // ==================== AUFTRÄGE (ORDERS) ====================

  listOrders(): WorkshopOrder[] {
    const rows = this.sql
      .exec<{
        id: string;
        order_number: string;
        vehicle_id: string;
        license_plate: string;
        vehicle_info: string;
        mileage: number;
        customer_name: string;
        customer_phone: string;
        customer_email: string;
        status: WorkshopOrderStatus;
        lift_bay: string;
        mechanic_name: string;
        issue_description: string;
        diagnostic_notes: string;
        positions_json: string;
        checklist_json: string;
        estimate_status: string;
        estimate_total_gross: number;
        status_token: string;
        payment_method: string | null;
        payment_status: string;
        total_net: number;
        total_tax: number;
        total_gross: number;
        created_at: string;
        updated_at: string;
        completed_at: string | null;
      }>("SELECT * FROM workshop_orders ORDER BY created_at DESC")
      .toArray();

    return rows.map((r) => this.mapOrder(r));
  }

  getOrder(id: string): WorkshopOrder {
    const r = this.sql
      .exec<{
        id: string;
        order_number: string;
        vehicle_id: string;
        license_plate: string;
        vehicle_info: string;
        mileage: number;
        customer_name: string;
        customer_phone: string;
        customer_email: string;
        status: WorkshopOrderStatus;
        lift_bay: string;
        mechanic_name: string;
        issue_description: string;
        diagnostic_notes: string;
        positions_json: string;
        checklist_json: string;
        estimate_status: string;
        estimate_total_gross: number;
        status_token: string;
        payment_method: string | null;
        payment_status: string;
        total_net: number;
        total_tax: number;
        total_gross: number;
        created_at: string;
        updated_at: string;
        completed_at: string | null;
      }>("SELECT * FROM workshop_orders WHERE id = ?", id)
      .toArray()[0];

    if (!r) throw new WorkshopError("orderNotFound");
    return this.mapOrder(r);
  }

  getOrderByStatusToken(token: string): WorkshopOrder {
    const r = this.sql
      .exec<{
        id: string;
        order_number: string;
        vehicle_id: string;
        license_plate: string;
        vehicle_info: string;
        mileage: number;
        customer_name: string;
        customer_phone: string;
        customer_email: string;
        status: WorkshopOrderStatus;
        lift_bay: string;
        mechanic_name: string;
        issue_description: string;
        diagnostic_notes: string;
        positions_json: string;
        checklist_json: string;
        estimate_status: string;
        estimate_total_gross: number;
        status_token: string;
        payment_method: string | null;
        payment_status: string;
        total_net: number;
        total_tax: number;
        total_gross: number;
        created_at: string;
        updated_at: string;
        completed_at: string | null;
      }>("SELECT * FROM workshop_orders WHERE status_token = ?", token)
      .toArray()[0];

    if (!r) throw new WorkshopError("orderNotFound");
    return this.mapOrder(r);
  }

  createOrder(data: {
    vehicleId?: string;
    licensePlate: string;
    vehicleInfo?: string;
    vin?: string;
    mileage: number;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    issueDescription: string;
    liftBay?: string;
    mechanicName?: string;
    positions?: OrderPosition[];
  }): WorkshopOrder {
    return this.tx(() => {
      // 1. Ggf. Fahrzeug anlegen oder aktualisieren
      let vId = data.vehicleId;
      const cleanPlate = data.licensePlate.trim().toUpperCase();

      if (!vId) {
        const existingV = this.sql
          .exec<{ id: string }>("SELECT id FROM workshop_vehicles WHERE license_plate = ?", cleanPlate)
          .toArray();

        if (existingV.length > 0) {
          vId = existingV[0].id;
          this.sql.exec(
            "UPDATE workshop_vehicles SET mileage = ?, customer_phone = ?, customer_email = ? WHERE id = ?",
            data.mileage,
            data.customerPhone,
            data.customerEmail ?? "",
            vId,
          );
        } else {
          vId = crypto.randomUUID();
          this.sql.exec(
            `INSERT INTO workshop_vehicles (id, license_plate, vin, brand, model, year, mileage, fuel_type, transmission, next_inspection, customer_name, customer_phone, customer_email)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            vId,
            cleanPlate,
            data.vin ?? "",
            data.vehicleInfo?.split(" ")[0] ?? "Kfz",
            data.vehicleInfo ?? "Fahrzeug",
            new Date().getFullYear() - 4,
            data.mileage,
            "Benzin",
            "Schaltgetriebe",
            "",
            data.customerName,
            data.customerPhone,
            data.customerEmail ?? "",
          );
        }
      }

      // 2. Auftragsnummer generieren
      const prefix = `WO-${berlinYear()}-`;
      const orderNum = `${prefix}${String(nextNumber(this.sql, "workshop_orders", "order_number", prefix)).padStart(4, "0")}`;

      const id = crypto.randomUUID();
      // Nicht erratbar: kein Kennzeichen im Link, 32 Zeichen Zufall
      const statusToken = crypto.randomUUID().replace(/-/g, "");

      const positions = data.positions ?? [];
      const totalNet = positions.reduce((s, p) => s + p.quantity * p.unitPriceNet, 0);
      const totalTax = Math.round(totalNet * 0.19 * 100) / 100;
      const totalGross = Math.round((totalNet + totalTax) * 100) / 100;

      this.sql.exec(
        `INSERT INTO workshop_orders (
           id, order_number, vehicle_id, license_plate, vehicle_info, mileage,
           customer_name, customer_phone, customer_email, status, lift_bay,
           mechanic_name, issue_description, diagnostic_notes, positions_json,
           checklist_json, estimate_status, estimate_total_gross, status_token,
           payment_method, payment_status, total_net, total_tax, total_gross
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        orderNum,
        vId,
        cleanPlate,
        data.vehicleInfo || "Fahrzeug",
        data.mileage,
        data.customerName,
        data.customerPhone,
        data.customerEmail ?? "",
        "annahme",
        data.liftBay || "Bühne 1",
        data.mechanicName || "Meister",
        data.issueDescription,
        "",
        JSON.stringify(positions),
        JSON.stringify([]),
        "draft",
        totalGross,
        statusToken,
        null,
        "offen",
        totalNet,
        totalTax,
        totalGross,
      );

      return this.getOrder(id);
    });
  }

  updateOrder(id: string, patch: Partial<WorkshopOrder>): WorkshopOrder {
    return this.tx(() => {
      const current = this.getOrder(id);
      const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };

      // Berechne Summen neu falls Positionen übergeben wurden
      if (patch.positions) {
        const net = patch.positions.reduce((s, p) => s + p.quantity * p.unitPriceNet, 0);
        const tax = Math.round(net * 0.19 * 100) / 100;
        updated.totalNet = net;
        updated.totalTax = tax;
        updated.totalGross = Math.round((net + tax) * 100) / 100;
      }

      this.sql.exec(
        `UPDATE workshop_orders SET
           status = ?, lift_bay = ?, mechanic_name = ?, issue_description = ?,
           diagnostic_notes = ?, positions_json = ?, checklist_json = ?,
           estimate_status = ?, estimate_total_gross = ?, payment_method = ?,
           payment_status = ?, total_net = ?, total_tax = ?, total_gross = ?,
           updated_at = ?, completed_at = ?
         WHERE id = ?`,
        updated.status,
        updated.liftBay,
        updated.mechanicName ?? "",
        updated.issueDescription,
        updated.diagnosticNotes ?? "",
        JSON.stringify(updated.positions),
        JSON.stringify(updated.checklist || []),
        updated.estimateStatus,
        updated.totalGross,
        // Offene Aufträge haben keine Zahlart; undefined nimmt SQLite nicht an
        updated.paymentMethod ?? null,
        updated.paymentStatus,
        updated.totalNet,
        updated.totalTax,
        updated.totalGross,
        updated.updatedAt,
        updated.status === "abgerechnet" || updated.status === "abholbereit"
          ? updated.completedAt || new Date().toISOString()
          : null,
        id,
      );

      return updated;
    });
  }

  updateOrderStatus(id: string, status: WorkshopOrderStatus): WorkshopOrder {
    return this.updateOrder(id, { status });
  }

  approveEstimateByToken(token: string, approvedPositionIds?: string[]): WorkshopOrder {
    return this.tx(() => {
      const order = this.getOrderByStatusToken(token);
      // Bezahlte oder schon entschiedene Aufträge ändert der Kunde nicht mehr
      if (order.status === "abgerechnet" || order.paymentStatus === "bezahlt") throw new WorkshopError("orderClosed");
      if (order.estimateStatus === "approved" || order.estimateStatus === "rejected") throw new WorkshopError("estimateDecided");
      let positions = order.positions;

      if (approvedPositionIds && approvedPositionIds.length > 0) {
        positions = positions.map((p) => ({
          ...p,
          approvedByCustomer: approvedPositionIds.includes(p.id) ? true : p.approvedByCustomer,
        }));
      } else {
        positions = positions.map((p) => ({ ...p, approvedByCustomer: true }));
      }

      const net = positions.filter((p) => p.approvedByCustomer).reduce((s, p) => s + p.quantity * p.unitPriceNet, 0);
      const tax = Math.round(net * 0.19 * 100) / 100;
      const gross = Math.round((net + tax) * 100) / 100;

      this.sql.exec(
        `UPDATE workshop_orders SET
           status = CASE WHEN status = 'wartet_teile' THEN 'in_arbeit' ELSE status END,
           estimate_status = 'approved',
           positions_json = ?,
           total_net = ?, total_tax = ?, total_gross = ?,
           updated_at = datetime('now')
         WHERE id = ?`,
        JSON.stringify(positions),
        net,
        tax,
        gross,
        order.id,
      );

      return this.getOrder(order.id);
    });
  }

  // ---------- KASSE: Aufträge und Teile werden in der Kasse der Plattform abgerechnet ----------

  posModule(): PosModule {
    const payable = (o: WorkshopOrder) => o.status !== "abgerechnet" && o.paymentStatus !== "bezahlt";
    // Bei freigegebenem Kostenvoranschlag nur die freigegebenen Positionen
    const billed = (o: WorkshopOrder) => (o.estimateStatus === "approved" ? o.positions.filter((p) => p.approvedByCustomer) : o.positions);
    const gross = (net: number, rate: number, discount = 0) => Math.round(net * 100 * (1 - discount / 100) * (1 + rate / 100));
    const orderArticle = (o: WorkshopOrder): PosArticle => ({
      source: "workshop", kind: "order", refId: o.id, name: `${o.orderNumber} · ${o.licensePlate}`, detail: o.customerName,
      priceCents: billed(o).reduce((sum, p) => sum + Math.round(p.quantity * gross(p.unitPriceNet, p.taxRate, p.discountPercent)), 0),
      vatRate: 0, single: true, group: "@workshop.order", code: o.orderNumber,
    });
    const partArticle = (p: SparePart): PosArticle => ({
      source: "workshop", kind: "part", refId: p.id, name: p.name, detail: [p.manufacturer, p.partNumber].filter(Boolean).join(" · "),
      priceCents: gross(p.salePriceNet, p.taxRate), vatRate: p.taxRate, stock: p.stock, group: "@workshop.part", code: p.partNumber,
    });
    const ready = () => this.listOrders().filter((o) => payable(o) && (o.status === "abholbereit" || o.status === "endkontrolle"));
    const order = (id: string | null) => {
      const r = id ? this.sql.exec<{ id: string }>("SELECT id FROM workshop_orders WHERE id = ?", id).toArray()[0] : undefined;
      return r ? this.getOrder(r.id) : null;
    };
    const partById = (id: string | null) => (id ? this.listParts().find((p) => p.id === id) ?? null : null);
    const partByNumber = (code: string) => this.sql.exec<{ id: string }>("SELECT id FROM workshop_parts WHERE part_number = ?", code).toArray()[0]?.id;
    // Lager: verkaufte Teile und Teile-Positionen eines Auftrags
    const stock = (lines: PosLine[], sign: 1 | -1) => {
      for (const l of lines) {
        if (l.kind === "part" && l.refId && partById(l.refId)) this.adjustPartStock(l.refId, sign * l.qty);
      }
    };
    const orderStock = (o: WorkshopOrder, sign: 1 | -1) => {
      for (const p of billed(o)) {
        const id = p.type === "part" && p.code ? partByNumber(p.code) : undefined;
        if (id) this.adjustPartStock(id, sign * p.quantity);
      }
    };
    return {
      articles: (query) => {
        const q = query.trim().toLowerCase();
        const orders = this.listOrders().filter((o) => payable(o) && [o.orderNumber, o.licensePlate, o.customerName].some((v) => v.toLowerCase().includes(q)));
        const parts = this.listParts().filter((p) => [p.name, p.partNumber, p.oemNumber ?? ""].some((v) => v.toLowerCase().includes(q)));
        return [...orders.slice(0, 20).map(orderArticle), ...parts.slice(0, 40).map(partArticle)];
      },
      catalog: () => [...ready().map(orderArticle), ...this.listParts().slice(0, 1000).map(partArticle)],
      scan: (code) => {
        const o = order(code) ?? this.listOrders().find((x) => x.orderNumber === code.toUpperCase()) ?? null;
        if (o && payable(o)) return [orderArticle(o)];
        const id = partByNumber(code);
        const p = id ? partById(id) : null;
        return p ? [partArticle(p)] : [];
      },
      prepare: (line) => {
        if (line.kind === "part") {
          const p = partById(line.refId);
          if (!p) throw new WorkshopError("notFound");
          return { lines: [{ ...line, name: line.name || p.name, vatRate: p.taxRate }] };
        }
        const o = order(line.refId);
        if (!o) throw new WorkshopError("notFound");
        if (!payable(o)) throw new WorkshopError("notPayable");
        return {
          lines: billed(o).map((p): PosLine => ({
            source: "workshop", kind: `order:${p.type}`, refId: o.id, name: p.name, qty: p.quantity,
            unitCents: gross(p.unitPriceNet, p.taxRate, p.discountPercent), vatRate: p.taxRate,
          })),
          refs: [{ source: "workshop", kind: "order", refId: o.id, label: `${o.orderNumber} · ${o.licensePlate}` }],
          customer: { id: null, name: o.customerName, address: "", phone: o.customerPhone, email: o.customerEmail ?? "" },
        };
      },
      booked: (_receipt, lines, refs) => {
        stock(lines, -1);
        for (const ref of refs) {
          const o = order(ref.refId);
          if (!o || !payable(o)) throw new WorkshopError("notPayable");
          orderStock(o, -1);
          this.updateOrder(o.id, { status: "abgerechnet", paymentMethod: "pos", paymentStatus: "bezahlt", completedAt: new Date().toISOString() });
        }
      },
      canceled: (original) => {
        stock(original.lines.filter((l) => l.source === "workshop"), 1);
        for (const ref of original.refs) {
          if (ref.source !== "workshop") continue;
          const o = order(ref.refId);
          if (!o || o.paymentStatus !== "bezahlt") continue;
          orderStock(o, 1);
          this.updateOrder(o.id, { status: "abholbereit", paymentStatus: "offen", completedAt: undefined });
        }
      },
    };
  }

  deleteOrder(id: string): { ok: true } {
    this.sql.exec("DELETE FROM workshop_orders WHERE id = ?", id);
    return { ok: true };
  }

  // ==================== FAHRZEUGE (VEHICLES) ====================

  listVehicles(): Vehicle[] {
    const rows = this.sql
      .exec<{
        id: string;
        license_plate: string;
        vin: string;
        brand: string;
        model: string;
        year: number;
        mileage: number;
        hsn: string;
        tsn: string;
        fuel_type: "Benzin" | "Diesel" | "Hybrid" | "Elektro" | "LPG";
        transmission: "Schaltgetriebe" | "Automatik" | "DSG";
        power_hp: number;
        next_inspection: string;
        customer_name: string;
        customer_phone: string;
        customer_email: string;
        notes: string;
        created_at: string;
      }>("SELECT * FROM workshop_vehicles ORDER BY license_plate ASC")
      .toArray();

    return rows.map((r) => ({
      id: r.id,
      licensePlate: r.license_plate,
      vin: r.vin,
      brand: r.brand,
      model: r.model,
      year: r.year,
      mileage: r.mileage,
      hsn: r.hsn,
      tsn: r.tsn,
      fuelType: r.fuel_type,
      transmission: r.transmission,
      powerHp: r.power_hp,
      nextInspection: r.next_inspection,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      customerEmail: r.customer_email,
      notes: r.notes,
      createdAt: r.created_at,
    }));
  }

  getVehicle(id: string): Vehicle {
    const r = this.sql
      .exec<{
        id: string;
        license_plate: string;
        vin: string;
        brand: string;
        model: string;
        year: number;
        mileage: number;
        hsn: string;
        tsn: string;
        fuel_type: "Benzin" | "Diesel" | "Hybrid" | "Elektro" | "LPG";
        transmission: "Schaltgetriebe" | "Automatik" | "DSG";
        power_hp: number;
        next_inspection: string;
        customer_name: string;
        customer_phone: string;
        customer_email: string;
        notes: string;
        created_at: string;
      }>("SELECT * FROM workshop_vehicles WHERE id = ?", id)
      .toArray()[0];

    if (!r) throw new WorkshopError("vehicleNotFound");
    return {
      id: r.id,
      licensePlate: r.license_plate,
      vin: r.vin,
      brand: r.brand,
      model: r.model,
      year: r.year,
      mileage: r.mileage,
      hsn: r.hsn,
      tsn: r.tsn,
      fuelType: r.fuel_type,
      transmission: r.transmission,
      powerHp: r.power_hp,
      nextInspection: r.next_inspection,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      customerEmail: r.customer_email,
      notes: r.notes,
      createdAt: r.created_at,
    };
  }

  saveVehicle(data: Partial<Vehicle> & { licensePlate: string; customerName: string }): Vehicle {
    return this.tx(() => {
      const cleanPlate = data.licensePlate.trim().toUpperCase();
      let id = data.id;
      // Kennzeichen sind eindeutig; sonst scheitert das Speichern mit einem Datenbankfehler
      if (this.sql.exec("SELECT 1 FROM workshop_vehicles WHERE license_plate = ? AND id <> ?", cleanPlate, id ?? "").toArray().length) throw new WorkshopError("plateTaken");

      if (id) {
        this.sql.exec(
          `UPDATE workshop_vehicles SET
             license_plate = ?, vin = ?, brand = ?, model = ?, year = ?,
             mileage = ?, hsn = ?, tsn = ?, fuel_type = ?, transmission = ?,
             power_hp = ?, next_inspection = ?, customer_name = ?,
             customer_phone = ?, customer_email = ?, notes = ?
           WHERE id = ?`,
          cleanPlate,
          data.vin ?? "",
          data.brand ?? "",
          data.model ?? "",
          data.year ?? 2020,
          data.mileage ?? 0,
          data.hsn ?? "",
          data.tsn ?? "",
          data.fuelType ?? "Benzin",
          data.transmission ?? "Schaltgetriebe",
          data.powerHp ?? 150,
          data.nextInspection ?? "",
          data.customerName,
          data.customerPhone ?? "",
          data.customerEmail ?? "",
          data.notes ?? "",
          id,
        );
      } else {
        id = crypto.randomUUID();
        this.sql.exec(
          `INSERT INTO workshop_vehicles (
             id, license_plate, vin, brand, model, year, mileage, hsn, tsn,
             fuel_type, transmission, power_hp, next_inspection,
             customer_name, customer_phone, customer_email, notes
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          cleanPlate,
          data.vin ?? "",
          data.brand ?? "",
          data.model ?? "",
          data.year ?? 2020,
          data.mileage ?? 0,
          data.hsn ?? "",
          data.tsn ?? "",
          data.fuelType ?? "Benzin",
          data.transmission ?? "Schaltgetriebe",
          data.powerHp ?? 150,
          data.nextInspection ?? "",
          data.customerName,
          data.customerPhone ?? "",
          data.customerEmail ?? "",
          data.notes ?? "",
        );
      }

      return this.getVehicle(id);
    });
  }

  deleteVehicle(id: string): { ok: true } {
    this.sql.exec("DELETE FROM workshop_vehicles WHERE id = ?", id);
    return { ok: true };
  }

  // ==================== ERSATZTEILE (SPARE PARTS) ====================

  listParts(): SparePart[] {
    const rows = this.sql
      .exec<{
        id: string;
        part_number: string;
        oem_number: string;
        name: string;
        manufacturer: string;
        category: SparePart["category"];
        stock: number;
        min_stock: number;
        purchase_price_net: number;
        sale_price_net: number;
        tax_rate: number;
        storage_bin: string;
      }>("SELECT * FROM workshop_parts ORDER BY category, name ASC")
      .toArray();

    return rows.map((r) => ({
      id: r.id,
      partNumber: r.part_number,
      oemNumber: r.oem_number,
      name: r.name,
      manufacturer: r.manufacturer,
      category: r.category,
      stock: r.stock,
      minStock: r.min_stock,
      purchasePriceNet: r.purchase_price_net,
      salePriceNet: r.sale_price_net,
      taxRate: r.tax_rate,
      storageBin: r.storage_bin,
    }));
  }

  savePart(data: Partial<SparePart> & { partNumber: string; name: string }): SparePart {
    return this.tx(() => {
      let id = data.id;
      if (this.sql.exec("SELECT 1 FROM workshop_parts WHERE part_number = ? AND id <> ?", data.partNumber, id ?? "").toArray().length) throw new WorkshopError("partNumberTaken");
      if (id) {
        this.sql.exec(
          `UPDATE workshop_parts SET
             part_number = ?, oem_number = ?, name = ?, manufacturer = ?,
             category = ?, stock = ?, min_stock = ?, purchase_price_net = ?,
             sale_price_net = ?, tax_rate = ?, storage_bin = ?
           WHERE id = ?`,
          data.partNumber,
          data.oemNumber ?? "",
          data.name,
          data.manufacturer ?? "",
          data.category ?? "Sonstiges",
          data.stock ?? 0,
          data.minStock ?? 2,
          data.purchasePriceNet ?? 0,
          data.salePriceNet ?? 0,
          data.taxRate ?? 19.0,
          data.storageBin ?? "",
          id,
        );
      } else {
        id = crypto.randomUUID();
        this.sql.exec(
          `INSERT INTO workshop_parts (
             id, part_number, oem_number, name, manufacturer, category,
             stock, min_stock, purchase_price_net, sale_price_net, tax_rate, storage_bin
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          data.partNumber,
          data.oemNumber ?? "",
          data.name,
          data.manufacturer ?? "",
          data.category ?? "Sonstiges",
          data.stock ?? 0,
          data.minStock ?? 2,
          data.purchasePriceNet ?? 0,
          data.salePriceNet ?? 0,
          data.taxRate ?? 19.0,
          data.storageBin ?? "",
        );
      }

      const p = this.sql
        .exec<{
          id: string;
          part_number: string;
          oem_number: string;
          name: string;
          manufacturer: string;
          category: SparePart["category"];
          stock: number;
          min_stock: number;
          purchase_price_net: number;
          sale_price_net: number;
          tax_rate: number;
          storage_bin: string;
        }>("SELECT * FROM workshop_parts WHERE id = ?", id)
        .one();

      return {
        id: p.id,
        partNumber: p.part_number,
        oemNumber: p.oem_number,
        name: p.name,
        manufacturer: p.manufacturer,
        category: p.category,
        stock: p.stock,
        minStock: p.min_stock,
        purchasePriceNet: p.purchase_price_net,
        salePriceNet: p.sale_price_net,
        taxRate: p.tax_rate,
        storageBin: p.storage_bin,
      };
    });
  }

  adjustPartStock(id: string, diff: number): SparePart {
    return this.tx(() => {
      this.sql.exec("UPDATE workshop_parts SET stock = MAX(0, stock + ?) WHERE id = ?", diff, id);
      const p = this.sql
        .exec<{
          id: string;
          part_number: string;
          oem_number: string;
          name: string;
          manufacturer: string;
          category: SparePart["category"];
          stock: number;
          min_stock: number;
          purchase_price_net: number;
          sale_price_net: number;
          tax_rate: number;
          storage_bin: string;
        }>("SELECT * FROM workshop_parts WHERE id = ?", id)
        .one();

      return {
        id: p.id,
        partNumber: p.part_number,
        oemNumber: p.oem_number,
        name: p.name,
        manufacturer: p.manufacturer,
        category: p.category,
        stock: p.stock,
        minStock: p.min_stock,
        purchasePriceNet: p.purchase_price_net,
        salePriceNet: p.sale_price_net,
        taxRate: p.tax_rate,
        storageBin: p.storage_bin,
      };
    });
  }

  deletePart(id: string): { ok: true } {
    this.sql.exec("DELETE FROM workshop_parts WHERE id = ?", id);
    return { ok: true };
  }

  // ==================== REIFENDEPOT (TIRES) ====================

  listTires(): TireStorage[] {
    const rows = this.sql
      .exec<{
        id: string;
        vehicle_id: string | null;
        license_plate: string;
        customer_name: string;
        customer_phone: string;
        type: "Sommer" | "Winter" | "Ganzjahr";
        brand: string;
        dimension: string;
        dot: string;
        rim_type: "Alufelge" | "Stahlfelge";
        tread_depth_fl: number;
        tread_depth_fr: number;
        tread_depth_rl: number;
        tread_depth_rr: number;
        condition: "gut" | "grenzwertig" | "erneuern";
        storage_location: string;
        stored_at: string;
      }>("SELECT * FROM workshop_tires ORDER BY stored_at DESC")
      .toArray();

    return rows.map((r) => ({
      id: r.id,
      vehicleId: r.vehicle_id ?? undefined,
      licensePlate: r.license_plate,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      type: r.type,
      brand: r.brand,
      dimension: r.dimension,
      dot: r.dot,
      rimType: r.rim_type,
      treadDepthFL: r.tread_depth_fl,
      treadDepthFR: r.tread_depth_fr,
      treadDepthRL: r.tread_depth_rl,
      treadDepthRR: r.tread_depth_rr,
      condition: r.condition,
      storageLocation: r.storage_location,
      storedAt: r.stored_at,
    }));
  }

  saveTireStorage(data: Partial<TireStorage> & { licensePlate: string; customerName: string; brand: string; dimension: string }): TireStorage {
    return this.tx(() => {
      let id = data.id;
      const cleanPlate = data.licensePlate.trim().toUpperCase();

      if (id) {
        this.sql.exec(
          `UPDATE workshop_tires SET
             license_plate = ?, customer_name = ?, customer_phone = ?,
             type = ?, brand = ?, dimension = ?, dot = ?, rim_type = ?,
             tread_depth_fl = ?, tread_depth_fr = ?, tread_depth_rl = ?, tread_depth_rr = ?,
             condition = ?, storage_location = ?
           WHERE id = ?`,
          cleanPlate,
          data.customerName,
          data.customerPhone ?? "",
          data.type ?? "Sommer",
          data.brand,
          data.dimension,
          data.dot ?? "",
          data.rimType ?? "Alufelge",
          data.treadDepthFL ?? 6.0,
          data.treadDepthFR ?? 6.0,
          data.treadDepthRL ?? 5.5,
          data.treadDepthRR ?? 5.5,
          data.condition ?? "gut",
          data.storageLocation ?? "",
          id,
        );
      } else {
        id = crypto.randomUUID();
        this.sql.exec(
          `INSERT INTO workshop_tires (
             id, vehicle_id, license_plate, customer_name, customer_phone,
             type, brand, dimension, dot, rim_type,
             tread_depth_fl, tread_depth_fr, tread_depth_rl, tread_depth_rr,
             condition, storage_location
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          data.vehicleId ?? null,
          cleanPlate,
          data.customerName,
          data.customerPhone ?? "",
          data.type ?? "Sommer",
          data.brand,
          data.dimension,
          data.dot ?? "",
          data.rimType ?? "Alufelge",
          data.treadDepthFL ?? 6.0,
          data.treadDepthFR ?? 6.0,
          data.treadDepthRL ?? 5.5,
          data.treadDepthRR ?? 5.5,
          data.condition ?? "gut",
          data.storageLocation ?? "",
        );
      }

      const t = this.sql
        .exec<{
          id: string;
          vehicle_id: string | null;
          license_plate: string;
          customer_name: string;
          customer_phone: string;
          type: "Sommer" | "Winter" | "Ganzjahr";
          brand: string;
          dimension: string;
          dot: string;
          rim_type: "Alufelge" | "Stahlfelge";
          tread_depth_fl: number;
          tread_depth_fr: number;
          tread_depth_rl: number;
          tread_depth_rr: number;
          condition: "gut" | "grenzwertig" | "erneuern";
          storage_location: string;
          stored_at: string;
        }>("SELECT * FROM workshop_tires WHERE id = ?", id)
        .one();

      return {
        id: t.id,
        vehicleId: t.vehicle_id ?? undefined,
        licensePlate: t.license_plate,
        customerName: t.customer_name,
        customerPhone: t.customer_phone,
        type: t.type,
        brand: t.brand,
        dimension: t.dimension,
        dot: t.dot,
        rimType: t.rim_type,
        treadDepthFL: t.tread_depth_fl,
        treadDepthFR: t.tread_depth_fr,
        treadDepthRL: t.tread_depth_rl,
        treadDepthRR: t.tread_depth_rr,
        condition: t.condition,
        storageLocation: t.storage_location,
        storedAt: t.stored_at,
      };
    });
  }

  deleteTireStorage(id: string): { ok: true } {
    this.sql.exec("DELETE FROM workshop_tires WHERE id = ?", id);
    return { ok: true };
  }

  // ==================== STATISTIKEN (STATS) ====================

  getStats(): WorkshopStats {
    const orders = this.listOrders();
    const parts = this.listParts();
    const tires = this.listTires();

    const todayStr = new Date().toISOString().slice(0, 10);

    const activeOrders = orders.filter((o) => o.status !== "abgerechnet").length;
    const inProgressCount = orders.filter((o) => o.status === "in_arbeit").length;
    const waitingForPartsCount = orders.filter((o) => o.status === "wartet_teile").length;
    const readyForPickupCount = orders.filter((o) => o.status === "abholbereit").length;

    const billedToday = orders.filter(
      (o) => o.status === "abgerechnet" && o.completedAt && o.completedAt.startsWith(todayStr),
    );
    const billedTodayCount = billedToday.length;
    const revenueTodayGross = billedToday.reduce((sum, o) => sum + o.totalGross, 0);

    const lowStockPartsCount = parts.filter((p) => p.stock <= p.minStock).length;

    return {
      activeOrders,
      inProgressCount,
      waitingForPartsCount,
      readyForPickupCount,
      billedTodayCount,
      revenueTodayGross,
      tireSetsStored: tires.length,
      lowStockPartsCount,
    };
  }

  private mapOrder(r: {
    id: string;
    order_number: string;
    vehicle_id: string;
    license_plate: string;
    vehicle_info: string;
    mileage: number;
    customer_name: string;
    customer_phone: string;
    customer_email: string;
    status: WorkshopOrderStatus;
    lift_bay: string;
    mechanic_name: string;
    issue_description: string;
    diagnostic_notes: string;
    positions_json: string;
    checklist_json: string;
    estimate_status: string;
    estimate_total_gross: number;
    status_token: string;
    payment_method: string | null;
    payment_status: string;
    total_net: number;
    total_tax: number;
    total_gross: number;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  }): WorkshopOrder {
    return {
      id: r.id,
      orderNumber: r.order_number,
      vehicleId: r.vehicle_id,
      licensePlate: r.license_plate,
      vehicleInfo: r.vehicle_info,
      mileage: r.mileage,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      customerEmail: r.customer_email,
      status: r.status,
      liftBay: r.lift_bay as WorkshopOrder["liftBay"],
      mechanicName: r.mechanic_name,
      issueDescription: r.issue_description,
      diagnosticNotes: r.diagnostic_notes,
      positions: JSON.parse(r.positions_json || "[]") as OrderPosition[],
      checklist: JSON.parse(r.checklist_json || "[]") as InspectionItem[],
      estimateStatus: r.estimate_status as WorkshopOrder["estimateStatus"],
      estimateTotalGross: r.estimate_total_gross,
      statusToken: r.status_token,
      paymentMethod: (r.payment_method as WorkshopOrder["paymentMethod"]) || undefined,
      paymentStatus: (r.payment_status as WorkshopOrder["paymentStatus"]) || "offen",
      totalNet: r.total_net,
      totalTax: r.total_tax,
      totalGross: r.total_gross,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      completedAt: r.completed_at || undefined,
    };
  }
}
