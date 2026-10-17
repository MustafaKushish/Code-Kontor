import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  computeDocumentTotals,
  computeLineTotal,
  formatMinutes,
  DEFAULT_OFFICE_SETTINGS,
} from "../shared/office";
import { OFFICE_MIGRATIONS, OfficeError, OfficeStore, addMonths } from "../worker/office/store";

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
    // Entwurf ohne Nummer; die Nummer kommt beim Festschreiben (GoBD)
    const draft = store.convertQuoteToInvoice(quote.id);
    expect(draft.status).toBe("draft");
    expect(draft.number).toMatch(/^ENTWURF-/);
    const invoice = store.finalizeInvoice(draft.id);
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
    expect(generatedInvoice.status).toBe("draft");
    expect(store.finalizeInvoice(generatedInvoice.id).number).toMatch(/^RE-\d{4}-\d{3}$/);
    expect(generatedInvoice.title).toContain("Support & Cloud-Wartung");
    expect(generatedInvoice.totalCents).toBe(101150); // 850 € + 19% = 1011,50 €
  });
});

describe("Büro & Dienstleister: Rechnungen nach GoBD", () => {
  const line = (unitCents: number, vatRate: number, source?: { kind: "time" | "expense"; id: string }) => ({
    id: crypto.randomUUID(), title: "Leistung", description: "", qty: 1, unit: "Std", unitCents, vatRate, totalCents: unitCents, ...(source ? { source } : {}),
  });
  const actor = { id: "u1", name: "Mia" };

  it("vergibt die Nummer erst beim Festschreiben, lückenlos und fortlaufend", () => {
    const store = createMemoryStore();
    const client = store.saveClient({ name: "Kunde A" });
    const a = store.saveInvoice({ clientId: client.id, items: [line(10000, 19)] });
    const b = store.saveInvoice({ clientId: client.id, items: [line(5000, 19)] });
    expect(a.number).toMatch(/^ENTWURF-/);
    // Gelöschter Entwurf hinterlässt keine Lücke
    store.deleteInvoice(a.id);
    const year = new Date().getFullYear();
    expect(store.finalizeInvoice(b.id).number).toBe(`RE-${year}-001`);
    const c = store.saveInvoice({ clientId: client.id, items: [line(5000, 19)], status: "sent" });
    expect(c.number).toBe(`RE-${year}-002`);
    expect(c.status).toBe("sent");
  });

  it("ausgestellte Rechnungen sind unveränderlich, Storno behält die Nummer", () => {
    const store = createMemoryStore();
    const client = store.saveClient({ name: "Kunde B" });
    const inv = store.saveInvoice({ clientId: client.id, items: [line(10000, 19)], status: "sent" });
    expect(() => store.saveInvoice({ ...inv, items: [line(1, 19)] })).toThrow(OfficeError);
    expect(() => store.deleteInvoice(inv.id)).toThrow(OfficeError);
    expect(() => store.finalizeInvoice(inv.id)).toThrow(OfficeError);
    const canceled = store.cancelInvoice(inv.id);
    expect(canceled).toMatchObject({ status: "canceled", number: inv.number });
    expect(canceled.canceledAt).toBeTruthy();
    expect(() => store.markInvoicePaid(inv.id)).toThrow(OfficeError);
    expect(() => store.cancelInvoice(inv.id)).toThrow(OfficeError);
  });

  it("rechnet Zeiten nur einmal und nur beim eigenen Kunden ab", () => {
    const store = createMemoryStore();
    const client = store.saveClient({ name: "Kunde C" });
    const other = store.saveClient({ name: "Kunde D" });
    const project = store.saveProject({ clientId: client.id, name: "Projekt", hourlyRateCents: 10000 });
    const time = store.saveTime({ projectId: project.id, minutes: 60, description: "Arbeit", billable: true }, actor);
    const src = { kind: "time" as const, id: time.id };

    expect(() => store.saveInvoice({ clientId: other.id, items: [line(10000, 19, src)] })).toThrow(OfficeError);
    const inv = store.saveInvoice({ clientId: client.id, items: [line(10000, 19, src)], status: "sent" });
    expect(store.listTimes(project.id)[0].billedInvoiceId).toBe(inv.id);
    expect(() => store.saveInvoice({ clientId: client.id, items: [line(10000, 19, src)] })).toThrow(OfficeError);
    // Abgerechnete Zeit ist gesperrt
    expect(() => store.saveTime({ ...time, minutes: 120 }, actor)).toThrow(OfficeError);

    store.cancelInvoice(inv.id);
    expect(store.listTimes(project.id)[0].billedInvoiceId).toBeFalsy();
    // Kunde mit Rechnung bleibt erhalten
    expect(() => store.deleteClient(client.id)).toThrow(OfficeError);
  });

  it("mahnt nur offene, fällige Rechnungen und nie rückwärts", () => {
    const store = createMemoryStore();
    const client = store.saveClient({ name: "Kunde E" });
    const future = store.saveInvoice({ clientId: client.id, items: [line(10000, 19)], dueDate: "2999-01-01", status: "sent" });
    expect(() => store.createDunning(future.id, 1)).toThrow(OfficeError);
    const draft = store.saveInvoice({ clientId: client.id, items: [line(10000, 19)], dueDate: "2020-01-01" });
    expect(() => store.createDunning(draft.id, 1)).toThrow(OfficeError);
    const due = store.saveInvoice({ clientId: client.id, items: [line(10000, 19)], dueDate: "2020-01-01", status: "sent" });
    store.createDunning(due.id, 2);
    expect(() => store.createDunning(due.id, 1)).toThrow(OfficeError);
    store.markInvoicePaid(due.id);
    expect(() => store.createDunning(due.id, 3)).toThrow(OfficeError);
  });

  it("DATEV: ohne Entwürfe, je Steuersatz ein Erlöskonto, Storno als Gegenbuchung", () => {
    const store = createMemoryStore();
    const client = store.saveClient({ name: "Kunde F" });
    store.saveInvoice({ clientId: client.id, items: [line(99900, 19)] });
    const inv = store.saveInvoice({ clientId: client.id, items: [line(10000, 19), line(10000, 7)], status: "sent" });
    store.cancelInvoice(inv.id);
    const rows = store.exportDatevCsv().split("\r\n").slice(1);
    expect(rows).toHaveLength(4);
    expect(rows.join("\n")).not.toContain("1188,81");
    expect(rows[0]).toMatch(/^119,00;S;10000;8400;\d{8};/);
    expect(rows[1]).toMatch(/^107,00;S;10000;8300;/);
    expect(rows[2]).toMatch(/^119,00;H;10000;8400;/);
  });

  it("legt fällige Daueraufträge als Entwurf an und hält Monatsenden ein", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    const store = createMemoryStore();
    const client = store.saveClient({ name: "Abo" });
    store.saveRecurring({ clientId: client.id, title: "Wartung", intervalMonths: 1, nextRunDay: "2026-08-15", items: [line(5000, 19)] });
    expect(store.runDueRecurring("2026-10-17")).toBe(3);
    expect(store.runDueRecurring("2026-10-17")).toBe(0);
    expect(store.listInvoices().every((i) => i.status === "draft")).toBe(true);
    expect(store.listRecurring()[0].nextRunDay).toBe("2026-11-15");
  });
});
