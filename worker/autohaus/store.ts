import {
  round2,
  vehicleLabel,
  type AutohausStats,
  type ContractStatus,
  type FuelType,
  type Lead,
  type LeadStatus,
  type PaymentMethod,
  type SalesContract,
  type StockVehicle,
  type Taxation,
  type TestDrive,
  type TestDriveStatus,
  type TradeIn,
  type TradeInStatus,
  type Transmission,
  type VehicleCondition,
  type VehiclePhoto,
  type VehicleStatus,
} from "../../shared/autohaus";

export class AutohausError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const AUTOHAUS_MIGRATIONS: string[] = [
  `CREATE TABLE autohaus_vehicles (
     id TEXT PRIMARY KEY,
     stock_number TEXT NOT NULL UNIQUE,
     make TEXT NOT NULL,
     model TEXT NOT NULL,
     variant TEXT NOT NULL DEFAULT '',
     condition TEXT NOT NULL DEFAULT 'gebraucht',
     first_registration TEXT NOT NULL DEFAULT '',
     mileage INTEGER NOT NULL DEFAULT 0,
     fuel TEXT NOT NULL DEFAULT 'Benzin',
     transmission TEXT NOT NULL DEFAULT 'Schaltgetriebe',
     power_kw INTEGER NOT NULL DEFAULT 0,
     color TEXT NOT NULL DEFAULT '',
     vin TEXT NOT NULL DEFAULT '',
     license_plate TEXT NOT NULL DEFAULT '',
     previous_owners INTEGER NOT NULL DEFAULT 0,
     next_inspection TEXT NOT NULL DEFAULT '',
     price REAL NOT NULL DEFAULT 0,
     purchase_price REAL NOT NULL DEFAULT 0,
     taxation TEXT NOT NULL DEFAULT 'differenz',
     status TEXT NOT NULL DEFAULT 'verfuegbar',
     equipment TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '',
     source TEXT NOT NULL DEFAULT 'einkauf',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     sold_at TEXT
   );
   CREATE INDEX autohaus_vehicles_status ON autohaus_vehicles(status);

   CREATE TABLE autohaus_photos (
     id TEXT PRIMARY KEY,
     vehicle_id TEXT NOT NULL,
     data_url TEXT NOT NULL,
     position INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX autohaus_photos_vehicle ON autohaus_photos(vehicle_id, position);

   CREATE TABLE autohaus_leads (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     phone TEXT NOT NULL DEFAULT '',
     email TEXT NOT NULL DEFAULT '',
     vehicle_id TEXT,
     source TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'neu',
     budget REAL NOT NULL DEFAULT 0,
     notes TEXT NOT NULL DEFAULT '',
     next_contact TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX autohaus_leads_status ON autohaus_leads(status);

   CREATE TABLE autohaus_testdrives (
     id TEXT PRIMARY KEY,
     vehicle_id TEXT NOT NULL,
     lead_id TEXT,
     customer_name TEXT NOT NULL,
     customer_phone TEXT NOT NULL DEFAULT '',
     license_number TEXT NOT NULL DEFAULT '',
     scheduled_at TEXT NOT NULL,
     duration_min INTEGER NOT NULL DEFAULT 30,
     status TEXT NOT NULL DEFAULT 'geplant',
     mileage_start INTEGER,
     mileage_end INTEGER,
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX autohaus_testdrives_time ON autohaus_testdrives(scheduled_at);

   CREATE TABLE autohaus_tradeins (
     id TEXT PRIMARY KEY,
     make TEXT NOT NULL,
     model TEXT NOT NULL,
     first_registration TEXT NOT NULL DEFAULT '',
     mileage INTEGER NOT NULL DEFAULT 0,
     vin TEXT NOT NULL DEFAULT '',
     license_plate TEXT NOT NULL DEFAULT '',
     owner_name TEXT NOT NULL DEFAULT '',
     owner_phone TEXT NOT NULL DEFAULT '',
     damages TEXT NOT NULL DEFAULT '',
     offered_price REAL NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'bewertet',
     contract_id TEXT,
     vehicle_id TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );

   CREATE TABLE autohaus_contracts (
     id TEXT PRIMARY KEY,
     contract_number TEXT NOT NULL UNIQUE,
     vehicle_id TEXT NOT NULL,
     vehicle_json TEXT NOT NULL,
     lead_id TEXT,
     buyer_name TEXT NOT NULL,
     buyer_address TEXT NOT NULL DEFAULT '',
     buyer_phone TEXT NOT NULL DEFAULT '',
     buyer_email TEXT NOT NULL DEFAULT '',
     price REAL NOT NULL,
     discount REAL NOT NULL DEFAULT 0,
     tradein_id TEXT,
     tradein_amount REAL NOT NULL DEFAULT 0,
     deposit REAL NOT NULL DEFAULT 0,
     payment_method TEXT NOT NULL DEFAULT 'ueberweisung',
     delivery_date TEXT NOT NULL DEFAULT '',
     warranty TEXT NOT NULL DEFAULT '',
     taxation TEXT NOT NULL DEFAULT 'differenz',
     notes TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'entwurf',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     signed_at TEXT,
     delivered_at TEXT
   );
   CREATE INDEX autohaus_contracts_vehicle ON autohaus_contracts(vehicle_id);`,
];

type Row = Record<string, string | number | null>;
type Input = Record<string, unknown>;

const VEHICLE_STATUSES: VehicleStatus[] = ["aufbereitung", "verfuegbar", "reserviert", "verkauft"];
const CONDITIONS: VehicleCondition[] = ["neu", "gebraucht", "jahreswagen", "vorfuehr"];
const FUELS: FuelType[] = ["Benzin", "Diesel", "Hybrid", "Elektro", "LPG"];
const TRANSMISSIONS: Transmission[] = ["Schaltgetriebe", "Automatik"];
const TAXATIONS: Taxation[] = ["differenz", "regel"];
const LEAD_STATUSES: LeadStatus[] = ["neu", "kontaktiert", "probefahrt", "angebot", "gewonnen", "verloren"];
const PAYMENTS: PaymentMethod[] = ["ueberweisung", "bar", "finanzierung", "leasing"];

/** Höchstens so viele Fotos je Fahrzeug, und jedes Foto höchstens so groß (als Data-URL). */
export const MAX_PHOTOS = 8;
export const MAX_PHOTO_LENGTH = 450_000;

function text(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function money(v: unknown): number {
  return Math.max(0, round2(num(v)));
}

function int(v: unknown): number {
  return Math.max(0, Math.round(num(v)));
}

function pick<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

function month(v: unknown): string {
  const s = text(v, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : "";
}

function day(v: unknown): string {
  const s = text(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function dateTime(v: unknown): string {
  const s = text(v, 16);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? s : "";
}

function minutes(at: string): number {
  return Math.floor(Date.parse(`${at}:00Z`) / 60000);
}

export class AutohausStore {
  constructor(
    private sql: SqlStorage,
    private tx: <T>(fn: () => T) => T = (fn) => fn(),
  ) {}

  private rows(query: string, ...params: (string | number | null)[]): Row[] {
    return this.sql.exec(query, ...params).toArray() as Row[];
  }

  private nextNumber(table: string, column: string, prefix: string, start: number): string {
    const rows = this.rows(`SELECT ${column} AS n FROM ${table} WHERE ${column} LIKE ?`, `${prefix}%`);
    const highest = rows.reduce((max, r) => Math.max(max, Number(String(r.n).slice(prefix.length)) || 0), start - 1);
    return `${prefix}${String(highest + 1).padStart(4, "0")}`;
  }

  // ---------- Fahrzeugbestand ----------

  private toVehicle(r: Row): StockVehicle {
    return {
      id: String(r.id),
      stockNumber: String(r.stock_number),
      make: String(r.make),
      model: String(r.model),
      variant: String(r.variant),
      condition: r.condition as VehicleCondition,
      firstRegistration: String(r.first_registration),
      mileage: Number(r.mileage),
      fuel: r.fuel as FuelType,
      transmission: r.transmission as Transmission,
      powerKw: Number(r.power_kw),
      color: String(r.color),
      vin: String(r.vin),
      licensePlate: String(r.license_plate),
      previousOwners: Number(r.previous_owners),
      nextInspection: String(r.next_inspection),
      price: Number(r.price),
      purchasePrice: Number(r.purchase_price),
      taxation: r.taxation as Taxation,
      status: r.status as VehicleStatus,
      equipment: String(r.equipment),
      notes: String(r.notes),
      source: r.source === "inzahlungnahme" ? "inzahlungnahme" : "einkauf",
      photoCount: Number(r.photo_count ?? 0),
      coverPhoto: r.cover_photo ? String(r.cover_photo) : null,
      createdAt: String(r.created_at),
      soldAt: r.sold_at ? String(r.sold_at) : null,
    };
  }

  private static VEHICLE_SELECT = `SELECT v.*,
      (SELECT COUNT(*) FROM autohaus_photos p WHERE p.vehicle_id = v.id) AS photo_count,
      (SELECT data_url FROM autohaus_photos p WHERE p.vehicle_id = v.id ORDER BY position LIMIT 1) AS cover_photo
    FROM autohaus_vehicles v`;

  listVehicles(): StockVehicle[] {
    return this.rows(`${AutohausStore.VEHICLE_SELECT} ORDER BY v.status = 'verkauft', v.created_at DESC`).map((r) => this.toVehicle(r));
  }

  getVehicle(id: string): StockVehicle {
    const row = this.rows(`${AutohausStore.VEHICLE_SELECT} WHERE v.id = ?`, id)[0];
    if (!row) throw new AutohausError("vehicleNotFound");
    return this.toVehicle(row);
  }

  saveVehicle(input: Input): StockVehicle {
    const make = text(input.make, 60);
    const model = text(input.model, 80);
    if (!make || !model) throw new AutohausError("vehicleMissingFields");
    const condition = pick(input.condition, CONDITIONS, "gebraucht");
    const values = [
      make,
      model,
      text(input.variant, 120),
      condition,
      condition === "neu" ? "" : month(input.firstRegistration),
      int(input.mileage),
      pick(input.fuel, FUELS, "Benzin"),
      pick(input.transmission, TRANSMISSIONS, "Schaltgetriebe"),
      int(input.powerKw),
      text(input.color, 40),
      text(input.vin, 17).toUpperCase(),
      text(input.licensePlate, 15).toUpperCase(),
      int(input.previousOwners),
      month(input.nextInspection),
      money(input.price),
      money(input.purchasePrice),
      pick(input.taxation, TAXATIONS, condition === "neu" ? "regel" : "differenz"),
      text(input.equipment, 2000),
      text(input.notes, 2000),
    ];
    const id = typeof input.id === "string" && input.id ? input.id : null;
    return this.tx(() => {
      if (id) {
        const current = this.getVehicle(id);
        // Verkaufte oder reservierte Fahrzeuge behalten ihren Status; der kommt aus dem Kaufvertrag
        const status = current.status === "verkauft" || current.status === "reserviert" ? current.status : pick(input.status, ["aufbereitung", "verfuegbar"], current.status as "aufbereitung" | "verfuegbar");
        this.sql.exec(
          `UPDATE autohaus_vehicles SET make = ?, model = ?, variant = ?, condition = ?, first_registration = ?, mileage = ?, fuel = ?,
             transmission = ?, power_kw = ?, color = ?, vin = ?, license_plate = ?, previous_owners = ?, next_inspection = ?, price = ?,
             purchase_price = ?, taxation = ?, equipment = ?, notes = ?, status = ? WHERE id = ?`,
          ...values,
          status,
          id,
        );
        return this.getVehicle(id);
      }
      const newId = crypto.randomUUID();
      const status = pick(input.status, ["aufbereitung", "verfuegbar"], "verfuegbar");
      this.sql.exec(
        `INSERT INTO autohaus_vehicles (make, model, variant, condition, first_registration, mileage, fuel, transmission, power_kw, color, vin,
           license_plate, previous_owners, next_inspection, price, purchase_price, taxation, equipment, notes, status, source, id, stock_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ...values,
        status,
        input.source === "inzahlungnahme" ? "inzahlungnahme" : "einkauf",
        newId,
        this.nextNumber("autohaus_vehicles", "stock_number", "FZ-", 1001),
      );
      return this.getVehicle(newId);
    });
  }

  setVehicleStatus(id: string, status: string): StockVehicle {
    const vehicle = this.getVehicle(id);
    const next = pick(status, ["aufbereitung", "verfuegbar"], vehicle.status as "aufbereitung");
    if (vehicle.status === "verkauft" || vehicle.status === "reserviert") throw new AutohausError("vehicleInContract");
    this.sql.exec("UPDATE autohaus_vehicles SET status = ? WHERE id = ?", next, id);
    return this.getVehicle(id);
  }

  deleteVehicle(id: string): { ok: true } {
    this.getVehicle(id);
    const contracts = this.rows("SELECT id FROM autohaus_contracts WHERE vehicle_id = ? AND status != 'storniert'", id);
    if (contracts.length) throw new AutohausError("vehicleInContract");
    this.tx(() => {
      this.sql.exec("DELETE FROM autohaus_photos WHERE vehicle_id = ?", id);
      this.sql.exec("DELETE FROM autohaus_testdrives WHERE vehicle_id = ? AND status = 'geplant'", id);
      this.sql.exec("UPDATE autohaus_leads SET vehicle_id = NULL WHERE vehicle_id = ?", id);
      this.sql.exec("UPDATE autohaus_tradeins SET vehicle_id = NULL WHERE vehicle_id = ?", id);
      this.sql.exec("DELETE FROM autohaus_vehicles WHERE id = ?", id);
    });
    return { ok: true };
  }

  // ---------- Fotos ----------

  listPhotos(vehicleId: string): VehiclePhoto[] {
    this.getVehicle(vehicleId);
    return this.rows("SELECT id, vehicle_id, data_url, position FROM autohaus_photos WHERE vehicle_id = ? ORDER BY position", vehicleId).map((r) => ({
      id: String(r.id),
      vehicleId: String(r.vehicle_id),
      dataUrl: String(r.data_url),
      position: Number(r.position),
    }));
  }

  addPhoto(vehicleId: string, dataUrl: unknown): VehiclePhoto[] {
    this.getVehicle(vehicleId);
    if (typeof dataUrl !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new AutohausError("photoInvalid");
    if (dataUrl.length > MAX_PHOTO_LENGTH) throw new AutohausError("photoTooLarge");
    const count = Number(this.rows("SELECT COUNT(*) AS c FROM autohaus_photos WHERE vehicle_id = ?", vehicleId)[0]?.c ?? 0);
    if (count >= MAX_PHOTOS) throw new AutohausError("photoLimit");
    const last = Number(this.rows("SELECT COALESCE(MAX(position), -1) AS p FROM autohaus_photos WHERE vehicle_id = ?", vehicleId)[0]?.p ?? -1);
    this.sql.exec("INSERT INTO autohaus_photos (id, vehicle_id, data_url, position) VALUES (?, ?, ?, ?)", crypto.randomUUID(), vehicleId, dataUrl, last + 1);
    return this.listPhotos(vehicleId);
  }

  /** Macht ein Foto zum Titelbild (erste Stelle). */
  coverPhoto(vehicleId: string, photoId: string): VehiclePhoto[] {
    const photos = this.listPhotos(vehicleId);
    if (!photos.some((p) => p.id === photoId)) throw new AutohausError("photoNotFound");
    const ordered = [photos.find((p) => p.id === photoId)!, ...photos.filter((p) => p.id !== photoId)];
    this.tx(() => ordered.forEach((p, i) => this.sql.exec("UPDATE autohaus_photos SET position = ? WHERE id = ?", i, p.id)));
    return this.listPhotos(vehicleId);
  }

  deletePhoto(vehicleId: string, photoId: string): VehiclePhoto[] {
    this.sql.exec("DELETE FROM autohaus_photos WHERE id = ? AND vehicle_id = ?", photoId, vehicleId);
    return this.listPhotos(vehicleId);
  }

  // ---------- Interessenten ----------

  private toLead(r: Row): Lead {
    return {
      id: String(r.id),
      name: String(r.name),
      phone: String(r.phone),
      email: String(r.email),
      vehicleId: r.vehicle_id ? String(r.vehicle_id) : null,
      vehicleLabel: r.make ? vehicleLabel({ make: String(r.make), model: String(r.model), variant: String(r.variant) }) : "",
      source: String(r.source),
      status: r.status as LeadStatus,
      budget: Number(r.budget),
      notes: String(r.notes),
      nextContact: String(r.next_contact),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  private static LEAD_SELECT = `SELECT l.*, v.make, v.model, v.variant FROM autohaus_leads l LEFT JOIN autohaus_vehicles v ON v.id = l.vehicle_id`;

  listLeads(): Lead[] {
    return this.rows(`${AutohausStore.LEAD_SELECT} ORDER BY l.status IN ('gewonnen', 'verloren'), l.updated_at DESC`).map((r) => this.toLead(r));
  }

  getLead(id: string): Lead {
    const row = this.rows(`${AutohausStore.LEAD_SELECT} WHERE l.id = ?`, id)[0];
    if (!row) throw new AutohausError("leadNotFound");
    return this.toLead(row);
  }

  saveLead(input: Input): Lead {
    const name = text(input.name, 120);
    if (!name) throw new AutohausError("leadMissingName");
    const vehicleId = typeof input.vehicleId === "string" && input.vehicleId ? input.vehicleId : null;
    if (vehicleId) this.getVehicle(vehicleId);
    const values = [name, text(input.phone, 40), text(input.email, 120), vehicleId, text(input.source, 60), pick(input.status, LEAD_STATUSES, "neu"), money(input.budget), text(input.notes, 2000), day(input.nextContact)];
    const id = typeof input.id === "string" && input.id ? input.id : null;
    if (id) {
      this.getLead(id);
      this.sql.exec(
        `UPDATE autohaus_leads SET name = ?, phone = ?, email = ?, vehicle_id = ?, source = ?, status = ?, budget = ?, notes = ?, next_contact = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
        ...values,
        id,
      );
      return this.getLead(id);
    }
    const newId = crypto.randomUUID();
    this.sql.exec(
      "INSERT INTO autohaus_leads (name, phone, email, vehicle_id, source, status, budget, notes, next_contact, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ...values,
      newId,
    );
    return this.getLead(newId);
  }

  setLeadStatus(id: string, status: string): Lead {
    this.getLead(id);
    this.sql.exec("UPDATE autohaus_leads SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", pick(status, LEAD_STATUSES, "neu"), id);
    return this.getLead(id);
  }

  deleteLead(id: string): { ok: true } {
    this.getLead(id);
    this.sql.exec("DELETE FROM autohaus_leads WHERE id = ?", id);
    return { ok: true };
  }

  // ---------- Probefahrten ----------

  private toTestDrive(r: Row): TestDrive {
    return {
      id: String(r.id),
      vehicleId: String(r.vehicle_id),
      vehicleLabel: r.make ? `${vehicleLabel({ make: String(r.make), model: String(r.model), variant: String(r.variant) })}${r.license_plate ? ` · ${r.license_plate}` : ""}` : "Fahrzeug gelöscht",
      leadId: r.lead_id ? String(r.lead_id) : null,
      customerName: String(r.customer_name),
      customerPhone: String(r.customer_phone),
      licenseNumber: String(r.license_number),
      scheduledAt: String(r.scheduled_at),
      durationMin: Number(r.duration_min),
      status: r.status as TestDriveStatus,
      mileageStart: r.mileage_start === null ? null : Number(r.mileage_start),
      mileageEnd: r.mileage_end === null ? null : Number(r.mileage_end),
      notes: String(r.notes),
      createdAt: String(r.created_at),
    };
  }

  private static DRIVE_SELECT = `SELECT d.*, v.make, v.model, v.variant, v.license_plate FROM autohaus_testdrives d LEFT JOIN autohaus_vehicles v ON v.id = d.vehicle_id`;

  listTestDrives(): TestDrive[] {
    return this.rows(`${AutohausStore.DRIVE_SELECT} ORDER BY d.status IN ('abgeschlossen', 'abgesagt'), d.scheduled_at`).map((r) => this.toTestDrive(r));
  }

  getTestDrive(id: string): TestDrive {
    const row = this.rows(`${AutohausStore.DRIVE_SELECT} WHERE d.id = ?`, id)[0];
    if (!row) throw new AutohausError("testDriveNotFound");
    return this.toTestDrive(row);
  }

  scheduleTestDrive(input: Input): TestDrive {
    const vehicleId = text(input.vehicleId, 64);
    const vehicle = this.getVehicle(vehicleId);
    if (vehicle.status === "verkauft") throw new AutohausError("vehicleSold");
    const customerName = text(input.customerName, 120);
    const scheduledAt = dateTime(input.scheduledAt);
    if (!customerName || !scheduledAt) throw new AutohausError("testDriveMissingFields");
    const durationMin = Math.min(480, Math.max(15, int(input.durationMin) || 30));
    const leadId = typeof input.leadId === "string" && input.leadId ? input.leadId : null;
    if (leadId) this.getLead(leadId);
    return this.tx(() => {
      // Ein Fahrzeug kann nicht zur selben Zeit zweimal unterwegs sein
      const start = minutes(scheduledAt);
      const end = start + durationMin;
      const clash = this.rows("SELECT scheduled_at, duration_min FROM autohaus_testdrives WHERE vehicle_id = ? AND status IN ('geplant', 'unterwegs')", vehicleId).some((d) => {
        const s = minutes(String(d.scheduled_at));
        return s < end && start < s + Number(d.duration_min);
      });
      if (clash) throw new AutohausError("testDriveConflict");
      const id = crypto.randomUUID();
      this.sql.exec(
        `INSERT INTO autohaus_testdrives (id, vehicle_id, lead_id, customer_name, customer_phone, license_number, scheduled_at, duration_min, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        vehicleId,
        leadId,
        customerName,
        text(input.customerPhone, 40),
        text(input.licenseNumber, 40).toUpperCase(),
        scheduledAt,
        durationMin,
        text(input.notes, 1000),
      );
      if (leadId) this.sql.exec("UPDATE autohaus_leads SET status = 'probefahrt', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status IN ('neu', 'kontaktiert')", leadId);
      return this.getTestDrive(id);
    });
  }

  startTestDrive(id: string, licenseNumber?: unknown): TestDrive {
    const drive = this.getTestDrive(id);
    if (drive.status !== "geplant") throw new AutohausError("testDriveWrongStatus");
    const license = text(licenseNumber, 40).toUpperCase() || drive.licenseNumber;
    // Ohne geprüften Führerschein keine Probefahrt
    if (!license) throw new AutohausError("testDriveNoLicense");
    const vehicle = this.getVehicle(drive.vehicleId);
    this.sql.exec("UPDATE autohaus_testdrives SET status = 'unterwegs', license_number = ?, mileage_start = ? WHERE id = ?", license, vehicle.mileage, id);
    return this.getTestDrive(id);
  }

  finishTestDrive(id: string, mileageEnd: unknown, notes?: unknown): TestDrive {
    const drive = this.getTestDrive(id);
    if (drive.status !== "unterwegs") throw new AutohausError("testDriveWrongStatus");
    const end = int(mileageEnd);
    if (end < (drive.mileageStart ?? 0)) throw new AutohausError("testDriveMileage");
    return this.tx(() => {
      this.sql.exec("UPDATE autohaus_testdrives SET status = 'abgeschlossen', mileage_end = ?, notes = ? WHERE id = ?", end, text(notes, 1000) || drive.notes, id);
      this.sql.exec("UPDATE autohaus_vehicles SET mileage = MAX(mileage, ?) WHERE id = ?", end, drive.vehicleId);
      return this.getTestDrive(id);
    });
  }

  cancelTestDrive(id: string): TestDrive {
    const drive = this.getTestDrive(id);
    if (drive.status !== "geplant") throw new AutohausError("testDriveWrongStatus");
    this.sql.exec("UPDATE autohaus_testdrives SET status = 'abgesagt' WHERE id = ?", id);
    return this.getTestDrive(id);
  }

  // ---------- Inzahlungnahme ----------

  private toTradeIn(r: Row): TradeIn {
    return {
      id: String(r.id),
      make: String(r.make),
      model: String(r.model),
      firstRegistration: String(r.first_registration),
      mileage: Number(r.mileage),
      vin: String(r.vin),
      licensePlate: String(r.license_plate),
      ownerName: String(r.owner_name),
      ownerPhone: String(r.owner_phone),
      damages: String(r.damages),
      offeredPrice: Number(r.offered_price),
      status: r.status as TradeInStatus,
      contractId: r.contract_id ? String(r.contract_id) : null,
      vehicleId: r.vehicle_id ? String(r.vehicle_id) : null,
      createdAt: String(r.created_at),
    };
  }

  listTradeIns(): TradeIn[] {
    return this.rows("SELECT * FROM autohaus_tradeins ORDER BY status = 'abgelehnt', created_at DESC").map((r) => this.toTradeIn(r));
  }

  getTradeIn(id: string): TradeIn {
    const row = this.rows("SELECT * FROM autohaus_tradeins WHERE id = ?", id)[0];
    if (!row) throw new AutohausError("tradeInNotFound");
    return this.toTradeIn(row);
  }

  saveTradeIn(input: Input): TradeIn {
    const make = text(input.make, 60);
    const model = text(input.model, 80);
    if (!make || !model) throw new AutohausError("vehicleMissingFields");
    const values = [
      make,
      model,
      month(input.firstRegistration),
      int(input.mileage),
      text(input.vin, 17).toUpperCase(),
      text(input.licensePlate, 15).toUpperCase(),
      text(input.ownerName, 120),
      text(input.ownerPhone, 40),
      text(input.damages, 2000),
      money(input.offeredPrice),
    ];
    const id = typeof input.id === "string" && input.id ? input.id : null;
    if (id) {
      const current = this.getTradeIn(id);
      if (current.status === "angenommen") throw new AutohausError("tradeInLocked");
      this.sql.exec(
        `UPDATE autohaus_tradeins SET make = ?, model = ?, first_registration = ?, mileage = ?, vin = ?, license_plate = ?, owner_name = ?,
           owner_phone = ?, damages = ?, offered_price = ? WHERE id = ?`,
        ...values,
        id,
      );
      return this.getTradeIn(id);
    }
    const newId = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO autohaus_tradeins (make, model, first_registration, mileage, vin, license_plate, owner_name, owner_phone, damages, offered_price, id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ...values,
      newId,
    );
    return this.getTradeIn(newId);
  }

  rejectTradeIn(id: string): TradeIn {
    const current = this.getTradeIn(id);
    if (current.contractId) throw new AutohausError("tradeInLocked");
    this.sql.exec("UPDATE autohaus_tradeins SET status = 'abgelehnt' WHERE id = ?", id);
    return this.getTradeIn(id);
  }

  /** Übernimmt ein angenommenes Fahrzeug in den Bestand (zur Aufbereitung, Einkaufspreis = Ankaufpreis). */
  tradeInToStock(id: string): StockVehicle {
    return this.tx(() => {
      const t = this.getTradeIn(id);
      if (t.vehicleId) throw new AutohausError("tradeInInStock");
      if (t.status !== "angenommen") throw new AutohausError("tradeInNotAccepted");
      const vehicle = this.saveVehicle({
        make: t.make,
        model: t.model,
        firstRegistration: t.firstRegistration,
        mileage: t.mileage,
        vin: t.vin,
        licensePlate: t.licensePlate,
        purchasePrice: t.offeredPrice,
        previousOwners: 1,
        notes: t.damages ? `Aus Inzahlungnahme. Schäden: ${t.damages}` : "Aus Inzahlungnahme.",
        status: "aufbereitung",
        source: "inzahlungnahme",
      });
      this.sql.exec("UPDATE autohaus_tradeins SET vehicle_id = ? WHERE id = ?", vehicle.id, id);
      return vehicle;
    });
  }

  deleteTradeIn(id: string): { ok: true } {
    const t = this.getTradeIn(id);
    if (t.contractId) throw new AutohausError("tradeInLocked");
    this.sql.exec("DELETE FROM autohaus_tradeins WHERE id = ?", id);
    return { ok: true };
  }

  // ---------- Kaufverträge ----------

  private toContract(r: Row): SalesContract {
    return {
      id: String(r.id),
      contractNumber: String(r.contract_number),
      vehicleId: String(r.vehicle_id),
      vehicle: JSON.parse(String(r.vehicle_json)),
      leadId: r.lead_id ? String(r.lead_id) : null,
      buyerName: String(r.buyer_name),
      buyerAddress: String(r.buyer_address),
      buyerPhone: String(r.buyer_phone),
      buyerEmail: String(r.buyer_email),
      price: Number(r.price),
      discount: Number(r.discount),
      tradeInId: r.tradein_id ? String(r.tradein_id) : null,
      tradeInAmount: Number(r.tradein_amount),
      deposit: Number(r.deposit),
      paymentMethod: r.payment_method as PaymentMethod,
      deliveryDate: String(r.delivery_date),
      warranty: String(r.warranty),
      taxation: r.taxation as Taxation,
      notes: String(r.notes),
      status: r.status as ContractStatus,
      createdAt: String(r.created_at),
      signedAt: r.signed_at ? String(r.signed_at) : null,
      deliveredAt: r.delivered_at ? String(r.delivered_at) : null,
    };
  }

  listContracts(): SalesContract[] {
    return this.rows("SELECT * FROM autohaus_contracts ORDER BY created_at DESC").map((r) => this.toContract(r));
  }

  getContract(id: string): SalesContract {
    const row = this.rows("SELECT * FROM autohaus_contracts WHERE id = ?", id)[0];
    if (!row) throw new AutohausError("contractNotFound");
    return this.toContract(row);
  }

  /** Legt einen Kaufvertrag als Entwurf an; das Fahrzeug ist ab dann reserviert. */
  createContract(input: Input): SalesContract {
    return this.tx(() => {
      const vehicle = this.getVehicle(text(input.vehicleId, 64));
      if (vehicle.status === "verkauft" || vehicle.status === "reserviert") throw new AutohausError("vehicleNotAvailable");
      const buyerName = text(input.buyerName, 120);
      if (!buyerName) throw new AutohausError("contractMissingBuyer");
      const price = input.price === undefined || input.price === "" ? vehicle.price : money(input.price);
      if (price <= 0) throw new AutohausError("contractMissingPrice");
      const discount = Math.min(price, money(input.discount));
      const leadId = typeof input.leadId === "string" && input.leadId ? input.leadId : null;
      if (leadId) this.getLead(leadId);

      let tradeInId: string | null = null;
      let tradeInAmount = 0;
      if (typeof input.tradeInId === "string" && input.tradeInId) {
        const t = this.getTradeIn(input.tradeInId);
        if (t.contractId || t.status === "abgelehnt") throw new AutohausError("tradeInLocked");
        tradeInId = t.id;
        tradeInAmount = t.offeredPrice;
      }
      const deposit = money(input.deposit);
      if (tradeInAmount + deposit > price - discount) throw new AutohausError("contractOverpaid");

      const id = crypto.randomUUID();
      const year = new Date().getFullYear();
      const snapshot: SalesContract["vehicle"] = {
        stockNumber: vehicle.stockNumber,
        make: vehicle.make,
        model: vehicle.model,
        variant: vehicle.variant,
        condition: vehicle.condition,
        firstRegistration: vehicle.firstRegistration,
        mileage: vehicle.mileage,
        fuel: vehicle.fuel,
        powerKw: vehicle.powerKw,
        color: vehicle.color,
        vin: vehicle.vin,
        licensePlate: vehicle.licensePlate,
        previousOwners: vehicle.previousOwners,
        nextInspection: vehicle.nextInspection,
      };
      this.sql.exec(
        `INSERT INTO autohaus_contracts (id, contract_number, vehicle_id, vehicle_json, lead_id, buyer_name, buyer_address, buyer_phone, buyer_email,
           price, discount, tradein_id, tradein_amount, deposit, payment_method, delivery_date, warranty, taxation, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        this.nextNumber("autohaus_contracts", "contract_number", `KV-${year}-`, 1),
        vehicle.id,
        JSON.stringify(snapshot),
        leadId,
        buyerName,
        text(input.buyerAddress, 300),
        text(input.buyerPhone, 40),
        text(input.buyerEmail, 120),
        price,
        discount,
        tradeInId,
        tradeInAmount,
        deposit,
        pick(input.paymentMethod, PAYMENTS, "ueberweisung"),
        day(input.deliveryDate),
        text(input.warranty, 300),
        vehicle.taxation,
        text(input.notes, 2000),
      );
      this.sql.exec("UPDATE autohaus_vehicles SET status = 'reserviert' WHERE id = ?", vehicle.id);
      if (tradeInId) this.sql.exec("UPDATE autohaus_tradeins SET status = 'angenommen', contract_id = ? WHERE id = ?", id, tradeInId);
      if (leadId) this.sql.exec("UPDATE autohaus_leads SET status = 'angebot', vehicle_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status NOT IN ('gewonnen')", vehicle.id, leadId);
      return this.getContract(id);
    });
  }

  /** Entwurf → unterschrieben → ausgeliefert; storniert gibt Fahrzeug und Inzahlungnahme wieder frei. */
  setContractStatus(id: string, status: string): SalesContract {
    return this.tx(() => {
      const contract = this.getContract(id);
      const next = pick(status, ["unterschrieben", "ausgeliefert", "storniert"], contract.status as "unterschrieben");
      const allowed: Record<ContractStatus, ContractStatus[]> = {
        entwurf: ["unterschrieben", "storniert"],
        unterschrieben: ["ausgeliefert", "storniert"],
        ausgeliefert: [],
        storniert: [],
      };
      if (!allowed[contract.status].includes(next)) throw new AutohausError("contractWrongStatus");
      const now = new Date().toISOString();
      if (next === "unterschrieben") {
        this.sql.exec("UPDATE autohaus_contracts SET status = 'unterschrieben', signed_at = ? WHERE id = ?", now, id);
        this.sql.exec("UPDATE autohaus_vehicles SET status = 'verkauft', sold_at = ? WHERE id = ?", now, contract.vehicleId);
        if (contract.leadId) this.sql.exec("UPDATE autohaus_leads SET status = 'gewonnen', updated_at = ? WHERE id = ?", now, contract.leadId);
      } else if (next === "ausgeliefert") {
        this.sql.exec("UPDATE autohaus_contracts SET status = 'ausgeliefert', delivered_at = ? WHERE id = ?", now, id);
      } else {
        this.sql.exec("UPDATE autohaus_contracts SET status = 'storniert' WHERE id = ?", id);
        this.sql.exec("UPDATE autohaus_vehicles SET status = 'verfuegbar', sold_at = NULL WHERE id = ?", contract.vehicleId);
        if (contract.tradeInId) this.sql.exec("UPDATE autohaus_tradeins SET status = 'bewertet', contract_id = NULL WHERE id = ? AND vehicle_id IS NULL", contract.tradeInId);
        if (contract.leadId) this.sql.exec("UPDATE autohaus_leads SET status = 'angebot', updated_at = ? WHERE id = ?", now, contract.leadId);
      }
      return this.getContract(id);
    });
  }

  // ---------- Kennzahlen ----------

  getStats(today = new Date().toISOString().slice(0, 10)): AutohausStats {
    const stock = this.rows("SELECT status, price, created_at FROM autohaus_vehicles WHERE status != 'verkauft'");
    const now = Date.parse(`${today}T12:00:00Z`);
    const days = stock.map((v) => Math.max(0, Math.floor((now - Date.parse(String(v.created_at))) / 86_400_000)));
    const monthPrefix = today.slice(0, 7);
    const sales = this.rows(
      "SELECT price, discount FROM autohaus_contracts WHERE status IN ('unterschrieben', 'ausgeliefert') AND substr(signed_at, 1, 7) = ?",
      monthPrefix,
    );
    return {
      inStock: stock.length,
      reserved: stock.filter((v) => v.status === "reserviert").length,
      stockValue: round2(stock.reduce((sum, v) => sum + Number(v.price), 0)),
      avgDaysInStock: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0,
      openLeads: Number(this.rows("SELECT COUNT(*) AS c FROM autohaus_leads WHERE status NOT IN ('gewonnen', 'verloren')")[0]?.c ?? 0),
      testDrivesToday: Number(this.rows("SELECT COUNT(*) AS c FROM autohaus_testdrives WHERE substr(scheduled_at, 1, 10) = ? AND status != 'abgesagt'", today)[0]?.c ?? 0),
      salesThisMonth: sales.length,
      revenueThisMonth: round2(sales.reduce((sum, s) => sum + Number(s.price) - Number(s.discount), 0)),
    };
  }

  // ---------- Beispieldaten ----------

  /** Beispieldaten, nur für das Demo-Konto (nie für echte Firmen). */
  seedIfEmpty() {
    const count = Number(this.rows("SELECT COUNT(*) AS c FROM autohaus_vehicles")[0]?.c ?? 0);
    if (count > 0) return;
    const golf = this.saveVehicle({
      make: "Volkswagen", model: "Golf", variant: "1.5 TSI Life", condition: "gebraucht", firstRegistration: "2021-04", mileage: 38500,
      fuel: "Benzin", transmission: "Schaltgetriebe", powerKw: 96, color: "Moonstone Grau", vin: "WVWZZZCDZMW123456", licensePlate: "B-KK 2104",
      previousOwners: 1, nextInspection: "2027-04", price: 21490, purchasePrice: 17800, equipment: "Navi, Sitzheizung, Einparkhilfe, LED-Scheinwerfer, App-Connect",
    });
    const tesla = this.saveVehicle({
      make: "Tesla", model: "Model 3", variant: "Long Range AWD", condition: "gebraucht", firstRegistration: "2022-09", mileage: 52100,
      fuel: "Elektro", transmission: "Automatik", powerKw: 324, color: "Pearl White", vin: "5YJ3E7EB2NF000001", previousOwners: 1,
      nextInspection: "2026-09", price: 32900, purchasePrice: 28500, taxation: "regel", equipment: "Autopilot, Panoramadach, Premium-Sound, Wärmepumpe",
    });
    this.saveVehicle({
      make: "BMW", model: "320d", variant: "Touring M Sport", condition: "gebraucht", firstRegistration: "2020-02", mileage: 89300,
      fuel: "Diesel", transmission: "Automatik", powerKw: 140, color: "Saphirschwarz", vin: "WBA8E11000K000002", previousOwners: 2,
      nextInspection: "2026-02", price: 24950, purchasePrice: 20900, status: "aufbereitung", equipment: "Head-up-Display, Anhängerkupplung, Live Cockpit Professional",
    });
    this.saveVehicle({
      make: "Skoda", model: "Octavia Combi", variant: "2.0 TDI Style", condition: "vorfuehr", firstRegistration: "2025-11", mileage: 4200,
      fuel: "Diesel", transmission: "Automatik", powerKw: 110, color: "Race Blau", vin: "TMBJJ7NX0SY000003", previousOwners: 0,
      nextInspection: "2028-11", price: 34890, purchasePrice: 30100, taxation: "regel", equipment: "Matrix-LED, Canton Sound, Virtual Cockpit, ACC",
    });
    this.saveVehicle({
      make: "Toyota", model: "Yaris", variant: "1.5 Hybrid Team D", condition: "jahreswagen", firstRegistration: "2025-03", mileage: 11800,
      fuel: "Hybrid", transmission: "Automatik", powerKw: 85, color: "Tokyo Rot", previousOwners: 1, nextInspection: "2028-03",
      price: 19990, purchasePrice: 16900, taxation: "regel", equipment: "Rückfahrkamera, Spurhalteassistent, Klimaautomatik",
    });

    const lead = this.saveLead({ name: "Jonas Becker", phone: "+49 171 2345678", email: "jonas.becker@beispiel.de", vehicleId: golf.id, source: "mobile.de", status: "kontaktiert", budget: 22000, notes: "Möchte Inzahlungnahme seines Polo." });
    this.saveLead({ name: "Selin Kaya", phone: "+49 160 9876543", email: "selin.kaya@beispiel.de", vehicleId: tesla.id, source: "Laufkundschaft", status: "neu", budget: 35000, notes: "Interesse an Finanzierung." });
    this.saveLead({ name: "Familie Wagner", phone: "+49 30 5551234", source: "Telefon", status: "angebot", budget: 30000, notes: "Sucht Kombi mit Anhängerkupplung." });

    const today = new Date().toISOString().slice(0, 10);
    this.scheduleTestDrive({ vehicleId: golf.id, leadId: lead.id, customerName: lead.name, customerPhone: lead.phone, licenseNumber: "B072XYZ12", scheduledAt: `${today}T15:00`, durationMin: 30 });
    this.saveTradeIn({ make: "Volkswagen", model: "Polo 1.0 TSI", firstRegistration: "2016-06", mileage: 112000, licensePlate: "B-JB 616", ownerName: lead.name, ownerPhone: lead.phone, damages: "Kratzer Stoßstange hinten, Reifen 4 mm", offeredPrice: 6500 });
  }
}
