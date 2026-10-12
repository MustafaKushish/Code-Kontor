import { describe, expect, it } from "vitest";
import { daysLeft, hasAccess, mapStripeStatus, quote } from "../shared/billing";
import { encodeForm, verifyWebhook } from "../worker/stripe";

describe("Abo-Preise", () => {
  it("nimmt das teuerste System voll und weitere zum halben Preis", () => {
    const q = quote(["buero", "werkstatt"], 2);
    expect(q.lines).toEqual([
      { kind: "system", id: "werkstatt", quantity: 1, unitAmount: 4900, discounted: false },
      { kind: "system", id: "buero", quantity: 1, unitAmount: 1450, discounted: true },
    ]);
    expect(q.total).toBe(6350);
  });

  it("berechnet weitere Benutzer ab dem vierten", () => {
    expect(quote(["friseur"], 3).lines).toHaveLength(1);
    const q = quote(["friseur"], 5);
    expect(q.lines[1]).toMatchObject({ kind: "users", quantity: 2, unitAmount: 500 });
    expect(q.total).toBe(3900 + 1000);
  });

  it("gibt bei jährlicher Zahlung zwei Monate gratis", () => {
    const q = quote(["friseur"], 1, "year");
    expect(q.total).toBe(39000);
    expect(q.perMonth).toBe(3250);
  });

  it("ignoriert unbekannte Systeme", () => {
    expect(quote(["gibtsnicht"], 1).total).toBe(0);
  });
});

describe("Zugang", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  it("erlaubt die Testphase bis zum Ende", () => {
    expect(hasAccess("trialing", "2026-10-20T00:00:00Z", now)).toBe(true);
    expect(hasAccess("trialing", "2026-10-01T00:00:00Z", now)).toBe(false);
    expect(daysLeft("2026-10-20T00:00:00Z", now)).toBe(8);
  });
  it("sperrt gekündigte Abos, nicht aber überfällige", () => {
    expect(hasAccess("active", null, now)).toBe(true);
    expect(hasAccess("past_due", null, now)).toBe(true);
    expect(hasAccess("canceled", null, now)).toBe(false);
    expect(mapStripeStatus("unpaid")).toBe("past_due");
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
  });
});

describe("Stripe", () => {
  it("schreibt verschachtelte Werte im Stripe-Format", () => {
    const body = decodeURIComponent(encodeForm({ mode: "subscription", line_items: [{ quantity: 1, price_data: { currency: "eur" } }], locales: ["de"], skip: undefined }));
    expect(body).toBe("mode=subscription&line_items[0][quantity]=1&line_items[0][price_data][currency]=eur&locales[0]=de");
  });

  it("prüft Webhook-Signaturen", async () => {
    const secret = "whsec_test";
    const payload = '{"id":"evt_1"}';
    const t = 1_760_000_000;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(await verifyWebhook(payload, `t=${t},v1=${sig}`, secret, t * 1000)).toBe(true);
    expect(await verifyWebhook(payload + " ", `t=${t},v1=${sig}`, secret, t * 1000)).toBe(false);
    expect(await verifyWebhook(payload, `t=${t},v1=${sig}`, secret, (t + 600) * 1000)).toBe(false);
    expect(await verifyWebhook(payload, undefined, secret)).toBe(false);
  });
});
