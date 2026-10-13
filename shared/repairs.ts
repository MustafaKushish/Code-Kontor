// Branchen-System „Handy- & IT-Service“: Reparaturaufträge von der Geräteannahme bis zur Abholung.
// Regeln und Prüfungen, die Browser und Server gleich verwenden. Beträge immer in Cent.

export const REPAIR_APP_ID = "handy-it";

export const DEVICE_TYPES = ["phone", "tablet", "laptop", "pc", "watch", "console", "other"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const ACCESSORIES = ["charger", "cable", "case", "sim", "memoryCard", "pen", "box"] as const;
export type Accessory = (typeof ACCESSORIES)[number];

/** Ablauf eines Auftrags. Fertig und „nicht repariert“ sind beide abholbereit. */
export const REPAIR_STATUSES = ["received", "diagnosis", "quote", "waitingParts", "repairing", "ready", "notRepaired", "pickedUp", "canceled"] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

export const PICKUP_STATUSES: RepairStatus[] = ["ready", "notRepaired"];
export const CLOSED_STATUSES: RepairStatus[] = ["pickedUp", "canceled"];

/** Gruppen für die Filter in der Auftragsliste. */
export const STATUS_GROUPS = {
  open: ["received", "diagnosis", "waitingParts", "repairing"],
  waiting: ["quote"],
  pickup: ["ready", "notRepaired"],
  done: ["pickedUp", "canceled"],
} as const satisfies Record<string, readonly RepairStatus[]>;
export type StatusGroup = keyof typeof STATUS_GROUPS | "all";

/** Welche Status von welchem aus gesetzt werden dürfen. Abholung läuft über einen eigenen Schritt mit Rechnung. */
const NEXT: Record<RepairStatus, RepairStatus[]> = {
  received: ["diagnosis", "quote", "waitingParts", "repairing", "ready", "notRepaired", "canceled"],
  diagnosis: ["received", "quote", "waitingParts", "repairing", "ready", "notRepaired", "canceled"],
  quote: ["diagnosis", "waitingParts", "repairing", "ready", "notRepaired", "canceled"],
  waitingParts: ["diagnosis", "quote", "repairing", "ready", "notRepaired", "canceled"],
  repairing: ["diagnosis", "quote", "waitingParts", "ready", "notRepaired"],
  ready: ["repairing", "notRepaired"],
  notRepaired: ["repairing", "ready"],
  pickedUp: [],
  canceled: ["received"],
};

export function canChangeStatus(from: RepairStatus, to: RepairStatus): boolean {
  return NEXT[from].includes(to);
}

export const isClosed = (status: RepairStatus) => CLOSED_STATUSES.includes(status);

export type QuoteDecision = "pending" | "approved" | "rejected";

export interface RepairDevice {
  type: DeviceType;
  brand: string;
  model: string;
  /** IMEI oder Seriennummer */
  serial: string;
  color: string;
}

export interface RepairIntake {
  device: RepairDevice;
  /** Was der Kunde schildert */
  problem: string;
  accessories: Accessory[];
  accessoriesOther: string;
  /** Sichtbarer Zustand bei Annahme (Kratzer, Displaybruch …) */
  condition: string;
  /** Bis zu diesem Betrag darf ohne Rückfrage repariert werden (0 = immer fragen) */
  approvedUpToCents: number;
  /** Erwarteter Preis, wird dem Kunden genannt (0 = noch offen) */
  estimateCents: number;
  /** Anzahlung bei Annahme */
  depositCents: number;
  /** Kunde wurde auf Datensicherung hingewiesen und ist einverstanden, dass Daten verloren gehen können */
  dataNotice: boolean;
  /** Wunschtermin oder versprochener Fertig-Termin (YYYY-MM-DD) */
  dueDay: string;
  /** Interne Notiz, sieht der Kunde nicht */
  internalNote: string;
  /** Sprache für E-Mails und die Statusseite des Kunden */
  customerLang: string;
}

export interface RepairCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** Anzahl Aufträge (nur in Listen gesetzt) */
  orders?: number;
}

export type RepairItemKind = "labor" | "part" | "other";

export interface RepairItem {
  id: string;
  kind: RepairItemKind;
  partId: string | null;
  name: string;
  qty: number;
  /** Endpreis je Stück inkl. MwSt. */
  unitCents: number;
  /** Steuersatz in Prozent (19, 7 oder 0) */
  vatRate: number;
}

export interface RepairEvent {
  id: number;
  at: string;
  status: RepairStatus | null;
  /** Kurzer Code für besondere Ereignisse, z. B. "quoteApproved" */
  event: string;
  note: string;
  userName: string | null;
}

export interface RepairInvoice {
  number: string;
  issuedAt: string;
  totalCents: number;
  paymentMethod: PaymentMethod;
  warrantyUntil: string;
  /** Unveränderliche Kopie aller Angaben zum Zeitpunkt der Rechnung */
  snapshot: InvoiceSnapshot;
}

export const PAYMENT_METHODS = ["cash", "card", "transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface InvoiceSnapshot {
  company: { name: string; street: string; postalCode: string; city: string; phone: string; email: string; taxNumber: string; vatId: string; iban: string; bic: string; bankName: string; logoDataUrl: string };
  customer: { name: string; phone: string; email: string };
  orderNumber: number;
  device: RepairDevice;
  items: RepairItem[];
  totals: Totals;
  depositCents: number;
  smallBusiness: boolean;
}

export interface RepairOrder {
  id: string;
  number: number;
  status: RepairStatus;
  customer: RepairCustomer;
  intake: RepairIntake;
  quote: QuoteDecision | null;
  items: RepairItem[];
  history: RepairEvent[];
  invoice: RepairInvoice | null;
  hasUnlockCode: boolean;
  publicToken: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

/** Kurzfassung für Listen */
export interface RepairOrderRow {
  id: string;
  number: number;
  status: RepairStatus;
  customerName: string;
  customerPhone: string;
  device: RepairDevice;
  problem: string;
  dueDay: string;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface RepairPart {
  id: string;
  sku: string;
  name: string;
  category: "part" | "accessory";
  /** Für welche Geräte, z. B. „iPhone 13, iPhone 13 Pro“ */
  fits: string;
  stock: number;
  minStock: number;
  purchaseCents: number;
  priceCents: number;
  vatRate: number;
}

export interface RepairSettings {
  /** Kleinunternehmer nach § 19 UStG: keine Umsatzsteuer auf der Rechnung */
  smallBusiness: boolean;
  /** Garantie auf Reparaturen in Monaten */
  warrantyMonths: number;
  /** Arbeitspreis, der beim Hinzufügen von Arbeitszeit vorgeschlagen wird */
  laborCents: number;
  /** Text unten auf dem Annahmeschein */
  intakeTerms: string;
  /** Kunden bei Kostenvoranschlag und Abholbereit automatisch per E-Mail informieren */
  notifyByMail: boolean;
}

export const DEFAULT_INTAKE_TERMS =
  "Bitte sichern Sie Ihre Daten vor der Abgabe. Für Datenverlust übernehmen wir keine Haftung. " +
  "Kosten über dem freigegebenen Betrag entstehen nur nach Ihrer Zustimmung. " +
  "Geräte, die 3 Monate nach Fertigmeldung nicht abgeholt wurden, können nach erneuter Aufforderung verwertet werden.";

export const DEFAULT_REPAIR_SETTINGS: RepairSettings = {
  smallBusiness: false,
  warrantyMonths: 6,
  laborCents: 0,
  intakeTerms: DEFAULT_INTAKE_TERMS,
  notifyByMail: true,
};

/** Steuersätze, wenn die Firma nichts anderes eingestellt hat (Deutschland). */
export const VAT_RATES = [19, 7, 0] as const;

/** Steuersatz aus einer Eingabe: 0 bis unter 100 Prozent, sonst der Normalsatz. */
export function vatRateOf(value: unknown, fallback = 19): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 100 ? Math.round(value * 100) / 100 : fallback;
}

// ---------- Rechnen ----------

export interface Totals {
  grossCents: number;
  netCents: number;
  /** Steuerbetrag je Satz */
  vat: { rate: number; netCents: number; vatCents: number }[];
}

/**
 * Summen aus Endpreisen. Die Steuer wird je Satz aus der Bruttosumme herausgerechnet,
 * damit die Rechnung auf den Cent mit dem Kassenbetrag übereinstimmt.
 */
export function computeTotals(items: Pick<RepairItem, "qty" | "unitCents" | "vatRate">[], smallBusiness = false): Totals {
  const byRate = new Map<number, number>();
  let grossCents = 0;
  for (const item of items) {
    const line = Math.round(item.qty * item.unitCents);
    grossCents += line;
    const rate = smallBusiness ? 0 : item.vatRate;
    byRate.set(rate, (byRate.get(rate) ?? 0) + line);
  }
  const vat = [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, gross]) => {
      const vatCents = Math.round((gross * rate) / (100 + rate));
      return { rate, netCents: gross - vatCents, vatCents };
    });
  return { grossCents, netCents: vat.reduce((s, v) => s + v.netCents, 0), vat };
}

/** Garantie-Ende als Tag (YYYY-MM-DD), Monate ab dem Abholtag. */
export function warrantyEnd(day: string, months: number): string {
  if (months <= 0) return "";
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Rechnungsnummer, z. B. „RE-2026-0007“. */
export const invoiceNumber = (year: number, seq: number) => `RE-${year}-${String(seq).padStart(4, "0")}`;

/** Prüfziffer einer 15-stelligen IMEI (Luhn). Seriennummern anderer Form gelten als gültig. */
export function isValidImei(value: string): boolean {
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d{15}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let n = Number(digits[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** Sieht aus wie eine IMEI (nur Ziffern, 14 bis 16 Stellen), dann sollte die Prüfziffer stimmen. */
export const looksLikeImei = (value: string) => /^\d{14,16}$/.test(value.replace(/[\s-]/g, ""));

/** Für die Suche: Leerzeichen und Bindestriche aus Seriennummern entfernen. */
export const normalizeSerial = (value: string) => value.replace(/[\s-]/g, "").toUpperCase();

// ---------- Eingaben prüfen ----------

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const cents = (value: unknown, max = 10_000_000) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), max) : 0;
};
const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const LANG = /^[a-z]{2}$/;

export type RepairErrors = Partial<Record<"customerName" | "contact" | "email" | "model" | "problem" | "serial" | "name" | "price", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeCustomer(input: unknown): Omit<RepairCustomer, "id"> {
  const c = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return { name: str(c.name, 120), phone: str(c.phone, 40), email: str(c.email, 200).toLowerCase() };
}

export function validateCustomer(c: Omit<RepairCustomer, "id">): RepairErrors {
  const errors: RepairErrors = {};
  if (!c.name) errors.customerName = "required";
  if (!c.phone && !c.email) errors.contact = "required";
  if (c.email && !EMAIL.test(c.email)) errors.email = "invalid";
  return errors;
}

export function sanitizeIntake(input: unknown): RepairIntake {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = (i.device && typeof i.device === "object" ? i.device : {}) as Record<string, unknown>;
  const accessories = Array.isArray(i.accessories) ? ACCESSORIES.filter((a) => (i.accessories as unknown[]).includes(a)) : [];
  return {
    device: {
      type: DEVICE_TYPES.includes(d.type as DeviceType) ? (d.type as DeviceType) : "phone",
      brand: str(d.brand, 60),
      model: str(d.model, 100),
      serial: str(d.serial, 60),
      color: str(d.color, 40),
    },
    problem: str(i.problem, 2000),
    accessories,
    accessoriesOther: str(i.accessoriesOther, 200),
    condition: str(i.condition, 1000),
    approvedUpToCents: cents(i.approvedUpToCents),
    estimateCents: cents(i.estimateCents),
    depositCents: cents(i.depositCents),
    dataNotice: i.dataNotice === true,
    dueDay: isDay(i.dueDay) ? i.dueDay : "",
    internalNote: str(i.internalNote, 2000),
    customerLang: typeof i.customerLang === "string" && LANG.test(i.customerLang) ? i.customerLang : "de",
  };
}

export function validateIntake(intake: RepairIntake): RepairErrors {
  const errors: RepairErrors = {};
  if (!intake.device.model && !intake.device.brand) errors.model = "required";
  if (!intake.problem) errors.problem = "required";
  if (looksLikeImei(intake.device.serial) && normalizeSerial(intake.device.serial).length === 15 && !isValidImei(intake.device.serial)) errors.serial = "imei";
  return errors;
}

export function sanitizeItem(input: unknown): Omit<RepairItem, "id"> | null {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const kind: RepairItemKind = i.kind === "part" || i.kind === "other" ? i.kind : "labor";
  const name = str(i.name, 160);
  const qty = typeof i.qty === "number" && Number.isFinite(i.qty) ? Math.round(i.qty * 100) / 100 : 1;
  if (!name || qty <= 0 || qty > 1000) return null;
  return {
    kind,
    partId: kind === "part" && typeof i.partId === "string" ? i.partId.slice(0, 64) : null,
    name,
    qty,
    unitCents: cents(i.unitCents),
    vatRate: vatRateOf(i.vatRate),
  };
}

export function sanitizePart(input: unknown): Omit<RepairPart, "id" | "stock"> & { stock: number } {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), 1_000_000) : 0);
  return {
    sku: str(p.sku, 60),
    name: str(p.name, 160),
    category: p.category === "accessory" ? "accessory" : "part",
    fits: str(p.fits, 300),
    stock: int(p.stock),
    minStock: int(p.minStock),
    purchaseCents: cents(p.purchaseCents),
    priceCents: cents(p.priceCents),
    vatRate: vatRateOf(p.vatRate),
  };
}

export function sanitizeRepairSettings(input: unknown): RepairSettings {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const months = typeof s.warrantyMonths === "number" ? Math.min(Math.max(Math.round(s.warrantyMonths), 0), 60) : DEFAULT_REPAIR_SETTINGS.warrantyMonths;
  return {
    smallBusiness: s.smallBusiness === true,
    warrantyMonths: months,
    laborCents: cents(s.laborCents),
    intakeTerms: typeof s.intakeTerms === "string" ? s.intakeTerms.trim().slice(0, 3000) : DEFAULT_INTAKE_TERMS,
    notifyByMail: s.notifyByMail !== false,
  };
}

/** Betrag („12,50“, „12.5“, „1.234,00“) in Cent; null bei ungültiger Eingabe. */
export function parseEuro(value: string): number | null {
  let v = value.trim().replace(/\s|€|[$£¥₺₹₴₽]|^[A-Z]{3}|[A-Z]{3}$/g, "");
  if (!v) return 0;
  if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
  else v = v.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}
