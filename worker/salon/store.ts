import {
  DEFAULT_SALON_SETTINGS,
  addMinutesToTime,
  timeSlotsOverlap,
  timeToMinutes,
  type AppointmentStatus,
  type SalonAppointment,
  type SalonClient,
  type SalonColorFormula,
  type SalonService,
  type SalonSettings,
  type SalonStaff,
} from "../../shared/salon";
import type { PosArticle, PosLine } from "../../shared/pos";
import type { PosModule } from "../pos/store";

export class SalonError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const SALON_MIGRATIONS: string[] = [
  `CREATE TABLE salon_services (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT 'cut_style',
     description TEXT NOT NULL DEFAULT '',
     duration_minutes INTEGER NOT NULL DEFAULT 45,
     price_cents INTEGER NOT NULL DEFAULT 0,
     vat_rate REAL NOT NULL DEFAULT 19.0,
     active INTEGER NOT NULL DEFAULT 1,
     color_hex TEXT NOT NULL DEFAULT '#ec4899',
     sort_order INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX salon_services_category ON salon_services(category);

   CREATE TABLE salon_staff (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     title TEXT NOT NULL DEFAULT '',
     email TEXT NOT NULL DEFAULT '',
     phone TEXT NOT NULL DEFAULT '',
     color_hex TEXT NOT NULL DEFAULT '#f43f5e',
     specialties TEXT NOT NULL DEFAULT '[]',
     active INTEGER NOT NULL DEFAULT 1,
     working_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
     work_start TEXT NOT NULL DEFAULT '09:00',
     work_end TEXT NOT NULL DEFAULT '18:00',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );

   CREATE TABLE salon_clients (
     id TEXT PRIMARY KEY,
     number INTEGER NOT NULL UNIQUE,
     name TEXT NOT NULL,
     email TEXT NOT NULL DEFAULT '',
     phone TEXT NOT NULL DEFAULT '',
     birthday TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '',
     allergies TEXT NOT NULL DEFAULT '',
     preferred_staff_id TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX salon_clients_name ON salon_clients(name);
   CREATE INDEX salon_clients_phone ON salon_clients(phone);

   CREATE TABLE salon_formulas (
     id TEXT PRIMARY KEY,
     client_id TEXT NOT NULL,
     date TEXT NOT NULL,
     staff_id TEXT NOT NULL DEFAULT '',
     staff_name TEXT NOT NULL DEFAULT '',
     brand TEXT NOT NULL DEFAULT '',
     formula TEXT NOT NULL,
     development_minutes INTEGER NOT NULL DEFAULT 35,
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX salon_formulas_client ON salon_formulas(client_id);

   CREATE TABLE salon_appointments (
     id TEXT PRIMARY KEY,
     client_id TEXT NOT NULL,
     client_name TEXT NOT NULL,
     client_phone TEXT NOT NULL DEFAULT '',
     client_email TEXT NOT NULL DEFAULT '',
     staff_id TEXT NOT NULL,
     staff_name TEXT NOT NULL,
     service_ids TEXT NOT NULL,
     service_names TEXT NOT NULL,
     day TEXT NOT NULL,
     start_time TEXT NOT NULL,
     end_time TEXT NOT NULL,
     duration_minutes INTEGER NOT NULL,
     total_cents INTEGER NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'booked',
     notes TEXT NOT NULL DEFAULT '',
     source TEXT NOT NULL DEFAULT 'salon',
     paid INTEGER NOT NULL DEFAULT 0,
     billed_invoice_id TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX salon_appointments_day ON salon_appointments(day);
   CREATE INDEX salon_appointments_staff ON salon_appointments(staff_id, day);
   CREATE INDEX salon_appointments_client ON salon_appointments(client_id);

   CREATE TABLE salon_settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
];

export interface SqlClient {
  exec(sql: string): unknown;
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number };
}

export class SalonStore {
  private sql: SqlClient;

  constructor(
    storage: SqlStorage | SqlClient,
    private transaction: (fn: () => unknown) => unknown
  ) {
    if ("all" in storage && "run" in storage) {
      this.sql = storage as SqlClient;
    } else {
      const s = storage as SqlStorage;
      this.sql = {
        exec: (sql: string) => s.exec(sql),
        all: <T = unknown>(sql: string, params: unknown[] = []): T[] => {
          return (s.exec(sql, ...params).toArray() as unknown[]) as T[];
        },
        run: (sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number } => {
          const cursor = s.exec(sql, ...params);
          return { changes: (cursor as any).rowsWritten ?? 1, lastInsertRowid: 0 };
        },
      };
    }
  }

  // ==========================================
  // SERVICES
  // ==========================================

  listServices(): SalonService[] {
    const rows = this.sql.all<any>(
      `SELECT * FROM salon_services WHERE active = 1 ORDER BY sort_order ASC, name ASC`
    );
    return rows.map(this.mapService);
  }

  listAllServices(): SalonService[] {
    const rows = this.sql.all<any>(
      `SELECT * FROM salon_services ORDER BY sort_order ASC, name ASC`
    );
    return rows.map(this.mapService);
  }

  getService(id: string): SalonService | null {
    const rows = this.sql.all<any>(`SELECT * FROM salon_services WHERE id = ?`, [id]);
    return rows.length > 0 ? this.mapService(rows[0]) : null;
  }

  saveService(input: Partial<SalonService>): SalonService {
    const now = new Date().toISOString();
    const id = input.id || crypto.randomUUID();
    const existing = this.getService(id);

    if (existing) {
      this.sql.run(
        `UPDATE salon_services SET
           name = ?, category = ?, description = ?, duration_minutes = ?,
           price_cents = ?, vat_rate = ?, active = ?, color_hex = ?,
           sort_order = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.name ?? existing.name,
          input.category ?? existing.category,
          input.description ?? existing.description,
          input.durationMinutes ?? existing.durationMinutes,
          input.priceCents ?? existing.priceCents,
          input.vatRate ?? existing.vatRate,
          input.active !== undefined ? (input.active ? 1 : 0) : existing.active ? 1 : 0,
          input.colorHex ?? existing.colorHex,
          input.sortOrder ?? existing.sortOrder,
          now,
          id,
        ]
      );
    } else {
      if (!input.name?.trim()) throw new SalonError("name_required");
      this.sql.run(
        `INSERT INTO salon_services (
           id, name, category, description, duration_minutes, price_cents,
           vat_rate, active, color_hex, sort_order, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.name.trim(),
          input.category || "cut_style",
          input.description || "",
          input.durationMinutes || 45,
          input.priceCents || 0,
          input.vatRate !== undefined ? input.vatRate : 19.0,
          input.active !== undefined ? (input.active ? 1 : 0) : 1,
          input.colorHex || "#ec4899",
          input.sortOrder || 0,
          now,
          now,
        ]
      );
    }

    return this.getService(id)!;
  }

  deleteService(id: string): void {
    this.sql.run(`UPDATE salon_services SET active = 0 WHERE id = ?`, [id]);
  }

  private mapService(r: any): SalonService {
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      description: r.description || "",
      durationMinutes: r.duration_minutes,
      priceCents: r.price_cents,
      vatRate: r.vat_rate,
      active: r.active === 1,
      colorHex: r.color_hex,
      sortOrder: r.sort_order,
    };
  }

  // ==========================================
  // STAFF
  // ==========================================

  listStaff(): SalonStaff[] {
    const rows = this.sql.all<any>(`SELECT * FROM salon_staff WHERE active = 1 ORDER BY name ASC`);
    return rows.map(this.mapStaff);
  }

  getStaff(id: string): SalonStaff | null {
    const rows = this.sql.all<any>(`SELECT * FROM salon_staff WHERE id = ?`, [id]);
    return rows.length > 0 ? this.mapStaff(rows[0]) : null;
  }

  saveStaff(input: Partial<SalonStaff>): SalonStaff {
    const now = new Date().toISOString();
    const id = input.id || crypto.randomUUID();
    const existing = this.getStaff(id);

    const specialtiesJson = JSON.stringify(input.specialties || []);
    const workingDaysJson = JSON.stringify(input.workingDays || [1, 2, 3, 4, 5, 6]);

    if (existing) {
      this.sql.run(
        `UPDATE salon_staff SET
           name = ?, title = ?, email = ?, phone = ?, color_hex = ?,
           specialties = ?, active = ?, working_days = ?, work_start = ?,
           work_end = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.name ?? existing.name,
          input.title ?? existing.title,
          input.email ?? existing.email,
          input.phone ?? existing.phone,
          input.colorHex ?? existing.colorHex,
          input.specialties ? specialtiesJson : JSON.stringify(existing.specialties),
          input.active !== undefined ? (input.active ? 1 : 0) : existing.active ? 1 : 0,
          input.workingDays ? workingDaysJson : JSON.stringify(existing.workingDays),
          input.workStart ?? existing.workStart,
          input.workEnd ?? existing.workEnd,
          now,
          id,
        ]
      );
    } else {
      if (!input.name?.trim()) throw new SalonError("name_required");
      this.sql.run(
        `INSERT INTO salon_staff (
           id, name, title, email, phone, color_hex, specialties, active,
           working_days, work_start, work_end, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.name.trim(),
          input.title || "",
          input.email || "",
          input.phone || "",
          input.colorHex || "#f43f5e",
          specialtiesJson,
          input.active !== undefined ? (input.active ? 1 : 0) : 1,
          workingDaysJson,
          input.workStart || "09:00",
          input.workEnd || "18:00",
          now,
          now,
        ]
      );
    }

    return this.getStaff(id)!;
  }

  deleteStaff(id: string): void {
    this.sql.run(`UPDATE salon_staff SET active = 0 WHERE id = ?`, [id]);
  }

  private mapStaff(r: any): SalonStaff {
    let specialties: string[] = [];
    let workingDays: number[] = [1, 2, 3, 4, 5, 6];
    try {
      specialties = JSON.parse(r.specialties || "[]");
    } catch {}
    try {
      workingDays = JSON.parse(r.working_days || "[1,2,3,4,5,6]");
    } catch {}

    return {
      id: r.id,
      name: r.name,
      title: r.title || "",
      email: r.email || "",
      phone: r.phone || "",
      colorHex: r.color_hex || "#f43f5e",
      specialties,
      active: r.active === 1,
      workingDays,
      workStart: r.work_start || "09:00",
      workEnd: r.work_end || "18:00",
    };
  }

  // ==========================================
  // CLIENTS
  // ==========================================

  listClients(query = ""): SalonClient[] {
    const q = `%${query.trim()}%`;
    const rows = this.sql.all<any>(
      `SELECT c.*,
              COUNT(DISTINCT a.id) as total_visits,
              SUM(CASE WHEN a.status = 'completed' THEN a.total_cents ELSE 0 END) as total_spent,
              MAX(a.day) as last_visit
       FROM salon_clients c
       LEFT JOIN salon_appointments a ON a.client_id = c.id
       WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?
       GROUP BY c.id
       ORDER BY c.name ASC
       LIMIT ?`,
      // Ohne Suche alle (bis 5000) für die Auswahl im Kalender, mit Suche die besten 100
      [q, q, q, query.trim() ? 100 : 5000]
    );

    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      name: r.name,
      email: r.email || "",
      phone: r.phone || "",
      birthday: r.birthday || "",
      notes: r.notes || "",
      allergies: r.allergies || "",
      preferredStaffId: r.preferred_staff_id || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      totalVisits: Number(r.total_visits) || 0,
      totalSpentCents: Number(r.total_spent) || 0,
      lastVisit: r.last_visit || undefined,
    }));
  }

  getClient(id: string): SalonClient | null {
    const rows = this.sql.all<any>(
      `SELECT c.*,
              COUNT(DISTINCT a.id) as total_visits,
              SUM(CASE WHEN a.status = 'completed' THEN a.total_cents ELSE 0 END) as total_spent,
              MAX(a.day) as last_visit
       FROM salon_clients c
       LEFT JOIN salon_appointments a ON a.client_id = c.id
       WHERE c.id = ?
       GROUP BY c.id`,
      [id]
    );
    if (rows.length === 0) return null;
    const client = rows[0];
    const formulas = this.listFormulas(id);

    return {
      id: client.id,
      number: client.number,
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      birthday: client.birthday || "",
      notes: client.notes || "",
      allergies: client.allergies || "",
      preferredStaffId: client.preferred_staff_id || undefined,
      createdAt: client.created_at,
      updatedAt: client.updated_at,
      totalVisits: Number(client.total_visits) || 0,
      totalSpentCents: Number(client.total_spent) || 0,
      lastVisit: client.last_visit || undefined,
      formulas,
    };
  }

  saveClient(input: Partial<SalonClient>): SalonClient {
    const now = new Date().toISOString();
    const id = input.id || crypto.randomUUID();
    const existing = this.sql.all<any>(`SELECT * FROM salon_clients WHERE id = ?`, [id])[0];

    if (existing) {
      this.sql.run(
        `UPDATE salon_clients SET
           name = ?, email = ?, phone = ?, birthday = ?, notes = ?,
           allergies = ?, preferred_staff_id = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.name ?? existing.name,
          input.email ?? existing.email,
          input.phone ?? existing.phone,
          input.birthday ?? existing.birthday,
          input.notes ?? existing.notes,
          input.allergies ?? existing.allergies,
          input.preferredStaffId ?? existing.preferred_staff_id,
          now,
          id,
        ]
      );
    } else {
      if (!input.name?.trim()) throw new SalonError("name_required");
      const nextNum = (this.sql.all<any>(`SELECT MAX(number) as m FROM salon_clients`)[0]?.m || 1000) + 1;
      this.sql.run(
        `INSERT INTO salon_clients (
           id, number, name, email, phone, birthday, notes,
           allergies, preferred_staff_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          nextNum,
          input.name.trim(),
          input.email || "",
          input.phone || "",
          input.birthday || "",
          input.notes || "",
          input.allergies || "",
          input.preferredStaffId || null,
          now,
          now,
        ]
      );
    }

    return this.getClient(id)!;
  }

  deleteClient(id: string): void {
    this.sql.run(`DELETE FROM salon_clients WHERE id = ?`, [id]);
    this.sql.run(`DELETE FROM salon_formulas WHERE client_id = ?`, [id]);
  }

  // ==========================================
  // FORMULAS (FARBREZEPTUREN)
  // ==========================================

  listFormulas(clientId: string): SalonColorFormula[] {
    const rows = this.sql.all<any>(
      `SELECT * FROM salon_formulas WHERE client_id = ? ORDER BY date DESC, created_at DESC`,
      [clientId]
    );
    return rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      date: r.date,
      staffId: r.staff_id,
      staffName: r.staff_name,
      brand: r.brand,
      formula: r.formula,
      developmentMinutes: r.development_minutes,
      notes: r.notes || "",
      createdAt: r.created_at,
    }));
  }

  saveFormula(input: Partial<SalonColorFormula>): SalonColorFormula {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const date = input.date || now.slice(0, 10);

    if (!input.clientId) throw new SalonError("client_required");
    if (!input.formula?.trim()) throw new SalonError("formula_required");

    this.sql.run(
      `INSERT INTO salon_formulas (
         id, client_id, date, staff_id, staff_name, brand, formula,
         development_minutes, notes, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.clientId,
        date,
        input.staffId || "",
        input.staffName || "",
        input.brand || "Wella",
        input.formula.trim(),
        input.developmentMinutes || 35,
        input.notes || "",
        now,
      ]
    );

    return {
      id,
      clientId: input.clientId,
      date,
      staffId: input.staffId || "",
      staffName: input.staffName || "",
      brand: input.brand || "Wella",
      formula: input.formula.trim(),
      developmentMinutes: input.developmentMinutes || 35,
      notes: input.notes || "",
      createdAt: now,
    };
  }

  deleteFormula(id: string): void {
    this.sql.run(`DELETE FROM salon_formulas WHERE id = ?`, [id]);
  }

  // ==========================================
  // APPOINTMENTS
  // ==========================================

  listAppointments(opts: { day?: string; staffId?: string; clientId?: string; status?: string }): SalonAppointment[] {
    let sql = `SELECT * FROM salon_appointments WHERE 1=1`;
    const params: unknown[] = [];

    if (opts.day) {
      sql += ` AND day = ?`;
      params.push(opts.day);
    }
    if (opts.staffId) {
      sql += ` AND staff_id = ?`;
      params.push(opts.staffId);
    }
    if (opts.clientId) {
      sql += ` AND client_id = ?`;
      params.push(opts.clientId);
    }
    if (opts.status && opts.status !== "all") {
      sql += ` AND status = ?`;
      params.push(opts.status);
    }

    sql += ` ORDER BY day ASC, start_time ASC`;

    const rows = this.sql.all<any>(sql, params);
    return rows.map(this.mapAppointment);
  }

  getAppointment(id: string): SalonAppointment | null {
    const rows = this.sql.all<any>(`SELECT * FROM salon_appointments WHERE id = ?`, [id]);
    return rows.length > 0 ? this.mapAppointment(rows[0]) : null;
  }

  saveAppointment(input: Partial<SalonAppointment>): SalonAppointment {
    const now = new Date().toISOString();
    const id = input.id || crypto.randomUUID();

    if (!input.day) throw new SalonError("day_required");
    if (!input.startTime) throw new SalonError("start_time_required");
    if (!input.staffId) throw new SalonError("staff_required");

    // Berechne Dauer und Endzeit
    const duration = input.durationMinutes || 45;
    const endTime = input.endTime || addMinutesToTime(input.startTime, duration);

    // Kollisionsprüfung für Stylisten
    const existingAppointments = this.listAppointments({ day: input.day, staffId: input.staffId });
    for (const app of existingAppointments) {
      if (app.id !== id && app.status !== "canceled") {
        if (timeSlotsOverlap(input.startTime, endTime, app.startTime, app.endTime)) {
          throw new SalonError(
            `Kollision: ${app.staffName} hat zu dieser Zeit bereits einen Termin (${app.startTime} - ${app.endTime})`
          );
        }
      }
    }

    // Wenn Kunde noch keine ID hat oder neu angelegt werden soll
    let clientId = input.clientId || "";
    let clientName = input.clientName || "Kunde";
    if (!clientId && clientName) {
      // Leere Telefonnummer darf keinen fremden Kunden treffen
      const existingClient = this.sql.all<any>(
        `SELECT id, name FROM salon_clients WHERE name = ? OR (phone <> '' AND phone = ?)`,
        [clientName, (input.clientPhone || "").trim()]
      )[0];
      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const newClient = this.saveClient({
          name: clientName,
          phone: input.clientPhone || "",
          email: input.clientEmail || "",
        });
        clientId = newClient.id;
      }
    }

    const serviceIdsJson = JSON.stringify(input.serviceIds || []);
    const serviceNamesJson = JSON.stringify(input.serviceNames || []);

    const existing = this.getAppointment(id);

    if (existing) {
      this.sql.run(
        `UPDATE salon_appointments SET
           client_id = ?, client_name = ?, client_phone = ?, client_email = ?,
           staff_id = ?, staff_name = ?, service_ids = ?, service_names = ?,
           day = ?, start_time = ?, end_time = ?, duration_minutes = ?,
           total_cents = ?, status = ?, notes = ?, source = ?, paid = ?,
           billed_invoice_id = ?, updated_at = ?
         WHERE id = ?`,
        [
          clientId || existing.clientId,
          clientName || existing.clientName,
          input.clientPhone ?? existing.clientPhone,
          input.clientEmail ?? existing.clientEmail,
          input.staffId || existing.staffId,
          input.staffName || existing.staffName,
          input.serviceIds ? serviceIdsJson : JSON.stringify(existing.serviceIds),
          input.serviceNames ? serviceNamesJson : JSON.stringify(existing.serviceNames),
          input.day || existing.day,
          input.startTime || existing.startTime,
          endTime,
          duration,
          input.totalCents !== undefined ? input.totalCents : existing.totalCents,
          input.status || existing.status,
          input.notes ?? existing.notes,
          input.source || existing.source,
          input.paid !== undefined ? (input.paid ? 1 : 0) : existing.paid ? 1 : 0,
          input.billedInvoiceId !== undefined ? input.billedInvoiceId : existing.billedInvoiceId,
          now,
          id,
        ]
      );
    } else {
      this.sql.run(
        `INSERT INTO salon_appointments (
           id, client_id, client_name, client_phone, client_email,
           staff_id, staff_name, service_ids, service_names,
           day, start_time, end_time, duration_minutes, total_cents,
           status, notes, source, paid, billed_invoice_id,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          clientId,
          clientName,
          input.clientPhone || "",
          input.clientEmail || "",
          input.staffId,
          input.staffName || "Stylist",
          serviceIdsJson,
          serviceNamesJson,
          input.day,
          input.startTime,
          endTime,
          duration,
          input.totalCents || 0,
          input.status || "booked",
          input.notes || "",
          input.source || "salon",
          input.paid ? 1 : 0,
          input.billedInvoiceId || null,
          now,
          now,
        ]
      );
    }

    return this.getAppointment(id)!;
  }

  updateAppointmentStatus(id: string, status: AppointmentStatus): SalonAppointment {
    const now = new Date().toISOString();
    this.sql.run(
      `UPDATE salon_appointments SET status = ?, updated_at = ? WHERE id = ?`,
      [status, now, id]
    );
    const updated = this.getAppointment(id);
    if (!updated) throw new SalonError("not_found");
    return updated;
  }

  deleteAppointment(id: string): void {
    this.sql.run(`DELETE FROM salon_appointments WHERE id = ?`, [id]);
  }

  private mapAppointment(r: any): SalonAppointment {
    let serviceIds: string[] = [];
    let serviceNames: string[] = [];
    try {
      serviceIds = JSON.parse(r.service_ids || "[]");
    } catch {}
    try {
      serviceNames = JSON.parse(r.service_names || "[]");
    } catch {}

    return {
      id: r.id,
      clientId: r.client_id,
      clientName: r.client_name,
      clientPhone: r.client_phone || "",
      clientEmail: r.client_email || "",
      staffId: r.staff_id,
      staffName: r.staff_name,
      serviceIds,
      serviceNames,
      day: r.day,
      startTime: r.start_time,
      endTime: r.end_time,
      durationMinutes: r.duration_minutes,
      totalCents: r.total_cents,
      status: r.status,
      notes: r.notes || "",
      source: r.source || "salon",
      paid: r.paid === 1,
      billedInvoiceId: r.billed_invoice_id || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /**
   * Online-Termin eines Kunden. Preis, Dauer und Stylist kommen aus der eigenen Datenbank,
   * nicht aus dem Browser; die Zeit muss ein freier Slot sein.
   */
  bookOnline(
    input: { serviceIds: string[]; staffId: string; day: string; startTime: string; name: string; phone: string; email: string; notes: string },
    today: string,
    now: string,
    lastDay: string,
  ): SalonAppointment {
    return this.transaction(() => {
      const settings = this.getSettings();
      if (!settings.onlineBookingEnabled) throw new SalonError("bookingDisabled");
      const services = [...new Set(input.serviceIds)].map((id) => this.getService(id));
      if (!services.length || services.some((srv) => !srv || !srv.active)) throw new SalonError("serviceNotFound");
      const chosen = services as SalonService[];
      if (input.day < today || input.day > lastDay) throw new SalonError("dayNotAllowed");
      const duration = chosen.reduce((sum, srv) => sum + srv.durationMinutes, 0);
      const free = this.getFreeSlots(input.day, duration, input.staffId, input.day === today ? now : undefined);
      const slot = free.find((f) => f.time === input.startTime && f.staffId === input.staffId);
      if (!slot) throw new SalonError("slotTaken");

      // Kunde nur über Telefon oder E-Mail wiedererkennen, nie über den Namen allein
      const known = this.sql.all<any>(
        `SELECT id FROM salon_clients WHERE (phone <> '' AND phone = ?) OR (email <> '' AND lower(email) = lower(?)) LIMIT 1`,
        [input.phone, input.email]
      )[0];
      const clientId = known ? known.id : this.saveClient({ name: input.name, phone: input.phone, email: input.email }).id;

      return this.saveAppointment({
        clientId,
        clientName: input.name,
        clientPhone: input.phone,
        clientEmail: input.email,
        staffId: slot.staffId,
        staffName: slot.staffName,
        serviceIds: chosen.map((srv) => srv.id),
        serviceNames: chosen.map((srv) => srv.name),
        day: input.day,
        startTime: input.startTime,
        durationMinutes: duration,
        totalCents: chosen.reduce((sum, srv) => sum + srv.priceCents, 0),
        status: "booked",
        notes: input.notes,
        source: "online",
        paid: false,
      });
    }) as SalonAppointment;
  }

  // ==========================================
  // FREE SLOTS SEARCH (FOR ONLINE & DESK BOOKING)
  // ==========================================

  /** notBefore („HH:MM“): heute keine Zeiten anbieten, die schon vorbei sind. */
  getFreeSlots(day: string, durationMinutes: number, staffId?: string, notBefore?: string): { time: string; staffId: string; staffName: string }[] {
    const settings = this.getSettings();
    if (!Number.isFinite(durationMinutes) || durationMinutes < 5) return [];
    const dateObj = new Date(day + "T00:00:00Z");
    let dayOfWeek = dateObj.getUTCDay(); // 0=So, 1=Mo
    if (dayOfWeek === 0) dayOfWeek = 7;

    if (!settings.openDays.includes(dayOfWeek)) {
      return []; // Salon geschlossen
    }

    const allStaff = this.listStaff().filter((s) => s.workingDays.includes(dayOfWeek));
    const targetStaff = staffId ? allStaff.filter((s) => s.id === staffId) : allStaff;

    const appointments = this.listAppointments({ day });
    const interval = Math.max(5, settings.slotIntervalMinutes || 15);
    const earliest = notBefore ? timeToMinutes(notBefore) : -1;
    const startM = timeToMinutes(settings.openTime || "09:00");
    const endM = timeToMinutes(settings.closeTime || "18:00");

    const freeSlots: { time: string; staffId: string; staffName: string }[] = [];

    for (const staff of targetStaff) {
      const staffStart = Math.max(startM, timeToMinutes(staff.workStart));
      const staffEnd = Math.min(endM, timeToMinutes(staff.workEnd));

      for (let m = staffStart; m + durationMinutes <= staffEnd; m += interval) {
        if (m <= earliest) continue;
        const slotStart = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        const slotEnd = addMinutesToTime(slotStart, durationMinutes);

        // Prüfe Kollision mit bestehenden Terminen dieses Stylisten
        const hasCollision = appointments.some(
          (a) => a.staffId === staff.id && a.status !== "canceled" && timeSlotsOverlap(slotStart, slotEnd, a.startTime, a.endTime)
        );

        if (!hasCollision) {
          freeSlots.push({
            time: slotStart,
            staffId: staff.id,
            staffName: staff.name,
          });
        }
      }
    }

    return freeSlots;
  }

  // ==========================================
  // SETTINGS
  // ==========================================

  getSettings(): SalonSettings {
    const rows = this.sql.all<any>(`SELECT * FROM salon_settings`);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    return {
      salonName: map.salonName || DEFAULT_SALON_SETTINGS.salonName,
      slotIntervalMinutes: Number(map.slotIntervalMinutes) || DEFAULT_SALON_SETTINGS.slotIntervalMinutes,
      openDays: map.openDays ? JSON.parse(map.openDays) : DEFAULT_SALON_SETTINGS.openDays,
      openTime: map.openTime || DEFAULT_SALON_SETTINGS.openTime,
      closeTime: map.closeTime || DEFAULT_SALON_SETTINGS.closeTime,
      onlineBookingEnabled: map.onlineBookingEnabled !== undefined ? map.onlineBookingEnabled === "true" : DEFAULT_SALON_SETTINGS.onlineBookingEnabled,
      bookingAdvanceDays: Number(map.bookingAdvanceDays) || DEFAULT_SALON_SETTINGS.bookingAdvanceDays,
      cancellationHours: Number(map.cancellationHours) || DEFAULT_SALON_SETTINGS.cancellationHours,
      noticeText: map.noticeText || DEFAULT_SALON_SETTINGS.noticeText,
    };
  }

  saveSettings(input: Partial<SalonSettings>): SalonSettings {
    const current = this.getSettings();
    const merged = sanitizeSettings({ ...current, ...input }, current);

    const entries = [
      ["salonName", merged.salonName],
      ["slotIntervalMinutes", String(merged.slotIntervalMinutes)],
      ["openDays", JSON.stringify(merged.openDays)],
      ["openTime", merged.openTime],
      ["closeTime", merged.closeTime],
      ["onlineBookingEnabled", String(merged.onlineBookingEnabled)],
      ["bookingAdvanceDays", String(merged.bookingAdvanceDays)],
      ["cancellationHours", String(merged.cancellationHours)],
      ["noticeText", merged.noticeText],
    ];

    for (const [key, value] of entries) {
      this.sql.run(
        `INSERT INTO salon_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?`,
        [key, value, value]
      );
    }

    return this.getSettings();
  }

  // ==========================================
  // KASSE: Termine und Dienstleistungen werden in der Kasse der Plattform abgerechnet
  // ==========================================

  posModule(): PosModule {
    const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
    const payable = (a: SalonAppointment) => !a.paid && a.status !== "canceled" && a.status !== "no_show";
    const appointmentArticle = (a: SalonAppointment): PosArticle => ({
      source: "salon", kind: "appointment", refId: a.id, name: `${a.startTime} ${a.clientName}`, detail: [a.serviceNames.join(", "), a.staffName].filter(Boolean).join(" · "),
      priceCents: a.totalCents, vatRate: 0, single: true, group: "@salon.appointment",
    });
    const serviceArticle = (srv: SalonService): PosArticle => ({
      source: "salon", kind: "service", refId: srv.id, name: srv.name, detail: `${srv.durationMinutes} min`, priceCents: srv.priceCents, vatRate: srv.vatRate, group: "@salon.service",
    });
    // Offene Termine von heute und den letzten Tagen (jemand hat vergessen abzurechnen)
    const open = () =>
      this.sql
        .all<any>(`SELECT * FROM salon_appointments WHERE paid = 0 AND status NOT IN ('canceled', 'no_show') AND day <= ? AND day >= date(?, '-7 days') ORDER BY day DESC, start_time`, [today(), today()])
        .map(this.mapAppointment);
    return {
      articles: (query) => {
        const q = query.trim().toLowerCase();
        return [
          ...open().filter((a) => a.clientName.toLowerCase().includes(q)).map(appointmentArticle),
          ...this.listServices().filter((srv) => srv.name.toLowerCase().includes(q)).map(serviceArticle),
        ];
      },
      catalog: () => [...open().filter((a) => a.day === today()).map(appointmentArticle), ...this.listServices().map(serviceArticle)],
      scan: (code) => {
        const a = this.getAppointment(code);
        return a && payable(a) ? [appointmentArticle(a)] : [];
      },
      prepare: (line) => {
        if (line.kind === "service") {
          const srv = line.refId ? this.getService(line.refId) : null;
          if (!srv) throw new SalonError("notFound");
          return { lines: [{ ...line, name: line.name || srv.name, kind: "service", vatRate: srv.vatRate }] };
        }
        const a = line.refId ? this.getAppointment(line.refId) : null;
        if (!a) throw new SalonError("notFound");
        if (!payable(a)) throw new SalonError("notPayable");
        // Preise und Steuersätze der Dienstleistungen; gibt es eine nicht mehr, gilt der Betrag des Termins
        const services = a.serviceIds.map((id) => this.getService(id));
        const lines: PosLine[] = services.every((srv) => srv)
          ? (services as SalonService[]).map((srv) => ({ source: "salon", kind: "appointment:service", refId: a.id, name: srv.name, qty: 1, unitCents: srv.priceCents, vatRate: srv.vatRate }))
          : [{ source: "salon", kind: "appointment:service", refId: a.id, name: a.serviceNames.join(", ") || "Termin", qty: 1, unitCents: a.totalCents, vatRate: services.find((srv) => srv)?.vatRate ?? 19 }];
        const client = a.clientId ? this.getClient(a.clientId) : null;
        return {
          lines,
          refs: [{ source: "salon", kind: "appointment", refId: a.id, label: `${a.day} ${a.startTime} · ${a.clientName}` }],
          customer: { id: client?.id ?? null, name: a.clientName, address: "", phone: a.clientPhone, email: a.clientEmail },
        };
      },
      booked: (receipt, _lines, refs) => {
        for (const ref of refs) {
          if (ref.kind !== "appointment") continue;
          const a = this.getAppointment(ref.refId);
          if (!a || !payable(a)) throw new SalonError("notPayable");
          this.sql.run(`UPDATE salon_appointments SET paid = 1, status = 'completed', billed_invoice_id = ?, updated_at = ? WHERE id = ?`, [receipt?.number ?? null, new Date().toISOString(), a.id]);
        }
      },
      canceled: (original) => {
        for (const ref of original.refs) {
          if (ref.source !== "salon" || ref.kind !== "appointment") continue;
          this.sql.run(`UPDATE salon_appointments SET paid = 0, billed_invoice_id = NULL, updated_at = ? WHERE id = ? AND billed_invoice_id = ?`, [new Date().toISOString(), ref.refId, original.number]);
        }
      },
    };
  }

  // ==========================================
  // SEED SAMPLE DATA
  // ==========================================

  seedIfEmpty(): void {
    const serviceCount = this.sql.all<any>(`SELECT COUNT(*) as c FROM salon_services`)[0]?.c || 0;
    if (serviceCount > 0) return;

    // Services anlegen
    const services: Partial<SalonService>[] = [
      { name: "Waschen, Schneiden & Föhnen (Damen)", category: "cut_style", durationMinutes: 60, priceCents: 5800, colorHex: "#f43f5e", sortOrder: 1 },
      { name: "Herrenhaarschnitt & Konturen", category: "cut_style", durationMinutes: 30, priceCents: 3200, colorHex: "#3b82f6", sortOrder: 2 },
      { name: "Balayage Komplett & Glossing", category: "color", durationMinutes: 150, priceCents: 14500, colorHex: "#d946ef", sortOrder: 3 },
      { name: "Ansatzfärbung & Pflege", category: "color", durationMinutes: 90, priceCents: 6800, colorHex: "#ec4899", sortOrder: 4 },
      { name: "Bartpflege & Hot Towel Shave", category: "beard", durationMinutes: 30, priceCents: 2600, colorHex: "#f59e0b", sortOrder: 5 },
      { name: "Olaplex Intensiv-Haarkur", category: "care", durationMinutes: 30, priceCents: 3500, colorHex: "#10b981", sortOrder: 6 },
      { name: "Augenbrauen Zupfen & Färben", category: "cosmetics", durationMinutes: 20, priceCents: 1800, colorHex: "#8b5cf6", sortOrder: 7 },
      { name: "Braut-Styling & Probe-Make-up", category: "package", durationMinutes: 120, priceCents: 18000, colorHex: "#e11d48", sortOrder: 8 },
    ];
    for (const s of services) this.saveService(s);

    // Mitarbeiter anlegen
    const staffMembers: Partial<SalonStaff>[] = [
      { name: "Elena Schmidt", title: "Master Stylist & Salonleitung", colorHex: "#e11d48", specialties: ["Balayage", "Brautstyling", "Coloration"], workStart: "08:30", workEnd: "17:30" },
      { name: "Marco Rossi", title: "Barbier & Herrenspezialist", colorHex: "#2563eb", specialties: ["Fade Cut", "Bartpflege", "Rasur"], workStart: "09:00", workEnd: "18:30" },
      { name: "Sophie Lindner", title: "Junior Stylist & Kosmetik", colorHex: "#10b981", specialties: ["Föhnfrisuren", "Augenbrauen", "Haarpflege"], workStart: "09:00", workEnd: "18:00" },
    ];
    const savedStaff: SalonStaff[] = [];
    for (const sm of staffMembers) savedStaff.push(this.saveStaff(sm));

    // Kunden & Farbkarten anlegen
    const c1 = this.saveClient({
      name: "Sabine Wagner",
      phone: "+49 171 4567890",
      email: "sabine.wagner@example.de",
      birthday: "1988-06-14",
      notes: "Bevorzugt Cappuccino mit Hafermilch. Feines Haar, empfindlich am Nacken.",
      preferredStaffId: savedStaff[0].id,
    });
    this.saveFormula({
      clientId: c1.id,
      staffId: savedStaff[0].id,
      staffName: savedStaff[0].name,
      brand: "Wella Koleston",
      formula: "30g 8/1 + 15g 9/16 mit 6% Welloxon (1:1)",
      developmentMinutes: 35,
      notes: "Sehr schönes kühles Blond, Ansatz gleichmäßig gedeckt.",
    });

    const c2 = this.saveClient({
      name: "Maximilian Bauer",
      phone: "+49 172 9876543",
      email: "max.bauer@example.de",
      notes: "Regelmäßig alle 3 Wochen für Fade Cut und Bartpflege.",
      preferredStaffId: savedStaff[1].id,
    });

    // Beispieltermine heute
    const today = new Date().toISOString().slice(0, 10);
    this.saveAppointment({
      clientId: c1.id,
      clientName: c1.name,
      clientPhone: c1.phone,
      clientEmail: c1.email,
      staffId: savedStaff[0].id,
      staffName: savedStaff[0].name,
      serviceIds: ["s1"],
      serviceNames: ["Waschen, Schneiden & Föhnen (Damen)"],
      day: today,
      startTime: "10:00",
      durationMinutes: 60,
      totalCents: 5800,
      status: "confirmed",
      notes: "Komm etwas früher für Farbabstimmung",
      source: "salon",
    });

    this.saveAppointment({
      clientId: c2.id,
      clientName: c2.name,
      clientPhone: c2.phone,
      clientEmail: c2.email,
      staffId: savedStaff[1].id,
      staffName: savedStaff[1].name,
      serviceIds: ["s2", "s5"],
      serviceNames: ["Herrenhaarschnitt & Konturen", "Bartpflege & Hot Towel Shave"],
      day: today,
      startTime: "11:30",
      durationMinutes: 60,
      totalCents: 5800,
      status: "booked",
      notes: "Fade Cut 0.5mm an den Seiten",
      source: "online",
    });
  }
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Einstellungen prüfen: ein Terminabstand von 0 oder weniger würde die Suche nach freien Zeiten endlos laufen lassen. */
function sanitizeSettings(input: SalonSettings, current: SalonSettings): SalonSettings {
  const num = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const interval = [5, 10, 15, 20, 30, 60].includes(Number(input.slotIntervalMinutes)) ? Number(input.slotIntervalMinutes) : current.slotIntervalMinutes;
  const days = Array.isArray(input.openDays) ? [...new Set(input.openDays.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort() : current.openDays;
  const openTime = TIME.test(String(input.openTime)) ? String(input.openTime) : current.openTime;
  const closeTime = TIME.test(String(input.closeTime)) && String(input.closeTime) > openTime ? String(input.closeTime) : current.closeTime;
  return {
    salonName: String(input.salonName ?? "").trim().slice(0, 120) || current.salonName,
    slotIntervalMinutes: [5, 10, 15, 20, 30, 60].includes(interval) ? interval : 15,
    openDays: days,
    openTime,
    closeTime,
    onlineBookingEnabled: input.onlineBookingEnabled === true,
    bookingAdvanceDays: num(input.bookingAdvanceDays, 1, 365, current.bookingAdvanceDays),
    cancellationHours: num(input.cancellationHours, 0, 168, current.cancellationHours),
    noticeText: String(input.noticeText ?? "").slice(0, 500),
  };
}
