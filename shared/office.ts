export const OFFICE_APP_ID = "buero";

export type ProjectStatus = "planned" | "active" | "completed" | "paused" | "canceled";
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "canceled";

export interface OfficeClient {
  id: string;
  number: number;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  vatId: string;
  paymentTermsDays: number;
  hourlyRateCents: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  openInvoiceCount?: number;
  openInvoiceCents?: number;
}

export interface OfficeProject {
  id: string;
  number: number;
  clientId: string;
  clientName: string;
  name: string;
  status: ProjectStatus;
  budgetCents: number;
  hourlyRateCents: number;
  startDate: string;
  dueDate: string;
  description: string;
  totalMinutesLogged: number;
  totalLoggedCents: number;
  totalBilledCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface OfficeTimeEntry {
  id: string;
  projectId: string;
  projectName?: string;
  clientId: string;
  clientName?: string;
  userId: string;
  userName: string;
  day: string; // YYYY-MM-DD
  minutes: number;
  hourlyRateCents: number;
  description: string;
  billable: boolean;
  billedInvoiceId: string | null;
  createdAt: string;
}

export interface LineItem {
  id: string;
  title: string;
  description: string;
  qty: number;
  unit: string; // "Std", "Tag", "Stk", "Pauschal"
  unitCents: number;
  vatRate: number; // e.g. 19, 7, 0
  totalCents: number;
}

export interface OfficeQuote {
  id: string;
  number: string;
  year: number;
  seq: number;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectName?: string;
  status: QuoteStatus;
  title: string;
  items: LineItem[];
  netCents: number;
  vatCents: number;
  totalCents: number;
  validUntil: string; // YYYY-MM-DD
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfficeInvoice {
  id: string;
  number: string;
  year: number;
  seq: number;
  clientId: string;
  clientName: string;
  clientAddress: string;
  clientVatId: string;
  projectId: string | null;
  projectName?: string;
  quoteId: string | null;
  status: InvoiceStatus;
  title: string;
  items: LineItem[];
  netCents: number;
  vatCents: number;
  totalCents: number;
  dueDate: string; // YYYY-MM-DD
  issuedAt: string;
  paidAt: string | null;
  paidMethod: string | null;
  buyerReference: string; // Leitweg-ID für E-Rechnung
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfficeSettings {
  defaultHourlyRateCents: number;
  defaultPaymentTermsDays: number;
  quotePrefix: string;
  invoicePrefix: string;
  buyerReferenceDefault: string;
  eInvoiceEnabled: boolean;
}

export const DEFAULT_OFFICE_SETTINGS: OfficeSettings = {
  defaultHourlyRateCents: 9500, // 95,00 €
  defaultPaymentTermsDays: 14,
  quotePrefix: "ANG",
  invoicePrefix: "RE",
  buyerReferenceDefault: "",
  eInvoiceEnabled: true,
};

export function computeLineTotal(qty: number, unitCents: number): number {
  return Math.round(qty * unitCents);
}

export function computeDocumentTotals(items: LineItem[]): { netCents: number; vatCents: number; totalCents: number } {
  let netCents = 0;
  let vatCents = 0;
  for (const item of items) {
    const itemTotal = computeLineTotal(item.qty, item.unitCents);
    netCents += itemTotal;
    vatCents += Math.round(itemTotal * (item.vatRate / 100));
  }
  return { netCents, vatCents, totalCents: netCents + vatCents };
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} Min`;
  if (m === 0) return `${h} Std`;
  return `${h} Std ${m} Min`;
}

export function hoursToMinutes(hoursStr: string | number): number {
  const n = typeof hoursStr === "number" ? hoursStr : parseFloat(hoursStr.replace(",", "."));
  if (isNaN(n) || n <= 0) return 0;
  return Math.round(n * 60);
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
