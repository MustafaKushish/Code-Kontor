// Die Kasse der Plattform: eine Kasse je Firma für alle Systeme.
// Module (z. B. Handy- & IT-Service) übergeben ihre Posten an die Kasse; Belegnummern,
// Zahlarten, Kassenbuch und Tagesabschluss gibt es nur hier.

export const PAY_METHODS = ["cash", "card", "transfer", "voucher"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

/** Herkunft eines Postens: „pos“ = direkt in der Kasse erfasst, sonst die ID des Moduls. */
export type PosSource = "pos" | "repairs";

export interface PosLine {
  source: PosSource;
  /** Art im Modul, z. B. „part“, „used“, „orderItem“; in der Kasse „item“ */
  kind: string;
  refId: string | null;
  name: string;
  qty: number;
  /** Endpreis je Stück inkl. Steuer */
  unitCents: number;
  vatRate: number;
  /** Differenzbesteuerung (§ 25a UStG): keine Steuer ausweisen */
  margin?: boolean;
  /** Garantie bis (YYYY-MM-DD), wird auf dem Beleg gedruckt */
  warrantyUntil?: string;
}

/** Ein Vorgang eines Moduls, der mit dem Beleg abgeschlossen wird (z. B. Abholung eines Auftrags). */
export interface PosRef {
  source: PosSource;
  kind: string;
  refId: string;
  label: string;
}

export interface Payment {
  method: PayMethod;
  cents: number;
}

export interface PosCustomer {
  id: string | null;
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface Totals {
  grossCents: number;
  netCents: number;
  /** Steuerbetrag je Satz */
  vat: { rate: number; netCents: number; vatCents: number }[];
}

export type ReceiptKind = "sale" | "deposit" | "cancel";

export interface ReceiptCompany {
  name: string; street: string; postalCode: string; city: string; phone: string; email: string;
  taxNumber: string; vatId: string; iban: string; bic: string; bankName: string; logoDataUrl: string;
}

export interface Receipt {
  number: string;
  kind: ReceiptKind;
  issuedAt: string;
  cashier: string | null;
  company: ReceiptCompany;
  currency: string;
  customer: PosCustomer | null;
  lines: PosLine[];
  refs: PosRef[];
  totals: Totals;
  /** Schon bezahlte Anzahlung, wird vom Betrag abgezogen */
  depositCents: number;
  /** Zu zahlen: Summe minus Anzahlung (negativ = Auszahlung an den Kunden) */
  dueCents: number;
  /** Bezahlt je Zahlart, Bargeld ohne Rückgeld */
  payments: Payment[];
  /** Vom Kunden gegeben (bar) und Rückgeld */
  givenCents: number;
  changeCents: number;
  smallBusiness: boolean;
  /** Storno: Nummer des stornierten Belegs; beim Original die Nummer des Stornobelegs */
  cancels: string | null;
  canceledBy: string | null;
  /** Nummer des Tagesabschlusses, sobald der Beleg darin steckt */
  closing: number | null;
  /** Daten der TSE (nur Deutschland), solange keine angebunden ist: null */
  tse: null | { serial: string; signature: string; counter: number; start: string; end: string };
}

export type ReceiptRow = Pick<Receipt, "number" | "kind" | "issuedAt" | "cashier" | "dueCents" | "payments" | "cancels" | "canceledBy" | "closing"> & {
  totalCents: number;
  customerName: string;
  label: string;
};

/** Bewegung im Kassenbuch ohne Beleg: Einlage, Entnahme, Auszahlung (z. B. Ankauf), Abschöpfung zur Bank, Differenz beim Zählen. */
export const CASH_MOVE_KINDS = ["in", "out", "payout", "bank", "difference"] as const;
export type CashMoveKind = (typeof CASH_MOVE_KINDS)[number];

export interface CashMove {
  id: string;
  at: string;
  kind: CashMoveKind;
  method: PayMethod;
  /** Positiv = in die Kasse, negativ = heraus */
  cents: number;
  note: string;
  ref: string;
  userName: string | null;
  closing: number | null;
}

/** Stand seit dem letzten Tagesabschluss (X-Bericht). */
export interface CashState {
  since: string | null;
  openingCents: number;
  receipts: number;
  cancels: number;
  /** Eingänge je Zahlart aus Belegen (netto, also nach Storno) */
  byMethod: Record<PayMethod, number>;
  vat: Totals["vat"];
  salesCents: number;
  /** Bargeld-Bewegungen ohne Beleg (Einlage, Entnahme, Auszahlung) */
  movesCents: number;
  /** So viel Bargeld sollte in der Kasse sein */
  expectedCents: number;
  /** Auszahlungen über andere Zahlarten (z. B. Ankauf per Überweisung), nur zur Info */
  otherPayouts: Record<PayMethod, number>;
  moves: CashMove[];
}

export interface Closing extends Omit<CashState, "moves"> {
  number: number;
  at: string;
  countedCents: number;
  differenceCents: number;
  bankCents: number;
  /** Bleibt als Wechselgeld in der Kasse */
  closingCents: number;
  userName: string | null;
  note: string;
}

export interface QuickItem {
  id: string;
  name: string;
  priceCents: number;
  vatRate: number;
}

export interface PosSettings {
  methods: PayMethod[];
  quickItems: QuickItem[];
  smallBusiness: boolean;
  /** Text unten auf dem Bon, z. B. Öffnungszeiten oder Umtausch */
  footer: string;
  /** Bon (80 mm) oder A4-Rechnung nach dem Bezahlen vorschlagen */
  print: "bon" | "a4" | "ask";
}

export const DEFAULT_POS_SETTINGS: PosSettings = { methods: ["cash", "card"], quickItems: [], smallBusiness: false, footer: "", print: "ask" };

/** Artikel, den die Kasse zum Suchen anbietet (Schnellartikel oder aus einem Modul). */
export interface PosArticle {
  source: PosSource;
  kind: string;
  refId: string | null;
  name: string;
  detail: string;
  priceCents: number;
  vatRate: number;
  margin?: boolean;
  /** Lagerbestand, wenn das Modul einen führt */
  stock?: number;
  /** Nur einmal verkaufbar (z. B. Gebrauchtgerät, Auftrag) */
  single?: boolean;
  /** Anzahlung, die bei Aufträgen schon bezahlt ist */
  depositCents?: number;
  /** Leihgerät, das vor der Abholung zurück sein muss */
  loaner?: string;
}

// ---------- Rechnen ----------

/**
 * Summen aus Endpreisen. Die Steuer wird je Satz aus der Bruttosumme herausgerechnet,
 * damit der Beleg auf den Cent mit dem Kassenbetrag übereinstimmt.
 */
export function computeTotals(items: { qty: number; unitCents: number; vatRate: number; margin?: boolean }[], smallBusiness = false): Totals {
  const byRate = new Map<number, number>();
  let grossCents = 0;
  for (const item of items) {
    const line = Math.round(item.qty * item.unitCents);
    grossCents += line;
    // Gebrauchtgeräte nach § 25a UStG: keine Steuer auf der Rechnung ausweisen
    const rate = smallBusiness || item.margin ? 0 : item.vatRate;
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

/** Steuer je Satz zusammenzählen (für Abschlüsse über viele Belege). */
export function addVat(into: Totals["vat"], add: Totals["vat"]): Totals["vat"] {
  const map = new Map(into.map((v) => [v.rate, { ...v }]));
  for (const v of add) {
    const row = map.get(v.rate) ?? { rate: v.rate, netCents: 0, vatCents: 0 };
    row.netCents += v.netCents;
    row.vatCents += v.vatCents;
    map.set(v.rate, row);
  }
  return [...map.values()].filter((v) => v.netCents || v.vatCents).sort((a, b) => b.rate - a.rate);
}

/** Belegnummer, z. B. „RE-2026-0007“ (ein Nummernkreis je Firma und Jahr). */
export const receiptNumber = (year: number, seq: number) => `RE-${year}-${String(seq).padStart(4, "0")}`;

export const emptyByMethod = (): Record<PayMethod, number> => ({ cash: 0, card: 0, transfer: 0, voucher: 0 });

export type PaymentProblem = "paymentMissing" | "paymentTooLow" | "changeWithoutCash" | "paymentMethod";

/**
 * Zahlungen prüfen und Rückgeld ausrechnen. Zu viel gegeben geht nur bar (Rückgeld);
 * bei Auszahlungen (Betrag negativ) wird genau ein negativer Betrag erwartet.
 * Gibt die gebuchten Zahlungen zurück: Bargeld ohne Rückgeld, leere Beträge entfernt.
 */
export function settlePayments(dueCents: number, input: Payment[], allowed: readonly PayMethod[] = PAY_METHODS):
  { ok: true; payments: Payment[]; givenCents: number; changeCents: number } | { ok: false; problem: PaymentProblem } {
  const merged = new Map<PayMethod, number>();
  for (const p of input) {
    if (!p.cents) continue;
    if (!allowed.includes(p.method)) return { ok: false, problem: "paymentMethod" };
    merged.set(p.method, (merged.get(p.method) ?? 0) + p.cents);
  }
  const list = [...merged.entries()].map(([method, cents]) => ({ method, cents }));
  if (dueCents === 0) return { ok: true, payments: [], givenCents: 0, changeCents: 0 };
  if (dueCents < 0) {
    // Auszahlung an den Kunden, z. B. Anzahlung höher als die Rechnung oder Storno
    if (list.length === 0) return { ok: false, problem: "paymentMissing" };
    const sum = list.reduce((s, p) => s + p.cents, 0);
    if (sum !== dueCents) return { ok: false, problem: "paymentTooLow" };
    return { ok: true, payments: list, givenCents: 0, changeCents: 0 };
  }
  if (list.length === 0) return { ok: false, problem: "paymentMissing" };
  if (list.some((p) => p.cents < 0)) return { ok: false, problem: "paymentTooLow" };
  const sum = list.reduce((s, p) => s + p.cents, 0);
  if (sum < dueCents) return { ok: false, problem: "paymentTooLow" };
  const change = sum - dueCents;
  const cash = merged.get("cash") ?? 0;
  if (change > cash) return { ok: false, problem: "changeWithoutCash" };
  const payments = list.map((p) => (p.method === "cash" ? { ...p, cents: p.cents - change } : p)).filter((p) => p.cents !== 0);
  return { ok: true, payments, givenCents: change ? cash : 0, changeCents: change };
}

// ---------- Eingaben prüfen ----------

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const int = (value: unknown, min: number, max: number) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : 0;
};
const MAX_CENTS = 100_000_000;

/** Steuersatz aus einer Eingabe: 0 bis unter 100 Prozent, sonst der Ersatzwert. */
export function vatRateOf(value: unknown, fallback = 19): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 100 ? Math.round(value * 100) / 100 : fallback;
}

export function sanitizeLine(input: unknown, fallbackVat = 19): PosLine | null {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const source: PosSource = i.source === "repairs" ? "repairs" : "pos";
  const name = str(i.name, 160);
  const kind = str(i.kind, 30) || "item";
  const refId = typeof i.refId === "string" && i.refId ? i.refId.slice(0, 64) : null;
  if (!name && source === "pos") return null;
  const qty = typeof i.qty === "number" && Number.isFinite(i.qty) ? Math.min(Math.max(Math.round(i.qty * 1000) / 1000, 0.001), 10_000) : 1;
  return { source, kind, refId, name, qty, unitCents: int(i.unitCents, -MAX_CENTS, MAX_CENTS), vatRate: vatRateOf(i.vatRate, fallbackVat) };
}

export function sanitizePayments(input: unknown): Payment[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 8)
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
    .filter((p) => PAY_METHODS.includes(p.method as PayMethod))
    .map((p) => ({ method: p.method as PayMethod, cents: int(p.cents, -MAX_CENTS, MAX_CENTS) }));
}

export function sanitizeCustomer(input: unknown): PosCustomer | null {
  const c = (input && typeof input === "object" ? input : null) as Record<string, unknown> | null;
  if (!c) return null;
  const customer = {
    id: typeof c.id === "string" && c.id ? c.id.slice(0, 64) : null,
    name: str(c.name, 120), address: str(c.address, 300), phone: str(c.phone, 40), email: str(c.email, 160).toLowerCase(),
  };
  return customer.name || customer.address || customer.phone || customer.email || customer.id ? customer : null;
}

export function sanitizePosSettings(input: unknown): PosSettings {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const methods = Array.isArray(s.methods) ? PAY_METHODS.filter((m) => (s.methods as unknown[]).includes(m)) : DEFAULT_POS_SETTINGS.methods;
  const quickItems = Array.isArray(s.quickItems)
    ? s.quickItems
        .slice(0, 48)
        .map((q) => (q && typeof q === "object" ? (q as Record<string, unknown>) : {}))
        .map((q) => ({
          id: typeof q.id === "string" && q.id ? q.id.slice(0, 64) : crypto.randomUUID(),
          name: str(q.name, 80), priceCents: int(q.priceCents, 0, MAX_CENTS), vatRate: vatRateOf(q.vatRate),
        }))
        .filter((q) => q.name)
    : [];
  return {
    // Bar geht immer, sonst kann die Kasse kein Rückgeld geben
    methods: methods.includes("cash") ? methods : ["cash", ...methods],
    quickItems,
    smallBusiness: s.smallBusiness === true,
    footer: str(s.footer, 400),
    print: s.print === "bon" || s.print === "a4" ? s.print : "ask",
  };
}

/** Betrag aus einer Eingabe („12,50“, „12.5“, „1.234,00“) in Cent; null bei ungültiger Eingabe. */
export function parseAmount(value: string): number | null {
  let v = value.trim().replace(/\s|€|[$£¥₺₹₴₽]|^[A-Z]{3}|[A-Z]{3}$/g, "");
  if (!v) return 0;
  const negative = v.startsWith("-");
  if (negative) v = v.slice(1);
  if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
  else v = v.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const cents = Math.round(Number(v) * 100);
  return negative ? -cents : cents;
}

/** Scheine und Münzen zum Zählen (Euro-Raum); andere Währungen zählen den Gesamtbetrag. */
export const EURO_DENOMINATIONS = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
