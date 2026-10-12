// Der App-Katalog: alle Branchen-Systeme, die ein Kunde installieren kann.
// Ein neues System kommt als weiterer Eintrag hier dazu.

export type AppStatus = "ready" | "preview";

export interface CatalogApp {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: "Dienstleistung" | "Handel" | "Handwerk" | "Gastronomie";
  icon: "scissors" | "wrench" | "utensils" | "shopping" | "smartphone" | "car" | "briefcase";
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
      "Online-Terminbuchung, Kundenkartei mit Behandlungsverlauf, Dienstleistungen und Produkte, Rechnungen und Kassenanbindung.",
    category: "Dienstleistung",
    icon: "scissors",
    hue: 330,
    priceMonthly: 39,
    status: "preview",
    features: ["Online-Terminbuchung", "Kundenkartei mit Verlauf", "Dienstleistungen & Preise", "Rechnungen & Kasse", "Mitarbeiter-Kalender"],
  },
  {
    id: "werkstatt",
    name: "Kfz-Werkstatt",
    tagline: "Aufträge, Fahrzeuge, Ersatzteile und Status-Portal",
    description:
      "Reparaturaufträge mit Fahrzeugdaten, Ersatzteillager, Kostenvoranschläge, Rechnungen und ein Status-Portal für deine Kunden.",
    category: "Handwerk",
    icon: "wrench",
    hue: 210,
    priceMonthly: 49,
    status: "preview",
    features: ["Reparaturaufträge", "Fahrzeugakte", "Ersatzteillager", "Kostenvoranschläge", "Status-Portal für Kunden"],
  },
  {
    id: "handy-it",
    name: "Handy- & IT-Service",
    tagline: "Reparaturen, Geräteannahme und Zubehörverkauf",
    description:
      "Geräteannahme mit Seriennummer und Fehlerbild, Reparaturstatus per SMS oder E-Mail, Zubehörverkauf und Ankauf.",
    category: "Handwerk",
    icon: "smartphone",
    hue: 265,
    priceMonthly: 39,
    status: "preview",
    features: ["Geräteannahme", "Reparaturstatus für Kunden", "Zubehör & Lager", "An- und Verkauf", "Garantie-Verwaltung"],
  },
  {
    id: "einzelhandel",
    name: "Einzelhandel",
    tagline: "Kasse, Warenwirtschaft und Online-Shop",
    description: "Artikel mit Barcode, Lagerbestand und Nachbestellung, Kasse mit TSE-Anbindung, Lieferanten und Online-Shop.",
    category: "Handel",
    icon: "shopping",
    hue: 160,
    priceMonthly: 49,
    status: "preview",
    features: ["Artikel & Barcodes", "Lager & Nachbestellung", "Kasse mit TSE", "Lieferanten & Einkauf", "Online-Shop"],
  },
  {
    id: "restaurant",
    name: "Restaurant & Café",
    tagline: "Tische, Bestellungen, Küche und Kasse",
    description: "Tischplan, Bestellungen per Tablet, Küchenmonitor, Speisekarte, Reservierungen und Kasse mit TSE.",
    category: "Gastronomie",
    icon: "utensils",
    hue: 25,
    priceMonthly: 49,
    status: "preview",
    features: ["Tischplan", "Bestellung per Tablet", "Küchenmonitor", "Reservierungen", "Kasse mit TSE"],
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
    id: "buero",
    name: "Büro & Dienstleister",
    tagline: "Projekte, Zeiterfassung, Angebote und Rechnungen",
    description: "Kunden und Projekte, Zeiterfassung, Angebote, Rechnungen als E-Rechnung und Export für den Steuerberater.",
    category: "Dienstleistung",
    icon: "briefcase",
    hue: 45,
    priceMonthly: 29,
    status: "preview",
    features: ["Kunden & Projekte", "Zeiterfassung", "Angebote", "E-Rechnungen", "DATEV-Export"],
  },
];

export function findApp(id: string): CatalogApp | undefined {
  return CATALOG.find((app) => app.id === id);
}
