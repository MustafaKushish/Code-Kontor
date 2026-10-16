import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  computeDocumentTotals,
  computeLineTotal,
  formatMinutes,
  DEFAULT_OFFICE_SETTINGS,
} from "../shared/office";
import { OFFICE_MIGRATIONS, OfficeError, OfficeStore } from "../worker/office/store";

describe("Büro & Dienstleister: Rechnen", () => {
  it("berechnet Positions- und Gesamtsummen mit MwSt.", () => {
    expect(computeLineTotal(2, 4500)).toBe(9000);

    const items = [
      { id: "1", title: "Beratung", description: "", qty: 2, unit: "Std", unitCents: 10000, vatRate: 19, totalCents: 20000 },
      { id: "2", title: "Hosting", description: "", qty: 1, unit: "Monat", unitCents: 5000, vatRate: 19, totalCents: 5000 },
    ];
    const totals = computeDocumentTotals(items);
    expect(totals.netCents).toBe(25000);
    expect(totals.vatCents).toBe(4750);
    expect(totals.totalCents).toBe(29750);
  });

  it("formatiert Minuten in Stunden und Minuten", () => {
    expect(formatMinutes(45)).toBe("45 Min");
    expect(formatMinutes(60)).toBe("1 Std");
    expect(formatMinutes(90)).toBe("1 Std 30 Min");
    expect(formatMinutes(150)).toBe("2 Std 30 Min");
  });
});

function createMemoryStore() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
  for (const mig of OFFICE_MIGRATIONS) {
    db.exec(mig);
  }

  const sql = {
    exec(query: string, ...params: (string | number | null)[]) {
      const stmt = db.prepare(query);
      if (/^\s*(SELECT|WITH)/i.test(query)) {
        const rows = stmt.all(...params) as Record<string, unknown>[];
        return {
          toArray: () => rows,
          one: () => rows[0] ?? {},
          raw: () => rows.map((r) => Object.values(r)),
        };
      }
      const res = stmt.run(...params);
      return {
        rowsWritten: Number(res.changes),
        toArray: () => [],
        one: () => ({}),
        raw: () => [],
      };
    },
  } as unknown as SqlStorage;

  const transaction = <T>(fn: () => T): T => fn();
  return new OfficeStore(sql, transaction);
}

describe("Büro & Dienstleister: Store Integration", () => {
  it("verwaltet Kunden, Projekte und Zeiterfassung", () => {
    const store = createMemoryStore();

    // 1. Kunde anlegen
    const client = store.saveClient({
      name: "Acme Corp",
      email: "info@acme.com",
      contactPerson: "Alice Smith",
      hourlyRateCents: 12000,
    });
    expect(client.name).toBe("Acme Corp");
    expect(client.number).toBe(10001);

    // 2. Projekt anlegen
    const project = store.saveProject({
      clientId: client.id,
      name: "Website Relaunch",
      budgetCents: 500000,
      hourlyRateCents: 12000,
    });
    expect(project.name).toBe("Website Relaunch");
    expect(project.clientName).toBe("Acme Corp");

    // 3. Zeit erfassen
    const time = store.saveTime(
      {
        projectId: project.id,
        minutes: 120, // 2 Std
        description: "Initiales Setup",
        billable: true,
      },
      { id: "user-1", name: "Max Mustermann" },
    );
    expect(time.minutes).toBe(120);
    expect(time.hourlyRateCents).toBe(12000);

    // 4. Prüfen ob Projekt-Summen aktualisiert wurden
    const updatedProj = store.getProject(project.id)!;
    expect(updatedProj.totalMinutesLogged).toBe(120);
    expect(updatedProj.totalLoggedCents).toBe(24000); // 2h * 120€ = 240€
  });

  it("erstellt Angebote und wandelt sie in Rechnungen um", () => {
    const store = createMemoryStore();

    const client = store.saveClient({
      name: "Musterfirma GmbH",
      street: "Hauptstr. 1",
      city: "Berlin",
      postalCode: "10115",
    });

    const quote = store.saveQuote({
      clientId: client.id,
      title: "Beratungsleistung",
      items: [
        {
          id: "1",
          title: "Senior Consulting",
          description: "Strategische Beratung",
          qty: 10,
          unit: "Std",
          unitCents: 10000,
          vatRate: 19,
          totalCents: 100000,
        },
      ],
    });

    expect(quote.netCents).toBe(100000);
    expect(quote.vatCents).toBe(19000);
    expect(quote.totalCents).toBe(119000);
    expect(quote.number).toMatch(/^ANG-\d{4}-001$/);

    // Umwandeln in Rechnung
    const invoice = store.convertQuoteToInvoice(quote.id);
    expect(invoice.number).toMatch(/^RE-\d{4}-001$/);
    expect(invoice.totalCents).toBe(119000);
    expect(invoice.clientAddress).toContain("Berlin");

    // Ursprüngliches Angebot muss als accepted markiert sein
    const updatedQuote = store.getQuote(quote.id)!;
    expect(updatedQuote.status).toBe("accepted");

    // Rechnung als bezahlt markieren
    const paidInvoice = store.markInvoicePaid(invoice.id, "Überweisung");
    expect(paidInvoice.status).toBe("paid");
    expect(paidInvoice.paidMethod).toBe("Überweisung");

    // DATEV-Export prüfen
    const datev = store.exportDatevCsv();
    expect(datev).toContain("1190,00");
    expect(datev).toContain("8400");
    expect(datev).toContain(invoice.number);
  });

  it("verwaltet Aufgaben & Meilensteine in Projekten", () => {
    const store = createMemoryStore();
    const client = store.saveClient({ name: "Tech Ventures AG" });
    const project = store.saveProject({ clientId: client.id, name: "ERP Migration" });

    const task1 = store.saveTask({
      projectId: project.id,
      title: "Datenbank-Schema entwerfen",
      estimatedMinutes: 240, // 4 Std
      assigneeName: "Dev Lead",
    });
    const task2 = store.saveTask({
      projectId: project.id,
      title: "Import-Skripte testen",
      estimatedMinutes: 180, // 3 Std
    });

    const tasks = store.listTasks(project.id);
    expect(tasks.length).toBe(2);
    expect(tasks[0].completed).toBe(false);

    // Toggle Task 1
    const toggled = store.toggleTask(task1.id);
    expect(toggled.completed).toBe(true);
    expect(toggled.completedAt).toBeDefined();

    // Project tasksCount
    const p = store.getProject(project.id)!;
    expect(p.tasksCount).toBe(2);
    expect(p.tasksCompleted).toBe(1);
  });

  it("erfasst Auslagen und berechnet Spesen weiter", () => {
    const store = createMemoryStore();
    const client = store.saveClient({ name: "Agentur Kunde" });
    const project = store.saveProject({ clientId: client.id, name: "Messeauftritt" });

    const expense = store.saveExpense({
      projectId: project.id,
      title: "Bahnfahrt München - Hamburg",
      category: "travel",
      netCents: 15000, // 150,00 €
      vatRate: 19,
      markupPercent: 10, // 10% Weiterberechnungs-Aufschlag
      billable: true,
    });

    expect(expense.vatCents).toBe(2850);
    expect(expense.totalCents).toBe(17850);

    const list = store.listExpenses(project.id);
    expect(list.length).toBe(1);
    expect(list[0].category).toBe("travel");
  });

  it("führt das Mahnwesen mit Mahnstufen und Gebühren durch", () => {
    const store = createMemoryStore();
    const client = store.saveClient({ name: "Säumiger Kunde", street: "Allee 5", city: "Köln" });
    const invoice = store.saveInvoice({
      clientId: client.id,
      title: "Beratungsrechnung",
      status: "sent",
      dueDate: "2026-01-01",
      items: [
        { id: "1", title: "Audit", description: "", qty: 1, unit: "Pauschal", unitCents: 200000, vatRate: 19, totalCents: 200000 },
      ],
    });

    // Mahnstufe 1 (Zahlungserinnerung, keine Gebühr)
    const dunning1 = store.createDunning(invoice.id, 1, "Freundliche Erinnerung");
    expect(dunning1.level).toBe(1);
    expect(dunning1.feeCents).toBe(0);

    let inv = store.getInvoice(invoice.id)!;
    expect(inv.dunningLevel).toBe(1);

    // Mahnstufe 2 (1. Mahnung mit 5,00 € Gebühr + Verzugszins)
    const dunning2 = store.createDunning(invoice.id, 2, "1. Mahnung");
    expect(dunning2.level).toBe(2);
    expect(dunning2.feeCents).toBe(500); // 5 €
    expect(dunning2.interestCents).toBeGreaterThan(0);

    inv = store.getInvoice(invoice.id)!;
    expect(inv.dunningLevel).toBe(2);
    expect(inv.status).toBe("overdue");
  });

  it("verwaltet Daueraufträge und generiert periodische Rechnungen", () => {
    const store = createMemoryStore();
    const client = store.saveClient({ name: "Abo Kunde GmbH" });

    const recurring = store.saveRecurring({
      clientId: client.id,
      title: "Monatlicher Support & Cloud-Wartung",
      intervalMonths: 1,
      nextRunDay: "2026-11-01",
      items: [
        { id: "1", title: "Supportvertrag", description: "24/7 Monitoring", qty: 1, unit: "Monat", unitCents: 85000, vatRate: 19, totalCents: 85000 },
      ],
    });

    expect(recurring.title).toBe("Monatlicher Support & Cloud-Wartung");
    expect(recurring.active).toBe(true);

    // Trigger erzeugt neue Ausgangsrechnung
    const generatedInvoice = store.triggerRecurring(recurring.id);
    expect(generatedInvoice.number).toMatch(/^RE-\d{4}-\d{3}$/);
    expect(generatedInvoice.title).toContain("Support & Cloud-Wartung");
    expect(generatedInvoice.totalCents).toBe(101150); // 850 € + 19% = 1011,50 €
  });
});
