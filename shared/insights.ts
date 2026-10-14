// Zentrale Auswertung: Zahlen aus allen Systemen der Firma für einen Zeitraum.
// Umsatz kommt aus den Belegen der Kasse (dort laufen auch Abholungen und Verkäufe der Module durch),
// dazu Aufträge des Handy- & IT-Service und die gestempelte Arbeitszeit.

import type { PayMethod, PosSource } from "./pos";
import { sessionsFromStamps, type TimeEntry } from "./time";

export const INSIGHT_PERIODS = ["day", "week", "month", "year"] as const;
export type InsightPeriod = (typeof INSIGHT_PERIODS)[number];
export type InsightBucket = "hour" | "day" | "month";

export interface Range {
  /** Erster Tag (YYYY-MM-DD, Ortszeit) */
  from: string;
  /** Letzter Tag, einschließlich */
  to: string;
}

export interface SalesStats {
  /** Verkäufe minus Stornos, ohne Anzahlungen (die zählen erst mit dem Verkauf) */
  revenueCents: number;
  /** Verkaufsbelege, die nicht storniert sind */
  receipts: number;
  cancels: number;
  /** Betrag der Stornobelege (positiv) */
  cancelCents: number;
  /** Eingenommen je Zahlart, mit Anzahlungen und Stornos */
  byMethod: Record<PayMethod, number>;
  /** Umsatz je Stunde, Tag oder Monat, lückenlos */
  series: { key: string; cents: number }[];
  /** Umsatz je Uhrzeit (0–23) */
  hours: number[];
  /** Warengruppen; Gruppen der Module beginnen mit „@“ (z. B. „@repairs.part“), "" = ohne Gruppe */
  groups: { group: string; cents: number; qty: number }[];
  articles: { name: string; group: string; cents: number; qty: number }[];
  /** Umsatz je Herkunft: direkt in der Kasse oder aus einem System */
  sources: { source: PosSource; cents: number }[];
}

export interface RepairPipeline {
  /** In Arbeit (angenommen bis Reparatur) */
  open: number;
  /** Warten auf Freigabe des Kostenvoranschlags */
  waiting: number;
  /** Abholbereit */
  pickup: number;
  /** Im Zeitraum angenommen */
  received: number;
  /** Im Zeitraum abgeholt */
  pickedUp: number;
}

export interface WorkTime {
  /** Gestempelte Minuten im Zeitraum (ohne Pausenabzug) */
  minutes: number;
  /** Personen mit Arbeitszeit im Zeitraum */
  people: number;
  /** Gerade eingestempelt */
  present: number;
}

export interface Insights extends Range {
  bucket: InsightBucket;
  sales: SalesStats;
  previous: Range & { revenueCents: number; receipts: number };
  repairs: RepairPipeline | null;
  time: WorkTime;
}

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const parse = (day: string) => new Date(`${day}T00:00:00Z`);
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (day: string, n: number) => fmt(new Date(parse(day).getTime() + n * DAY));
const lastOfMonth = (year: number, month0: number) => fmt(new Date(Date.UTC(year, month0 + 1, 0)));

export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && fmt(parse(v)) === v;
export const daysBetween = (r: Range) => Math.round((parse(r.to).getTime() - parse(r.from).getTime()) / DAY) + 1;

/** Zeitraum zu „heute/Woche/Monat/Jahr“; offset −1 = der davor. Wochen beginnen am Montag. */
export function periodRange(period: InsightPeriod, offset: number, today: string): Range {
  const t = parse(today);
  if (period === "day") {
    const d = addDays(today, offset);
    return { from: d, to: d };
  }
  if (period === "week") {
    const monday = addDays(today, -((t.getUTCDay() + 6) % 7) + offset * 7);
    return { from: monday, to: addDays(monday, 6) };
  }
  if (period === "month") {
    const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset, 1));
    return { from: fmt(first), to: lastOfMonth(first.getUTCFullYear(), first.getUTCMonth()) };
  }
  const year = t.getUTCFullYear() + offset;
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Vergleichszeitraum direkt davor: ganze Monate (und Jahre) als Monate, sonst gleich viele Tage. */
export function previousRange(r: Range): Range {
  const from = parse(r.from);
  const to = parse(r.to);
  if (from.getUTCDate() === 1 && r.to === lastOfMonth(to.getUTCFullYear(), to.getUTCMonth())) {
    const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1;
    const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - months, 1));
    return { from: fmt(start), to: addDays(r.from, -1) };
  }
  const n = daysBetween(r);
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}

/**
 * Vergleichszeitraum für den Trend. Läuft der Zeitraum noch (z. B. dieser Monat bis heute),
 * zählen davor nur gleich viele Tage, sonst wäre ein halber Monat immer „schlechter“.
 */
export function comparisonRange(r: Range, today: string): Range {
  const prev = previousRange(r);
  if (today < r.from || today >= r.to) return prev;
  const end = addDays(prev.from, daysBetween({ from: r.from, to: today }) - 1);
  return { from: prev.from, to: end < prev.to ? end : prev.to };
}

/** Ein Tag zeigt Stunden, bis gut zwei Monate Tage, darüber Monate. */
export const bucketOf = (r: Range): InsightBucket => (r.from === r.to ? "hour" : daysBetween(r) <= 62 ? "day" : "month");

/** Alle Schlüssel der Zeitachse, damit leere Stunden/Tage/Monate als 0 erscheinen. */
export function bucketKeys(r: Range, bucket: InsightBucket): string[] {
  if (bucket === "hour") return Array.from({ length: 24 }, (_, h) => pad(h));
  if (bucket === "day") return Array.from({ length: daysBetween(r) }, (_, i) => addDays(r.from, i));
  const keys: string[] = [];
  for (let m = r.from.slice(0, 7); m <= r.to.slice(0, 7); ) {
    keys.push(m);
    const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1));
    m = fmt(d).slice(0, 7);
  }
  return keys;
}

/** Prüft from/to aus der Anfrage; ohne Angabe der laufende Monat. Höchstens ein Jahr (plus Schalttag). */
export function sanitizeRange(input: { from?: unknown; to?: unknown }, today: string): Range | null {
  if (input.from === undefined && input.to === undefined) return periodRange("month", 0, today);
  if (!isDay(input.from) || !isDay(input.to) || input.to < input.from) return null;
  const r = { from: input.from, to: input.to };
  return daysBetween(r) <= 366 ? r : null;
}

/** Gestempelte Arbeitszeit aller Personen im Zeitraum; eine Schicht zählt zum Tag ihres Beginns. */
export function workTime(entries: TimeEntry[], r: Range, now = new Date()): WorkTime {
  const byPerson = new Map<string, TimeEntry[]>();
  for (const e of entries) byPerson.set(e.employeeId, [...(byPerson.get(e.employeeId) ?? []), e]);
  let minutes = 0;
  let people = 0;
  let present = 0;
  for (const list of byPerson.values()) {
    let own = 0;
    for (const s of sessionsFromStamps(list, now)) {
      if (s.open) present++;
      if (s.orphanOut || !s.end || s.day < r.from || s.day > r.to) continue;
      own += Math.max(0, Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60_000));
    }
    if (own) people++;
    minutes += own;
  }
  return { minutes, people, present };
}
