import { DurableObject } from "cloudflare:workers";
import type { CompanyProfile } from "../shared/company";

// Die eigene Datenbank eines Kunden. Jede Firma bekommt bei der Anmeldung
// ein eigenes Durable Object mit eigener SQLite-Datenbank, getrennt von allen anderen.
// Neue Tabellen kommen als weitere Einträge in MIGRATIONS dazu.

const MIGRATIONS: string[] = [
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
   CREATE TABLE installed_apps (app_id TEXT PRIMARY KEY, installed_at TEXT NOT NULL DEFAULT (datetime('now')));`,
];

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
}
