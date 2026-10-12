import { DurableObject } from "cloudflare:workers";
import type { CompanyProfile } from "../shared/company";
import type { Advisor, Employee, MonthEntry } from "../shared/accounting";

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
];

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
      .map((r) => ({ ...(JSON.parse(r.data) as Employee), id: r.id, personnelNumber: String(r.personnel_number) }));
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
