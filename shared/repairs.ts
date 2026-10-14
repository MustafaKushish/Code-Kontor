// Branchen-System „Handy- & IT-Service“: Reparaturaufträge von der Geräteannahme bis zur Abholung.
// Regeln und Prüfungen, die Browser und Server gleich verwenden. Beträge immer in Cent.

import { vatRateOf, type Payment, type PayMethod, type Totals } from "./pos";

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
  /** Garantiefall: Bezug auf die frühere Rechnung oder den früheren Auftrag (leer = normaler Auftrag) */
  warrantyRef: string;
  /** Funktions-Check bei Annahme */
  checks: CheckList;
  /** Bei Annahme vorgemerkte Leistungen aus der Preisliste */
  planned: PlannedService[];
}

export interface PlannedService {
  priceId: string;
  name: string;
  cents: number;
}

export interface RepairCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** Nur in der Kundenkartei gesetzt */
  address?: string;
  note?: string;
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

export type InvoiceKind = "repair" | "sale";

export interface RepairInvoice {
  number: string;
  issuedAt: string;
  totalCents: number;
  /** Hauptzahlart (bei geteilter Zahlung die größte); alle Zahlungen stehen im Beleg der Kasse */
  paymentMethod: PayMethod;
  warrantyUntil: string;
  /** Stornobeleg, falls die Rechnung storniert wurde */
  canceledBy?: string | null;
  /** Unveränderliche Kopie aller Angaben zum Zeitpunkt der Rechnung */
  snapshot: InvoiceSnapshot;
}

/** Zahlarten für Auszahlungen im Ankauf */
export const PAYMENT_METHODS = ["cash", "card", "transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface InvoiceSnapshot {
  company: { name: string; street: string; postalCode: string; city: string; phone: string; email: string; taxNumber: string; vatId: string; iban: string; bic: string; bankName: string; logoDataUrl: string; paymentMethods?: string; paymentAccount?: string };
  customer: { name: string; phone: string; email: string; address?: string };
  /** Auftragsnummer; null bei einem Verkauf */
  orderNumber: number | null;
  device: RepairDevice | null;
  items: (RepairItem & { margin?: boolean; warrantyUntil?: string })[];
  totals: Totals;
  depositCents: number;
  smallBusiness: boolean;
  /** Zahlungen laut Kasse (ältere Rechnungen haben nur paymentMethod) */
  payments?: Payment[];
  changeCents?: number;
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
  /** Funktions-Check bei Ausgabe (null = noch nicht gemacht) */
  outChecks: CheckList | null;
  /** Ausgeliehenes Leihgerät, solange es nicht zurück ist */
  loaner: { id: string; name: string; serial: string; lentAt: string } | null;
  photos: RepairPhoto[];
  /** Unterschriften als PNG (Data-URL): bei Annahme und bei Abholung */
  signature: { intake: string | null; pickup: string | null };
  /** Teile, die für diesen Auftrag beim Lieferanten bestellt sind */
  partOrders: OrderPartOrder[];
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
  /** Gewährleistung auf verkaufte Gebrauchtgeräte in Monaten (an Verbraucher mindestens 12) */
  usedWarrantyMonths: number;
  /** Eigene Vorlagen für WhatsApp und SMS (leer = mitgelieferte Vorlagen in der Sprache der App) */
  messages: MessageTemplate[];
  /** Landesvorwahl für Telefonnummern ohne Vorwahl, z. B. „49“ */
  countryCode: string;
  /** Online-Terminbuchung */
  booking: BookingSettings;
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
  usedWarrantyMonths: 12,
  messages: [],
  countryCode: "49",
  booking: { enabled: false, weekdays: [1, 2, 3, 4, 5, 6], from: "10:00", to: "18:00", slotMinutes: 30, perSlot: 1, daysAhead: 14, note: "" },
};

/** Steuersätze, wenn die Firma nichts anderes eingestellt hat (Deutschland). */
export const VAT_RATES = [19, 7, 0] as const;

// ---------- Rechnen ----------

// Summen und Steuer rechnet die Kasse der Plattform; hier nur weitergereicht.
export { computeTotals, vatRateOf, type Totals } from "./pos";

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

export type RepairErrors = Partial<Record<"customerName" | "contact" | "email" | "model" | "problem" | "serial" | "name" | "price" | "slot", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeCustomer(input: unknown): Omit<RepairCustomer, "id"> {
  const c = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return { name: str(c.name, 120), phone: str(c.phone, 40), email: str(c.email, 200).toLowerCase() };
}

/** Kundenkartei: Kontakt plus Anschrift und Notiz. */
export function sanitizeCustomerCard(input: unknown): { name: string; phone: string; email: string; address: string; note: string } {
  const c = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return { ...sanitizeCustomer(c), address: str(c.address, 300), note: str(c.note, 2000) };
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
    warrantyRef: str(i.warrantyRef, 40),
    checks: sanitizeChecks(i.checks),
    planned: (Array.isArray(i.planned) ? i.planned : []).slice(0, 10).flatMap((x) => {
      const p = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const name = str(p.name, 120);
      return typeof p.priceId === "string" && name ? [{ priceId: p.priceId.slice(0, 64), name, cents: cents(p.cents) }] : [];
    }),
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
    usedWarrantyMonths: typeof s.usedWarrantyMonths === "number" ? Math.min(Math.max(Math.round(s.usedWarrantyMonths), 0), 60) : DEFAULT_REPAIR_SETTINGS.usedWarrantyMonths,
    messages: sanitizeTemplates(s.messages),
    countryCode: typeof s.countryCode === "string" && /^\d{1,4}$/.test(s.countryCode) ? s.countryCode : "49",
    booking: sanitizeBookingSettings(s.booking),
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

// ---------- An- und Verkauf gebrauchter Geräte ----------

export const GRADES = ["likeNew", "good", "used", "defective"] as const;
export type Grade = (typeof GRADES)[number];

export const ID_TYPES = ["idCard", "passport", "residence", "driving"] as const;
export type IdType = (typeof ID_TYPES)[number];

export interface UsedDevice {
  id: string;
  /** Laufende Ankaufsnummer, z. B. 1001 → „A-1001“ */
  number: number;
  status: "inStock" | "sold";
  device: RepairDevice & { storage: string };
  grade: Grade;
  note: string;
  purchaseCents: number;
  priceCents: number;
  seller: { name: string; address: string; phone: string; idType: IdType | ""; hasIdNumber: boolean };
  payout: PaymentMethod;
  purchasedAt: string;
  purchasedBy: string | null;
  soldAt: string | null;
  saleInvoice: string | null;
  buyerName: string | null;
  warrantyUntil: string;
}

export interface UsedDeviceInput {
  device: UsedDevice["device"];
  grade: Grade;
  note: string;
  purchaseCents: number;
  priceCents: number;
  seller: { name: string; address: string; phone: string; idType: IdType | "" };
  idNumber: string;
  payout: PaymentMethod;
  ownership: boolean;
}

export function sanitizeUsed(input: unknown): UsedDeviceInput {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const intake = sanitizeIntake({ device: i.device });
  const d = (i.device && typeof i.device === "object" ? i.device : {}) as Record<string, unknown>;
  const s = (i.seller && typeof i.seller === "object" ? i.seller : {}) as Record<string, unknown>;
  return {
    device: { ...intake.device, storage: str(d.storage, 30) },
    grade: GRADES.includes(i.grade as Grade) ? (i.grade as Grade) : "good",
    note: str(i.note, 1000),
    purchaseCents: cents(i.purchaseCents),
    priceCents: cents(i.priceCents),
    seller: { name: str(s.name, 120), address: str(s.address, 300), phone: str(s.phone, 40), idType: ID_TYPES.includes(s.idType as IdType) ? (s.idType as IdType) : "" },
    idNumber: str(i.idNumber, 60),
    payout: PAYMENT_METHODS.includes(i.payout as PaymentMethod) ? (i.payout as PaymentMethod) : "cash",
    ownership: i.ownership === true,
  };
}

export type UsedErrors = Partial<Record<"model" | "serial" | "sellerName" | "sellerAddress" | "ownership", string>>;

/** Beim Ankauf braucht es Verkäufer mit Anschrift und die Eigentumsbestätigung, damit keine gestohlenen Geräte angekauft werden. */
export function validateUsed(u: UsedDeviceInput, isNew: boolean): UsedErrors {
  const errors: UsedErrors = {};
  if (!u.device.brand && !u.device.model) errors.model = "required";
  if (looksLikeImei(u.device.serial) && normalizeSerial(u.device.serial).length === 15 && !isValidImei(u.device.serial)) errors.serial = "imei";
  if (isNew) {
    if (!u.seller.name) errors.sellerName = "required";
    if (!u.seller.address) errors.sellerAddress = "required";
    if (!u.ownership) errors.ownership = "required";
  }
  return errors;
}

/** Eine Position im Verkauf: Zubehör/Teil aus dem Lager, Gebrauchtgerät oder freie Position. */
export interface SaleLine {
  kind: "part" | "used" | "other";
  refId: string | null;
  name: string;
  qty: number;
  unitCents: number;
  vatRate: number;
}

export function sanitizeSaleLine(input: unknown): SaleLine | null {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const kind = i.kind === "part" || i.kind === "used" ? i.kind : "other";
  const item = sanitizeItem({ ...i, kind: "other" });
  if (!item) return null;
  const refId = typeof i.refId === "string" ? i.refId.slice(0, 64) : null;
  if (kind !== "other" && !refId) return null;
  return { kind, refId: kind === "other" ? null : refId, name: item.name, qty: kind === "used" ? 1 : item.qty, unitCents: item.unitCents, vatRate: item.vatRate };
}

export interface WarrantyRow {
  source: "repair" | "sale";
  /** Auftrags-ID bzw. Ankauf-ID, zum Öffnen */
  refId: string;
  invoice: string;
  label: string;
  device: RepairDevice;
  customer: { name: string; phone: string; email: string };
  from: string;
  until: string;
}

// ---------- Funktions-Check ----------

export const CHECK_ITEMS = [
  "power", "display", "touch", "frontCamera", "backCamera", "speaker", "earpiece", "microphone", "charging", "battery",
  "wifi", "bluetooth", "mobile", "biometrics", "buttons", "keyboard", "trackpad", "ports", "storage",
] as const;
export type CheckItem = (typeof CHECK_ITEMS)[number];
export type CheckResult = "ok" | "fail" | "untested";
export type CheckList = Partial<Record<CheckItem, CheckResult>>;

/** Welche Prüfpunkte je Gerätetyp angeboten werden. */
export const CHECKS_FOR: Record<DeviceType, readonly CheckItem[]> = {
  phone: ["power", "display", "touch", "frontCamera", "backCamera", "speaker", "earpiece", "microphone", "charging", "battery", "wifi", "bluetooth", "mobile", "biometrics", "buttons"],
  tablet: ["power", "display", "touch", "frontCamera", "backCamera", "speaker", "microphone", "charging", "battery", "wifi", "bluetooth", "biometrics", "buttons"],
  laptop: ["power", "display", "keyboard", "trackpad", "charging", "battery", "wifi", "bluetooth", "speaker", "microphone", "frontCamera", "ports", "storage"],
  pc: ["power", "ports", "wifi", "bluetooth", "storage", "speaker"],
  watch: ["power", "display", "touch", "charging", "battery", "bluetooth", "buttons", "speaker"],
  console: ["power", "display", "ports", "wifi", "bluetooth", "buttons", "storage", "charging"],
  other: ["power", "display", "buttons", "charging", "ports"],
};

export function sanitizeChecks(input: unknown): CheckList {
  const c = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: CheckList = {};
  for (const item of CHECK_ITEMS) if (c[item] === "ok" || c[item] === "fail" || c[item] === "untested") out[item] = c[item];
  return out;
}

// ---------- Preisliste ----------

export interface RepairPrice {
  id: string;
  deviceType: DeviceType;
  brand: string;
  /** Modell; leer = gilt für alle Modelle der Marke */
  model: string;
  /** Leistung, z. B. „Display tauschen“ */
  service: string;
  /** Endpreis für den Kunden inkl. Teil */
  priceCents: number;
  vatRate: number;
  /** Teil aus dem Lager, das dabei verbaut wird */
  partId: string | null;
  /** Ungefähre Dauer in Minuten (0 = keine Angabe) */
  minutes: number;
}

export function sanitizePrice(input: unknown): Omit<RepairPrice, "id"> | null {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const service = str(p.service, 120);
  if (!service) return null;
  return {
    deviceType: DEVICE_TYPES.includes(p.deviceType as DeviceType) ? (p.deviceType as DeviceType) : "phone",
    brand: str(p.brand, 60),
    model: str(p.model, 100),
    service,
    priceCents: cents(p.priceCents),
    vatRate: vatRateOf(p.vatRate),
    partId: typeof p.partId === "string" && p.partId ? p.partId.slice(0, 64) : null,
    minutes: typeof p.minutes === "number" && Number.isFinite(p.minutes) ? Math.min(Math.max(Math.round(p.minutes), 0), 10_000) : 0,
  };
}

/** Passt ein Preis zum Gerät? Marke muss stimmen (oder leer sein), Modell ebenso. */
export function priceMatches(p: Pick<RepairPrice, "brand" | "model" | "deviceType">, device: Pick<RepairDevice, "brand" | "model" | "type">): boolean {
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  if (p.deviceType !== device.type) return false;
  if (p.brand && norm(p.brand) !== norm(device.brand)) return false;
  if (p.model && !norm(device.model).startsWith(norm(p.model))) return false;
  return true;
}

// ---------- Leihgeräte ----------

export interface Loaner {
  id: string;
  name: string;
  serial: string;
  note: string;
  /** Ausgeliehen an Auftrag (null = verfügbar) */
  orderId: string | null;
  orderNumber: number | null;
  customerName: string | null;
  lentAt: string | null;
}

// ---------- Auswertung ----------

export interface RepairStats {
  month: string;
  revenue: { repairCents: number; saleCents: number; invoices: number };
  orders: { received: number; pickedUp: number; open: number; avgDays: number | null };
  used: { bought: number; boughtCents: number; sold: number; soldCents: number; profitCents: number };
  topModels: { label: string; n: number }[];
  topServices: { label: string; n: number; cents: number }[];
  daily: { day: string; cents: number }[];
}

// ---------- Fotos und Unterschrift ----------

export const PHOTO_STAGES = ["intake", "repair", "output"] as const;
export type PhotoStage = (typeof PHOTO_STAGES)[number];

export interface RepairPhoto {
  id: string;
  stage: PhotoStage;
  at: string;
  userName: string | null;
}

export const MAX_PHOTOS = 12;
/** Fotos werden im Browser verkleinert; mehr als ~700 KB als Text nehmen wir nicht an. */
export const MAX_PHOTO_CHARS = 950_000;
export const MAX_SIGNATURE_CHARS = 200_000;

export const isPhotoDataUrl = (v: unknown): v is string =>
  typeof v === "string" && v.length <= MAX_PHOTO_CHARS && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(v);
export const isSignatureDataUrl = (v: unknown): v is string =>
  typeof v === "string" && v.length <= MAX_SIGNATURE_CHARS && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(v);

// ---------- Nachrichten an Kunden (WhatsApp, SMS) ----------

export interface MessageTemplate {
  id: string;
  name: string;
  text: string;
}

/** Platzhalter, die in Vorlagen ersetzt werden. */
export const MESSAGE_FIELDS = ["name", "device", "number", "status", "link", "total", "company"] as const;

export function fillTemplate(text: string, vars: Partial<Record<(typeof MESSAGE_FIELDS)[number], string>>): string {
  return text.replace(/\{(\w+)\}/g, (all, key: string) => (key in vars ? (vars as Record<string, string>)[key] ?? "" : all));
}

/**
 * Telefonnummer für WhatsApp in internationaler Form ohne Plus, z. B. „0176 123“ → „49176123“.
 * null, wenn das keine Handynummer sein kann.
 */
export function internationalPhone(phone: string, countryCode = "49"): string | null {
  const raw = phone.trim();
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    // schon international
  } else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = countryCode + digits.slice(1);
  else digits = countryCode + digits;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function sanitizeTemplates(input: unknown): MessageTemplate[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
    .map((t) => ({ id: str(t.id, 40) || crypto.randomUUID(), name: str(t.name, 60), text: str(t.text, 1000) }))
    .filter((t) => t.name && t.text)
    .slice(0, 20);
}

// ---------- Online-Termine ----------

export interface BookingSettings {
  enabled: boolean;
  /** Geöffnete Wochentage, 0 = Sonntag … 6 = Samstag */
  weekdays: number[];
  /** Erster und letzter möglicher Termin am Tag, „HH:MM“ */
  from: string;
  to: string;
  slotMinutes: number;
  /** Wie viele Kunden gleichzeitig kommen können */
  perSlot: number;
  /** Wie viele Tage im Voraus gebucht werden kann */
  daysAhead: number;
  /** Hinweis auf der Buchungsseite */
  note: string;
}

export const DEFAULT_BOOKING: BookingSettings = DEFAULT_REPAIR_SETTINGS.booking;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const timeOf = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function sanitizeBookingSettings(input: unknown): BookingSettings {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), min), max) : fallback);
  const from = typeof s.from === "string" && TIME.test(s.from) ? s.from : DEFAULT_BOOKING.from;
  const to = typeof s.to === "string" && TIME.test(s.to) && minutesOf(s.to) > minutesOf(from) ? s.to : timeOf(Math.min(minutesOf(from) + 60, 23 * 60 + 59));
  const weekdays = Array.isArray(s.weekdays) ? [...new Set(s.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : DEFAULT_BOOKING.weekdays;
  return {
    enabled: s.enabled === true,
    weekdays,
    from,
    to,
    slotMinutes: num(s.slotMinutes, 10, 240, DEFAULT_BOOKING.slotMinutes),
    perSlot: num(s.perSlot, 1, 20, DEFAULT_BOOKING.perSlot),
    daysAhead: num(s.daysAhead, 1, 60, DEFAULT_BOOKING.daysAhead),
    note: str(s.note, 500),
  };
}

/** Startzeiten eines Tages, z. B. 10:00, 10:30 … (der letzte Termin beginnt spätestens um „to“). */
export function slotTimes(s: Pick<BookingSettings, "from" | "to" | "slotMinutes">): string[] {
  const out: string[] = [];
  for (let m = minutesOf(s.from); m <= minutesOf(s.to) && out.length < 200; m += s.slotMinutes) out.push(timeOf(m));
  return out;
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/**
 * Freie Termine ab heute. today/now in Ortszeit der Firma; taken zählt Buchungen je „Tag Uhrzeit“.
 * Heute nur Zeiten, die mindestens eine Stunde in der Zukunft liegen.
 */
export function freeSlots(s: BookingSettings, today: string, now: string, taken: Record<string, number>): { day: string; times: string[] }[] {
  const times = slotTimes(s);
  const out: { day: string; times: string[] }[] = [];
  for (let i = 0; i < s.daysAhead; i++) {
    const day = addDays(today, i);
    if (!s.weekdays.includes(weekdayOf(day))) continue;
    const free = times.filter((t) => (i > 0 || minutesOf(t) >= minutesOf(now) + 60) && (taken[`${day} ${t}`] ?? 0) < s.perSlot);
    if (free.length) out.push({ day, times: free });
  }
  return out;
}

export const BOOKING_STATUSES = ["new", "confirmed", "declined", "canceled", "done", "noShow"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
/** Diese Buchungen belegen einen Termin. */
export const ACTIVE_BOOKING: BookingStatus[] = ["new", "confirmed"];

export interface BookingInput {
  day: string;
  time: string;
  name: string;
  phone: string;
  email: string;
  device: { type: DeviceType; brand: string; model: string };
  problem: string;
  lang: string;
}

export interface RepairBooking extends BookingInput {
  id: string;
  status: BookingStatus;
  source: "online" | "shop";
  orderId: string | null;
  orderNumber: number | null;
  createdAt: string;
}

export function sanitizeBooking(input: unknown): BookingInput {
  const b = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = (b.device && typeof b.device === "object" ? b.device : {}) as Record<string, unknown>;
  return {
    day: isDay(b.day) ? b.day : "",
    time: typeof b.time === "string" && TIME.test(b.time) ? b.time : "",
    name: str(b.name, 120),
    phone: str(b.phone, 40),
    email: str(b.email, 200).toLowerCase(),
    device: { type: DEVICE_TYPES.includes(d.type as DeviceType) ? (d.type as DeviceType) : "phone", brand: str(d.brand, 60), model: str(d.model, 100) },
    problem: str(b.problem, 1000),
    lang: typeof b.lang === "string" && LANG.test(b.lang) ? b.lang : "de",
  };
}

export function validateBooking(b: BookingInput): RepairErrors {
  const errors: RepairErrors = validateCustomer({ name: b.name, phone: b.phone, email: b.email });
  if (!b.day || !b.time) errors.slot = "required";
  return errors;
}

// ---------- Lieferanten und Bestellungen ----------

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  website: string;
  /** Unsere Kundennummer beim Lieferanten */
  customerNo: string;
  note: string;
}

export function sanitizeSupplier(input: unknown): Omit<Supplier, "id"> | null {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const name = str(s.name, 120);
  if (!name) return null;
  return {
    name, contact: str(s.contact, 120), phone: str(s.phone, 40), email: str(s.email, 200).toLowerCase(),
    website: str(s.website, 200), customerNo: str(s.customerNo, 60), note: str(s.note, 1000),
  };
}

export const PURCHASE_STATUSES = ["draft", "ordered", "received", "canceled"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export interface PurchaseLine {
  id: string;
  partId: string | null;
  name: string;
  qty: number;
  /** Schon eingetroffen */
  received: number;
  /** Einkaufspreis je Stück */
  unitCents: number;
  /** Reparaturauftrag, der auf dieses Teil wartet */
  orderId: string | null;
  orderNumber: number | null;
}

export interface PurchaseOrder {
  id: string;
  number: number;
  supplierId: string;
  supplierName: string;
  status: PurchaseStatus;
  note: string;
  lines: PurchaseLine[];
  totalCents: number;
  createdAt: string;
  createdBy: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
}

export type PurchaseLineInput = { partId: string | null; name: string; qty: number; unitCents: number; orderNumber: number | null };

export function sanitizePurchaseLines(input: unknown): PurchaseLineInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : {}))
    .map((l) => ({
      partId: typeof l.partId === "string" && l.partId ? l.partId.slice(0, 64) : null,
      name: str(l.name, 160),
      qty: typeof l.qty === "number" && Number.isFinite(l.qty) ? Math.min(Math.max(Math.round(l.qty), 1), 9999) : 1,
      unitCents: cents(l.unitCents),
      orderNumber: typeof l.orderNumber === "number" && Number.isInteger(l.orderNumber) && l.orderNumber > 0 ? l.orderNumber : null,
    }))
    .filter((l) => l.name)
    .slice(0, 100);
}

/** Bestellte Teile, die ein Reparaturauftrag erwartet (für die Auftragsansicht). */
export interface OrderPartOrder {
  purchaseId: string;
  purchaseNumber: number;
  supplierName: string;
  status: PurchaseStatus;
  name: string;
  qty: number;
  received: number;
}
