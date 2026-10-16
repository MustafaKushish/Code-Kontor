import {
  DEFAULT_OFFICE_SETTINGS, computeDocumentTotals, type LineItem, type OfficeClient,
  type OfficeInvoice, type OfficeProject, type OfficeQuote, type OfficeSettings, type OfficeTimeEntry,
  type ProjectStatus, type QuoteStatus, type InvoiceStatus, type OfficeTask, type OfficeExpense,
  type OfficeDunning, type OfficeRecurring, type ExpenseCategory,
} from "../../shared/office";

export class OfficeError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const OFFICE_MIGRATIONS: string[] = [
  `CREATE TABLE office_clients (
     id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, name TEXT NOT NULL, contact_person TEXT NOT NULL DEFAULT '',
     email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', street TEXT NOT NULL DEFAULT '',
     postal_code TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT 'DE',
     vat_id TEXT NOT NULL DEFAULT '', payment_terms_days INTEGER NOT NULL DEFAULT 14,
     hourly_rate_cents INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX office_clients_name ON office_clients(name);

   CREATE TABLE office_projects (
     id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, client_id TEXT NOT NULL, name TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'active', budget_cents INTEGER NOT NULL DEFAULT 0,
     hourly_rate_cents INTEGER NOT NULL DEFAULT 0, start_date TEXT NOT NULL DEFAULT '',
     due_date TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX office_projects_client ON office_projects(client_id);
   CREATE INDEX office_projects_status ON office_projects(status);

   CREATE TABLE office_times (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL, client_id TEXT NOT NULL, user_id TEXT NOT NULL DEFAULT '',
     user_name TEXT NOT NULL DEFAULT '', day TEXT NOT NULL, minutes INTEGER NOT NULL,
     hourly_rate_cents INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL DEFAULT '',
     billable INTEGER NOT NULL DEFAULT 1, billed_invoice_id TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX office_times_project ON office_times(project_id, day);
   CREATE INDEX office_times_day ON office_times(day);

   CREATE TABLE office_quotes (
     id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, year INTEGER NOT NULL, seq INTEGER NOT NULL,
     client_id TEXT NOT NULL, project_id TEXT, status TEXT NOT NULL DEFAULT 'draft',
     title TEXT NOT NULL, items TEXT NOT NULL, net_cents INTEGER NOT NULL, vat_cents INTEGER NOT NULL,
     total_cents INTEGER NOT NULL, valid_until TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     UNIQUE (year, seq)
   );
   CREATE INDEX office_quotes_client ON office_quotes(client_id);
   CREATE INDEX office_quotes_status ON office_quotes(status);

   CREATE TABLE office_invoices (
     id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, year INTEGER NOT NULL, seq INTEGER NOT NULL,
     client_id TEXT NOT NULL, project_id TEXT, quote_id TEXT, status TEXT NOT NULL DEFAULT 'draft',
     title TEXT NOT NULL, items TEXT NOT NULL, net_cents INTEGER NOT NULL, vat_cents INTEGER NOT NULL,
     total_cents INTEGER NOT NULL, due_date TEXT NOT NULL DEFAULT '', issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     paid_at TEXT, paid_method TEXT, buyer_reference TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
     UNIQUE (year, seq)
   );
   CREATE INDEX office_invoices_client ON office_invoices(client_id);
   CREATE INDEX office_invoices_status ON office_invoices(status);`,

  // Migration 2: Aufgaben/Meilensteine, Auslagen, Mahnwesen, Wiederkehrende Rechnungen, SEPA/Skonto
  `CREATE TABLE office_tasks (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
     estimated_minutes INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0, completed_at TEXT,
     due_date TEXT NOT NULL DEFAULT '', assignee_name TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX office_tasks_project ON office_tasks(project_id);

   CREATE TABLE office_expenses (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL, client_id TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL,
     day TEXT NOT NULL, net_cents INTEGER NOT NULL, vat_rate INTEGER NOT NULL, vat_cents INTEGER NOT NULL,
     total_cents INTEGER NOT NULL, billable INTEGER NOT NULL DEFAULT 1, markup_percent INTEGER NOT NULL DEFAULT 0,
     billed_invoice_id TEXT, notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX office_expenses_project ON office_expenses(project_id);
   CREATE INDEX office_expenses_day ON office_expenses(day);

   CREATE TABLE office_dunning (
     id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, invoice_number TEXT NOT NULL, level INTEGER NOT NULL,
     issued_at TEXT NOT NULL, due_date TEXT NOT NULL, fee_cents INTEGER NOT NULL, interest_cents INTEGER NOT NULL,
     total_amount_cents INTEGER NOT NULL, notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX office_dunning_invoice ON office_dunning(invoice_id);

   CREATE TABLE office_recurring (
     id TEXT PRIMARY KEY, client_id TEXT NOT NULL, project_id TEXT, title TEXT NOT NULL, items TEXT NOT NULL,
     interval_months INTEGER NOT NULL DEFAULT 1, next_run_day TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );

   ALTER TABLE office_clients ADD COLUMN sepa_iban TEXT NOT NULL DEFAULT '';
   ALTER TABLE office_clients ADD COLUMN sepa_bic TEXT NOT NULL DEFAULT '';
   ALTER TABLE office_clients ADD COLUMN sepa_mandate_ref TEXT NOT NULL DEFAULT '';
   ALTER TABLE office_clients ADD COLUMN sepa_mandate_date TEXT NOT NULL DEFAULT '';
   ALTER TABLE office_clients ADD COLUMN skonto_days INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE office_clients ADD COLUMN skonto_percent REAL NOT NULL DEFAULT 0;
   ALTER TABLE office_clients ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;

   ALTER TABLE office_times ADD COLUMN task_id TEXT;
   ALTER TABLE office_times ADD COLUMN role_name TEXT NOT NULL DEFAULT '';

   ALTER TABLE office_invoices ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;
   ALTER TABLE office_invoices ADD COLUMN skonto_days INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE office_invoices ADD COLUMN skonto_percent REAL NOT NULL DEFAULT 0;
   ALTER TABLE office_invoices ADD COLUMN dunning_level INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE office_invoices ADD COLUMN last_dunning_at TEXT;

   ALTER TABLE office_quotes ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;`,
];

type Row = Record<string, string | number | null>;

export class OfficeStore {
  constructor(private sql: SqlStorage, private transaction: <T>(fn: () => T) => T) {}

  // ---------- Einstellungen ----------

  getSettings(): OfficeSettings {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'office'").toArray()[0];
    return row ? { ...DEFAULT_OFFICE_SETTINGS, ...(JSON.parse(row.value) as Partial<OfficeSettings>) } : DEFAULT_OFFICE_SETTINGS;
  }

  saveSettings(settings: OfficeSettings): OfficeSettings {
    this.sql.exec(
      `INSERT INTO settings (key, value) VALUES ('office', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      JSON.stringify(settings),
    );
    return settings;
  }

  // ---------- Kunden ----------

  listClients(query = ""): OfficeClient[] {
    const q = `%${query.trim().toLowerCase()}%`;
    const rows = this.sql
      .exec<Row>(
        `SELECT c.*,
                (SELECT COUNT(*) FROM office_invoices i WHERE i.client_id = c.id AND i.status IN ('sent', 'overdue')) AS open_invoice_count,
                (SELECT COALESCE(SUM(i.total_cents), 0) FROM office_invoices i WHERE i.client_id = c.id AND i.status IN ('sent', 'overdue')) AS open_invoice_cents
           FROM office_clients c
          WHERE ? = '%%' OR lower(c.name) LIKE ? OR lower(c.contact_person) LIKE ? OR lower(c.email) LIKE ?
          ORDER BY c.name`,
        q, q, q, q,
      )
      .toArray();

    return rows.map((r) => this.mapClient(r));
  }

  getClient(id: string): OfficeClient | null {
    const r = this.sql.exec<Row>("SELECT * FROM office_clients WHERE id = ?", id).toArray()[0];
    return r ? this.mapClient(r) : null;
  }

  saveClient(input: Partial<OfficeClient>): OfficeClient {
    const name = (input.name ?? "").trim();
    if (!name) throw new OfficeError("clientNameRequired");

    const id = input.id || crypto.randomUUID();
    const isNew = !input.id;
    const now = new Date().toISOString();

    this.transaction(() => {
      if (isNew) {
        const nextNum = (this.sql.exec<{ n: number | null }>("SELECT MAX(number) AS n FROM office_clients").one().n ?? 10000) + 1;
        this.sql.exec(
          `INSERT INTO office_clients (id, number, name, contact_person, email, phone, street, postal_code, city, country, vat_id, payment_terms_days, hourly_rate_cents, notes, sepa_iban, sepa_bic, sepa_mandate_ref, sepa_mandate_date, skonto_days, skonto_percent, discount_percent, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, nextNum, name, (input.contactPerson ?? "").trim(), (input.email ?? "").trim(),
          (input.phone ?? "").trim(), (input.street ?? "").trim(), (input.postalCode ?? "").trim(),
          (input.city ?? "").trim(), (input.country ?? "DE").trim().toUpperCase(), (input.vatId ?? "").trim(),
          Number(input.paymentTermsDays) || 14, Number(input.hourlyRateCents) || 0, (input.notes ?? "").trim(),
          (input.sepaIban ?? "").trim().toUpperCase(), (input.sepaBic ?? "").trim().toUpperCase(),
          (input.sepaMandateRef ?? "").trim(), (input.sepaMandateDate ?? "").trim(),
          Number(input.skontoDays) || 0, Number(input.skontoPercent) || 0, Number(input.discountPercent) || 0,
          now, now,
        );
      } else {
        this.sql.exec(
          `UPDATE office_clients SET name = ?, contact_person = ?, email = ?, phone = ?, street = ?, postal_code = ?, city = ?, country = ?, vat_id = ?, payment_terms_days = ?, hourly_rate_cents = ?, notes = ?, sepa_iban = ?, sepa_bic = ?, sepa_mandate_ref = ?, sepa_mandate_date = ?, skonto_days = ?, skonto_percent = ?, discount_percent = ?, updated_at = ?
           WHERE id = ?`,
          name, (input.contactPerson ?? "").trim(), (input.email ?? "").trim(),
          (input.phone ?? "").trim(), (input.street ?? "").trim(), (input.postalCode ?? "").trim(),
          (input.city ?? "").trim(), (input.country ?? "DE").trim().toUpperCase(), (input.vatId ?? "").trim(),
          Number(input.paymentTermsDays) || 14, Number(input.hourlyRateCents) || 0, (input.notes ?? "").trim(),
          (input.sepaIban ?? "").trim().toUpperCase(), (input.sepaBic ?? "").trim().toUpperCase(),
          (input.sepaMandateRef ?? "").trim(), (input.sepaMandateDate ?? "").trim(),
          Number(input.skontoDays) || 0, Number(input.skontoPercent) || 0, Number(input.discountPercent) || 0,
          now, id,
        );
      }
    });

    return this.getClient(id)!;
  }

  deleteClient(id: string): { ok: boolean } {
    const hasProjects = this.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM office_projects WHERE client_id = ?", id).one().c;
    if (hasProjects > 0) throw new OfficeError("clientHasProjects");
    this.sql.exec("DELETE FROM office_clients WHERE id = ?", id);
    return { ok: true };
  }

  private mapClient(r: Row): OfficeClient {
    return {
      id: String(r.id),
      number: Number(r.number),
      name: String(r.name),
      contactPerson: String(r.contact_person ?? ""),
      email: String(r.email ?? ""),
      phone: String(r.phone ?? ""),
      street: String(r.street ?? ""),
      postalCode: String(r.postal_code ?? ""),
      city: String(r.city ?? ""),
      country: String(r.country ?? "DE"),
      vatId: String(r.vat_id ?? ""),
      paymentTermsDays: Number(r.payment_terms_days ?? 14),
      hourlyRateCents: Number(r.hourly_rate_cents ?? 0),
      notes: String(r.notes ?? ""),
      sepaIban: r.sepa_iban ? String(r.sepa_iban) : undefined,
      sepaBic: r.sepa_bic ? String(r.sepa_bic) : undefined,
      sepaMandateRef: r.sepa_mandate_ref ? String(r.sepa_mandate_ref) : undefined,
      sepaMandateDate: r.sepa_mandate_date ? String(r.sepa_mandate_date) : undefined,
      skontoDays: Number(r.skonto_days ?? 0),
      skontoPercent: Number(r.skonto_percent ?? 0),
      discountPercent: Number(r.discount_percent ?? 0),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      openInvoiceCount: r.open_invoice_count !== undefined ? Number(r.open_invoice_count) : undefined,
      openInvoiceCents: r.open_invoice_cents !== undefined ? Number(r.open_invoice_cents) : undefined,
    };
  }

  // ---------- Projekte ----------

  listProjects(status?: string, clientId?: string): OfficeProject[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (status && status !== "all") {
      where.push("p.status = ?");
      args.push(status);
    }
    if (clientId) {
      where.push("p.client_id = ?");
      args.push(clientId);
    }

    const rows = this.sql
      .exec<Row>(
        `SELECT p.*, c.name AS client_name,
                (SELECT COALESCE(SUM(t.minutes), 0) FROM office_times t WHERE t.project_id = p.id) AS total_minutes,
                (SELECT COALESCE(SUM(ROUND(t.minutes * t.hourly_rate_cents / 60.0)), 0) FROM office_times t WHERE t.project_id = p.id) AS logged_cents,
                (SELECT COALESCE(SUM(i.total_cents), 0) FROM office_invoices i WHERE i.project_id = p.id AND i.status != 'canceled') AS billed_cents,
                (SELECT COALESCE(SUM(e.total_cents), 0) FROM office_expenses e WHERE e.project_id = p.id) AS total_expenses,
                (SELECT COUNT(*) FROM office_tasks tk WHERE tk.project_id = p.id) AS tasks_count,
                (SELECT COUNT(*) FROM office_tasks tk WHERE tk.project_id = p.id AND tk.completed = 1) AS tasks_completed
           FROM office_projects p
           JOIN office_clients c ON c.id = p.client_id
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY p.updated_at DESC`,
        ...args,
      )
      .toArray();

    return rows.map((r) => this.mapProject(r));
  }

  getProject(id: string): OfficeProject | null {
    const r = this.sql
      .exec<Row>(
        `SELECT p.*, c.name AS client_name,
                (SELECT COALESCE(SUM(t.minutes), 0) FROM office_times t WHERE t.project_id = p.id) AS total_minutes,
                (SELECT COALESCE(SUM(ROUND(t.minutes * t.hourly_rate_cents / 60.0)), 0) FROM office_times t WHERE t.project_id = p.id) AS logged_cents,
                (SELECT COALESCE(SUM(i.total_cents), 0) FROM office_invoices i WHERE i.project_id = p.id AND i.status != 'canceled') AS billed_cents,
                (SELECT COALESCE(SUM(e.total_cents), 0) FROM office_expenses e WHERE e.project_id = p.id) AS total_expenses,
                (SELECT COUNT(*) FROM office_tasks tk WHERE tk.project_id = p.id) AS tasks_count,
                (SELECT COUNT(*) FROM office_tasks tk WHERE tk.project_id = p.id AND tk.completed = 1) AS tasks_completed
           FROM office_projects p
           JOIN office_clients c ON c.id = p.client_id
          WHERE p.id = ?`,
        id,
      )
      .toArray()[0];
    return r ? this.mapProject(r) : null;
  }

  saveProject(input: Partial<OfficeProject>): OfficeProject {
    const name = (input.name ?? "").trim();
    if (!name) throw new OfficeError("projectNameRequired");
    const clientId = input.clientId;
    if (!clientId) throw new OfficeError("clientRequired");

    const id = input.id || crypto.randomUUID();
    const isNew = !input.id;
    const now = new Date().toISOString();

    this.transaction(() => {
      if (isNew) {
        const nextNum = (this.sql.exec<{ n: number | null }>("SELECT MAX(number) AS n FROM office_projects").one().n ?? 2000) + 1;
        this.sql.exec(
          `INSERT INTO office_projects (id, number, client_id, name, status, budget_cents, hourly_rate_cents, start_date, due_date, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, nextNum, clientId, name, (input.status as ProjectStatus) || "active",
          Number(input.budgetCents) || 0, Number(input.hourlyRateCents) || 0,
          input.startDate || now.slice(0, 10), input.dueDate || "", (input.description ?? "").trim(), now, now,
        );
      } else {
        this.sql.exec(
          `UPDATE office_projects SET client_id = ?, name = ?, status = ?, budget_cents = ?, hourly_rate_cents = ?, start_date = ?, due_date = ?, description = ?, updated_at = ?
           WHERE id = ?`,
          clientId, name, (input.status as ProjectStatus) || "active",
          Number(input.budgetCents) || 0, Number(input.hourlyRateCents) || 0,
          input.startDate || "", input.dueDate || "", (input.description ?? "").trim(), now, id,
        );
      }
    });

    return this.getProject(id)!;
  }

  deleteProject(id: string): { ok: boolean } {
    this.sql.exec("DELETE FROM office_tasks WHERE project_id = ?", id);
    this.sql.exec("DELETE FROM office_expenses WHERE project_id = ?", id);
    this.sql.exec("DELETE FROM office_times WHERE project_id = ?", id);
    this.sql.exec("DELETE FROM office_projects WHERE id = ?", id);
    return { ok: true };
  }

  private mapProject(r: Row): OfficeProject {
    return {
      id: String(r.id),
      number: Number(r.number),
      clientId: String(r.client_id),
      clientName: String(r.client_name ?? ""),
      name: String(r.name),
      status: String(r.status) as ProjectStatus,
      budgetCents: Number(r.budget_cents ?? 0),
      hourlyRateCents: Number(r.hourly_rate_cents ?? 0),
      startDate: String(r.start_date ?? ""),
      dueDate: String(r.due_date ?? ""),
      description: String(r.description ?? ""),
      totalMinutesLogged: Number(r.total_minutes ?? 0),
      totalLoggedCents: Number(r.logged_cents ?? 0),
      totalBilledCents: Number(r.billed_cents ?? 0),
      totalExpensesCents: Number(r.total_expenses ?? 0),
      tasksCount: Number(r.tasks_count ?? 0),
      tasksCompleted: Number(r.tasks_completed ?? 0),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  // ---------- Aufgaben & Meilensteine ----------

  listTasks(projectId: string): OfficeTask[] {
    const rows = this.sql
      .exec<Row>("SELECT * FROM office_tasks WHERE project_id = ? ORDER BY completed ASC, due_date ASC, created_at DESC", projectId)
      .toArray();

    return rows.map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      title: String(r.title),
      description: String(r.description ?? ""),
      estimatedMinutes: Number(r.estimated_minutes ?? 0),
      completed: Boolean(r.completed),
      completedAt: r.completed_at ? String(r.completed_at) : null,
      dueDate: String(r.due_date ?? ""),
      assigneeName: String(r.assignee_name ?? ""),
      createdAt: String(r.created_at),
    }));
  }

  saveTask(input: Partial<OfficeTask>): OfficeTask {
    const title = (input.title ?? "").trim();
    if (!title) throw new OfficeError("taskTitleRequired");
    if (!input.projectId) throw new OfficeError("projectRequired");

    const id = input.id || crypto.randomUUID();
    const isNew = !input.id;
    const now = new Date().toISOString();

    if (isNew) {
      this.sql.exec(
        `INSERT INTO office_tasks (id, project_id, title, description, estimated_minutes, completed, due_date, assignee_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, input.projectId, title, (input.description ?? "").trim(),
        Number(input.estimatedMinutes) || 0, input.completed ? 1 : 0,
        input.dueDate || "", (input.assigneeName ?? "").trim(), now,
      );
    } else {
      this.sql.exec(
        `UPDATE office_tasks SET title = ?, description = ?, estimated_minutes = ?, completed = ?, completed_at = ?, due_date = ?, assignee_name = ?
         WHERE id = ?`,
        title, (input.description ?? "").trim(), Number(input.estimatedMinutes) || 0,
        input.completed ? 1 : 0, input.completed ? now : null, input.dueDate || "", (input.assigneeName ?? "").trim(), id,
      );
    }

    const r = this.sql.exec<Row>("SELECT * FROM office_tasks WHERE id = ?", id).toArray()[0];
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      title: String(r.title),
      description: String(r.description ?? ""),
      estimatedMinutes: Number(r.estimated_minutes ?? 0),
      completed: Boolean(r.completed),
      completedAt: r.completed_at ? String(r.completed_at) : null,
      dueDate: String(r.due_date ?? ""),
      assigneeName: String(r.assignee_name ?? ""),
      createdAt: String(r.created_at),
    };
  }

  toggleTask(id: string): OfficeTask {
    const r = this.sql.exec<Row>("SELECT * FROM office_tasks WHERE id = ?", id).toArray()[0];
    if (!r) throw new OfficeError("taskNotFound");
    const nextCompleted = Number(r.completed) === 1 ? 0 : 1;
    const completedAt = nextCompleted === 1 ? new Date().toISOString() : null;
    this.sql.exec("UPDATE office_tasks SET completed = ?, completed_at = ? WHERE id = ?", nextCompleted, completedAt, id);
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      title: String(r.title),
      description: String(r.description ?? ""),
      estimatedMinutes: Number(r.estimated_minutes ?? 0),
      completed: Boolean(nextCompleted),
      completedAt,
      dueDate: String(r.due_date ?? ""),
      assigneeName: String(r.assignee_name ?? ""),
      createdAt: String(r.created_at),
    };
  }

  deleteTask(id: string): { ok: boolean } {
    this.sql.exec("DELETE FROM office_tasks WHERE id = ?", id);
    return { ok: true };
  }

  // ---------- Zeiterfassung ----------

  listTimes(projectId?: string, clientId?: string, fromDay?: string, toDay?: string): OfficeTimeEntry[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (projectId) {
      where.push("t.project_id = ?");
      args.push(projectId);
    }
    if (clientId) {
      where.push("t.client_id = ?");
      args.push(clientId);
    }
    if (fromDay) {
      where.push("t.day >= ?");
      args.push(fromDay);
    }
    if (toDay) {
      where.push("t.day <= ?");
      args.push(toDay);
    }

    const rows = this.sql
      .exec<Row>(
        `SELECT t.*, p.name AS project_name, c.name AS client_name, tk.title AS task_title
           FROM office_times t
           JOIN office_projects p ON p.id = t.project_id
           JOIN office_clients c ON c.id = t.client_id
           LEFT JOIN office_tasks tk ON tk.id = t.task_id
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY t.day DESC, t.created_at DESC`,
        ...args,
      )
      .toArray();

    return rows.map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      projectName: String(r.project_name ?? ""),
      clientId: String(r.client_id),
      clientName: String(r.client_name ?? ""),
      taskId: r.task_id ? String(r.task_id) : null,
      taskTitle: r.task_title ? String(r.task_title) : undefined,
      roleName: String(r.role_name ?? ""),
      userId: String(r.user_id ?? ""),
      userName: String(r.user_name ?? ""),
      day: String(r.day),
      minutes: Number(r.minutes),
      hourlyRateCents: Number(r.hourly_rate_cents ?? 0),
      description: String(r.description ?? ""),
      billable: Boolean(r.billable),
      billedInvoiceId: r.billed_invoice_id ? String(r.billed_invoice_id) : null,
      createdAt: String(r.created_at),
    }));
  }

  saveTime(input: Partial<OfficeTimeEntry>, actor: { id: string; name: string }): OfficeTimeEntry {
    const projectId = input.projectId;
    if (!projectId) throw new OfficeError("projectRequired");
    const minutes = Number(input.minutes);
    if (!minutes || minutes <= 0) throw new OfficeError("durationInvalid");

    const project = this.getProject(projectId);
    if (!project) throw new OfficeError("projectNotFound");

    const client = this.getClient(project.clientId);
    const hourlyRate = Number(input.hourlyRateCents) || project.hourlyRateCents || client?.hourlyRateCents || this.getSettings().defaultHourlyRateCents;

    const id = input.id || crypto.randomUUID();
    const day = input.day || new Date().toISOString().slice(0, 10);
    const billable = input.billable !== undefined ? (input.billable ? 1 : 0) : 1;

    this.sql.exec(
      `INSERT INTO office_times (id, project_id, client_id, user_id, user_name, day, minutes, hourly_rate_cents, description, billable, billed_invoice_id, task_id, role_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         project_id = excluded.project_id,
         client_id = excluded.client_id,
         day = excluded.day,
         minutes = excluded.minutes,
         hourly_rate_cents = excluded.hourly_rate_cents,
         description = excluded.description,
         billable = excluded.billable,
         task_id = excluded.task_id,
         role_name = excluded.role_name`,
      id, projectId, project.clientId, actor.id, actor.name, day, minutes, hourlyRate,
      (input.description ?? "").trim(), billable, input.billedInvoiceId || null,
      input.taskId || null, (input.roleName ?? "").trim(),
    );

    return {
      id,
      projectId,
      projectName: project.name,
      clientId: project.clientId,
      clientName: project.clientName,
      taskId: input.taskId || null,
      roleName: (input.roleName ?? "").trim(),
      userId: actor.id,
      userName: actor.name,
      day,
      minutes,
      hourlyRateCents: hourlyRate,
      description: (input.description ?? "").trim(),
      billable: Boolean(billable),
      billedInvoiceId: input.billedInvoiceId || null,
      createdAt: new Date().toISOString(),
    };
  }

  deleteTime(id: string): { ok: boolean } {
    this.sql.exec("DELETE FROM office_times WHERE id = ?", id);
    return { ok: true };
  }

  getTimesheet(projectId?: string, clientId?: string, fromDay?: string, toDay?: string) {
    const entries = this.listTimes(projectId, clientId, fromDay, toDay);
    const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0);
    const totalFeeCents = entries.reduce((s, e) => s + Math.round((e.minutes * e.hourlyRateCents) / 60), 0);
    const billableEntries = entries.filter((e) => e.billable);
    const billableMinutes = billableEntries.reduce((s, e) => s + e.minutes, 0);
    const billableFeeCents = billableEntries.reduce((s, e) => s + Math.round((e.minutes * e.hourlyRateCents) / 60), 0);

    return { entries, totalMinutes, totalFeeCents, billableMinutes, billableFeeCents };
  }

  // ---------- Auslagen & Reisekosten ----------

  listExpenses(projectId?: string, clientId?: string, fromDay?: string, toDay?: string): OfficeExpense[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (projectId) {
      where.push("e.project_id = ?");
      args.push(projectId);
    }
    if (clientId) {
      where.push("e.client_id = ?");
      args.push(clientId);
    }
    if (fromDay) {
      where.push("e.day >= ?");
      args.push(fromDay);
    }
    if (toDay) {
      where.push("e.day <= ?");
      args.push(toDay);
    }

    const rows = this.sql
      .exec<Row>(
        `SELECT e.*, p.name AS project_name, c.name AS client_name
           FROM office_expenses e
           JOIN office_projects p ON p.id = e.project_id
           JOIN office_clients c ON c.id = e.client_id
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY e.day DESC, e.created_at DESC`,
        ...args,
      )
      .toArray();

    return rows.map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      projectName: String(r.project_name ?? ""),
      clientId: String(r.client_id),
      clientName: String(r.client_name ?? ""),
      title: String(r.title),
      category: String(r.category) as ExpenseCategory,
      day: String(r.day),
      netCents: Number(r.net_cents),
      vatRate: Number(r.vat_rate),
      vatCents: Number(r.vat_cents),
      totalCents: Number(r.total_cents),
      billable: Boolean(r.billable),
      markupPercent: Number(r.markup_percent ?? 0),
      billedInvoiceId: r.billed_invoice_id ? String(r.billed_invoice_id) : null,
      notes: String(r.notes ?? ""),
      createdAt: String(r.created_at),
    }));
  }

  saveExpense(input: Partial<OfficeExpense>): OfficeExpense {
    const title = (input.title ?? "").trim();
    if (!title) throw new OfficeError("expenseTitleRequired");
    const projectId = input.projectId;
    if (!projectId) throw new OfficeError("projectRequired");

    const project = this.getProject(projectId);
    if (!project) throw new OfficeError("projectNotFound");

    const netCents = Number(input.netCents) || 0;
    const vatRate = Number(input.vatRate) || 19;
    const vatCents = Math.round(netCents * (vatRate / 100));
    const totalCents = netCents + vatCents;

    const id = input.id || crypto.randomUUID();
    const isNew = !input.id;
    const now = new Date().toISOString();

    if (isNew) {
      this.sql.exec(
        `INSERT INTO office_expenses (id, project_id, client_id, title, category, day, net_cents, vat_rate, vat_cents, total_cents, billable, markup_percent, billed_invoice_id, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, projectId, project.clientId, title, input.category || "other",
        input.day || now.slice(0, 10), netCents, vatRate, vatCents, totalCents,
        input.billable !== false ? 1 : 0, Number(input.markupPercent) || 0,
        input.billedInvoiceId || null, (input.notes ?? "").trim(), now,
      );
    } else {
      this.sql.exec(
        `UPDATE office_expenses SET project_id = ?, client_id = ?, title = ?, category = ?, day = ?, net_cents = ?, vat_rate = ?, vat_cents = ?, total_cents = ?, billable = ?, markup_percent = ?, billed_invoice_id = ?, notes = ?
         WHERE id = ?`,
        projectId, project.clientId, title, input.category || "other",
        input.day || now.slice(0, 10), netCents, vatRate, vatCents, totalCents,
        input.billable !== false ? 1 : 0, Number(input.markupPercent) || 0,
        input.billedInvoiceId || null, (input.notes ?? "").trim(), id,
      );
    }

    const r = this.sql.exec<Row>("SELECT * FROM office_expenses WHERE id = ?", id).toArray()[0];
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      projectName: project.name,
      clientId: project.clientId,
      clientName: project.clientName,
      title: String(r.title),
      category: String(r.category) as ExpenseCategory,
      day: String(r.day),
      netCents: Number(r.net_cents),
      vatRate: Number(r.vat_rate),
      vatCents: Number(r.vat_cents),
      totalCents: Number(r.total_cents),
      billable: Boolean(r.billable),
      markupPercent: Number(r.markup_percent ?? 0),
      billedInvoiceId: r.billed_invoice_id ? String(r.billed_invoice_id) : null,
      notes: String(r.notes ?? ""),
      createdAt: String(r.created_at),
    };
  }

  deleteExpense(id: string): { ok: boolean } {
    this.sql.exec("DELETE FROM office_expenses WHERE id = ?", id);
    return { ok: true };
  }

  // ---------- Angebote ----------

  listQuotes(status?: string, clientId?: string): OfficeQuote[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (status && status !== "all") {
      where.push("q.status = ?");
      args.push(status);
    }
    if (clientId) {
      where.push("q.client_id = ?");
      args.push(clientId);
    }

    const rows = this.sql
      .exec<Row>(
        `SELECT q.*, c.name AS client_name, p.name AS project_name
           FROM office_quotes q
           JOIN office_clients c ON c.id = q.client_id
           LEFT JOIN office_projects p ON p.id = q.project_id
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY q.year DESC, q.seq DESC`,
        ...args,
      )
      .toArray();

    return rows.map((r) => this.mapQuote(r));
  }

  getQuote(id: string): OfficeQuote | null {
    const r = this.sql
      .exec<Row>(
        `SELECT q.*, c.name AS client_name, p.name AS project_name
           FROM office_quotes q
           JOIN office_clients c ON c.id = q.client_id
           LEFT JOIN office_projects p ON p.id = q.project_id
          WHERE q.id = ?`,
        id,
      )
      .toArray()[0];
    return r ? this.mapQuote(r) : null;
  }

  saveQuote(input: Partial<OfficeQuote>): OfficeQuote {
    const clientId = input.clientId;
    if (!clientId) throw new OfficeError("clientRequired");
    const items = input.items && input.items.length ? input.items : [];
    const discount = Number(input.discountPercent) || 0;
    const totals = computeDocumentTotals(items, discount);
    const settings = this.getSettings();

    const id = input.id || crypto.randomUUID();
    const isNew = !input.id;
    const now = new Date();
    const year = now.getFullYear();
    const nowIso = now.toISOString();

    this.transaction(() => {
      if (isNew) {
        const nextSeq = (this.sql.exec<{ s: number | null }>("SELECT MAX(seq) AS s FROM office_quotes WHERE year = ?", year).one().s ?? 0) + 1;
        const number = `${settings.quotePrefix}-${year}-${String(nextSeq).padStart(3, "0")}`;
        const validUntil = input.validUntil || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
        this.sql.exec(
          `INSERT INTO office_quotes (id, number, year, seq, client_id, project_id, status, title, items, discount_percent, net_cents, vat_cents, total_cents, valid_until, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, number, year, nextSeq, clientId, input.projectId || null,
          (input.status as QuoteStatus) || "draft", (input.title ?? "Angebot").trim(),
          JSON.stringify(items), discount, totals.netCents, totals.vatCents, totals.totalCents,
          validUntil, (input.notes ?? "").trim(), nowIso, nowIso,
        );
      } else {
        this.sql.exec(
          `UPDATE office_quotes SET client_id = ?, project_id = ?, status = ?, title = ?, items = ?, discount_percent = ?, net_cents = ?, vat_cents = ?, total_cents = ?, valid_until = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
          clientId, input.projectId || null, (input.status as QuoteStatus) || "draft",
          (input.title ?? "Angebot").trim(), JSON.stringify(items), discount, totals.netCents, totals.vatCents,
          totals.totalCents, input.validUntil || "", (input.notes ?? "").trim(), nowIso, id,
        );
      }
    });

    return this.getQuote(id)!;
  }

  deleteQuote(id: string): { ok: boolean } {
    this.sql.exec("DELETE FROM office_quotes WHERE id = ?", id);
    return { ok: true };
  }

  convertQuoteToInvoice(quoteId: string): OfficeInvoice {
    const quote = this.getQuote(quoteId);
    if (!quote) throw new OfficeError("quoteNotFound");

    const client = this.getClient(quote.clientId);
    const address = client ? `${client.street}, ${client.postalCode} ${client.city}` : "";

    const invoice = this.saveInvoice({
      clientId: quote.clientId,
      projectId: quote.projectId,
      quoteId: quote.id,
      title: quote.title,
      items: quote.items,
      discountPercent: quote.discountPercent,
      skontoDays: client?.skontoDays || 0,
      skontoPercent: client?.skontoPercent || 0,
      clientAddress: address,
      clientVatId: client?.vatId || "",
      notes: quote.notes,
      dueDate: new Date(Date.now() + (client?.paymentTermsDays || 14) * 86_400_000).toISOString().slice(0, 10),
    });

    this.sql.exec("UPDATE office_quotes SET status = 'accepted', updated_at = datetime('now') WHERE id = ?", quoteId);
    return invoice;
  }

  private mapQuote(r: Row): OfficeQuote {
    return {
      id: String(r.id),
      number: String(r.number),
      year: Number(r.year),
      seq: Number(r.seq),
      clientId: String(r.client_id),
      clientName: String(r.client_name ?? ""),
      projectId: r.project_id ? String(r.project_id) : null,
      projectName: r.project_name ? String(r.project_name) : undefined,
      status: String(r.status) as QuoteStatus,
      title: String(r.title),
      items: JSON.parse(String(r.items || "[]")) as LineItem[],
      discountPercent: Number(r.discount_percent ?? 0),
      netCents: Number(r.net_cents),
      vatCents: Number(r.vat_cents),
      totalCents: Number(r.total_cents),
      validUntil: String(r.valid_until ?? ""),
      notes: String(r.notes ?? ""),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  // ---------- Rechnungen ----------

  listInvoices(status?: string, clientId?: string): OfficeInvoice[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (status && status !== "all") {
      where.push("i.status = ?");
      args.push(status);
    }
    if (clientId) {
      where.push("i.client_id = ?");
      args.push(clientId);
    }

    const rows = this.sql
      .exec<Row>(
        `SELECT i.*, c.name AS client_name, c.street, c.postal_code, c.city, c.vat_id AS client_vat_id, p.name AS project_name
           FROM office_invoices i
           JOIN office_clients c ON c.id = i.client_id
           LEFT JOIN office_projects p ON p.id = i.project_id
          ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY i.year DESC, i.seq DESC`,
        ...args,
      )
      .toArray();

    return rows.map((r) => this.mapInvoice(r));
  }

  getInvoice(id: string): OfficeInvoice | null {
    const r = this.sql
      .exec<Row>(
        `SELECT i.*, c.name AS client_name, c.street, c.postal_code, c.city, c.vat_id AS client_vat_id, p.name AS project_name
           FROM office_invoices i
           JOIN office_clients c ON c.id = i.client_id
           LEFT JOIN office_projects p ON p.id = i.project_id
          WHERE i.id = ?`,
        id,
      )
      .toArray()[0];
    return r ? this.mapInvoice(r) : null;
  }

  saveInvoice(input: Partial<OfficeInvoice>): OfficeInvoice {
    const clientId = input.clientId;
    if (!clientId) throw new OfficeError("clientRequired");
    const items = input.items && input.items.length ? input.items : [];
    const discount = Number(input.discountPercent) || 0;
    const totals = computeDocumentTotals(items, discount);
    const settings = this.getSettings();

    const id = input.id || crypto.randomUUID();
    const isNew = !input.id;
    const now = new Date();
    const year = now.getFullYear();
    const nowIso = now.toISOString();

    this.transaction(() => {
      if (isNew) {
        const nextSeq = (this.sql.exec<{ s: number | null }>("SELECT MAX(seq) AS s FROM office_invoices WHERE year = ?", year).one().s ?? 0) + 1;
        const number = `${settings.invoicePrefix}-${year}-${String(nextSeq).padStart(3, "0")}`;
        const dueDate = input.dueDate || new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
        this.sql.exec(
          `INSERT INTO office_invoices (id, number, year, seq, client_id, project_id, quote_id, status, title, items, discount_percent, skonto_days, skonto_percent, net_cents, vat_cents, total_cents, due_date, issued_at, buyer_reference, dunning_level, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, number, year, nextSeq, clientId, input.projectId || null, input.quoteId || null,
          (input.status as InvoiceStatus) || "draft", (input.title ?? "Rechnung").trim(),
          JSON.stringify(items), discount, Number(input.skontoDays) || 0, Number(input.skontoPercent) || 0,
          totals.netCents, totals.vatCents, totals.totalCents,
          dueDate, input.issuedAt || nowIso, (input.buyerReference ?? settings.buyerReferenceDefault).trim(),
          Number(input.dunningLevel) || 0, (input.notes ?? "").trim(), nowIso, nowIso,
        );
      } else {
        this.sql.exec(
          `UPDATE office_invoices SET client_id = ?, project_id = ?, quote_id = ?, status = ?, title = ?, items = ?, discount_percent = ?, skonto_days = ?, skonto_percent = ?, net_cents = ?, vat_cents = ?, total_cents = ?, due_date = ?, buyer_reference = ?, dunning_level = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
          clientId, input.projectId || null, input.quoteId || null, (input.status as InvoiceStatus) || "draft",
          (input.title ?? "Rechnung").trim(), JSON.stringify(items), discount, Number(input.skontoDays) || 0, Number(input.skontoPercent) || 0,
          totals.netCents, totals.vatCents, totals.totalCents, input.dueDate || "", (input.buyerReference ?? "").trim(),
          Number(input.dunningLevel) || 0, (input.notes ?? "").trim(), nowIso, id,
        );
      }
    });

    return this.getInvoice(id)!;
  }

  markInvoicePaid(id: string, paymentMethod = "Überweisung"): OfficeInvoice {
    const inv = this.getInvoice(id);
    if (!inv) throw new OfficeError("invoiceNotFound");
    const nowIso = new Date().toISOString();
    this.sql.exec(
      "UPDATE office_invoices SET status = 'paid', paid_at = ?, paid_method = ?, updated_at = ? WHERE id = ?",
      nowIso, paymentMethod, nowIso, id,
    );
    return this.getInvoice(id)!;
  }

  deleteInvoice(id: string): { ok: boolean } {
    this.sql.exec("DELETE FROM office_dunning WHERE invoice_id = ?", id);
    this.sql.exec("DELETE FROM office_invoices WHERE id = ?", id);
    return { ok: true };
  }

  private mapInvoice(r: Row): OfficeInvoice {
    return {
      id: String(r.id),
      number: String(r.number),
      year: Number(r.year),
      seq: Number(r.seq),
      clientId: String(r.client_id),
      clientName: String(r.client_name ?? ""),
      clientAddress: `${r.street || ""}, ${r.postal_code || ""} ${r.city || ""}`.trim().replace(/^,\s*|\s*,$/g, ""),
      clientVatId: String(r.client_vat_id ?? ""),
      projectId: r.project_id ? String(r.project_id) : null,
      projectName: r.project_name ? String(r.project_name) : undefined,
      quoteId: r.quote_id ? String(r.quote_id) : null,
      status: String(r.status) as InvoiceStatus,
      title: String(r.title),
      items: JSON.parse(String(r.items || "[]")) as LineItem[],
      discountPercent: Number(r.discount_percent ?? 0),
      skontoDays: Number(r.skonto_days ?? 0),
      skontoPercent: Number(r.skonto_percent ?? 0),
      netCents: Number(r.net_cents),
      vatCents: Number(r.vat_cents),
      totalCents: Number(r.total_cents),
      dueDate: String(r.due_date ?? ""),
      issuedAt: String(r.issued_at),
      paidAt: r.paid_at ? String(r.paid_at) : null,
      paidMethod: r.paid_method ? String(r.paid_method) : null,
      buyerReference: String(r.buyer_reference ?? ""),
      dunningLevel: Number(r.dunning_level ?? 0),
      lastDunningAt: r.last_dunning_at ? String(r.last_dunning_at) : null,
      notes: String(r.notes ?? ""),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  // ---------- Mahnwesen (Dunning) ----------

  listDunning(invoiceId?: string): OfficeDunning[] {
    const where = invoiceId ? "WHERE invoice_id = ?" : "";
    const args = invoiceId ? [invoiceId] : [];
    const rows = this.sql
      .exec<Row>(`SELECT * FROM office_dunning ${where} ORDER BY created_at DESC`, ...args)
      .toArray();

    return rows.map((r) => ({
      id: String(r.id),
      invoiceId: String(r.invoice_id),
      invoiceNumber: String(r.invoice_number),
      level: Number(r.level) as 1 | 2 | 3,
      issuedAt: String(r.issued_at),
      dueDate: String(r.due_date),
      feeCents: Number(r.fee_cents),
      interestCents: Number(r.interest_cents),
      totalAmountCents: Number(r.total_amount_cents),
      notes: String(r.notes ?? ""),
      createdAt: String(r.created_at),
    }));
  }

  createDunning(invoiceId: string, level: 1 | 2 | 3, notes = ""): OfficeDunning {
    const inv = this.getInvoice(invoiceId);
    if (!inv) throw new OfficeError("invoiceNotFound");
    const settings = this.getSettings();

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const dueDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10); // 7 Tage Zahlungsfrist

    let feeCents = 0;
    if (level === 2) feeCents = settings.dunningFeeLevel2Cents;
    if (level === 3) feeCents = settings.dunningFeeLevel3Cents;

    // Verzugszinsen ab Stufe 2 (z.B. 9 Prozentpunkte über Basiszinssatz, pauschal 1% des Betrags)
    const interestCents = level >= 2 ? Math.round(inv.totalCents * 0.01) : 0;
    const totalAmountCents = inv.totalCents + feeCents + interestCents;

    this.transaction(() => {
      this.sql.exec(
        `INSERT INTO office_dunning (id, invoice_id, invoice_number, level, issued_at, due_date, fee_cents, interest_cents, total_amount_cents, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, invoiceId, inv.number, level, nowIso.slice(0, 10), dueDate, feeCents, interestCents, totalAmountCents, notes.trim(), nowIso,
      );
      this.sql.exec(
        "UPDATE office_invoices SET dunning_level = ?, last_dunning_at = ?, status = 'overdue', updated_at = ? WHERE id = ?",
        level, nowIso, nowIso, invoiceId,
      );
    });

    return {
      id,
      invoiceId,
      invoiceNumber: inv.number,
      level,
      issuedAt: nowIso.slice(0, 10),
      dueDate,
      feeCents,
      interestCents,
      totalAmountCents,
      notes: notes.trim(),
      createdAt: nowIso,
    };
  }

  // ---------- Wiederkehrende Rechnungen (Recurring) ----------

  listRecurring(): OfficeRecurring[] {
    const rows = this.sql
      .exec<Row>(
        `SELECT r.*, c.name AS client_name
           FROM office_recurring r
           JOIN office_clients c ON c.id = r.client_id
          ORDER BY r.next_run_day ASC`,
      )
      .toArray();

    return rows.map((r) => ({
      id: String(r.id),
      clientId: String(r.client_id),
      clientName: String(r.client_name ?? ""),
      projectId: r.project_id ? String(r.project_id) : null,
      title: String(r.title),
      items: JSON.parse(String(r.items || "[]")) as LineItem[],
      intervalMonths: Number(r.interval_months ?? 1),
      nextRunDay: String(r.next_run_day),
      active: Boolean(r.active),
      createdAt: String(r.created_at),
    }));
  }

  saveRecurring(input: Partial<OfficeRecurring>): OfficeRecurring {
    const clientId = input.clientId;
    if (!clientId) throw new OfficeError("clientRequired");
    const title = (input.title ?? "").trim();
    if (!title) throw new OfficeError("titleRequired");

    const id = input.id || crypto.randomUUID();
    const isNew = !input.id;
    const now = new Date().toISOString();
    const nextRun = input.nextRunDay || now.slice(0, 10);

    if (isNew) {
      this.sql.exec(
        `INSERT INTO office_recurring (id, client_id, project_id, title, items, interval_months, next_run_day, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, clientId, input.projectId || null, title, JSON.stringify(input.items || []),
        Number(input.intervalMonths) || 1, nextRun, input.active !== false ? 1 : 0, now,
      );
    } else {
      this.sql.exec(
        `UPDATE office_recurring SET client_id = ?, project_id = ?, title = ?, items = ?, interval_months = ?, next_run_day = ?, active = ?
         WHERE id = ?`,
        clientId, input.projectId || null, title, JSON.stringify(input.items || []),
        Number(input.intervalMonths) || 1, nextRun, input.active !== false ? 1 : 0, id,
      );
    }

    const rec = this.listRecurring().find((r) => r.id === id);
    return rec!;
  }

  deleteRecurring(id: string): { ok: boolean } {
    this.sql.exec("DELETE FROM office_recurring WHERE id = ?", id);
    return { ok: true };
  }

  triggerRecurring(id: string): OfficeInvoice {
    const rec = this.listRecurring().find((r) => r.id === id);
    if (!rec) throw new OfficeError("recurringNotFound");

    const client = this.getClient(rec.clientId);
    const invoice = this.saveInvoice({
      clientId: rec.clientId,
      projectId: rec.projectId,
      title: rec.title,
      items: rec.items,
      skontoDays: client?.skontoDays || 0,
      skontoPercent: client?.skontoPercent || 0,
      dueDate: new Date(Date.now() + (client?.paymentTermsDays || 14) * 86_400_000).toISOString().slice(0, 10),
    });

    // Advance next_run_day by intervalMonths
    const [y, m, d] = rec.nextRunDay.split("-").map(Number);
    const nextDate = new Date(y, (m - 1) + rec.intervalMonths, d);
    const nextRunStr = nextDate.toISOString().slice(0, 10);
    this.sql.exec("UPDATE office_recurring SET next_run_day = ? WHERE id = ?", nextRunStr, id);

    return invoice;
  }

  // ---------- DATEV Export ----------

  exportDatevCsv(): string {
    const invoices = this.listInvoices();
    const rows = [
      ["Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "Konto", "Gegenkonto", "Belegdatum", "Belegfeld 1", "Buchungstext", "Festschreibung"].join(";"),
    ];

    for (const inv of invoices) {
      if (inv.status === "canceled") continue;
      const amountEur = (inv.totalCents / 100).toFixed(2).replace(".", ",");
      const dateFormatted = inv.issuedAt.slice(0, 10).replace(/-/g, "");
      const beleg = inv.number;
      const text = `${inv.clientName} - ${inv.title}`.slice(0, 60);

      // Standardkontenrahmen SKR03/SKR04: Erlöskonto 8400 (19% USt) gegen Debitor 10000
      rows.push([
        amountEur,
        "S",
        "10000",
        "8400",
        dateFormatted,
        `"${beleg}"`,
        `"${text.replace(/"/g, '""')}"`,
        "0",
      ].join(";"));
    }

    return rows.join("\r\n");
  }
}
