// Schlanker Stripe-Zugang über die REST-API (ohne SDK, läuft direkt im Worker).
// Kartendaten kommen nie auf unseren Server: Bezahlt wird auf der Stripe-Checkout-Seite.

type Value = string | number | boolean | undefined | null | Params | Params[] | string[];
interface Params {
  [key: string]: Value;
}

/** Verschachtelte Werte in Stripes Formular-Schreibweise umwandeln: a[b][0][c]=1 */
export function encodeForm(params: Params, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value))
      value.forEach((item, i) =>
        parts.push(typeof item === "object" ? encodeForm(item, `${name}[${i}]`) : `${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(item)}`),
      );
    else if (typeof value === "object") parts.push(encodeForm(value, name));
    else parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return parts.filter(Boolean).join("&");
}

export class StripeError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function stripe<T = Record<string, unknown>>(
  key: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Params = {},
  doFetch: typeof fetch = fetch,
): Promise<T> {
  const body = encodeForm(params);
  const url = `https://api.stripe.com/v1/${path}${method === "GET" && body ? `?${body}` : ""}`;
  const response = await doFetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" ? undefined : body,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) throw new StripeError(data.error?.message ?? `Stripe ${response.status}`, response.status);
  return data;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Prüft die Signatur eines Stripe-Webhooks (Header „Stripe-Signature“). Höchstens 5 Minuten alt. */
export async function verifyWebhook(payload: string, header: string | undefined, secret: string, now = Date.now()): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const timestamp = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  // Vergleich in konstanter Zeit
  return signatures.some((sig) => {
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}
