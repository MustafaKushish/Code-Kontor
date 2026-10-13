import { Hono, type Context } from "hono";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import { fail } from "../errors";
import { decryptField } from "../crypto";
import { defaultTaxSettings } from "../../shared/countries";
import { REPAIR_APP_ID } from "../../shared/repairs";
import {
  POS_APP_ID, cleanBarcode, sanitizeCustomer, sanitizeItem, sanitizeLine, sanitizePayments, sanitizePosSettings, sanitizeRegisterName,
  type PosLine, type PosSource, type ReceiptCompany,
} from "../../shared/pos";
import { berlinDay, type Actor, type PosContext, type PosStore } from "./store";

// Schnittstellen der Kasse unter /api/pos. Die Kasse ist ein buchbares Modul („kasse“) mit beliebig vielen Kassenplätzen.
// Ohne das Modul bleibt nur, was die Branchen-Systeme selbst brauchen: ihre Vorgänge abrechnen (z. B. Abholung) und Belege drucken.

interface User { id: string; tenantId: string; tenantName: string; name: string; role: "owner" | "admin" | "staff" }
type PosEnv = { Bindings: Env; Variables: { user: User } };
type Ctx = Context<PosEnv>;

type Remote = { [K in keyof PosStore]: PosStore[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<ModuleResult<R>> : never };

function store(env: Env, tenantId: string): Remote {
  const stub = tenantStub(env, tenantId);
  return new Proxy({} as Remote, {
    get: (_, action: string) => (...args: unknown[]) => stub.pos(action, args),
  });
}

/** Fehler als Antwort; Codes der Module kommen schon mit Vorsilbe (z. B. „repairs.loanerOut“). */
function posError(c: Ctx, code: string) {
  const full = code.includes(".") ? code : `pos.${code}`;
  return c.json({ code: full, error: code }, code.endsWith("notFound") ? 404 : 409);
}

async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

/** Firmendaten für Belege, IBAN und BIC entschlüsselt. */
export async function companyForReceipt(env: Env, tenantId: string): Promise<ReceiptCompany> {
  const company = await tenantStub(env, tenantId).getCompany();
  return {
    name: company?.name ?? "", street: company?.street ?? "", postalCode: company?.postalCode ?? "", city: company?.city ?? "",
    phone: company?.phone ?? "", email: company?.email ?? "", taxNumber: company?.taxNumber ?? "", vatId: company?.vatId ?? "",
    iban: await decryptField(env.DATA_KEY, company?.iban ?? ""), bic: await decryptField(env.DATA_KEY, company?.bic ?? ""),
    bankName: company?.bankName ?? "", logoDataUrl: company?.logoDataUrl ?? "",
  };
}

/** Alles, was die Kasse zum Buchen braucht: Firma, Währung, heutiger Tag. */
export async function posContext(env: Env, tenantId: string, actor: Actor, options?: Record<string, unknown>): Promise<PosContext> {
  const db = tenantStub(env, tenantId);
  const [company, tax, profile] = await Promise.all([companyForReceipt(env, tenantId), db.getTaxSettings(), db.getCompany()]);
  return {
    actor, company, options,
    currency: tax?.currency ?? defaultTaxSettings(profile?.country ?? "DE").currency,
    today: berlinDay(new Date().toISOString()),
  };
}

/** Kassenplatz des Geräts (die App schickt ihn bei jeder Anfrage mit) oder ausdrücklich gewählt. */
export function registerOf(c: Context, explicit?: unknown): string | undefined {
  const value = typeof explicit === "string" && explicit ? explicit : c.req.header("x-pos-register") ?? "";
  return /^[\w-]{1,64}$/.test(value) ? value : undefined;
}

const actor = (c: Ctx, register?: unknown): Actor => ({ id: c.get("user").id, name: c.get("user").name, register: registerOf(c, register) });
const isManager = (c: Ctx) => c.get("user").role !== "staff";

function audit(c: Ctx, action: string, detail: Record<string, unknown>) {
  const user = c.get("user");
  const done = tenantStub(c.env, user.tenantId)
    .logEvent({ userId: user.id, userName: user.name, action, detail })
    .catch((err) => console.error("[audit]", err));
  c.executionCtx.waitUntil(done);
}

/** Welche Module ihre Posten an die Kasse geben dürfen: nur installierte. */
async function sources(env: Env, tenantId: string): Promise<PosSource[]> {
  const installed = await tenantStub(env, tenantId).installedApps();
  return installed.includes(REPAIR_APP_ID) ? ["repairs"] : [];
}

export const posRoutes = new Hono<PosEnv>();

// Ohne Kassen-Modul nur das, was Branchen-Systeme für ihre eigenen Vorgänge brauchen
const WITHOUT_MODULE = [/^GET \/api\/pos\/settings$/, /^GET \/api\/pos\/receipts\/[^/]+$/, /^POST \/api\/pos\/checkout$/];

posRoutes.use("*", async (c, next) => {
  if (WITHOUT_MODULE.some((r) => r.test(`${c.req.method} ${c.req.path}`))) return next();
  const installed = await tenantStub(c.env, c.get("user").tenantId).installedApps();
  if (!installed.includes(POS_APP_ID)) return posError(c, "notInstalled");
  return next();
});

posRoutes.get("/settings", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).settings();
  if (!result.ok) return posError(c, result.code);
  return c.json({ settings: result.value, sources: await sources(c.env, c.get("user").tenantId) });
});

posRoutes.put("/settings", async (c) => {
  if (!isManager(c)) return fail(c, "forbidden", 403);
  const result = await store(c.env, c.get("user").tenantId).saveSettings(sanitizePosSettings((await readBody(c)).settings));
  if (!result.ok) return posError(c, result.code);
  return c.json({ settings: result.value });
});

posRoutes.get("/articles", async (c) => {
  const tenantId = c.get("user").tenantId;
  const result = await store(c.env, tenantId).articles(c.req.query("q") ?? "", await sources(c.env, tenantId));
  if (!result.ok) return posError(c, result.code);
  return c.json({ articles: result.value });
});

posRoutes.get("/scan", async (c) => {
  const tenantId = c.get("user").tenantId;
  const code = cleanBarcode(c.req.query("code"));
  if (!code) return c.json({ articles: [] });
  const result = await store(c.env, tenantId).scan(code, await sources(c.env, tenantId));
  if (!result.ok) return posError(c, result.code);
  return c.json({ articles: result.value });
});

// ---------- Artikelstamm ----------

posRoutes.get("/items", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).items(c.req.query("q") ?? "", 2000);
  if (!result.ok) return posError(c, result.code);
  return c.json({ items: result.value });
});

async function saveItem(c: Ctx, id: string | null) {
  if (!isManager(c)) return fail(c, "forbidden", 403);
  const tenantId = c.get("user").tenantId;
  const tax = await tenantStub(c.env, tenantId).getTaxSettings();
  const item = sanitizeItem(await readBody(c), tax?.vatRates?.[0] ?? 19);
  if (!item) return fail(c, "checkFields", 400);
  const result = await store(c.env, tenantId).saveItem(id, item);
  if (!result.ok) return posError(c, result.code);
  return c.json({ item: result.value });
}

posRoutes.post("/items", (c) => saveItem(c, null));
posRoutes.put("/items/:id", (c) => saveItem(c, c.req.param("id")));

posRoutes.delete("/items/:id", async (c) => {
  if (!isManager(c)) return fail(c, "forbidden", 403);
  const result = await store(c.env, c.get("user").tenantId).removeItem(c.req.param("id"));
  if (!result.ok) return posError(c, result.code);
  return c.json({ ok: true });
});

// ---------- Kassenplätze ----------

posRoutes.get("/registers", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).registers();
  if (!result.ok) return posError(c, result.code);
  return c.json({ registers: result.value });
});

async function saveRegister(c: Ctx, id: string | null) {
  if (!isManager(c)) return fail(c, "forbidden", 403);
  const name = sanitizeRegisterName((await readBody(c)).name);
  if (!name) return fail(c, "checkFields", 400);
  const result = await store(c.env, c.get("user").tenantId).saveRegister(id, name);
  if (!result.ok) return posError(c, result.code);
  audit(c, id ? "posRegisterRenamed" : "posRegisterAdded", { name });
  return c.json({ register: result.value });
}

posRoutes.post("/registers", (c) => saveRegister(c, null));
posRoutes.put("/registers/:id", (c) => saveRegister(c, c.req.param("id")));

posRoutes.delete("/registers/:id", async (c) => {
  if (!isManager(c)) return fail(c, "forbidden", 403);
  const result = await store(c.env, c.get("user").tenantId).removeRegister(c.req.param("id"));
  if (!result.ok) return posError(c, result.code);
  audit(c, "posRegisterRemoved", { id: c.req.param("id") });
  return c.json({ ok: true });
});

// ---------- Verkaufen ----------

posRoutes.post("/checkout", async (c) => {
  const body = await readBody(c);
  const tenantId = c.get("user").tenantId;
  const raw = Array.isArray(body.lines) ? body.lines.slice(0, 200) : [];
  const lines = raw.map((l) => sanitizeLine(l));
  if (!lines.length || lines.some((l) => !l)) return fail(c, "checkFields", 400);
  const installed = await tenantStub(c.env, tenantId).installedApps();
  const allowed = await sources(c.env, tenantId);
  if ((lines as PosLine[]).some((l) => l.source !== "pos" && !allowed.includes(l.source))) return fail(c, "unknownApp", 404);
  if ((lines as PosLine[]).some((l) => l.source === "pos") && !installed.includes(POS_APP_ID)) return posError(c, "notInstalled");
  const options = body.options && typeof body.options === "object" ? { loanerReturned: (body.options as Record<string, unknown>).loanerReturned === true } : {};
  const ctx = await posContext(c.env, tenantId, actor(c), options);
  const result = await store(c.env, tenantId).checkout(
    { lines: lines as PosLine[], payments: sanitizePayments(body.payments), customer: sanitizeCustomer(body.customer) },
    ctx,
  );
  if (!result.ok) return posError(c, result.code);
  if (result.value) audit(c, "posReceipt", { number: result.value.number, cents: result.value.totals.grossCents });
  return c.json({ receipt: result.value });
});

posRoutes.get("/receipts", async (c) => {
  const day = c.req.query("day");
  const closing = c.req.query("closing");
  const result = await store(c.env, c.get("user").tenantId).receipts({
    ...(day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? { day } : {}),
    ...(c.req.query("q") ? { query: c.req.query("q") } : {}),
    ...(closing && /^\d+$/.test(closing) ? { closing: Number(closing) } : {}),
    ...(c.req.query("register") ? { register: registerOf(c, c.req.query("register")) } : {}),
  });
  if (!result.ok) return posError(c, result.code);
  return c.json({ receipts: result.value });
});

posRoutes.get("/receipts/:number", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).receipt(c.req.param("number"));
  if (!result.ok || !result.value) return posError(c, "notFound");
  return c.json({ receipt: result.value });
});

/** Storno nur für Inhaber und Admins. */
posRoutes.post("/receipts/:number/cancel", async (c) => {
  if (!isManager(c)) return fail(c, "forbidden", 403);
  const tenantId = c.get("user").tenantId;
  const result = await store(c.env, tenantId).cancel(c.req.param("number"), await posContext(c.env, tenantId, actor(c)));
  if (!result.ok) return posError(c, result.code);
  audit(c, "posCanceled", { number: c.req.param("number"), cancel: result.value.number });
  return c.json({ receipt: result.value });
});

posRoutes.get("/state", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).state(registerOf(c, c.req.query("register")));
  if (!result.ok) return posError(c, result.code);
  return c.json({ state: result.value });
});

/** Einlage (alle) oder Entnahme (Inhaber und Admins). */
posRoutes.post("/moves", async (c) => {
  const body = await readBody(c);
  const kind = body.kind === "out" ? "out" : "in";
  if (kind === "out" && !isManager(c)) return fail(c, "forbidden", 403);
  const cents = typeof body.cents === "number" && Number.isFinite(body.cents) ? Math.round(Math.abs(body.cents)) : 0;
  if (!cents || cents > 100_000_000) return fail(c, "checkFields", 400);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  const result = await store(c.env, c.get("user").tenantId).addMove({ kind, method: "cash", cents: kind === "out" ? -cents : cents, note }, actor(c, body.register));
  if (!result.ok) return posError(c, result.code);
  audit(c, kind === "out" ? "posCashOut" : "posCashIn", { cents });
  return c.json({ move: result.value });
});

posRoutes.post("/close", async (c) => {
  const body = await readBody(c);
  const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.round(v), 0), 100_000_000) : 0);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  const result = await store(c.env, c.get("user").tenantId).close({ countedCents: amount(body.countedCents), bankCents: amount(body.bankCents), note }, actor(c, body.register));
  if (!result.ok) return posError(c, result.code);
  audit(c, "posClosing", { number: result.value.number, difference: result.value.differenceCents });
  return c.json({ closing: result.value });
});

posRoutes.get("/closings", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).closings(60, registerOf(c, c.req.query("register")));
  if (!result.ok) return posError(c, result.code);
  return c.json({ closings: result.value });
});

posRoutes.get("/closings/:number", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).closing(Number(c.req.param("number")) || 0);
  if (!result.ok || !result.value) return posError(c, "notFound");
  return c.json(result.value);
});
