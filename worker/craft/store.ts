import type {
  CraftMeasurement,
  CraftProject,
  CraftProjectStatus,
  CraftReport,
  CraftReportItem,
  CraftReportStatus,
  CraftSiteDiaryEntry,
  CraftStats,
  CraftTrade,
} from "../../shared/craft";

export class CraftError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const CRAFT_MIGRATIONS: string[] = [
  `CREATE TABLE craft_projects (
     id TEXT PRIMARY KEY,
     project_number TEXT NOT NULL UNIQUE,
     title TEXT NOT NULL,
     trade TEXT NOT NULL DEFAULT 'Allgemein',
     customer_name TEXT NOT NULL,
     customer_phone TEXT NOT NULL DEFAULT '',
     customer_email TEXT NOT NULL DEFAULT '',
     site_address TEXT NOT NULL,
     site_city TEXT NOT NULL DEFAULT '',
     start_date TEXT NOT NULL,
     target_date TEXT,
     status TEXT NOT NULL DEFAULT 'in_arbeit',
     budget_gross REAL NOT NULL DEFAULT 0,
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX craft_projects_status ON craft_projects(status);
   CREATE INDEX craft_projects_customer ON craft_projects(customer_name);

   CREATE TABLE craft_measurements (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     room_name TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT 'Fläche',
     formula TEXT NOT NULL DEFAULT '',
     result REAL NOT NULL DEFAULT 0,
     unit TEXT NOT NULL DEFAULT 'm²',
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX craft_measurements_project ON craft_measurements(project_id);

   CREATE TABLE craft_reports (
     id TEXT PRIMARY KEY,
     report_number TEXT NOT NULL UNIQUE,
     project_id TEXT NOT NULL,
     project_title TEXT NOT NULL,
     customer_name TEXT NOT NULL,
     site_address TEXT NOT NULL,
     date TEXT NOT NULL,
     worker_name TEXT NOT NULL,
     hours_worked REAL NOT NULL DEFAULT 0,
     travel_km REAL NOT NULL DEFAULT 0,
     items_json TEXT NOT NULL DEFAULT '[]',
     work_description TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'entwurf',
     signature_data_url TEXT,
     signed_by_name TEXT,
     signed_at TEXT,
     total_wage_net REAL NOT NULL DEFAULT 0,
     total_material_net REAL NOT NULL DEFAULT 0,
     total_tax REAL NOT NULL DEFAULT 0,
     total_gross REAL NOT NULL DEFAULT 0,
     payment_method TEXT,
     payment_status TEXT NOT NULL DEFAULT 'offen',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX craft_reports_project ON craft_reports(project_id);
   CREATE INDEX craft_reports_status ON craft_reports(status);

   CREATE TABLE craft_site_diary (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     date TEXT NOT NULL,
     author TEXT NOT NULL,
     weather TEXT NOT NULL DEFAULT 'Sonnig',
     temperature_celsius REAL NOT NULL DEFAULT 18,
     trades_json TEXT NOT NULL DEFAULT '[]',
     activities_summary TEXT NOT NULL,
     issues_or_delays TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
   );
   CREATE INDEX craft_site_diary_project ON craft_site_diary(project_id);`,
];

export class CraftStore {
  constructor(private sql: SqlStorage) {
    this.ensureSeedData();
  }

  private ensureSeedData() {
    const existing = this.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM craft_projects").toArray();
    if (existing[0]?.count > 0) return;

    // Beispieldaten für Handwerksbetrieb
    const p1: CraftProject = {
      id: "proj-1",
      projectNumber: "BV-2026-01",
      title: "Neubau EFH Millerntor – Elektroinstallation",
      trade: "Elektro",
      customerName: "Dr. Thomas Bergmann",
      customerPhone: "+49 40 4567890",
      customerEmail: "t.bergmann@hamburg-mail.de",
      siteAddress: "Millerntorplatz 14",
      siteCity: "20359 Hamburg",
      startDate: new Date(Date.now() - 86400000 * 7).toISOString().slice(0, 10),
      targetDate: new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10),
      status: "in_arbeit",
      budgetGross: 14500,
      notes: "Zählerkasten nach TAB 2023, CAT7-Netzwerkverkabelung in allen Wohnräumen.",
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    };

    const p2: CraftProject = {
      id: "proj-2",
      projectNumber: "BV-2026-02",
      title: "Altbausanierung Bad & Fußbodenheizung",
      trade: "Sanitär & Heizung",
      customerName: "Sabine & Marc Wagner",
      customerPhone: "+49 40 7654321",
      customerEmail: "wagner.altbau@outlook.de",
      siteAddress: "Eppendorfer Landstraße 78",
      siteCity: "20249 Hamburg",
      startDate: new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10),
      targetDate: new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10),
      status: "abnahmebereit",
      budgetGross: 8900,
      notes: "Walk-In Dusche mit Unterputzthermostat, Vorwandelement Geberit Duofix.",
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    };

    const p3: CraftProject = {
      id: "proj-3",
      projectNumber: "BV-2026-03",
      title: "Kanzleiräume Malerarbeiten & Akustikputz",
      trade: "Maler & Lackierer",
      customerName: "Rechtsanwälte Alsterkanzlei",
      customerPhone: "+49 40 334455",
      customerEmail: "empfang@alster-recht.de",
      siteAddress: "Neuer Wall 42",
      siteCity: "20354 Hamburg",
      startDate: new Date().toISOString().slice(0, 10),
      status: "geplant",
      budgetGross: 5600,
      notes: "Vliestapete & Schimmelsanierung Besprechungsraum.",
      createdAt: new Date().toISOString(),
    };

    this.saveProject(p1);
    this.saveProject(p2);
    this.saveProject(p3);

    // Aufmaße für p1 & p2
    this.saveMeasurement({
      id: "m-1",
      projectId: "proj-1",
      roomName: "Wohnzimmer EG",
      category: "Fläche",
      formula: "6.40 * 4.20",
      result: 26.88,
      unit: "m²",
      notes: "Kabeltrasse Decke + 8 Deckenspots",
      createdAt: new Date().toISOString(),
    });

    this.saveMeasurement({
      id: "m-2",
      projectId: "proj-1",
      roomName: "Küche EG",
      category: "Länge / Umfang",
      formula: "2 * (3.80 + 2.90)",
      result: 13.4,
      unit: "m",
      notes: "LED-Lichtband Arbeitsplatte",
      createdAt: new Date().toISOString(),
    });

    this.saveMeasurement({
      id: "m-3",
      projectId: "proj-2",
      roomName: "Hauptbad 1. OG",
      category: "Fläche",
      formula: "3.50 * 2.80",
      result: 9.8,
      unit: "m²",
      notes: "Fliesenfläche Boden & Duschtasse",
      createdAt: new Date().toISOString(),
    });

    // Fertiger Rapportzettel mit Unterschrift für p2
    const itemsP2: CraftReportItem[] = [
      {
        id: "item-1",
        type: "lohn",
        name: "Monteurstunden Sanitärinstallation (Meister)",
        quantity: 8.5,
        unit: "Std.",
        unitPriceNet: 75.0,
        totalNet: 637.5,
        taxRate: 19,
      },
      {
        id: "item-2",
        type: "lohn",
        name: "Gesellenstunden Rohrleitungsbau",
        quantity: 8.5,
        unit: "Std.",
        unitPriceNet: 58.0,
        totalNet: 493.0,
        taxRate: 19,
      },
      {
        id: "item-3",
        type: "fahrt",
        name: "Anfahrt Baustelle & Rüstzeit",
        quantity: 24,
        unit: "km",
        unitPriceNet: 1.8,
        totalNet: 43.2,
        taxRate: 19,
      },
      {
        id: "item-4",
        type: "material",
        name: "Geberit Duofix Vorwandelement & Drückerplatte",
        quantity: 1,
        unit: "Stk.",
        unitPriceNet: 310.0,
        totalNet: 310.0,
        taxRate: 19,
      },
      {
        id: "item-5",
        type: "material",
        name: "Verbundrohr 20x2mm & Pressfittinge",
        quantity: 25,
        unit: "m",
        unitPriceNet: 4.8,
        totalNet: 120.0,
        taxRate: 19,
      },
    ];

    this.createReport({
      projectId: "proj-2",
      date: new Date().toISOString().slice(0, 10),
      workerName: "Markus Krause (SHK-Meister)",
      hoursWorked: 17,
      travelKm: 24,
      workDescription: "Wasserleitungen abgedrückt, Vorwandelement gesetzt und Dichtheitsprüfung nach DIN EN 806 erfolgreich durchgeführt.",
      items: itemsP2,
    });
  }

  // ---------- STATS ----------
  getStats(): CraftStats {
    const projects = this.listProjects();
    const reports = this.listReports();

    const activeProjectsCount = projects.filter((p) => p.status === "in_arbeit" || p.status === "abnahmebereit").length;
    const pendingSignaturesCount = reports.filter((r) => r.status === "entwurf").length;
    const openReportsCount = reports.filter((r) => r.status === "unterschrieben" && r.paymentStatus === "offen").length;

    const totalWageHoursMonth = reports.reduce((sum, r) => sum + r.hoursWorked, 0);
    const revenueThisMonthGross = reports.reduce((sum, r) => sum + r.totalGross, 0);

    return {
      activeProjectsCount,
      totalProjectsCount: projects.length,
      pendingSignaturesCount,
      openReportsCount,
      totalWageHoursMonth: Math.round(totalWageHoursMonth * 10) / 10,
      revenueThisMonthGross: Math.round(revenueThisMonthGross * 100) / 100,
    };
  }

  // ---------- PROJECTS (BAUSTELLEN) ----------
  listProjects(): CraftProject[] {
    const rows = this.sql
      .exec<{
        id: string;
        project_number: string;
        title: string;
        trade: string;
        customer_name: string;
        customer_phone: string;
        customer_email: string;
        site_address: string;
        site_city: string;
        start_date: string;
        target_date: string | null;
        status: string;
        budget_gross: number;
        notes: string;
        created_at: string;
      }>("SELECT * FROM craft_projects ORDER BY created_at DESC")
      .toArray();

    return rows.map((r) => ({
      id: r.id,
      projectNumber: r.project_number,
      title: r.title,
      trade: r.trade as CraftTrade,
      customerName: r.customer_name,
      customerPhone: r.customer_phone || undefined,
      customerEmail: r.customer_email || undefined,
      siteAddress: r.site_address,
      siteCity: r.site_city,
      startDate: r.start_date,
      targetDate: r.target_date || undefined,
      status: r.status as CraftProjectStatus,
      budgetGross: r.budget_gross || 0,
      notes: r.notes || "",
      createdAt: r.created_at,
    }));
  }

  getProject(id: string): CraftProject {
    const rows = this.sql
      .exec<{
        id: string;
        project_number: string;
        title: string;
        trade: string;
        customer_name: string;
        customer_phone: string;
        customer_email: string;
        site_address: string;
        site_city: string;
        start_date: string;
        target_date: string | null;
        status: string;
        budget_gross: number;
        notes: string;
        created_at: string;
      }>("SELECT * FROM craft_projects WHERE id = ?", id)
      .toArray();

    if (!rows.length) throw new CraftError("projectNotFound");
    const r = rows[0];
    return {
      id: r.id,
      projectNumber: r.project_number,
      title: r.title,
      trade: r.trade as CraftTrade,
      customerName: r.customer_name,
      customerPhone: r.customer_phone || undefined,
      customerEmail: r.customer_email || undefined,
      siteAddress: r.site_address,
      siteCity: r.site_city,
      startDate: r.start_date,
      targetDate: r.target_date || undefined,
      status: r.status as CraftProjectStatus,
      budgetGross: r.budget_gross || 0,
      notes: r.notes || "",
      createdAt: r.created_at,
    };
  }

  saveProject(project: Partial<CraftProject> & { title: string; customerName: string; siteAddress: string }): CraftProject {
    const id = project.id || "proj-" + Math.random().toString(36).slice(2, 9);
    const existing = this.sql.exec<{ project_number: string }>("SELECT project_number FROM craft_projects WHERE id = ?", id).toArray();

    let projectNumber = project.projectNumber;
    if (!projectNumber && existing.length > 0) {
      projectNumber = existing[0].project_number;
    } else if (!projectNumber) {
      const year = new Date().getFullYear();
      const count = this.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM craft_projects").toArray()[0]?.count || 0;
      projectNumber = `BV-${year}-${String(count + 1).padStart(2, "0")}`;
    }

    const trade = project.trade || "Allgemein";
    const status = project.status || "in_arbeit";
    const startDate = project.startDate || new Date().toISOString().slice(0, 10);

    this.sql.exec(
      `INSERT INTO craft_projects (
         id, project_number, title, trade, customer_name, customer_phone, customer_email,
         site_address, site_city, start_date, target_date, status, budget_gross, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         trade = excluded.trade,
         customer_name = excluded.customer_name,
         customer_phone = excluded.customer_phone,
         customer_email = excluded.customer_email,
         site_address = excluded.site_address,
         site_city = excluded.site_city,
         start_date = excluded.start_date,
         target_date = excluded.target_date,
         status = excluded.status,
         budget_gross = excluded.budget_gross,
         notes = excluded.notes`,
      id,
      projectNumber,
      project.title,
      trade,
      project.customerName,
      project.customerPhone || "",
      project.customerEmail || "",
      project.siteAddress,
      project.siteCity || "",
      startDate,
      project.targetDate || null,
      status,
      project.budgetGross || 0,
      project.notes || ""
    );

    return this.getProject(id);
  }

  deleteProject(id: string): { success: boolean } {
    this.sql.exec("DELETE FROM craft_measurements WHERE project_id = ?", id);
    this.sql.exec("DELETE FROM craft_reports WHERE project_id = ?", id);
    this.sql.exec("DELETE FROM craft_site_diary WHERE project_id = ?", id);
    this.sql.exec("DELETE FROM craft_projects WHERE id = ?", id);
    return { success: true };
  }

  // ---------- MEASUREMENTS (AUFMAß) ----------
  listMeasurements(projectId?: string): CraftMeasurement[] {
    const query = projectId
      ? "SELECT * FROM craft_measurements WHERE project_id = ? ORDER BY created_at DESC"
      : "SELECT * FROM craft_measurements ORDER BY created_at DESC";

    const rows = projectId
      ? this.sql.exec<{
          id: string;
          project_id: string;
          room_name: string;
          category: string;
          formula: string;
          result: number;
          unit: string;
          notes: string;
          created_at: string;
        }>(query, projectId).toArray()
      : this.sql.exec<{
          id: string;
          project_id: string;
          room_name: string;
          category: string;
          formula: string;
          result: number;
          unit: string;
          notes: string;
          created_at: string;
        }>(query).toArray();

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      roomName: r.room_name,
      category: r.category as any,
      formula: r.formula,
      result: r.result,
      unit: r.unit as any,
      notes: r.notes || "",
      createdAt: r.created_at,
    }));
  }

  saveMeasurement(m: Partial<CraftMeasurement> & { projectId: string; roomName: string }): CraftMeasurement {
    const id = m.id || "m-" + Math.random().toString(36).slice(2, 9);
    const category = m.category || "Fläche";
    const formula = m.formula || "";
    let result = m.result || 0;

    // Einfache sichere Auswertung für L x B Formeln
    if (formula && !m.result) {
      try {
        const sanitized = formula.replace(/[^\d.+*\- /()]/g, "");
        result = Math.round(Function(`'use strict'; return (${sanitized})`)() * 100) / 100;
      } catch {
        result = 0;
      }
    }

    const unit = m.unit || (category === "Fläche" ? "m²" : category === "Länge / Umfang" ? "m" : category === "Volumen" ? "m³" : "stk");

    this.sql.exec(
      `INSERT INTO craft_measurements (id, project_id, room_name, category, formula, result, unit, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         room_name = excluded.room_name,
         category = excluded.category,
         formula = excluded.formula,
         result = excluded.result,
         unit = excluded.unit,
         notes = excluded.notes`,
      id,
      m.projectId,
      m.roomName,
      category,
      formula,
      result,
      unit,
      m.notes || ""
    );

    const rows = this.sql.exec<any>("SELECT * FROM craft_measurements WHERE id = ?", id).toArray();
    const r = rows[0];
    return {
      id: r.id,
      projectId: r.project_id,
      roomName: r.room_name,
      category: r.category,
      formula: r.formula,
      result: r.result,
      unit: r.unit,
      notes: r.notes || "",
      createdAt: r.created_at,
    };
  }

  deleteMeasurement(id: string): { success: boolean } {
    this.sql.exec("DELETE FROM craft_measurements WHERE id = ?", id);
    return { success: true };
  }

  // ---------- REPORTS (ARBEITSBERICHTE & RAPPORTZETTEL) ----------
  listReports(projectId?: string): CraftReport[] {
    const query = projectId
      ? "SELECT * FROM craft_reports WHERE project_id = ? ORDER BY date DESC, created_at DESC"
      : "SELECT * FROM craft_reports ORDER BY date DESC, created_at DESC";

    const rows = projectId
      ? this.sql.exec<any>(query, projectId).toArray()
      : this.sql.exec<any>(query).toArray();

    return rows.map(this.mapReport);
  }

  getReport(id: string): CraftReport {
    const rows = this.sql.exec<any>("SELECT * FROM craft_reports WHERE id = ?", id).toArray();
    if (!rows.length) throw new CraftError("reportNotFound");
    return this.mapReport(rows[0]);
  }

  createReport(data: {
    projectId: string;
    date: string;
    workerName: string;
    hoursWorked: number;
    travelKm?: number;
    workDescription: string;
    items?: CraftReportItem[];
  }): CraftReport {
    const project = this.getProject(data.projectId);
    const id = "rep-" + Math.random().toString(36).slice(2, 9);

    const count = this.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM craft_reports").toArray()[0]?.count || 0;
    const reportNumber = `RAP-${100 + count + 1}`;

    const items: CraftReportItem[] = data.items || [];
    // Falls keine Items übergeben wurden, mindestens Lohnposition generieren
    if (items.length === 0 && data.hoursWorked > 0) {
      items.push({
        id: "item-" + Math.random().toString(36).slice(2, 9),
        type: "lohn",
        name: `Arbeitszeit vor Ort (${data.workerName})`,
        quantity: data.hoursWorked,
        unit: "Std.",
        unitPriceNet: 65.0,
        totalNet: Math.round(data.hoursWorked * 65.0 * 100) / 100,
        taxRate: 19,
      });
    }

    if (data.travelKm && data.travelKm > 0 && !items.some((i) => i.type === "fahrt")) {
      items.push({
        id: "item-" + Math.random().toString(36).slice(2, 9),
        type: "fahrt",
        name: "An- und Abfahrt zur Baustelle",
        quantity: data.travelKm,
        unit: "km",
        unitPriceNet: 1.5,
        totalNet: Math.round(data.travelKm * 1.5 * 100) / 100,
        taxRate: 19,
      });
    }

    // Split § 35a: Lohnkosten (Lohn + Fahrt) vs Materialkosten
    let totalWageNet = 0;
    let totalMaterialNet = 0;

    for (const item of items) {
      if (item.type === "lohn" || item.type === "fahrt") {
        totalWageNet += item.totalNet;
      } else {
        totalMaterialNet += item.totalNet;
      }
    }

    const totalNet = totalWageNet + totalMaterialNet;
    const totalTax = Math.round(totalNet * 0.19 * 100) / 100;
    const totalGross = Math.round((totalNet + totalTax) * 100) / 100;

    this.sql.exec(
      `INSERT INTO craft_reports (
         id, report_number, project_id, project_title, customer_name, site_address,
         date, worker_name, hours_worked, travel_km, items_json, work_description,
         status, total_wage_net, total_material_net, total_tax, total_gross, payment_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      reportNumber,
      project.id,
      project.title,
      project.customerName,
      project.siteAddress,
      data.date,
      data.workerName,
      data.hoursWorked,
      data.travelKm || 0,
      JSON.stringify(items),
      data.workDescription,
      "entwurf",
      totalWageNet,
      totalMaterialNet,
      totalTax,
      totalGross,
      "offen"
    );

    return this.getReport(id);
  }

  signReport(id: string, signatureDataUrl: string, signedByName: string): CraftReport {
    const report = this.getReport(id);
    const signedAt = new Date().toISOString();

    this.sql.exec(
      `UPDATE craft_reports
       SET status = 'unterschrieben', signature_data_url = ?, signed_by_name = ?, signed_at = ?
       WHERE id = ?`,
      signatureDataUrl,
      signedByName,
      signedAt,
      id
    );

    return this.getReport(id);
  }

  checkoutReport(id: string, paymentMethod: "bar" | "karte" | "rechnung" | "pos"): CraftReport {
    const report = this.getReport(id);

    this.sql.exec(
      `UPDATE craft_reports
       SET status = 'abgerechnet', payment_method = ?, payment_status = 'bezahlt'
       WHERE id = ?`,
      paymentMethod,
      id
    );

    return this.getReport(id);
  }

  deleteReport(id: string): { success: boolean } {
    this.sql.exec("DELETE FROM craft_reports WHERE id = ?", id);
    return { success: true };
  }

  // ---------- SITE DIARY (BAUTAGEBUCH) ----------
  listSiteDiary(projectId?: string): CraftSiteDiaryEntry[] {
    const query = projectId
      ? "SELECT * FROM craft_site_diary WHERE project_id = ? ORDER BY date DESC, created_at DESC"
      : "SELECT * FROM craft_site_diary ORDER BY date DESC, created_at DESC";

    const rows = projectId
      ? this.sql.exec<any>(query, projectId).toArray()
      : this.sql.exec<any>(query).toArray();

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      date: r.date,
      author: r.author,
      weather: r.weather,
      temperatureCelsius: r.temperature_celsius,
      tradesPresent: JSON.parse(r.trades_json || "[]"),
      activitiesSummary: r.activities_summary,
      issuesOrDelays: r.issues_or_delays || "",
      createdAt: r.created_at,
    }));
  }

  saveSiteDiaryEntry(entry: Partial<CraftSiteDiaryEntry> & { projectId: string; author: string; activitiesSummary: string }): CraftSiteDiaryEntry {
    const id = entry.id || "diary-" + Math.random().toString(36).slice(2, 9);
    const date = entry.date || new Date().toISOString().slice(0, 10);
    const weather = entry.weather || "Sonnig";
    const temperatureCelsius = entry.temperatureCelsius || 18;
    const tradesJson = JSON.stringify(entry.tradesPresent || []);

    this.sql.exec(
      `INSERT INTO craft_site_diary (id, project_id, date, author, weather, temperature_celsius, trades_json, activities_summary, issues_or_delays)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         author = excluded.author,
         weather = excluded.weather,
         temperature_celsius = excluded.temperature_celsius,
         trades_json = excluded.trades_json,
         activities_summary = excluded.activities_summary,
         issues_or_delays = excluded.issues_or_delays`,
      id,
      entry.projectId,
      date,
      entry.author,
      weather,
      temperatureCelsius,
      tradesJson,
      entry.activitiesSummary,
      entry.issuesOrDelays || ""
    );

    const rows = this.sql.exec<any>("SELECT * FROM craft_site_diary WHERE id = ?", id).toArray();
    const r = rows[0];
    return {
      id: r.id,
      projectId: r.project_id,
      date: r.date,
      author: r.author,
      weather: r.weather,
      temperatureCelsius: r.temperature_celsius,
      tradesPresent: JSON.parse(r.trades_json || "[]"),
      activitiesSummary: r.activities_summary,
      issuesOrDelays: r.issues_or_delays || "",
      createdAt: r.created_at,
    };
  }

  private mapReport(r: any): CraftReport {
    return {
      id: r.id,
      reportNumber: r.report_number,
      projectId: r.project_id,
      projectTitle: r.project_title,
      customerName: r.customer_name,
      siteAddress: r.site_address,
      date: r.date,
      workerName: r.worker_name,
      hoursWorked: r.hours_worked,
      travelKm: r.travel_km || undefined,
      items: JSON.parse(r.items_json || "[]"),
      workDescription: r.work_description || "",
      status: r.status as CraftReportStatus,
      signatureDataUrl: r.signature_data_url || undefined,
      signedByName: r.signed_by_name || undefined,
      signedAt: r.signed_at || undefined,
      totalWageNet: r.total_wage_net,
      totalMaterialNet: r.total_material_net,
      totalTax: r.total_tax,
      totalGross: r.total_gross,
      paymentMethod: r.payment_method || undefined,
      paymentStatus: r.payment_status || "offen",
      createdAt: r.created_at,
    };
  }
}
