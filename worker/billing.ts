// Abo-Verwaltung: Testphase, Stripe-Checkout, Kundenportal, Webhooks und Abgleich bei Änderungen.

import { CATALOG } from "../shared/apps";
import { mapStripeStatus, quote, TRIAL_DAYS, type BillingInterval, type SubscriptionStatus } from "../shared/billing";
import { stripe, StripeError } from "./stripe";

interface BillingEnv {
  PLATFORM_DB: D1Database;
  STRIPE_SECRET_KEY?: string;
}

export interface SubscriptionRow {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  interval: BillingInterval;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  customerId: string | null;
  subscriptionId: string | null;
}

export const billingEnabled = (env: BillingEnv) => !!env.STRIPE_SECRET_KEY;

export const trialEnd = (from = Date.now()) => new Date(from + TRIAL_DAYS * 86_400_000).toISOString();

/** Abo der Firma lesen; fehlt es (alte Firma), beginnt die Testphase jetzt. */
export async function getSubscription(env: BillingEnv, tenantId: string): Promise<SubscriptionRow> {
  const select = () =>
    env.PLATFORM_DB.prepare(
      `SELECT status, trial_ends_at AS trialEndsAt, billing_interval AS interval, current_period_end AS currentPeriodEnd,
              cancel_at_period_end AS cancelAtPeriodEnd, stripe_customer_id AS customerId, stripe_subscription_id AS subscriptionId
         FROM subscriptions WHERE tenant_id = ?`,
    )
      .bind(tenantId)
      .first<SubscriptionRow>();
  let row = await select();
  if (!row) {
    await env.PLATFORM_DB.prepare("INSERT OR IGNORE INTO subscriptions (tenant_id, status, trial_ends_at) VALUES (?, 'trialing', ?)")
      .bind(tenantId, trialEnd())
      .run();
    row = await select();
  }
  return { ...row!, cancelAtPeriodEnd: !!row!.cancelAtPeriodEnd };
}

export async function countUsers(env: BillingEnv, tenantId: string): Promise<number> {
  const row = await env.PLATFORM_DB.prepare("SELECT COUNT(*) AS n FROM users WHERE tenant_id = ?").bind(tenantId).first<{ n: number }>();
  return row?.n ?? 1;
}

// ---------- Produkte in Stripe ----------

const PRODUCT_USERS = "ck_users";
const productId = (appId: string) => `ck_app_${appId}`;

/** Legt die Produkte (je System eines, dazu „Weiterer Benutzer“) einmalig mit fester ID an. */
async function ensureProduct(key: string, id: string, name: string, doFetch: typeof fetch) {
  try {
    await stripe(key, "GET", `products/${id}`, {}, doFetch);
  } catch (error) {
    if (!(error instanceof StripeError && error.status === 404)) throw error;
    await stripe(key, "POST", "products", { id, name }, doFetch);
  }
}

/** Positionen für Checkout bzw. Abo-Änderung, mit Preisen direkt aus unserer Preisliste. */
async function priceItems(key: string, installedApps: string[], users: number, interval: BillingInterval, doFetch: typeof fetch) {
  const q = quote(installedApps, users, interval);
  const items = [];
  for (const line of q.lines) {
    const app = CATALOG.find((a) => a.id === line.id);
    const id = line.kind === "users" ? PRODUCT_USERS : productId(line.id);
    await ensureProduct(key, id, line.kind === "users" ? "Code Kontor – weiterer Benutzer" : `Code Kontor – ${app?.name ?? line.id}`, doFetch);
    items.push({
      quantity: line.quantity,
      price_data: { currency: "eur", product: id, unit_amount: line.unitAmount, recurring: { interval }, tax_behavior: "exclusive" },
    });
  }
  return { items, quote: q };
}

// ---------- Checkout und Portal ----------

export async function createCheckout(
  env: BillingEnv,
  opts: { tenantId: string; tenantName: string; email: string; installedApps: string[]; interval: BillingInterval; origin: string },
  doFetch: typeof fetch = fetch,
): Promise<string> {
  const key = env.STRIPE_SECRET_KEY!;
  const sub = await getSubscription(env, opts.tenantId);
  let customer = sub.customerId;
  if (!customer) {
    const created = await stripe<{ id: string }>(key, "POST", "customers", {
      email: opts.email,
      name: opts.tenantName,
      preferred_locales: ["de"],
      metadata: { tenant_id: opts.tenantId },
    }, doFetch);
    customer = created.id;
    await env.PLATFORM_DB.prepare("UPDATE subscriptions SET stripe_customer_id = ?, updated_at = ? WHERE tenant_id = ?")
      .bind(customer, new Date().toISOString(), opts.tenantId)
      .run();
  }
  const users = await countUsers(env, opts.tenantId);
  const { items } = await priceItems(key, opts.installedApps, users, opts.interval, doFetch);
  // Rest der Testphase bleibt gratis (Stripe verlangt dafür mindestens 2 Tage Abstand)
  const trialEndsAt = sub.trialEndsAt ? Date.parse(sub.trialEndsAt) : 0;
  const keepTrial = sub.status === "trialing" && trialEndsAt - Date.now() > 2 * 86_400_000;
  const session = await stripe<{ url: string }>(key, "POST", "checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: opts.tenantId,
    line_items: items,
    subscription_data: {
      metadata: { tenant_id: opts.tenantId },
      trial_end: keepTrial ? Math.floor(trialEndsAt / 1000) : undefined,
    },
    allow_promotion_codes: true,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    customer_update: { name: "auto", address: "auto" },
    locale: "auto",
    success_url: `${opts.origin}/konto?abo=ok`,
    cancel_url: `${opts.origin}/konto?abo=abgebrochen`,
  }, doFetch);
  return session.url;
}

export async function createPortal(env: BillingEnv, customerId: string, origin: string, doFetch: typeof fetch = fetch): Promise<string> {
  const session = await stripe<{ url: string }>(env.STRIPE_SECRET_KEY!, "POST", "billing_portal/sessions", {
    customer: customerId,
    return_url: `${origin}/konto`,
  }, doFetch);
  return session.url;
}

/** Nach Änderungen (System installiert, Benutzer dazu) die Positionen im laufenden Abo anpassen. */
export async function syncSubscription(env: BillingEnv, tenantId: string, installedApps: string[], doFetch: typeof fetch = fetch) {
  if (!billingEnabled(env)) return;
  const sub = await getSubscription(env, tenantId);
  if (!sub.subscriptionId || sub.status === "canceled" || sub.status === "expired") return;
  const key = env.STRIPE_SECRET_KEY!;
  try {
    const current = await stripe<{ items: { data: { id: string }[] } }>(key, "GET", `subscriptions/${sub.subscriptionId}`, {}, doFetch);
    const { items, quote: q } = await priceItems(key, installedApps, await countUsers(env, tenantId), sub.interval, doFetch);
    if (q.lines.length === 0) return; // ohne System nichts ändern; kündigen geht über das Kundenportal
    await stripe(key, "POST", `subscriptions/${sub.subscriptionId}`, {
      items: [...current.items.data.map((i) => ({ id: i.id, deleted: true })), ...items],
      proration_behavior: "create_prorations",
    }, doFetch);
  } catch (error) {
    console.error("billing sync", tenantId, error);
  }
}

export async function cancelForDeletion(env: BillingEnv, tenantId: string, doFetch: typeof fetch = fetch) {
  if (!billingEnabled(env)) return;
  const sub = await getSubscription(env, tenantId);
  if (!sub.subscriptionId || sub.status === "canceled") return;
  await stripe(env.STRIPE_SECRET_KEY!, "DELETE", `subscriptions/${sub.subscriptionId}`, {}, doFetch).catch((e) => console.error("billing cancel", e));
}

// ---------- Webhook ----------

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data: { current_period_end?: number; price?: { recurring?: { interval?: string } } }[] };
}

const iso = (seconds?: number) => (seconds ? new Date(seconds * 1000).toISOString() : null);

/** Verarbeitet ein geprüftes Stripe-Ereignis. Gibt false zurück, wenn es schon verarbeitet war. */
export async function handleStripeEvent(env: BillingEnv, event: { id: string; type: string; data: { object: Record<string, unknown> } }) {
  const inserted = await env.PLATFORM_DB.prepare("INSERT OR IGNORE INTO billing_events (id, type) VALUES (?, ?)").bind(event.id, event.type).run();
  if (!inserted.meta.changes) return false;
  try {
    const obj = event.data.object;
    const now = new Date().toISOString();
    if (event.type === "checkout.session.completed" && obj.mode === "subscription") {
      await env.PLATFORM_DB.prepare(
        "UPDATE subscriptions SET stripe_customer_id = ?, stripe_subscription_id = ?, status = 'active', updated_at = ? WHERE tenant_id = ?",
      )
        .bind(obj.customer as string, obj.subscription as string, now, obj.client_reference_id as string)
        .run();
    } else if (event.type.startsWith("customer.subscription.")) {
      const s = obj as unknown as StripeSubscription;
      const item = s.items?.data[0];
      const status: SubscriptionStatus = event.type === "customer.subscription.deleted" ? "canceled" : mapStripeStatus(s.status);
      const interval = item?.price?.recurring?.interval === "year" ? "year" : "month";
      const periodEnd = iso(s.current_period_end ?? item?.current_period_end);
      const tenantId = s.metadata?.tenant_id;
      const sql = `UPDATE subscriptions SET status = ?, stripe_subscription_id = ?, stripe_customer_id = ?, billing_interval = ?,
                     current_period_end = ?, cancel_at_period_end = ?, updated_at = ?
                   WHERE ${tenantId ? "tenant_id = ?" : "stripe_customer_id = ?"}`;
      await env.PLATFORM_DB.prepare(sql)
        .bind(status, s.id, s.customer, interval, periodEnd, s.cancel_at_period_end ? 1 : 0, now, tenantId ?? s.customer)
        .run();
    }
    return true;
  } catch (error) {
    // Beim nächsten Versuch von Stripe erneut verarbeiten
    await env.PLATFORM_DB.prepare("DELETE FROM billing_events WHERE id = ?").bind(event.id).run();
    throw error;
  }
}
