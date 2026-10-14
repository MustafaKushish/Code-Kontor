import { formatMoney } from "../../money";
import { ApiError } from "../../api";
import { useI18n } from "../../i18n";

export const officeDictDe = {
  title: "Büro & Dienstleister",
  tagline: "Projekte, Zeiterfassung, Angebote und E-Rechnungen",
  tabs: {
    projects: "Projekte",
    time: "Zeiterfassung",
    quotes: "Angebote",
    invoices: "Rechnungen",
    clients: "Kunden",
    settings: "Einstellungen",
  },
  projects: {
    title: "Projekte",
    newProject: "Neues Projekt",
    noProjects: "Noch keine Projekte angelegt.",
    budget: "Budget",
    budgetSpent: "Verbraucht",
    hourlyRate: "Stundensatz",
    loggedHours: "Erfasste Stunden",
    status: {
      planned: "Geplant",
      active: "Aktiv",
      completed: "Abgeschlossen",
      paused: "Pausiert",
      canceled: "Abgebrochen",
    },
    fields: {
      name: "Projektname",
      client: "Kunde",
      status: "Status",
      budget: "Budget (€)",
      hourlyRate: "Stundensatz (€/Std)",
      startDate: "Startdatum",
      dueDate: "Zieldatum",
      description: "Beschreibung",
    },
  },
  time: {
    title: "Projekt-Zeiterfassung",
    logTime: "Zeit erfassen",
    minutes: "Minuten",
    hours: "Stunden",
    duration: "Dauer",
    billable: "Abrechenbar",
    billed: "Abgerechnet",
    unbilled: "Offen zur Abrechnung",
    noEntries: "Keine Zeiten erfasst.",
    timerStart: "Timer starten",
    timerStop: "Timer stoppen",
    fields: {
      project: "Projekt auswählen",
      date: "Datum",
      duration: "Dauer (z.B. 1.5 oder 90m)",
      hourlyRate: "Stundensatz (€)",
      description: "Tätigkeitsbeschreibung",
    },
  },
  quotes: {
    title: "Angebote",
    newQuote: "Angebot erstellen",
    noQuotes: "Keine Angebote vorhanden.",
    validUntil: "Gültig bis",
    convertToInvoice: "In Rechnung umwandeln",
    status: {
      draft: "Entwurf",
      sent: "Versendet",
      accepted: "Angenommen",
      rejected: "Abgelehnt",
      expired: "Abgelaufen",
    },
  },
  invoices: {
    title: "Rechnungen & E-Rechnung",
    newInvoice: "Rechnung schreiben",
    noInvoices: "Keine Rechnungen vorhanden.",
    dueDate: "Fällig am",
    issuedAt: "Rechnungsdatum",
    markPaid: "Als bezahlt markieren",
    exportDatev: "DATEV-Export (CSV)",
    eInvoiceNotice: "E-Rechnung (ZUGFeRD / XRechnung kompatibel)",
    buyerReference: "Leitweg-ID / Käuferreferenz",
    status: {
      draft: "Entwurf",
      sent: "Offen",
      paid: "Bezahlt",
      overdue: "Überfällig",
      canceled: "Storniert",
    },
  },
  clients: {
    title: "Kundenkartei",
    newClient: "Neuer Kunde",
    noClients: "Keine Kunden gefunden.",
    contactPerson: "Ansprechpartner",
    paymentTerms: "Zahlungsziel (Tage)",
    vatId: "USt-IdNr.",
    openInvoices: "Offene Rechnungen",
  },
  settings: {
    title: "Büro-Einstellungen",
    defaultHourlyRate: "Standard-Stundensatz (€/Std)",
    defaultPaymentTerms: "Standard-Zahlungsziel (Tage)",
    quotePrefix: "Angebots-Präfix",
    invoicePrefix: "Rechnungs-Präfix",
    buyerReferenceDefault: "Standard Leitweg-ID / Käuferreferenz",
    eInvoiceEnabled: "E-Rechnungs-Standard aktivieren",
    saved: "Einstellungen erfolgreich gespeichert.",
  },
  common: {
    save: "Speichern",
    cancel: "Abbrechen",
    delete: "Löschen",
    edit: "Bearbeiten",
    total: "Gesamt",
    net: "Netto",
    vat: "MwSt.",
    gross: "Brutto",
    qty: "Menge",
    unitPrice: "Einzelpreis",
    addItem: "Position hinzufügen",
    removeItem: "Position entfernen",
    details: "Details",
    all: "Alle",
    search: "Suchen...",
    print: "Drucken",
    actions: "Aktionen",
    back: "Zurück",
    yes: "Ja",
    no: "Nein",
    confirmDelete: "Wirklich löschen?",
  },
  errors: {
    clientRequired: "Bitte wählen Sie einen Kunden aus.",
    clientNameRequired: "Der Kundenname darf nicht leer sein.",
    clientHasProjects: "Dieser Kunde hat noch verknüpfte Projekte und kann nicht gelöscht werden.",
    projectNameRequired: "Der Projektname darf nicht leer sein.",
    projectRequired: "Bitte wählen Sie ein Projekt aus.",
    durationInvalid: "Bitte geben Sie eine gültige Dauer an.",
    quoteNotFound: "Angebot nicht gefunden.",
    invoiceNotFound: "Rechnung nicht gefunden.",
    projectNotFound: "Projekt nicht gefunden.",
    clientNotFound: "Kunde nicht gefunden.",
  },
  print: {
    quoteTitle: "Angebot",
    invoiceTitle: "Rechnung",
    quoteValid: "Dieses Angebot ist freibleibend und gültig bis zum angegebenen Datum.",
    payNotice: "Zahlbar innerhalb von {days} Tagen ohne Abzug.",
    bankDetails: "Bankverbindung",
    giroCodeNotice: "Mit der Banking-App scannen und sofort überweisen:",
    eInvoiceXml: "E-Rechnung (XML)",
    downloadXml: "XRechnung XML herunterladen",
    copyXml: "XML kopieren",
    copied: "Kopiert!",
    datevSuccess: "DATEV-Export heruntergeladen.",
    paidWith: "Bezahlt am {date} per {method}",
  },
};

export type OfficeDict = typeof officeDictDe;

export function useOfficeI18n() {
  const core = useI18n();

  const o = (path: string, vars?: Record<string, string | number>): string => {
    const keys = path.split(".");
    let current: unknown = officeDictDe;
    for (const key of keys) {
      if (current && typeof current === "object" && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return path;
      }
    }
    let text = typeof current === "string" ? current : path;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }
    return text;
  };

  const officeError = (error: unknown) => {
    if (error instanceof ApiError && error.code?.startsWith("office.")) {
      const code = error.code.slice(7);
      const translated = o(`errors.${code}`);
      return translated !== `errors.${code}` ? translated : core.errorText(error);
    }
    return core.errorText(error);
  };

  const euro = (cents: number) => formatMoney(cents, core.lang);

  const day = (iso: string) =>
    iso ? new Intl.DateTimeFormat(core.lang, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)) : "";

  return { ...core, o, euro, day, officeError };
}

