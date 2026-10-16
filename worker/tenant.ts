import { DEFAULT_PRIVACY, sanitizePrivacy, type PrivacySettings } from "../shared/privacy";
import { DurableObject } from "cloudflare:workers";
import type { CompanyProfile } from "../shared/company";
import type { TaxSettings } from "../shared/countries";
import { emptyEmployee, type Advisor, type Employee, type MonthEntry } from "../shared/accounting";
import { localDay, type Absence, type RequestStatus, type TimeEntry, type TimeRequest, type TimeRequestData, type TimeSettings } from "../shared/time";
import { REPAIR_MIGRATIONS, RepairError, RepairStore } from "./repairs/store";
import { POS_MIGRATIONS, POS_MODULE_MIGRATIONS, PosError, PosStore } from "./pos/store";
import { OFFICE_MIGRATIONS, OfficeError, OfficeStore } from "./office/store";
import { SALON_MIGRATIONS, SalonError, SalonStore } from "./salon/store";
import { RETAIL_MIGRATIONS, RetailError, RetailStore } from "./retail/store";
import { WORKSHOP_MIGRATIONS, WorkshopError, WorkshopStore } from "./workshop/store";
import { RESTAURANT_MIGRATIONS, RestaurantError, RestaurantStore } from "./restaurant/store";
import { CRAFT_MIGRATIONS, CraftError, CraftStore } from "./craft/store";
import { FITNESS_MIGRATIONS, FitnessError, FitnessStore } from "./fitness/store";
import { bucketOf, comparisonRange, workTime, type Insights, type Range } from "../shared/insights";

// Die eigene Datenbank eines Kunden. Jede Firma bekommt bei der Anmeldung
// ein eigenes Durable Object mit eigener SQLite-Datenbank, getrennt von allen anderen.
// Neue Tabellen kommen als weitere Einträge in MIGRATIONS dazu.

const MIGRATIONS: string[] = [
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE installed_apps (app_id TEXT PRIMARY KEY, installed_at TEXT NOT NULL DEFAULT (datetime('now')));`,
  `CREATE TABLE assistant_usage (user_id TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));`,
  `CREATE TABLE audit_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     user_id TEXT, user_name TEXT, action TEXT NOT NULL, detail TEXT
   );
   CREATE INDEX audit_log_at ON audit_log(at);`,
  `CREATE TABLE employees (id TEXT PRIMARY KEY, personnel_number INTEGER NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE payroll_entries (employee_id TEXT NOT NULL, month TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (employee_id, month));`,
  `CREATE TABLE time_entries (
     id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL,
     source TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX time_entries_employee_at ON time_entries(employee_id, at);
   CREATE TABLE absences (
     id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, type TEXT NOT NULL, from_day TEXT NOT NULL, to_day TEXT NOT NULL,
     half_day INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT ''
   );
   CREATE INDEX absences_employee ON absences(employee_id, from_day);`,
  `CREATE TABLE time_requests (
     id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, data TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'pending', created_by TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     decided_by TEXT, decided_at TEXT, reply TEXT NOT NULL DEFAULT ''
   );
   CREATE INDEX time_requests_status ON time_requests(status, created_at);
   CREATE INDEX time_requests_employee ON time_requests(employee_id, created_at);`,
  // Kasse für alle Systeme
  POS_MIGRATIONS,
];

// Tabellen der Branchen-Systeme, je System eigens gezählt, damit sie unabhängig vom Kern wachsen.
const MODULE_MIGRATIONS: Record<string, (string | ((sql: SqlStorage) => void))[]> = {
  repairs: REPAIR_MIGRATIONS,
  pos: POS_MODULE_MIGRATIONS,
  buero: OFFICE_MIGRATIONS,
  friseur: SALON_MIGRATIONS,
  einzelhandel: RETAIL_MIGRATIONS,
  werkstatt: WORKSHOP_MIGRATIONS,
  restaurant: RESTAURANT_MIGRATIONS,
  handwerk: CRAFT_MIGRATIONS,
  fitness: FITNESS_MIGRATIONS,
};

/** Antwort eines Modul-Aufrufs: Fehler kommen als Code zurück, weil eigene Fehlerklassen den Weg aus dem Durable Object nicht überstehen. */
export type ModuleResult<T> = { ok: true; value: T } | { ok: false; code: string };

/**
 * Datenbank einer Firma. Alle Firmen-Datenbanken liegen nur in EU-Rechenzentren (Jurisdiktion „eu“),
 * dieselbe Firmen-ID ergibt dort eine andere Datenbank als ohne Jurisdiktion.
 */
export function tenantStub(env: { TENANT_DB: DurableObjectNamespace<TenantDatabase>; LOCAL_NO_JURISDICTION?: string }, tenantId: string) {
  // Nur lokal (wrangler dev kennt keine Jurisdiktionen) über .dev.vars oder Fallback, online immer EU
  if (env.LOCAL_NO_JURISDICTION === "1") {
    return env.TENANT_DB.get(env.TENANT_DB.idFromName(tenantId));
  }
  try {
    const ns = env.TENANT_DB.jurisdiction("eu");
    return ns.get(ns.idFromName(tenantId));
  } catch {
    return env.TENANT_DB.get(env.TENANT_DB.idFromName(tenantId));
  }
}

export interface AuditEntry {
  id: number;
  at: string;
  userId: string | null;
  userName: string | null;
  action: string;
  detail: Record<string, unknown> | null;
}

export class TenantDatabase extends DurableObject<Record<string, never>> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Record<string, never>) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate() {
    this.sql.exec("CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY)");
    const row = this.sql.exec<{ v: number | null }>("SELECT MAX(version) AS v FROM _migrations").one();
    for (let version = (row.v ?? 0) + 1; version <= MIGRATIONS.length; version++) {
      this.ctx.storage.transactionSync(() => {
        this.sql.exec(MIGRATIONS[version - 1]);
        this.sql.exec("INSERT INTO _migrations (version) VALUES (?)", version);
      });
    }
    this.sql.exec("CREATE TABLE IF NOT EXISTS _module_migrations (module TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY (module, version))");
    for (const [module, steps] of Object.entries(MODULE_MIGRATIONS)) {
      const done = this.sql.exec<{ v: number | null }>("SELECT MAX(version) AS v FROM _module_migrations WHERE module = ?", module).one().v ?? 0;
      for (let version = done + 1; version <= steps.length; version++) {
        this.ctx.storage.transactionSync(() => {
          const step = steps[version - 1]!;
          if (typeof step === "function") step(this.sql);
          else this.sql.exec(step);
          this.sql.exec("INSERT INTO _module_migrations (module, version) VALUES (?, ?)", module, version);
        });
      }
    }
  }

  private storesCache?: { pos: PosStore; repairs: RepairStore; office: OfficeStore; salon: SalonStore; retail: RetailStore; workshop: WorkshopStore; restaurant: RestaurantStore; craft: CraftStore; fitness: FitnessStore };
  private txDepth = 0;

  /** Kasse und Module teilen sich eine Datenbank; verschachtelte Transaktionen laufen in der äußeren mit. */
  private stores() {
    if (!this.storesCache) {
      const transaction = <T>(fn: () => T): T => {
        if (this.txDepth) return fn();
        this.txDepth++;
        try {
          return this.ctx.storage.transactionSync(fn);
        } finally {
          this.txDepth--;
        }
      };
      const pos = new PosStore(this.sql, transaction);
      const repairs = new RepairStore(this.sql, transaction, pos);
      const office = new OfficeStore(this.sql, transaction);
      const salon = new SalonStore(this.sql, transaction);
      const retail = new RetailStore(this.sql, transaction);
      const workshop = new WorkshopStore(this.sql, transaction);
      const restaurant = new RestaurantStore(this.sql, transaction);
      const craft = new CraftStore(this.sql);
      const fitness = new FitnessStore(this.sql);
      pos.register("repairs", repairs.posModule());
      this.storesCache = { pos, repairs, office, salon, retail, workshop, restaurant, craft, fitness };
    }
    return this.storesCache!;
  }

  private call(target: object, action: string, args: unknown[], prefix: { pos: string; repairs: string }): ModuleResult<unknown> {
    const method = (target as Record<string, unknown>)[action];
    if (action === "constructor" || action === "posModule" || typeof method !== "function") return { ok: false, code: "notFound" };
    try {
      return { ok: true, value: (method as (...a: unknown[]) => unknown).apply(target, args) };
    } catch (error) {
      if (error instanceof RepairError) return { ok: false, code: prefix.repairs + error.code };
      if (error instanceof PosError) return { ok: false, code: prefix.pos + error.code };
      if (error instanceof OfficeError) return { ok: false, code: error.code };
      if (error instanceof SalonError) return { ok: false, code: error.code };
      if (error instanceof RetailError) return { ok: false, code: error.code };
      if (error instanceof WorkshopError) return { ok: false, code: error.code };
      if (error instanceof RestaurantError) return { ok: false, code: error.code };
      if (error instanceof CraftError) return { ok: false, code: error.code };
      if (error instanceof FitnessError) return { ok: false, code: error.code };
      throw error;
    }
  }

  async repairs(action: string, args: unknown[]): Promise<ModuleResult<unknown>> {
    return this.call(this.stores().repairs, action, args, { repairs: "", pos: "pos." });
  }

  async pos(action: string, args: unknown[]): Promise<ModuleResult<unknown>> {
    return this.call(this.stores().pos, action, args, { repairs: "repairs.", pos: "" });
  }

  async office(action: string, args: unknown[]): Promise<ModuleResult<unknown>> {
    return this.call(this.stores().office, action, args, { repairs: "repairs.", pos: "pos." });
  }

  async salon(action: string, args: unknown[]): Promise<ModuleResult<unknown>> {
    return this.call(this.stores().salon, action, args, { repairs: "repairs.", pos: "pos." });
  }

  async retail(action: string, args: unknown[]): Promise<ModuleResult<unknown>> {
    return this.call(this.stores().retail, action, args, { repairs: "repairs.", pos: "pos." });
  }

  async workshop(action: string, args: unknown[]): Promise<ModuleResult<unknown>> {
    return this.call(this.stores().workshop, action, args, { repairs: "repairs.", pos: "pos." });
  }

  async restaurant(action: string, args: unknown[]): Promise<ModuleResult<unknown>> {
    return this.call(this.stores().restaurant, action, args, { repairs: "repairs.", pos: "pos." });
  }

  async craft(action: string, args: unknown[]): Promise<ModuleResult<unknown>> {
    return this.call(this.stores().craft, action, args, { repairs: "repairs.", pos: "pos." });
  }

  async fitness(action: string, args: unknown[]): Promise<ModuleResult<unknown>> {
    return this.call(this.stores().fitness, action, args, { repairs: "repairs.", pos: "pos." });
  }

  async getCompany(): Promise<CompanyProfile | null> {
    const rows = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'company'").toArray();
    return rows.length ? (JSON.parse(rows[0].value) as CompanyProfile) : null;
  }

  async saveCompany(profile: CompanyProfile): Promise<void> {
    this.sql.exec(
      `INSERT INTO settings (key, value) VALUES ('company', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      JSON.stringify(profile),
    );
  }

  async installedApps(): Promise<string[]> {
    return this.sql.exec<{ app_id: string }>("SELECT app_id FROM installed_apps ORDER BY installed_at").toArray().map((r) => r.app_id);
  }

  async installApp(appId: string): Promise<void> {
    this.sql.exec("INSERT OR IGNORE INTO installed_apps (app_id) VALUES (?)", appId);
  }

  async uninstallApp(appId: string): Promise<void> {
    this.sql.exec("DELETE FROM installed_apps WHERE app_id = ?", appId);
  }

  // ---------- Buchhaltung ----------

  async listEmployees(): Promise<Employee[]> {
    return this.sql
      .exec<{ id: string; personnel_number: number; data: string }>("SELECT id, personnel_number, data FROM employees ORDER BY personnel_number")
      .toArray()
      .map((r) => ({ ...emptyEmployee, ...(JSON.parse(r.data) as Employee), id: r.id, personnelNumber: String(r.personnel_number) }));
  }

  /** Neue Person anlegen (bekommt die nächste Personalnummer ab 1001) oder bestehende ändern. */
  async saveEmployee(id: string | null, data: Omit<Employee, "id" | "personnelNumber">): Promise<string> {
    if (id) {
      const done = this.sql.exec("UPDATE employees SET data = ?, updated_at = datetime('now') WHERE id = ?", JSON.stringify(data), id);
      if (done.rowsWritten === 0) throw new Error("not found");
      return id;
    }
    const newId = crypto.randomUUID();
    const next = this.sql.exec<{ n: number | null }>("SELECT MAX(personnel_number) AS n FROM employees").one().n ?? 1000;
    this.sql.exec("INSERT INTO employees (id, personnel_number, data) VALUES (?, ?, ?)", newId, next + 1, JSON.stringify(data));
    return newId;
  }

  async deleteEmployee(id: string): Promise<void> {
    this.sql.exec("DELETE FROM payroll_entries WHERE employee_id = ?", id);
    this.sql.exec("DELETE FROM time_entries WHERE employee_id = ?", id);
    this.sql.exec("DELETE FROM absences WHERE employee_id = ?", id);
    this.sql.exec("DELETE FROM time_requests WHERE employee_id = ?", id);
    this.sql.exec("DELETE FROM employees WHERE id = ?", id);
  }

  async monthEntries(month: string): Promise<MonthEntry[]> {
    return this.sql.exec<{ data: string }>("SELECT data FROM payroll_entries WHERE month = ?", month).toArray().map((r) => JSON.parse(r.data) as MonthEntry);
  }

  async saveMonthEntries(month: string, entries: MonthEntry[]): Promise<void> {
    this.ctx.storage.transactionSync(() => {
      for (const e of entries)
        this.sql.exec(
          `INSERT INTO payroll_entries (employee_id, month, data) VALUES (?, ?, ?)
           ON CONFLICT(employee_id, month) DO UPDATE SET data = excluded.data`,
          e.employeeId, month, JSON.stringify(e),
        );
    });
  }

  async getAdvisor(): Promise<Advisor | null> {
    const rows = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'advisor'").toArray();
    return rows.length ? (JSON.parse(rows[0]!.value) as Advisor) : null;
  }

  async saveAdvisor(advisor: Advisor): Promise<void> {
    this.sql.exec(
      `INSERT INTO settings (key, value) VALUES ('advisor', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      JSON.stringify(advisor),
    );
  }

  // ---------- Zeitwirtschaft ----------

  /** Stempel einer Person (oder aller) im Zeitraum, from/to als UTC-ISO. */
  async timeEntries(employeeId: string | null, from: string, to: string): Promise<TimeEntry[]> {
    const rows = employeeId
      ? this.sql.exec<Record<string, string>>("SELECT * FROM time_entries WHERE employee_id = ? AND at >= ? AND at < ? ORDER BY at", employeeId, from, to)
      : this.sql.exec<Record<string, string>>("SELECT * FROM time_entries WHERE at >= ? AND at < ? ORDER BY at", from, to);
    return rows.toArray().map((r) => ({ id: r.id!, employeeId: r.employee_id!, kind: r.kind as TimeEntry["kind"], at: r.at!, source: r.source as TimeEntry["source"], note: r.note ?? "" }));
  }

  /** Zentrale Auswertung: Kasse, Handy- & IT-Service (falls gebucht) und Arbeitszeit, alles aus dieser einen Datenbank. */
  async insights(range: Range, withRepairs: boolean, today: string): Promise<Insights> {
    const { pos, repairs } = this.stores();
    const bucket = bucketOf(range);
    const prev = comparisonRange(range, today);
    const before = pos.salesStats(prev, bucketOf(prev));
    const from = new Date(Date.parse(`${range.from}T00:00:00Z`) - 86_400_000).toISOString();
    const to = new Date(Date.parse(`${range.to}T00:00:00Z`) + 2 * 86_400_000).toISOString();
    return {
      ...range, bucket,
      sales: pos.salesStats(range, bucket),
      previous: { ...prev, revenueCents: before.revenueCents, receipts: before.receipts },
      repairs: withRepairs ? repairs.pipeline(range) : null,
      time: workTime(await this.timeEntries(null, from, to), range),
    };
  }

  async lastTimeEntry(employeeId: string): Promise<TimeEntry | null> {
    const r = this.sql.exec<Record<string, string>>("SELECT * FROM time_entries WHERE employee_id = ? ORDER BY at DESC LIMIT 1", employeeId).toArray()[0];
    return r ? { id: r.id!, employeeId: r.employee_id!, kind: r.kind as TimeEntry["kind"], at: r.at!, source: r.source as TimeEntry["source"], note: r.note ?? "" } : null;
  }

  async addTimeEntry(entry: Omit<TimeEntry, "id">, createdBy: string | null): Promise<string> {
    const id = crypto.randomUUID();
    this.sql.exec(
      "INSERT INTO time_entries (id, employee_id, kind, at, source, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id, entry.employeeId, entry.kind, entry.at, entry.source, entry.note, createdBy,
    );
    return id;
  }

  async updateTimeEntry(id: string, patch: Pick<TimeEntry, "kind" | "at" | "note">): Promise<TimeEntry | null> {
    this.sql.exec("UPDATE time_entries SET kind = ?, at = ?, note = ? WHERE id = ?", patch.kind, patch.at, patch.note, id);
    const r = this.sql.exec<Record<string, string>>("SELECT * FROM time_entries WHERE id = ?", id).toArray()[0];
    return r ? { id: r.id!, employeeId: r.employee_id!, kind: r.kind as TimeEntry["kind"], at: r.at!, source: r.source as TimeEntry["source"], note: r.note ?? "" } : null;
  }

  async deleteTimeEntry(id: string): Promise<string | null> {
    const r = this.sql.exec<{ employee_id: string }>("SELECT employee_id FROM time_entries WHERE id = ?", id).toArray()[0];
    this.sql.exec("DELETE FROM time_entries WHERE id = ?", id);
    return r?.employee_id ?? null;
  }

  /** Abwesenheiten, die den Zeitraum (Tage YYYY-MM-DD) berühren. */
  async absences(employeeId: string | null, from: string, to: string): Promise<Absence[]> {
    const rows = employeeId
      ? this.sql.exec<Record<string, string | number>>("SELECT * FROM absences WHERE employee_id = ? AND to_day >= ? AND from_day <= ? ORDER BY from_day", employeeId, from, to)
      : this.sql.exec<Record<string, string | number>>("SELECT * FROM absences WHERE to_day >= ? AND from_day <= ? ORDER BY from_day", from, to);
    return rows.toArray().map((r) => ({
      id: String(r.id), employeeId: String(r.employee_id), type: r.type as Absence["type"], from: String(r.from_day), to: String(r.to_day),
      halfDay: !!r.half_day, note: String(r.note ?? ""),
    }));
  }

  async addAbsence(a: Omit<Absence, "id">): Promise<string> {
    const id = crypto.randomUUID();
    this.sql.exec(
      "INSERT INTO absences (id, employee_id, type, from_day, to_day, half_day, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id, a.employeeId, a.type, a.from, a.to, a.halfDay ? 1 : 0, a.note,
    );
    return id;
  }

  async deleteAbsence(id: string): Promise<void> {
    this.sql.exec("DELETE FROM absences WHERE id = ?", id);
  }

  async addRequest(employeeId: string, data: TimeRequestData, note: string, createdBy: string): Promise<string> {
    const id = crypto.randomUUID();
    this.sql.exec("INSERT INTO time_requests (id, employee_id, data, note, created_by) VALUES (?, ?, ?, ?, ?)", id, employeeId, JSON.stringify(data), note, createdBy);
    return id;
  }

  /** Anträge einer Person (neueste zuerst) oder alle offenen plus die zuletzt entschiedenen. */
  async requests(employeeId: string | null, limit = 50): Promise<TimeRequest[]> {
    const rows = employeeId
      ? this.sql.exec<Record<string, string | null>>("SELECT * FROM time_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT ?", employeeId, limit)
      : this.sql.exec<Record<string, string | null>>(
          "SELECT * FROM time_requests ORDER BY status = 'pending' DESC, COALESCE(decided_at, created_at) DESC LIMIT ?", limit,
        );
    return rows.toArray().map((r) => ({
      id: r.id!, employeeId: r.employee_id!, data: JSON.parse(r.data!) as TimeRequestData, note: r.note ?? "",
      status: r.status as RequestStatus, createdAt: r.created_at!, decidedAt: r.decided_at ?? null, decidedBy: r.decided_by ?? null, reply: r.reply ?? "",
    }));
  }

  async pendingRequestCount(): Promise<number> {
    return this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM time_requests WHERE status = 'pending'").one().n;
  }

  /**
   * Antrag entscheiden. Bei Genehmigung wird daraus ein Stempel oder eine Abwesenheit.
   * Gibt den Antrag zurück oder null, wenn er nicht (mehr) offen ist.
   */
  async decideRequest(id: string, approve: boolean, reply: string, decidedBy: string, decidedByName: string): Promise<TimeRequest | null> {
    const [request] = (await this.requests(null, 1000)).filter((r) => r.id === id && r.status === "pending");
    if (!request) return null;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        "UPDATE time_requests SET status = ?, reply = ?, decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        approve ? "approved" : "rejected", reply, decidedByName, id,
      );
      if (!approve) return;
      const d = request.data;
      const note = [request.note, `Antrag genehmigt von ${decidedByName}`].filter(Boolean).join(" · ");
      if (d.type === "stamp")
        this.sql.exec("INSERT INTO time_entries (id, employee_id, kind, at, source, note, created_by) VALUES (?, ?, ?, ?, 'manual', ?, ?)", crypto.randomUUID(), request.employeeId, d.kind, d.at, note, decidedBy);
      else
        this.sql.exec("INSERT INTO absences (id, employee_id, type, from_day, to_day, half_day, note) VALUES (?, ?, ?, ?, ?, ?, ?)", crypto.randomUUID(), request.employeeId, d.absence, d.from, d.to, d.halfDay ? 1 : 0, note);
    });
    return { ...request, status: approve ? "approved" : "rejected", reply };
  }

  /** Eigenen offenen Antrag zurückziehen. */
  async withdrawRequest(id: string, employeeId: string): Promise<boolean> {
    const before = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM time_requests WHERE id = ? AND employee_id = ? AND status = 'pending'", id, employeeId).one().n;
    this.sql.exec("DELETE FROM time_requests WHERE id = ? AND employee_id = ? AND status = 'pending'", id, employeeId);
    return before > 0;
  }

  /** Eigene Steuer-Einstellungen; null, solange die Vorgaben des Landes gelten. */
  async getPrivacy(): Promise<PrivacySettings> {
    const rows = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'privacy'").toArray();
    return rows[0] ? sanitizePrivacy(JSON.parse(rows[0].value)) : { ...DEFAULT_PRIVACY };
  }

  async savePrivacy(settings: PrivacySettings): Promise<void> {
    this.sql.exec(
      `INSERT INTO settings (key, value) VALUES ('privacy', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      JSON.stringify(sanitizePrivacy(settings)),
    );
  }

  async getTaxSettings(): Promise<TaxSettings | null> {
    const rows = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'tax'").toArray();
    return rows.length ? (JSON.parse(rows[0]!.value) as TaxSettings) : null;
  }

  async saveTaxSettings(settings: TaxSettings | null): Promise<void> {
    if (!settings) {
      this.sql.exec("DELETE FROM settings WHERE key = 'tax'");
      return;
    }
    this.sql.exec(
      `INSERT INTO settings (key, value) VALUES ('tax', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      JSON.stringify(settings),
    );
  }

  async getTimeSettings(): Promise<TimeSettings> {
    const rows = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'time'").toArray();
    if (rows.length) return { state: "", since: "", ...(JSON.parse(rows[0]!.value) as Partial<TimeSettings>) };
    // Erster Aufruf: Das Zeitkonto zählt erst ab heute, sonst hätten alle sofort riesige Minusstunden
    const settings: TimeSettings = { state: "", since: localDay(new Date().toISOString()) };
    await this.saveTimeSettings(settings);
    return settings;
  }

  async saveTimeSettings(settings: TimeSettings): Promise<void> {
    this.sql.exec(
      `INSERT INTO settings (key, value) VALUES ('time', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      JSON.stringify(settings),
    );
  }

  /** Eintrag ins Protokoll: wer hat wann was getan. Einträge älter als 2 Jahre fallen weg. */
  async logEvent(entry: { userId?: string | null; userName?: string | null; action: string; detail?: Record<string, unknown> }): Promise<void> {
    this.sql.exec(
      "INSERT INTO audit_log (user_id, user_name, action, detail) VALUES (?, ?, ?, ?)",
      entry.userId ?? null,
      entry.userName ?? null,
      entry.action,
      entry.detail ? JSON.stringify(entry.detail) : null,
    );
    this.sql.exec("DELETE FROM audit_log WHERE at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 years')");
  }

  async auditLog(limit = 100): Promise<AuditEntry[]> {
    return this.sql
      .exec<{ id: number; at: string; user_id: string | null; user_name: string | null; action: string; detail: string | null }>(
        "SELECT id, at, user_id, user_name, action, detail FROM audit_log ORDER BY id DESC LIMIT ?",
        Math.min(Math.max(limit, 1), 500),
      )
      .toArray()
      .map((r) => ({ id: r.id, at: r.at, userId: r.user_id, userName: r.user_name, action: r.action, detail: r.detail ? JSON.parse(r.detail) : null }));
  }

  /** Alle Daten dieser Firma als JSON (Datenexport nach DSGVO). */
  async exportAll(): Promise<Record<string, unknown[]>> {
    const tables = this.sql
      .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%'")
      .toArray()
      .map((r) => r.name);
    return Object.fromEntries(tables.map((t) => [t, this.sql.exec(`SELECT * FROM "${t}"`).toArray()]));
  }

  /** Löscht die komplette Datenbank dieser Firma unwiderruflich. */
  async destroy(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  /** Zählt eine Frage an den KI-Assistenten. Gibt false zurück, wenn das Tageslimit erreicht ist. */
  async countAssistantQuestion(userId: string, dailyLimit: number): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10);
    const row = this.sql
      .exec<{ count: number }>("SELECT count FROM assistant_usage WHERE user_id = ? AND day = ?", userId, day)
      .toArray()[0];
    if ((row?.count ?? 0) >= dailyLimit) return false;
    this.sql.exec(
      `INSERT INTO assistant_usage (user_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1`,
      userId,
      day,
    );
    this.sql.exec("DELETE FROM assistant_usage WHERE day < date('now', '-30 days')");
    return true;
  }
}
