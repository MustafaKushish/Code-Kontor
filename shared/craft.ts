// Datenmodelle für das Handwerk- & Baustellen-Modul in Code Kontor

export type CraftTrade = "Elektro" | "Sanitär & Heizung" | "Maler & Lackierer" | "Tischler & Holzbau" | "Trockenbau" | "Dachdecker" | "Fliesenleger" | "Allgemein";

export type CraftProjectStatus = "geplant" | "in_arbeit" | "abnahmebereit" | "abgeschlossen" | "pausiert";

export type CraftReportStatus = "entwurf" | "unterschrieben" | "abgerechnet";

export type ReportItemType = "lohn" | "fahrt" | "material" | "geraet";

export interface CraftProject {
  id: string;
  projectNumber: string; // z.B. "BV-2026-04"
  title: string; // z.B. "Sanierung Altbau 1. OG"
  trade: CraftTrade;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  siteAddress: string; // Baustellenadresse
  siteCity: string;
  startDate: string;
  targetDate?: string;
  status: CraftProjectStatus;
  budgetGross?: number;
  notes?: string;
  createdAt: string;
}

export interface CraftMeasurement {
  id: string;
  projectId: string;
  roomName: string; // z.B. "Wohnzimmer EG", "Badezimmer", "Fassade Nord"
  category: "Fläche" | "Länge / Umfang" | "Volumen" | "Stückzahl";
  formula: string; // z.B. "5.40 * 3.80" oder "2 * (4.20 + 3.10)"
  result: number;
  unit: "m²" | "m" | "m³" | "stk";
  notes?: string;
  createdAt: string;
}

export interface CraftReportItem {
  id: string;
  type: ReportItemType; // "lohn" | "fahrt" | "material" | "geraet"
  name: string; // z.B. "Monteurstunden Elektroinstallation" oder "NYM-J 3x1.5mm² 100m"
  quantity: number;
  unit: "Std." | "km" | "Stk." | "m" | "Psch.";
  unitPriceNet: number;
  totalNet: number;
  taxRate: number; // in der Regel 19%
}

export interface CraftReport {
  id: string;
  reportNumber: string; // z.B. "RAP-104"
  projectId: string;
  projectTitle: string;
  customerName: string;
  siteAddress: string;
  date: string;
  workerName: string; // Name des Monteurs / Meisters vor Ort
  hoursWorked: number;
  travelKm?: number;
  items: CraftReportItem[];
  workDescription: string; // Ausgeführte Arbeiten
  status: CraftReportStatus;
  signatureDataUrl?: string; // Digital signierter Base64-PNG String; nur bei GET /reports/:id, nicht in der Liste
  hasSignature?: boolean; // Liste: Unterschrift vorhanden (das Bild selbst lädt erst die Einzelansicht)
  signedByName?: string; // Name des Unterzeichnenden (Kunde / Bauleiter)
  signedAt?: string;
  totalWageNet: number; // Lohnkosten Netto (§ 35a EStG)
  totalMaterialNet: number; // Materialkosten Netto
  totalTax: number;
  totalGross: number;
  paymentMethod?: "bar" | "karte" | "rechnung" | "pos";
  paymentStatus: "offen" | "bezahlt";
  createdAt: string;
}

export interface CraftSiteDiaryEntry {
  id: string;
  projectId: string;
  date: string;
  author: string;
  weather?: "Sonnig" | "Bewölkt" | "Regen" | "Frost" | "Schnee";
  temperatureCelsius?: number;
  tradesPresent: string[]; // z.B. ["Elektro", "Maler", "Estrichleger"]
  activitiesSummary: string;
  issuesOrDelays?: string; // Behinderungen oder Bedenken
  createdAt: string;
}

export interface CraftStats {
  activeProjectsCount: number;
  totalProjectsCount: number;
  pendingSignaturesCount: number;
  openReportsCount: number;
  totalWageHoursMonth: number;
  revenueThisMonthGross: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const isWage = (i: CraftReportItem) => i.type === "lohn" || i.type === "fahrt";

/** Netto und Steuer je Steuersatz (Steuer je Position mit ihrem Satz, wie der Server rechnet), höchster Satz zuerst. */
export function craftVatTotals(items: CraftReportItem[]): { rate: number; net: number; tax: number }[] {
  const byRate = new Map<number, { net: number; tax: number }>();
  for (const i of items) {
    const rate = Number(i.taxRate) || 0;
    const row = byRate.get(rate) ?? { net: 0, tax: 0 };
    row.net += i.totalNet;
    row.tax += (i.totalNet * rate) / 100;
    byRate.set(rate, row);
  }
  return [...byRate.entries()]
    .map(([rate, v]) => ({ rate, net: round2(v.net), tax: round2(v.tax) }))
    .sort((a, b) => b.rate - a.rate);
}

/** Brutto der Lohn- und Fahrtpositionen (§ 35a) bzw. der übrigen Positionen, je Position mit ihrem Satz. */
export function craftGrossShares(items: CraftReportItem[]): { wageGross: number; materialGross: number } {
  let wageGross = 0;
  let materialGross = 0;
  for (const i of items) {
    const gross = i.totalNet * (1 + (Number(i.taxRate) || 0) / 100);
    if (isWage(i)) wageGross += gross;
    else materialGross += gross;
  }
  return { wageGross: round2(wageGross), materialGross: round2(materialGross) };
}
