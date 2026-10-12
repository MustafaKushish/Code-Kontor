import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { askAssistant, parseConversation, systemPrompt } from "../worker/assistant";

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

// Antworten der Claude-API nachbauen, ohne echtes Netz.
let lastRequest: { headers: Headers; body: Record<string, unknown> } | null = null;
function fakeClient(events: object[]) {
  const body = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Anthropic({
    apiKey: "test",
    maxRetries: 0,
    fetch: async (_url: string | URL | Request, init?: RequestInit) => {
      lastRequest = { headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    },
  });
}

const start = { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } };
const text = (index: number, t: string) => [
  { type: "content_block_start", index, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index, delta: { type: "text_delta", text: t } },
  { type: "content_block_stop", index },
];
const end = (stop_reason: string) => [
  { type: "message_delta", delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 5 } },
  { type: "message_stop" },
];
const ctx = { companyName: "X", userName: "Y", role: "owner" as const, installedApps: [], lang: "de" };

async function collect(client: Anthropic) {
  const out = [];
  for await (const e of askAssistant(client, ctx, [{ role: "user", content: "Hallo" }])) out.push(e);
  return out;
}

describe("KI-Assistent: Antwortstrom", () => {
  it("gibt Text weiter und meldet das Ende", async () => {
    expect(await collect(fakeClient([start, ...text(0, "Hallo!"), ...end("end_turn")]))).toEqual([
      { type: "text", text: "Hallo!" },
      { type: "done" },
    ]);
    expect(lastRequest?.body).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", stream: true });
    expect(lastRequest?.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("verwirft angefangenen Text, wenn ein Ersatzmodell übernimmt", async () => {
    const fallback = {
      type: "content_block_start",
      index: 1,
      content_block: { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-4-8" }, trigger: { type: "refusal" } },
    };
    const events = await collect(fakeClient([start, ...text(0, "Teil"), fallback, { type: "content_block_stop", index: 1 }, ...text(2, "Ganz"), ...end("end_turn")]));
    expect(events).toEqual([{ type: "text", text: "Teil" }, { type: "reset" }, { type: "text", text: "Ganz" }, { type: "done" }]);
  });

  it("meldet eine Ablehnung als Fehler", async () => {
    const events = await collect(fakeClient([start, ...end("refusal")]));
    expect(events).toEqual([{ type: "reset" }, { type: "error", code: "assistantRefused" }]);
  });

  it("meldet Überlastung verständlich", async () => {
    const client = new Anthropic({
      apiKey: "test",
      maxRetries: 0,
      fetch: async () => new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }), { status: 429 }),
    });
    expect(await collect(client)).toEqual([{ type: "error", code: "assistantBusy" }]);
  });
});
