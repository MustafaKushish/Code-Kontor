// Abo-Preise von Code Kontor. Grundlage sind die Katalogpreise der Branchen-Systeme.
// Alle Beträge sind netto in Euro; abgerechnet wird über Stripe.

import { findApp } from "./apps";

export const TRIAL_DAYS = 30;
export const INCLUDED_USERS = 3;
export const EXTRA_USER_PRICE = 5;
/** Jedes zweite und weitere System kostet nur diesen Anteil. */
export const ADDITIONAL_SYSTEM_FACTOR = 0.5;
/** Bei jährlicher Zahlung zahlt man so viele Monate. */
export const YEARLY_MONTHS = 10;

export type BillingInterval = "month" | "year";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";

export interface QuoteLine {
  kind: "system" | "users";
  /** App-ID oder "users" */
  id: string;
  quantity: number;
  /** Preis pro Stück im gewählten Zeitraum, in Cent */
  unitAmount: number;
  discounted: boolean;
}

export interface Quote {
  interval: BillingInterval;
  lines: QuoteLine[];
  /** Summe netto in Cent */
  total: number;
  /** Zum Vergleich: Summe pro Monat in Cent */
  perMonth: number;
}

const cents = (euro: number) => Math.round(euro * 100);

/** Berechnet den Abo-Preis für die installierten Systeme und die Anzahl der Benutzer. */
export function quote(installedApps: string[], users: number, interval: BillingInterval = "month"): Quote {
  const months = interval === "year" ? YEARLY_MONTHS : 1;
  // Teuerstes System zum vollen Preis, alle weiteren mit Rabatt
  const apps = installedApps
    .map((id) => findApp(id))
    .filter((a) => a !== undefined)
    .sort((a, b) => b.priceMonthly - a.priceMonthly);
  const lines: QuoteLine[] = apps.map((app, i) => ({
    kind: "system",
    id: app.id,
    quantity: 1,
    unitAmount: cents(app.priceMonthly * (i === 0 ? 1 : ADDITIONAL_SYSTEM_FACTOR) * months),
    discounted: i > 0,
  }));
  const extraUsers = Math.max(0, users - INCLUDED_USERS);
  if (extraUsers > 0) lines.push({ kind: "users", id: "users", quantity: extraUsers, unitAmount: cents(EXTRA_USER_PRICE * months), discounted: false });
  const total = lines.reduce((sum, l) => sum + l.unitAmount * l.quantity, 0);
  return { interval, lines, total, perMonth: Math.round(total / (interval === "year" ? 12 : 1)) };
}

/** Darf die Firma die App normal nutzen? */
export function hasAccess(status: SubscriptionStatus, trialEndsAt: string | null, now = new Date()): boolean {
  if (status === "active" || status === "past_due") return true;
  if (status === "trialing") return !!trialEndsAt && Date.parse(trialEndsAt) > now.getTime();
  return false;
}

export function daysLeft(trialEndsAt: string | null, now = new Date()): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(trialEndsAt) - now.getTime()) / 86_400_000));
}

/** Stripe-Status auf unseren Status abbilden. */
export function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      return "canceled";
  }
}
