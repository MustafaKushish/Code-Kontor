// Der App-Katalog: alle Branchen-Systeme, die ein Kunde installieren kann.
// Ein neues System kommt als weiterer Eintrag hier dazu.

export type AppStatus = "ready" | "preview";

export interface CatalogApp {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: "Dienstleistung" | "Handel" | "Handwerk" | "Gastronomie" | "Zusatz";
  icon: "scissors" | "wrench" | "utensils" | "shopping" | "smartphone" | "car" | "briefcase" | "register" | "hard-hat" | "dumbbell";
  /** Akzentfarbe der Karte, als Farbton (0–360) */
  hue: number;
  /** Monatspreis in Euro (Platzhalter bis zur Preisliste) */
  priceMonthly: number;
  status: AppStatus;
  features: string[];
}

export const CATALOG: CatalogApp[] = [
  {
    id: "friseur",
    name: "Friseur & Kosmetik",
    tagline: "Termine, Kundenkartei und Kasse für Salons",
    description:
      "Online-Terminbuchung, Kundenkartei mit Behandlungsverlauf und Farbrezepturen, Dienstleistungen und Preise, Mitarbeiter-Kalender, Rechnungen und Kassenanbindung.",
    category: "Dienstleistung",
    icon: "scissors",
    hue: 330,
    priceMonthly: 39,
    status: "ready",
    features: [
      "Interaktiver Stylisten- & Terminkalender",
      "Kundenkartei mit Farbrezepturen & Verlauf",
      "Dienstleistungskatalog mit Dauer & Preisen",
      "Online-Terminbuchung für Kunden ohne Login",
      "Kassenübergabe & Rechnungsstellung",
    ],
  },
  {
    id: "werkstatt",
    name: "Kfz-Werkstatt",
    tagline: "Aufträge, Fahrzeuge, Hebebühnen, Teilelager & Status-Portal",
    description:
      "Reparaturaufträge mit Fahrzeugdaten, Hebebühnen-Management, Dialogannahme-Checkliste, Ersatzteillager, Reifeneinlagerung, Kostenvoranschläge mit Online-Freigabe, Rechnungen und Kassenanbindung.",
    category: "Handwerk",
    icon: "wrench",
    hue: 210,
    priceMonthly: 49,
    status: "ready",
    features: [
      "Fahrzeugakte mit Kennzeichen, FIN & HU/AU-Fälligkeit",
      "Hebebühnen- & Auftragssteuerung mit Status-Phasen",
      "Digitale Dialogannahme mit Inspektionscheckliste",
      "Ersatzteillager mit OEM-Teilenummern & Mindestbestand",
      "Räderhotel & Reifeneinlagerung mit Profiltiefenprotokoll",
      "Online-Statusportal & digitale KVA-Freigabe für Kunden",
      "Sofortkassierung, Werkstattrechnung & Kassenübergabe",
    ],
  },
  {
    id: "handy-it",
    name: "Handy- & IT-Service",
    tagline: "Reparaturen für Handy, Tablet, Laptop und Smartwatch",
    description:
      "Geräteannahme mit IMEI und Fehlerbild, Kostenvoranschlag mit Freigabe durch den Kunden, Ersatzteile aus dem Lager, Abholung mit Rechnung und Garantie und eine Statusseite für deine Kunden.",
    category: "Handwerk",
    icon: "smartphone",
    hue: 265,
    priceMonthly: 39,
    status: "ready",
    features: ["Geräteannahme mit Annahmeschein", "Statusseite & E-Mail für Kunden", "Kostenvoranschlag mit Online-Freigabe", "Ersatzteile & Zubehör im Lager", "Abholung mit Rechnung & Garantie"],
  },
  {
    // Zusatzmodul: eine Kasse für alle installierten Systeme (siehe worker/pos)
    id: "kasse",
    name: "Kasse",
    tagline: "Eine Kasse für alle Systeme, mit Scanner und Kassenplätzen",
    description:
      "Verkaufen per Barcode-Scanner oder Kacheln, bezahlen mit Bar, Karte, Überweisung oder Gutschein, Artikel mit EAN und Bestand, mehrere Kassenplätze mit eigenem Kassenbuch und Tagesabschluss. Arbeitet mit allen installierten Systemen zusammen.",
    category: "Zusatz",
    icon: "register",
    hue: 185,
    priceMonthly: 19,
    status: "ready",
    features: ["Barcode-Scanner & Vollbild-Kassenmodus", "Artikel mit EAN & Bestand", "Bar, Karte, Überweisung, Gutschein", "Mehrere Kassenplätze", "Kassenbuch & Tagesabschluss (Z-Bon)"],
  },
  {
    id: "einzelhandel",
    name: "Einzelhandel",
    tagline: "Warenwirtschaft, Barcodes, Wareneingang und Kasse",
    description:
      "Vollständige Warenwirtschaft mit EAN/Barcode-Scanner, Lagerbestand mit Mindestmengen-Alarm, Wareneingang mit Lieferscheinabgleich, Lieferantenbestellungen, Etikettendruck und Kassenanbindung.",
    category: "Handel",
    icon: "shopping",
    hue: 160,
    priceMonthly: 49,
    status: "ready",
    features: [
      "Artikelstamm mit EAN/Barcode & Regalplätzen",
      "Mindestbestands-Alarm & Nachbestellungen",
      "Wareneingang mit automatischer Zubuchung",
      "Lieferantenkartei & Einkaufsbestellungen",
      "Lückenloses Lagerjournal & Inventurbuchung",
      "Artikeletiketten & Preisschilddruck",
      "Kassenübergabe & Sofortabrechnung",
    ],
  },
  {
    id: "restaurant",
    name: "Restaurant & Café",
    tagline: "Tischplan, Kundenschalter, Abholschalter & Küchenmonitor",
    description:
      "Tischplan mit Raumzonen, Touch-Kundenschalter für Thekenbestellungen, Abholschalter mit digitalem Abholaufruf, interaktives Küchenleitsystem (KDS), Speisekarte und Kassenanbindung.",
    category: "Gastronomie",
    icon: "utensils",
    hue: 25,
    priceMonthly: 49,
    status: "ready",
    features: [
      "Interaktiver Tischplan mit Raumzonen & Belegungsstatus",
      "Kundenschalter für schnelle Theken- und Mitnahmebestellungen",
      "Abholschalter mit Nummernvergabe & Großbild-Abholaufruf",
      "Digitaler Küchenmonitor (KDS) mit Gänge-Steuerung & Timern",
      "Speisen & Getränke mit Druckziel-Trennung (Küche vs. Bar)",
      "Getrennte MwSt.-Kalkulation (7% Speisen / 19% In-Haus & Getränke)",
      "Schnellkassierung (Bar/Karte) & Kassenübergabe an Hauptkasse",
    ],
  },
  {
    id: "autohaus",
    name: "Autohaus",
    tagline: "Fahrzeugbestand, Verkauf und Probefahrten",
    description: "Fahrzeugbestand mit Fotos, Interessenten, Probefahrten, Kaufverträge, Inzahlungnahmen und Werkstatt-Anbindung.",
    category: "Handel",
    icon: "car",
    hue: 0,
    priceMonthly: 79,
    status: "preview",
    features: ["Fahrzeugbestand", "Interessenten & Anfragen", "Probefahrten", "Kaufverträge", "Inzahlungnahme"],
  },
  {
    id: "handwerk",
    name: "Handwerk & Baustelle",
    tagline: "Baustellenakte, Aufmaß, Rapportzettel & Kundenunterschrift",
    description:
      "Baustellenakte für Gewerke (Elektro, SHK, Maler, Ausbau), mobiles Raumaufmaß mit Formelrechner, Arbeitsberichte mit Stunden und Material, digitale Touch-Kundenunterschrift und Übergabe an Rechnung & Kasse (§ 35a EStG).",
    category: "Handwerk",
    icon: "hard-hat",
    hue: 35,
    priceMonthly: 49,
    status: "ready",
    features: [
      "Baustellenakte mit Bauherr, Terminen & Adresse",
      "Mobiles Raumaufmaß mit Flächen- & Längenrechner",
      "Arbeitsberichte mit Monteurstunden & Material",
      "Digitale Kundenunterschrift direkt auf dem Tablet",
      "Automatischer § 35a Lohn- & Materialsplit",
      "Bautagebuch & Dokumentation vor Ort",
      "1-Klick-Übernahme in Rechnung & Hauptkasse",
    ],
  },
  {
    id: "fitness",
    name: "Fitnessstudio & Kurse",
    tagline: "Mitgliederkartei, Kursplan, Theken-Check-In & Tarife",
    description:
      "Mitgliederverwaltung mit Verträgen, schneller Theken-Check-In per Barcode/QR-Code mit optischer Gültigkeitsprüfung, Live-Studioauslastung, wöchentlicher Kursplan mit Teilnehmerbuchung und Kassenanbindung.",
    category: "Dienstleistung",
    icon: "dumbbell",
    hue: 165,
    priceMonthly: 49,
    status: "ready",
    features: [
      "Theken-Check-In mit Barcode/QR-Code-Scan",
      "Optische Gültigkeitsprüfung & Sperr-Warnung",
      "Live-Studioauslastung & Anwesenheitsliste",
      "Mitgliederkartei mit Verträgen & Laufzeiten",
      "Wöchentlicher Kursplan mit Trainer & Buchung",
      "Tarife, Aufnahmegebühren & 10er-Karten",
      "Mitgliedsvertrag, SEPA-Mandat & Ausweisdruck",
    ],
  },
  {
    id: "buero",
    name: "Büro & Dienstleister",
    tagline: "Projekte, Zeiterfassung, Angebote und Rechnungen",
    description: "Kunden und Projekte, Zeiterfassung, Angebote, Rechnungen als E-Rechnung und Export für den Steuerberater.",
    category: "Dienstleistung",
    icon: "briefcase",
    hue: 45,
    priceMonthly: 29,
    status: "ready",
    features: ["Kunden & Projekte", "Zeiterfassung", "Angebote", "E-Rechnungen", "DATEV-Export"],
  },
];

export function findApp(id: string): CatalogApp | undefined {
  return CATALOG.find((app) => app.id === id);
}
