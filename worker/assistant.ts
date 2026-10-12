import { CATALOG } from "../shared/apps";

// KI-Assistent: beantwortet Fragen zu Code Kontor und zum Geschäftsalltag.
// Heute für Inhaber und Team in der App; die öffentlichen Kundenseiten der
// Module bekommen später eine eigene Variante mit anderem Systemprompt.

/** Immer das aktuelle kostenlose Flash-Modell von Google; mit der Variable GEMINI_MODEL austauschbar. */
export const DEFAULT_MODEL = "gemini-flash-latest";
export const DAILY_QUESTION_LIMIT = 50;
const MAX_TURNS = 20;
const MAX_MESSAGE_CHARS = 4000;

const LANGUAGE_NAMES: Record<string, string> = {
  de: "German",
  en: "English",
  tr: "Turkish",
  ar: "Arabic",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  pl: "Polish",
  ru: "Russian",
  uk: "Ukrainian",
};

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Prüft den Gesprächsverlauf aus dem Browser. Gibt null zurück, wenn er ungültig ist. */
export function parseConversation(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_TURNS) return null;
  const messages: ChatMessage[] = [];
  for (const [i, item] of input.entries()) {
    const role = i % 2 === 0 ? "user" : "assistant";
    if (!item || typeof item !== "object") return null;
    const { role: r, content } = item as Record<string, unknown>;
    if (r !== role || typeof content !== "string") return null;
    const text = content.trim();
    if (!text || text.length > MAX_MESSAGE_CHARS) return null;
    messages.push({ role, content: text });
  }
  return messages[messages.length - 1]!.role === "user" ? messages : null;
}

export interface AssistantContext {
  companyName: string;
  userName: string;
  role: "owner" | "admin" | "staff";
  installedApps: string[];
  lang: string;
}

export function systemPrompt(ctx: AssistantContext): string {
  const language = LANGUAGE_NAMES[ctx.lang] ?? "German";
  const installed = CATALOG.filter((a) => ctx.installedApps.includes(a.id));
  const catalog = CATALOG.map((a) => `- ${a.name} (${a.category}): ${a.description}`).join("\n");
  const roleText = {
    owner: "the owner (can change company details, install systems and manage the team, including admins)",
    admin: "an admin (can change company details, install systems and add staff, but not other admins)",
    staff: "a staff member (can use installed systems, but cannot change company details, install systems or manage the team)",
  }[ctx.role];

  return `You are the assistant inside Code Kontor, a business management platform for small and medium businesses: hair salons, car workshops, phone and IT repair shops, retail stores, restaurants, car dealerships and offices. You help the people who work at a business that uses Code Kontor.

You are talking to ${ctx.userName}, ${roleText}, at the company "${ctx.companyName}".
Installed systems: ${installed.length ? installed.map((a) => a.name).join(", ") : "none yet"}.

How Code Kontor works:
- Each company has its own separate database. It runs in the browser on phone, tablet and laptop and can be installed as an app from the browser.
- "Overview" is the start page. "App catalog" lists the industry systems; owners and admins open one and press "Install". Installed systems appear in the sidebar under "Your systems".
- "Company" shows the company details printed on invoices: name, address, tax number or VAT ID, IBAN, BIC and logo. Owners and admins change them with "Edit".
- "Team" (owners and admins only) adds people with name, email, a starting password and a role (staff or admin).
- Appearance (light, dark, like device) and the language (10 languages) can be changed in the sidebar or on the Company page.
- The industry systems are still being built; their feature areas are marked "coming soon". Say so honestly when someone asks for a feature that is not available yet, and don't invent menus or buttons.

Available systems in the catalog:
${catalog}

You can also answer general questions about running a small business in Germany and Europe, such as what an invoice must contain, VAT basics, opening hours, customer service or bookkeeping habits. For binding tax or legal decisions, recommend checking with a tax advisor or lawyer. You cannot see or change the company's data and cannot carry out actions; explain the steps instead.

Always answer in ${language}, unless the user writes in another language; then answer in that language. Keep answers short and practical: a few sentences, or a short numbered list for step-by-step instructions. Use plain text with simple Markdown (bold, lists) only.`;
}

export type StreamEvent = { type: "text"; text: string } | { type: "reset" } | { type: "done" } | { type: "error"; code: string };

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  /** Für Tests austauschbar. */
  fetch?: typeof fetch;
}

interface GeminiChunk {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

/** Stellt die Frage an Gemini und liefert die Antwort Stück für Stück. */
export async function* askAssistant(options: GeminiOptions, ctx: AssistantContext, messages: ChatMessage[]): AsyncGenerator<StreamEvent> {
  const model = options.model || DEFAULT_MODEL;
  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": options.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
      }),
    });
  } catch (error) {
    console.error("assistant", error);
    yield { type: "error", code: "assistantFailed" };
    return;
  }

  if (!response.ok || !response.body) {
    console.error("assistant", response.status, await response.text().catch(() => ""));
    if (response.status === 429) yield { type: "error", code: "assistantBusy" };
    else if (response.status === 401 || response.status === 403) yield { type: "error", code: "assistantNotConfigured" };
    else yield { type: "error", code: "assistantFailed" };
    return;
  }

  // Antwort kommt als Server-Sent Events: Zeilen "data: {...}".
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let blocked = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      let chunk: GeminiChunk;
      try {
        chunk = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      if (chunk.promptFeedback?.blockReason) blocked = true;
      const candidate = chunk.candidates?.[0];
      if (candidate?.finishReason && BLOCKED.has(candidate.finishReason)) blocked = true;
      const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (text && !blocked) yield { type: "text", text };
    }
  }
  if (blocked) {
    yield { type: "reset" };
    yield { type: "error", code: "assistantRefused" };
    return;
  }
  yield { type: "done" };
}
