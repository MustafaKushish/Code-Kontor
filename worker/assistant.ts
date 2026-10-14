import { CATALOG } from "../shared/apps";
import type { Insights } from "../shared/insights";

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
  /** Zahlen aus der Auswertung (nur für Inhaber und Admins), damit die KI konkrete Vorschläge machen kann */
  insights?: { data: Insights; currency: string; today: string };
}

/** Worauf es je Branche ankommt; daraus leitet die KI ihre Vorschläge ab. */
const INDUSTRY_HINTS: Record<string, string> = {
  friseur: "Hair and beauty salon: utilisation of chairs and staff hours, no-shows and online booking, rebooking the next appointment at checkout, retail products (care products) as add-on sales, service packages, quiet weekday slots (e.g. Tuesday mornings) filled with offers, seasonal events (weddings, proms, Christmas).",
  werkstatt: "Car workshop: seasonal work (tyre change in spring and autumn, inspection before winter, air conditioning in summer), parts margin, labour hours sold vs. worked, open orders and turnaround time, reminders for inspection and MOT/HU.",
  "handy-it": "Phone and IT repair shop: turnaround time and orders waiting for approval or pickup (call customers, send reminders), add-on sales at pickup (screen protector, case, charger), used devices buy and sell margin, data transfer as a service, new phone launches (September) and Black Friday/Christmas as peaks.",
  einzelhandel: "Retail store: best sellers and slow movers, stock and reordering, basket size (cross-selling at the till), peak hours vs. staffing, seasonal ranges and promotions.",
  restaurant: "Restaurant or café: table turnover at peak hours, average bill (drinks, desserts), quiet hours (lunch menu, happy hour), staff planning by hour, seasonal menu.",
  autohaus: "Car dealership: stock age, test drives to sales, trade-ins, financing and add-ons, seasonal demand.",
  buero: "Office or service provider: billable hours vs. worked hours, open quotes and invoices, recurring clients, monthly retainers.",
  kasse: "Shop till: payment mix (cash vs. card), basket size, product groups, cancellations.",
};

const money = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`;
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)} %` : "–");

/** Die Zahlen der Auswertung als kurzer, gut lesbarer Text für die KI (keine Kundendaten, nur Summen). */
export function insightsBrief(ins: Insights, currency: string, today: string): string {
  const s = ins.sales;
  const m = (c: number) => money(c, currency);
  const change = ins.previous.revenueCents ? `${s.revenueCents >= ins.previous.revenueCents ? "+" : ""}${Math.round(((s.revenueCents - ins.previous.revenueCents) / Math.abs(ins.previous.revenueCents)) * 100)} %` : "no revenue before";
  const paid = Object.entries(s.byMethod).filter(([, c]) => c !== 0).map(([k, c]) => `${k} ${m(c)}`).join(", ") || "none";
  const totalPaid = Object.values(s.byMethod).reduce((a, b) => a + Math.max(0, b), 0);
  const groups = s.groups.map((g) => `${g.group || "(no group)"}: ${m(g.cents)}, ${g.qty} pcs (${pct(g.cents, s.revenueCents)})`).join("; ") || "none";
  const articles = s.articles.map((a) => `${a.name} (${a.group || "no group"}): ${a.qty} pcs, ${m(a.cents)}`).join("; ") || "none";
  const sources = s.sources.map((x) => `${x.source === "pos" ? "till" : x.source}: ${m(x.cents)}`).join(", ") || "none";
  const hours = s.hours.map((c, h) => ({ h, c })).filter((x) => x.c > 0);
  const peak = [...hours].sort((a, b) => b.c - a.c).slice(0, 3).map((x) => `${x.h}:00 (${m(x.c)})`).join(", ") || "none";
  const quiet = hours.length > 3 ? [...hours].sort((a, b) => a.c - b.c).slice(0, 3).map((x) => `${x.h}:00 (${m(x.c)})`).join(", ") : "not enough data";
  const series = ins.bucket === "hour" ? "" : `\n- Revenue per ${ins.bucket}: ${s.series.map((x) => `${x.key} ${m(x.cents)}`).join(", ")}`;
  const workedHours = Math.round(ins.time.minutes / 6) / 10;
  const repairs = ins.repairs
    ? `\n- Repair orders now: ${ins.repairs.open} in progress, ${ins.repairs.waiting} waiting for customer approval of the quote, ${ins.repairs.pickup} ready for pickup. In the period: ${ins.repairs.received} received, ${ins.repairs.pickedUp} picked up.`
    : "";
  return `Figures from the company's dashboard (all amounts incl. VAT). Today is ${today}. Period ${ins.from} to ${ins.to}${today >= ins.from && today <= ins.to ? " (still running)" : ""}.
- Revenue: ${m(s.revenueCents)}; previous comparable period ${ins.previous.from} to ${ins.previous.to}: ${m(ins.previous.revenueCents)} (${change}).
- Receipts: ${s.receipts} (previous period ${ins.previous.receipts}); average per receipt ${s.receipts ? m(Math.round(s.revenueCents / s.receipts)) : "–"}.
- Cancellations: ${s.cancels} receipts, ${m(s.cancelCents)}.
- Paid with: ${paid}${totalPaid ? ` (cash share ${pct(Math.max(0, s.byMethod.cash), totalPaid)})` : ""}.
- Product groups: ${groups}.
- Top items: ${articles}.
- Revenue by system: ${sources}.
- Peak hours: ${peak}. Weakest hours with sales: ${quiet}.${series}
- Working time clocked: ${workedHours} h by ${ins.time.people} people${workedHours ? `, revenue per worked hour ${m(Math.round(s.revenueCents / workedHours))}` : ""}.${repairs}`;
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

${insightsSection(ctx)}You can also answer general questions about running a small business in Germany and Europe, such as what an invoice must contain, VAT basics, opening hours, customer service or bookkeeping habits. For binding tax or legal decisions, recommend checking with a tax advisor or lawyer. ${ctx.insights ? "Apart from the dashboard figures above you cannot see or change the company's data" : "You cannot see or change the company's data"} and cannot carry out actions; explain the steps instead.

Always answer in ${language}, unless the user writes in another language; then answer in that language. Keep answers short and practical: a few sentences, or a short numbered list for step-by-step instructions. Use plain text with simple Markdown (bold, lists) only.`;
}

function insightsSection(ctx: AssistantContext): string {
  if (!ctx.insights) return "";
  const { data, currency, today } = ctx.insights;
  const next = new Date(`${today.slice(0, 7)}-15T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const hints = ctx.installedApps.map((id) => INDUSTRY_HINTS[id]).filter(Boolean).map((h) => `- ${h}`).join("\n");
  return `The user is looking at the dashboard ("Auswertung") and you can see its figures:
${insightsBrief(data, currency, today)}

What matters in this company's industry (derived from the installed systems):
${hints || "- No industry system installed yet; give advice for a small shop with a till."}

When asked how to improve, act like an experienced business advisor for this industry: give 3 to 5 concrete actions for the next month (${nextMonth}), most effective first. Each action names the figure it is based on (e.g. "your average receipt is 48 EUR"), what to do this week, and a realistic target for ${nextMonth}. Consider the season and typical events in ${nextMonth} for this industry in Germany. Point out problems in the numbers (falling revenue, many cancellations, orders waiting for approval or pickup, weak hours, low-selling groups) and suggest a fix. Do not invent figures that are not listed; if data is missing or too little, say so and suggest what to track. Where it fits, mention the Code Kontor feature that helps (till, product groups, repair orders, time tracking). Be honest that these are suggestions, not guarantees.

`;
}

export type StreamEvent = { type: "text"; text: string } | { type: "reset" } | { type: "done" } | { type: "error"; code: string };

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  /** Für Tests austauschbar. */
  fetch?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
}

interface GeminiChunk {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

/** Ausweichmodelle, wenn Google das Hauptmodell gerade überlastet meldet (HTTP 503/500/429). */
export const FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-3.7-flash", "gemini-3.5-flash", "gemma-4-31b-it"];
const RETRYABLE = new Set([429, 500, 503, 504]);

/** Stellt die Frage an Gemini und liefert die Antwort Stück für Stück. */
export async function* askAssistant(options: GeminiOptions, ctx: AssistantContext, messages: ChatMessage[]): AsyncGenerator<StreamEvent> {
  const doFetch = options.fetch ?? fetch;
  const primary = options.model || DEFAULT_MODEL;
  // Überlastung dauert meist nur Sekunden: zum Schluss das Hauptmodell nach kurzer Pause noch einmal.
  const models = [...new Set([primary, ...FALLBACK_MODELS]), primary];
  const wait = options.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
  });

  let response: Response | null = null;
  let lastStatus = 0;
  for (const [i, model] of models.entries()) {
    if (i === models.length - 1) await wait(1500);
    try {
      response = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": options.apiKey },
        body,
      });
    } catch (error) {
      console.error("assistant", model, error);
      response = null;
      continue;
    }
    if (response.ok && response.body) break;
    lastStatus = response.status;
    console.error("assistant", model, response.status, await response.text().catch(() => ""));
    // Falscher Schlüssel oder ungültige Anfrage: andere Modelle helfen nicht.
    if (!RETRYABLE.has(response.status) && response.status !== 404) break;
    response = null;
  }

  if (!response || !response.ok || !response.body) {
    if (lastStatus === 401 || lastStatus === 403) yield { type: "error", code: "assistantNotConfigured" };
    else if (RETRYABLE.has(lastStatus)) yield { type: "error", code: "assistantBusy" };
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
