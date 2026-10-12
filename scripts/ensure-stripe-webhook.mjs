// Legt den Stripe-Webhook für Code Kontor an, falls er fehlt, und gibt dann das neue Signatur-Geheimnis aus.
// Aufruf: STRIPE_SECRET_KEY=… APP_URL=https://codekontor.net HAS_SECRET=0|1 node scripts/ensure-stripe-webhook.mjs
// Ausgabe auf stdout: leer (nichts zu tun) oder das neue whsec_…-Geheimnis.

const key = process.env.STRIPE_SECRET_KEY;
const url = `${(process.env.APP_URL || "https://codekontor.net").replace(/\/$/, "")}/api/billing/webhook`;
const hasSecret = process.env.HAS_SECRET === "1";
const EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];

async function call(method, path, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${data.error?.message ?? res.status}`);
  return data;
}

const list = await call("GET", "webhook_endpoints?limit=100");
const ours = list.data.filter((e) => e.url === url);
if (ours.length > 0 && hasSecret) {
  console.error(`Stripe-Webhook vorhanden: ${url}`);
  process.exit(0);
}
// Geheimnis ist nur beim Anlegen lesbar: alte Einträge entfernen und neu anlegen
for (const e of ours) await call("DELETE", `webhook_endpoints/${e.id}`);
const params = { url, description: "Code Kontor Abo" };
EVENTS.forEach((ev, i) => (params[`enabled_events[${i}]`] = ev));
const created = await call("POST", "webhook_endpoints", params);
console.error(`Stripe-Webhook angelegt: ${url}`);
process.stdout.write(created.secret);
