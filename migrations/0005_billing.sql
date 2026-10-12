-- Abo je Firma (Stripe). Kartendaten liegen nur bei Stripe.
CREATE TABLE subscriptions (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at TEXT,
  billing_interval TEXT NOT NULL DEFAULT 'month',
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX subscriptions_customer ON subscriptions(stripe_customer_id);

-- Bereits verarbeitete Stripe-Ereignisse, damit keines doppelt zählt
CREATE TABLE billing_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Bestehende Firmen bekommen ab heute 30 Tage Testphase
INSERT INTO subscriptions (tenant_id, status, trial_ends_at)
SELECT id, 'trialing', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days') FROM tenants;
