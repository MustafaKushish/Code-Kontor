export const OFFICE_APP_ID = "buero";

export type ProjectStatus = "planned" | "active" | "completed" | "paused" | "canceled";
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "canceled";
export type ExpenseCategory = "travel" | "subcontractor" | "software" | "material" | "other";

export interface RoleRate {
  id: string;
  name: string;
  hourlyRateCents: number;
}

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
  // SEPA-Mandat & Skonto
  sepaIban?: string;
  sepaBic?: string;
  sepaMandateRef?: string;
  sepaMandateDate?: string;
  skontoDays?: number;
  skontoPercent?: number;
  discountPercent?: number;
  createdAt: string;
  updatedAt: string;
  openInvoiceCount?: number;
  openInvoiceCents?: number;
}

export interface OfficeTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  completed: boolean;
  completedAt?: string | null;
  dueDate?: string;
  assigneeName?: string;
  createdAt: string;
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
  totalExpensesCents: number;
  tasksCount?: number;
  tasksCompleted?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OfficeTimeEntry {
  id: string;
  projectId: string;
  projectName?: string;
  clientId: string;
  clientName?: string;
  taskId?: string | null;
  taskTitle?: string;
  roleName?: string;
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

export interface OfficeExpense {
  id: string;
  projectId: string;
  projectName?: string;
  clientId: string;
  clientName?: string;
  title: string;
  category: ExpenseCategory;
  day: string;
  netCents: number;
  vatRate: number;
  vatCents: number;
  totalCents: number;
  billable: boolean;
  markupPercent: number; // e.g. 10%
  billedInvoiceId: string | null;
  notes: string;
  createdAt: string;
}

export interface LineItem {
  id: string;
  title: string;
  description: string;
  qty: number;
  unit: string; // "Std", "Tag", "Stk", "Pauschal", "km"
  unitCents: number;
  vatRate: number; // e.g. 19, 7, 0
  totalCents: number;
  /** Herkunft: Zeiteintrag oder Auslage, die mit dieser Position abgerechnet wird */
  source?: { kind: "time" | "expense"; id: string };
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
  discountPercent?: number;
  netCents: number;
  vatCents: number;
  totalCents: number;
  validUntil: string; // YYYY-MM-DD
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfficeDunning {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  level: 1 | 2 | 3; // 1 = Zahlungserinnerung, 2 = 1. Mahnung, 3 = 2. Mahnung / Letzte
  issuedAt: string;
  dueDate: string;
  feeCents: number;
  interestCents: number;
  totalAmountCents: number;
  notes: string;
  createdAt: string;
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
  discountPercent?: number;
  skontoDays?: number;
  skontoPercent?: number;
  netCents: number;
  vatCents: number;
  totalCents: number;
  dueDate: string; // YYYY-MM-DD
  issuedAt: string;
  paidAt: string | null;
  paidMethod: string | null;
  /** Storniert am (die Rechnung bleibt mit ihrer Nummer erhalten) */
  canceledAt?: string | null;
  buyerReference: string; // Leitweg-ID für E-Rechnung
  dunningLevel: number; // 0 = keine, 1, 2, 3
  lastDunningAt?: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfficeRecurring {
  id: string;
  clientId: string;
  clientName: string;
  projectId: string | null;
  title: string;
  items: LineItem[];
  intervalMonths: number; // 1 = monatlich, 3 = quartalsweise, 12 = jährlich
  nextRunDay: string;
  active: boolean;
  createdAt: string;
}

export interface OfficeSettings {
  defaultHourlyRateCents: number;
  defaultPaymentTermsDays: number;
  quotePrefix: string;
  invoicePrefix: string;
  buyerReferenceDefault: string;
  eInvoiceEnabled: boolean;
  defaultSkontoDays: number;
  defaultSkontoPercent: number;
  dunningFeeLevel1Cents: number; // e.g. 0
  dunningFeeLevel2Cents: number; // e.g. 500 (5,00 €)
  dunningFeeLevel3Cents: number; // e.g. 1000 (10,00 €)
  roleRates: RoleRate[];
}

export const DEFAULT_ROLE_RATES: RoleRate[] = [
  { id: "junior", name: "Junior Berater / Assistent", hourlyRateCents: 7500 },
  { id: "senior", name: "Senior Berater / Entwickler", hourlyRateCents: 12000 },
  { id: "director", name: "Projektleitung / Partner", hourlyRateCents: 16500 },
];

export const DEFAULT_OFFICE_SETTINGS: OfficeSettings = {
  defaultHourlyRateCents: 9500, // 95,00 €
  defaultPaymentTermsDays: 14,
  quotePrefix: "ANG",
  invoicePrefix: "RE",
  buyerReferenceDefault: "",
  eInvoiceEnabled: true,
  defaultSkontoDays: 7,
  defaultSkontoPercent: 2,
  dunningFeeLevel1Cents: 0,
  dunningFeeLevel2Cents: 500,
  dunningFeeLevel3Cents: 1000,
  roleRates: DEFAULT_ROLE_RATES,
};

export function computeLineTotal(qty: number, unitCents: number): number {
  return Math.round(qty * unitCents);
}

export function computeDocumentTotals(items: LineItem[], discountPercent = 0): { netCents: number; vatCents: number; totalCents: number } {
  let netCents = 0;
  let vatCents = 0;
  for (const item of items) {
    const itemTotal = computeLineTotal(item.qty, item.unitCents);
    netCents += itemTotal;
    vatCents += Math.round(itemTotal * (item.vatRate / 100));
  }
  if (discountPercent > 0 && discountPercent <= 100) {
    const discountFactor = (100 - discountPercent) / 100;
    netCents = Math.round(netCents * discountFactor);
    vatCents = Math.round(vatCents * discountFactor);
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
  const n = typeof hoursStr === "number" ? hoursStr : parseFloat(String(hoursStr).replace(",", "."));
  if (isNaN(n) || n <= 0) return 0;
  return Math.round(n * 60);
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
