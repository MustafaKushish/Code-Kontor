// Vorschläge zur Auswertung: feste Regeln, die aus den Zahlen konkrete Tipps für den nächsten Monat machen.
// Sie erscheinen sofort (ohne KI); die Texte kommen aus den Übersetzungen (insights.tips.<id>).

import type { Insights } from "./insights";

export type TipTone = "warn" | "idea" | "good";
export type Industry = "handy" | "salon" | "workshop" | "food" | "shop";
export type Season = "christmas" | "newYear" | "spring" | "summer" | "autumn";

export interface Tip {
  id: "revenueDown" | "revenueUp" | "waiting" | "pickup" | "cancels" | "basket" | "quietHours" | "topGroup" | "bestseller" | "productivity" | "season" | "empty";
  tone: TipTone;
  /** Beträge in Cent (Schlüssel enden auf „Cents“), Anteile in Prozent (enden auf „Pct“), sonst Text oder Zahl */
  vars: Record<string, string | number>;
}

/** Branche aus den installierten Systemen; bestimmt Zusatzverkäufe und Beispiele. */
export function industryOf(installedApps: string[]): Industry {
  if (installedApps.includes("handy-it")) return "handy";
  if (installedApps.includes("friseur")) return "salon";
  if (installedApps.includes("werkstatt") || installedApps.includes("autohaus")) return "workshop";
  if (installedApps.includes("restaurant")) return "food";
  return "shop";
}

/** Jahreszeit des Monats (1–12) für den Saison-Tipp. */
export function seasonOf(month: number): Season {
  if (month === 11 || month === 12) return "christmas";
  if (month <= 2) return "newYear";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

/** Monat nach dem Tag `today` (YYYY-MM-DD) als YYYY-MM. */
export function nextMonthOf(today: string): string {
  const d = new Date(`${today.slice(0, 7)}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** Die wichtigsten Vorschläge, Probleme zuerst, höchstens `limit`. */
export function adviceFor(ins: Insights, installedApps: string[], today: string, limit = 7): Tip[] {
  const s = ins.sales;
  const tips: Tip[] = [];
  const season: Tip = { id: "season", tone: "idea", vars: { month: nextMonthOf(today), season: seasonOf(Number(nextMonthOf(today).slice(5))) } };
  if (s.receipts < 3 && s.revenueCents <= 0) return [{ id: "empty", tone: "idea", vars: {} }, season];

  // Probleme
  const before = ins.previous.revenueCents;
  const change = before > 0 ? pct(s.revenueCents - before, before) : 0;
  if (before > 0 && change <= -10) tips.push({ id: "revenueDown", tone: "warn", vars: { changePct: -change, beforeCents: before } });
  if (ins.repairs?.waiting) tips.push({ id: "waiting", tone: "warn", vars: { n: ins.repairs.waiting } });
  if (ins.repairs?.pickup) tips.push({ id: "pickup", tone: "warn", vars: { n: ins.repairs.pickup } });
  const cancelPct = pct(s.cancels, s.receipts + s.cancels);
  if (s.cancels >= 2 && cancelPct >= 3) tips.push({ id: "cancels", tone: "warn", vars: { n: s.cancels, sharePct: cancelPct } });

  // Ideen aus den Zahlen
  if (s.receipts > 0) {
    const avg = Math.round(s.revenueCents / s.receipts);
    tips.push({ id: "basket", tone: "idea", vars: { avgCents: avg, targetCents: Math.round(avg * 1.1), gainCents: Math.round(s.revenueCents * 0.1), industry: industryOf(installedApps) } });
  }
  const hours = s.hours.map((cents, h) => ({ h, cents })).filter((x) => x.cents > 0);
  if (hours.length >= 4) {
    const peak = hours.reduce((a, b) => (b.cents > a.cents ? b : a));
    const quiet = hours.reduce((a, b) => (b.cents < a.cents ? b : a));
    if (quiet.cents * 3 <= peak.cents) tips.push({ id: "quietHours", tone: "idea", vars: { peak: peak.h, peakCents: peak.cents, quiet: quiet.h, quietCents: quiet.cents } });
  }
  const group = s.groups[0];
  if (group && group.group && s.revenueCents > 0 && pct(group.cents, s.revenueCents) >= 30)
    tips.push({ id: "topGroup", tone: "idea", vars: { group: group.group, sharePct: pct(group.cents, s.revenueCents) } });
  const best = s.articles[0];
  if (best && best.qty >= 3) tips.push({ id: "bestseller", tone: "idea", vars: { name: best.name, qty: best.qty } });
  if (ins.time.minutes >= 60 && s.revenueCents > 0)
    tips.push({ id: "productivity", tone: "idea", vars: { perHourCents: Math.round(s.revenueCents / (ins.time.minutes / 60)), hours: Math.round(ins.time.minutes / 60) } });

  // Gutes zum Schluss, dann die Saison
  if (before > 0 && change >= 10) tips.push({ id: "revenueUp", tone: "good", vars: { changePct: change, beforeCents: before } });
  return [...tips.slice(0, limit - 1), season];
}
