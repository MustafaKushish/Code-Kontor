// Zeitwirtschaft: Stempelzeiten, Abwesenheiten, Feiertage und daraus das Zeit- und Urlaubskonto.
// Alle Rechnungen laufen in der Zeitzone der Firma (Standard Europe/Berlin), Zeiten werden als UTC gespeichert.

export const TIME_ZONE = "Europe/Berlin";

export type StampKind = "in" | "out";
export type StampSource = "app" | "terminal" | "manual";

export interface TimeEntry {
  id: string;
  employeeId: string;
  kind: StampKind;
  /** Zeitpunkt in UTC (ISO) */
  at: string;
  source: StampSource;
  note: string;
}

export const ABSENCE_TYPES = ["vacation", "sick", "childSick", "training", "unpaid", "compensation"] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

export interface Absence {
  id: string;
  employeeId: string;
  type: AbsenceType;
  /** Erster und letzter Tag (YYYY-MM-DD) */
  from: string;
  to: string;
  halfDay: boolean;
  note: string;
}

export const STATES = ["", "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH"] as const;
export type State = (typeof STATES)[number];

export interface TimeSettings {
  /** Bundesland für die Feiertage; leer = nur bundesweite Feiertage */
  state: State;
  /** Ab diesem Tag zählt das Zeitkonto (Start der Zeiterfassung), YYYY-MM-DD; leer = ab Eintritt */
  since: string;
}

/** Was die Zeitwirtschaft von einer Person braucht. */
export interface WorkProfile {
  id: string;
  startDate: string;
  endDate: string;
  weeklyHours: number;
  /** Arbeitstage 1 = Montag … 7 = Sonntag */
  workDays: number[];
  vacationDays: number;
  /** Übertrag aus dem Vorjahr bzw. Startwert des Zeitkontos in Stunden */
  openingBalance: number;
  /** Resturlaub aus dem Vorjahr in Tagen */
  vacationCarryover: number;
}

// ---------- Datum ----------

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseDay = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};
/** Wochentag 1 = Montag … 7 = Sonntag */
export const weekday = (s: string) => ((parseDay(s).getUTCDay() + 6) % 7) + 1;

/** Kalendertag in der Firmenzeitzone für einen UTC-Zeitpunkt. */
export function localDay(iso: string, timeZone = TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

// ---------- Feiertage ----------

function easter(year: number): string {
  // Gaußsche Osterformel (Anonymous Gregorian algorithm)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Gesetzliche Feiertage in Deutschland, je nach Bundesland. Schlüssel: Datum, Wert: Name. */
export function holidays(year: number, state: State = ""): Map<string, string> {
  const e = easter(year);
  const list: [string, string, State[] | null][] = [
    [`${year}-01-01`, "Neujahr", null],
    [`${year}-01-06`, "Heilige Drei Könige", ["BW", "BY", "ST"]],
    [`${year}-03-08`, "Internationaler Frauentag", ["BE", "MV"]],
    [addDays(e, -2), "Karfreitag", null],
    [addDays(e, 1), "Ostermontag", null],
    [`${year}-05-01`, "Tag der Arbeit", null],
    [addDays(e, 39), "Christi Himmelfahrt", null],
    [addDays(e, 50), "Pfingstmontag", null],
    [addDays(e, 60), "Fronleichnam", ["BW", "BY", "HE", "NW", "RP", "SL"]],
    [`${year}-08-15`, "Mariä Himmelfahrt", ["SL"]],
    [`${year}-09-20`, "Weltkindertag", ["TH"]],
    [`${year}-10-03`, "Tag der Deutschen Einheit", null],
    [`${year}-10-31`, "Reformationstag", ["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH"]],
    [`${year}-11-01`, "Allerheiligen", ["BW", "BY", "NW", "RP", "SL"]],
    [`${year}-12-25`, "1. Weihnachtstag", null],
    [`${year}-12-26`, "2. Weihnachtstag", null],
  ];
  // Buß- und Bettag (Sachsen): Mittwoch vor dem 23. November
  let bb = `${year}-11-22`;
  while (weekday(bb) !== 3) bb = addDays(bb, -1);
  list.push([bb, "Buß- und Bettag", ["SN"]]);
  const map = new Map<string, string>();
  for (const [day, name, states] of list) if (!states || (state && states.includes(state))) map.set(day, name);
  return map;
}

// ---------- Arbeitszeit ----------

/** Gesetzliche Mindestpause (ArbZG §4): über 6 Stunden 30 Minuten, über 9 Stunden 45 Minuten. */
export function requiredBreakMinutes(grossMinutes: number): number {
  if (grossMinutes > 9 * 60) return 45;
  if (grossMinutes > 6 * 60) return 30;
  return 0;
}

/** Eine Schicht darf höchstens so lange offen sein, sonst gilt das „Gehen“ als vergessen. */
const MAX_SHIFT_MINUTES = 16 * 60;

export interface DayResult {
  day: string;
  /** Soll in Minuten */
  target: number;
  /** Gearbeitet in Minuten (nach gesetzlicher Pause) */
  worked: number;
  /** Gutgeschrieben für Urlaub, Krankheit usw. in Minuten */
  credited: number;
  /** Automatisch abgezogene Pause in Minuten */
  autoBreak: number;
  holiday: string | null;
  absence: AbsenceType | null;
  absenceHalf: boolean;
  /** Stempelpaare (lokale Uhrzeit HH:MM) */
  sessions: { from: string; to: string | null; minutes: number }[];
  /** Fehlendes „Gehen“ oder „Kommen“ */
  incomplete: boolean;
}

const localTime = (iso: string, timeZone = TIME_ZONE) =>
  new Intl.DateTimeFormat("de-DE", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

/** Stempel in Schichten (Kommen → Gehen) aufteilen. Eine Schicht zählt zum Tag ihres Beginns. */
export function sessionsFromStamps(entries: TimeEntry[], now = new Date()) {
  const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  const sessions: { day: string; start: string; end: string | null; open: boolean; orphanOut: boolean }[] = [];
  let open: TimeEntry | null = null;
  for (const e of sorted) {
    if (e.kind === "in") {
      if (open) sessions.push({ day: localDay(open.at), start: open.at, end: null, open: false, orphanOut: false });
      open = e;
    } else if (open && Date.parse(e.at) - Date.parse(open.at) <= MAX_SHIFT_MINUTES * 60_000) {
      sessions.push({ day: localDay(open.at), start: open.at, end: e.at, open: false, orphanOut: false });
      open = null;
    } else {
      if (open) sessions.push({ day: localDay(open.at), start: open.at, end: null, open: false, orphanOut: false });
      open = null;
      sessions.push({ day: localDay(e.at), start: e.at, end: e.at, open: false, orphanOut: true });
    }
  }
  if (open) {
    const running = now.getTime() - Date.parse(open.at) <= MAX_SHIFT_MINUTES * 60_000;
    sessions.push({ day: localDay(open.at), start: open.at, end: running ? now.toISOString() : null, open: running, orphanOut: false });
  }
  return sessions;
}

const minutesBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60_000));

/** Ist die Person an dem Tag beschäftigt? */
const employedOn = (p: Pick<WorkProfile, "startDate" | "endDate">, day: string) => !!p.startDate && p.startDate <= day && (!p.endDate || p.endDate >= day);

/** Tagessoll in Minuten an einem regulären Arbeitstag. */
export const dailyTarget = (p: Pick<WorkProfile, "weeklyHours" | "workDays">) =>
  p.workDays.length ? Math.round((p.weeklyHours * 60) / p.workDays.length) : 0;

/** Tage von from bis to auswerten (inklusive). */
export function computeDays(
  profile: WorkProfile,
  entries: TimeEntry[],
  absences: Absence[],
  range: { from: string; to: string },
  settings: TimeSettings,
  now = new Date(),
): DayResult[] {
  const sessions = sessionsFromStamps(entries, now);
  const holidayCache = new Map<number, Map<string, string>>();
  const holidayOf = (day: string) => {
    const y = Number(day.slice(0, 4));
    if (!holidayCache.has(y)) holidayCache.set(y, holidays(y, settings.state));
    return holidayCache.get(y)!.get(day) ?? null;
  };
  const perDay = dailyTarget(profile);
  return eachDay(range.from, range.to).map((day) => {
    const employed = employedOn(profile, day);
    const holiday = holidayOf(day);
    const tracked = !settings.since || day >= settings.since;
    const isWorkday = employed && tracked && profile.workDays.includes(weekday(day)) && !holiday;
    const target = isWorkday ? perDay : 0;
    const absence = absences.find((a) => a.from <= day && a.to >= day) ?? null;
    const daySessions = sessions.filter((s) => s.day === day);
    const gross = daySessions.reduce((sum, s) => sum + (s.end && !s.orphanOut ? minutesBetween(s.start, s.end) : 0), 0);
    // Pausen = Lücken zwischen den Schichten des Tages
    const closed = daySessions.filter((s) => s.end && !s.orphanOut).sort((a, b) => a.start.localeCompare(b.start));
    let recordedBreak = 0;
    for (let i = 1; i < closed.length; i++) recordedBreak += minutesBetween(closed[i - 1]!.end!, closed[i]!.start);
    const autoBreak = Math.min(gross, Math.max(0, requiredBreakMinutes(gross + recordedBreak) - recordedBreak));
    const credit = absence && isWorkday && absence.type !== "unpaid" && absence.type !== "compensation" ? (absence.halfDay ? Math.round(target / 2) : target) : 0;
    return {
      day,
      target: absence?.type === "unpaid" && isWorkday ? (absence.halfDay ? Math.round(target / 2) : 0) : target,
      worked: gross - autoBreak,
      credited: credit,
      autoBreak,
      holiday,
      absence: absence?.type ?? null,
      absenceHalf: !!absence?.halfDay,
      sessions: daySessions.map((s) => ({
        from: s.orphanOut ? "" : localTime(s.start),
        to: s.orphanOut ? localTime(s.start) : s.end && !s.open ? localTime(s.end) : null,
        minutes: s.end && !s.orphanOut ? minutesBetween(s.start, s.end) : 0,
      })),
      incomplete: daySessions.some((s) => (!s.end && !s.open) || s.orphanOut),
    };
  });
}

export interface YearAccount {
  year: number;
  /** Soll, Ist (inkl. Gutschriften) und Saldo bis heute, in Minuten */
  target: number;
  actual: number;
  balance: number;
  /** Saldo inklusive Übertrag aus dem Vorjahr */
  balanceTotal: number;
  vacationEntitlement: number;
  vacationTaken: number;
  vacationPlanned: number;
  vacationLeft: number;
  sickDays: number;
  incompleteDays: number;
}

/** Urlaubsanspruch im Jahr: je vollem Beschäftigungsmonat 1/12 (BUrlG §5), auf halbe Tage gerundet. */
export function vacationEntitlement(p: Pick<WorkProfile, "startDate" | "endDate" | "vacationDays">, year: number): number {
  let months = 0;
  for (let m = 1; m <= 12; m++) {
    const first = `${year}-${pad(m)}-01`;
    const last = addDays(m === 12 ? `${year + 1}-01-01` : `${year}-${pad(m + 1)}-01`, -1);
    if (p.startDate && p.startDate <= first && (!p.endDate || p.endDate >= last)) months++;
  }
  return Math.round(((p.vacationDays * months) / 12) * 2) / 2;
}

/** Zeit- und Urlaubskonto für ein Jahr. Soll und Ist zählen bis heute, Urlaub fürs ganze Jahr. */
export function computeYear(
  profile: WorkProfile,
  entries: TimeEntry[],
  absences: Absence[],
  year: number,
  settings: TimeSettings,
  now = new Date(),
): YearAccount {
  const today = localDay(now.toISOString());
  const from = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const to = today < yearEnd ? today : yearEnd;
  const days = to >= from ? computeDays(profile, entries, absences, { from, to }, settings, now) : [];
  // Der laufende Tag zählt erst, wenn sein Soll erreicht ist, sonst stünde morgens schon das ganze Tagessoll im Minus
  const counted = days.filter((d) => d.day < today || d.worked + d.credited >= d.target);
  const target = counted.reduce((s, d) => s + d.target, 0);
  const actual = counted.reduce((s, d) => s + d.worked + d.credited, 0);
  // Urlaub über das ganze Jahr zählen (auch geplanten)
  const all = computeDays(profile, [], absences, { from, to: yearEnd }, settings, now);
  let taken = 0, planned = 0, sick = 0;
  for (const d of all) {
    if (!d.absence || d.target === 0) continue;
    const amount = d.absenceHalf ? 0.5 : 1;
    if (d.absence === "vacation") (d.day <= today ? (taken += amount) : (planned += amount));
    if ((d.absence === "sick" || d.absence === "childSick") && d.day <= today) sick += amount;
  }
  const entitlement = vacationEntitlement(profile, year) + profile.vacationCarryover;
  const balance = actual - target;
  return {
    year,
    target,
    actual,
    balance,
    balanceTotal: balance + Math.round(profile.openingBalance * 60),
    vacationEntitlement: entitlement,
    vacationTaken: taken,
    vacationPlanned: planned,
    vacationLeft: entitlement - taken - planned,
    sickDays: sick,
    incompleteDays: days.filter((d) => d.incomplete && d.day < today).length,
  };
}

/** Nächster Stempel: nach „Kommen“ folgt „Gehen“, sonst „Kommen“ (offene Schichten älter als 16 Stunden gelten als beendet). */
export function nextStampKind(last: Pick<TimeEntry, "kind" | "at"> | null, now = new Date()): StampKind {
  if (!last || last.kind === "out") return "in";
  return now.getTime() - Date.parse(last.at) > MAX_SHIFT_MINUTES * 60_000 ? "in" : "out";
}

/** Monatswerte für die Lohn-Monatsmeldung. */
export function monthTotals(days: DayResult[]) {
  const worked = days.reduce((s, d) => s + d.worked, 0);
  const target = days.reduce((s, d) => s + d.target, 0);
  const credited = days.reduce((s, d) => s + d.credited, 0);
  const count = (types: AbsenceType[]) => days.reduce((s, d) => s + (d.absence && types.includes(d.absence) && d.target > 0 ? (d.absenceHalf ? 0.5 : 1) : 0), 0);
  return {
    hours: Math.round((worked / 60) * 100) / 100,
    overtimeHours: Math.round((Math.max(0, worked + credited - target) / 60) * 100) / 100,
    vacationDays: count(["vacation"]),
    sickDays: count(["sick", "childSick"]),
  };
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function sanitizeAbsence(input: Record<string, unknown>): Omit<Absence, "id"> | null {
  const type = ABSENCE_TYPES.includes(input.type as AbsenceType) ? (input.type as AbsenceType) : null;
  if (!type || !isDay(input.from)) return null;
  const to = isDay(input.to) && input.to >= input.from ? input.to : input.from;
  return { employeeId: str(input.employeeId, 64), type, from: input.from, to, halfDay: input.halfDay === true && to === input.from, note: str(input.note, 300) };
}

export function sanitizeTimeSettings(input: Record<string, unknown>): TimeSettings {
  return {
    state: STATES.includes(input.state as State) ? (input.state as State) : "",
    since: isDay(input.since) ? input.since : "",
  };
}

/** Minuten als „7:30“ bzw. „-1:15“. */
export function formatMinutes(min: number): string {
  const sign = min < 0 ? "−" : "";
  const abs = Math.abs(Math.round(min));
  return `${sign}${Math.floor(abs / 60)}:${pad(abs % 60)}`;
}

// ---------- Anträge: Mitarbeiter beantragen, Inhaber oder Admin entscheidet ----------

export type RequestStatus = "pending" | "approved" | "rejected";

export type TimeRequestData =
  | { type: "stamp"; kind: StampKind; at: string }
  | { type: "absence"; absence: AbsenceType; from: string; to: string; halfDay: boolean };

export interface TimeRequest {
  id: string;
  employeeId: string;
  data: TimeRequestData;
  note: string;
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  reply: string;
}

/** Wie weit ein Nachtrag zurückliegen darf. */
export const REQUEST_MAX_DAYS_BACK = 62;

/** Antrag prüfen. Gibt null zurück, wenn etwas nicht stimmt. */
export function sanitizeRequest(input: Record<string, unknown>, now = new Date()): { data: TimeRequestData; note: string } | null {
  const note = str(input.note, 300);
  if (input.type === "stamp") {
    if ((input.kind !== "in" && input.kind !== "out") || typeof input.at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(input.at)) return null;
    const at = Date.parse(input.at);
    if (Number.isNaN(at) || at > now.getTime() || now.getTime() - at > REQUEST_MAX_DAYS_BACK * 86_400_000) return null;
    return { data: { type: "stamp", kind: input.kind, at: new Date(at).toISOString() }, note };
  }
  if (input.type === "absence") {
    const absence = sanitizeAbsence({ ...input, type: input.absence });
    if (!absence) return null;
    return { data: { type: "absence", absence: absence.type, from: absence.from, to: absence.to, halfDay: absence.halfDay }, note };
  }
  return null;
}
