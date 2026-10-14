import { describe, expect, it } from "vitest";
import { askAssistant, insightsBrief, parseConversation, systemPrompt, type GeminiOptions } from "../worker/assistant";
import type { Insights } from "../shared/insights";

describe("KI-Assistent", () => {
  it("nimmt einen gültigen Verlauf an", () => {
    expect(parseConversation([{ role: "user", content: " Hallo " }])).toEqual([{ role: "user", content: "Hallo" }]);
    expect(
      parseConversation([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ]),
    ).toHaveLength(3);
  });

  it("lehnt ungültige Verläufe ab", () => {
    expect(parseConversation([])).toBeNull();
    expect(parseConversation("Hallo")).toBeNull();
    expect(parseConversation([{ role: "assistant", content: "a" }])).toBeNull();
    expect(parseConversation([{ role: "user", content: "a" }, { role: "assistant", content: "b" }])).toBeNull();
    expect(parseConversation([{ role: "user", content: "   " }])).toBeNull();
    expect(parseConversation([{ role: "user", content: "x".repeat(4001) }])).toBeNull();
    expect(parseConversation([{ role: "system", content: "a" }])).toBeNull();
    expect(parseConversation(Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "a" })))).toBeNull();
  });

  it("kennt Firma, Rolle, Systeme und Sprache", () => {
    const prompt = systemPrompt({ companyName: "Salon Aylin", userName: "Aylin", role: "staff", installedApps: ["friseur"], lang: "tr" });
    expect(prompt).toContain("Salon Aylin");
    expect(prompt).toContain("a staff member");
    expect(prompt).toContain("Installed systems: Friseur & Kosmetik");
    expect(prompt).toContain("Always answer in Turkish");
  });
});

// Antworten der Gemini-API nachbauen, ohne echtes Netz.
let lastRequest: { url: string; headers: Headers; body: Record<string, unknown> } | null = null;
function fakeGemini(chunks: object[], status = 200): GeminiOptions {
  return {
    apiKey: "test-key",
    wait: async () => undefined,
    fetch: (async (url: string, init?: RequestInit) => {
      lastRequest = { url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
      if (status !== 200) return new Response("{}", { status });
      return new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\r\n\r\n`).join(""), { headers: { "content-type": "text/event-stream" } });
    }) as typeof fetch,
  };
}
const part = (text: string, finishReason?: string) => ({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason }] });
const ctx = { companyName: "X", userName: "Y", role: "owner" as const, installedApps: [], lang: "de" };

async function collect(options: GeminiOptions, messages = [{ role: "user" as const, content: "Hallo" }]) {
  const out = [];
  for await (const e of askAssistant(options, ctx, messages)) out.push(e);
  return out;
}

describe("KI-Assistent: Antwortstrom", () => {
  it("gibt Text weiter und meldet das Ende", async () => {
    const events = await collect(fakeGemini([part("Hal"), part("lo!", "STOP")]), [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]);
    expect(events).toEqual([{ type: "text", text: "Hal" }, { type: "text", text: "lo!" }, { type: "done" }]);
    expect(lastRequest?.url).toContain("/models/gemini-flash-latest:streamGenerateContent?alt=sse");
    expect(lastRequest?.headers.get("x-goog-api-key")).toBe("test-key");
    expect(lastRequest?.body.contents).toEqual([
      { role: "user", parts: [{ text: "a" }] },
      { role: "model", parts: [{ text: "b" }] },
      { role: "user", parts: [{ text: "c" }] },
    ]);
  });

  it("verwirft Text, wenn Gemini die Antwort sperrt", async () => {
    expect(await collect(fakeGemini([part("Teil"), part("", "SAFETY")]))).toEqual([
      { type: "text", text: "Teil" },
      { type: "reset" },
      { type: "error", code: "assistantRefused" },
    ]);
    expect(await collect(fakeGemini([{ promptFeedback: { blockReason: "SAFETY" } }]))).toEqual([
      { type: "reset" },
      { type: "error", code: "assistantRefused" },
    ]);
  });

  it("meldet Überlastung und falschen Schlüssel verständlich", async () => {
    expect(await collect(fakeGemini([], 429))).toEqual([{ type: "error", code: "assistantBusy" }]);
    expect(await collect(fakeGemini([], 403))).toEqual([{ type: "error", code: "assistantNotConfigured" }]);
    expect(await collect(fakeGemini([], 503))).toEqual([{ type: "error", code: "assistantBusy" }]);
    expect(await collect(fakeGemini([], 400))).toEqual([{ type: "error", code: "assistantFailed" }]);
  });

  it("weicht auf ein anderes Modell aus, wenn Google überlastet ist", async () => {
    const urls: string[] = [];
    const options: GeminiOptions = {
      apiKey: "k",
      fetch: (async (url: string) => {
        urls.push(String(url));
        if (urls.length === 1) return new Response("{}", { status: 503 });
        return new Response(`data: ${JSON.stringify(part("Hallo", "STOP"))}\n\n`);
      }) as typeof fetch,
    };
    expect(await collect(options)).toEqual([{ type: "text", text: "Hallo" }, { type: "done" }]);
    expect(urls[0]).toContain("gemini-flash-latest");
    expect(urls[1]).toContain("gemini-flash-lite-latest");
  });
});

describe("KI-Assistent: Vorschläge aus der Auswertung", () => {
  const insights: Insights = {
    from: "2026-10-01", to: "2026-10-31", bucket: "day",
    sales: {
      revenueCents: 253180, receipts: 52, cancels: 2, cancelCents: 11850,
      byMethod: { cash: 109980, card: 143200, transfer: 0, voucher: 0 },
      series: [{ key: "2026-10-01", cents: 12000 }], hours: Array.from({ length: 24 }, (_, h) => (h >= 9 && h <= 18 ? h * 1000 : 0)),
      groups: [{ group: "Zubehör", cents: 117110, qty: 69 }], articles: [{ name: "Panzerglas", group: "Zubehör", cents: 41720, qty: 28 }],
      sources: [{ source: "pos", cents: 200680 }, { source: "repairs", cents: 52500 }],
    },
    previous: { from: "2026-09-01", to: "2026-09-14", revenueCents: 194020, receipts: 40 },
    repairs: { open: 3, waiting: 1, pickup: 2, received: 7, pickedUp: 5 },
    time: { minutes: 12270, people: 3, present: 2 },
  };

  it("fasst die Zahlen zusammen, ohne etwas zu erfinden", () => {
    const brief = insightsBrief(insights, "EUR", "2026-10-14");
    expect(brief).toContain("Revenue: 2531.80 EUR");
    expect(brief).toContain("(+30 %)");
    expect(brief).toContain("average per receipt 48.69 EUR");
    expect(brief).toContain("Panzerglas");
    expect(brief).toContain("1 waiting for customer approval");
    expect(brief).toContain("(still running)");
    expect(brief).toContain("204.5 h by 3 people");
  });

  it("gibt die Zahlen und Branchen-Hinweise nur mit, wenn sie da sind", () => {
    const base = { companyName: "Handy Doktor", userName: "Mia", role: "owner" as const, installedApps: ["handy-it", "kasse"], lang: "de" };
    expect(systemPrompt(base)).not.toContain("dashboard");
    const prompt = systemPrompt({ ...base, insights: { data: insights, currency: "EUR", today: "2026-10-14" } });
    expect(prompt).toContain("Revenue: 2531.80 EUR");
    expect(prompt).toContain("Phone and IT repair shop");
    expect(prompt).toContain("November 2026");
    expect(prompt).toContain("Always answer in German");
  });
});
