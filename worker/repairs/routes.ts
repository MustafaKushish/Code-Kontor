import { Hono, type Context } from "hono";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import { berlinDay, type RepairStore } from "./store";
import { fail } from "../errors";
import { decryptField, encryptField } from "../crypto";
import { mailEnabled, sendMail } from "../mail";
import { billingEnabled, getSubscription } from "../billing";
import { hasAccess } from "../../shared/billing";
import { renderRepairMail, type RepairMailKind } from "./mail";
import {
  PAYMENT_METHODS, REPAIR_APP_ID, REPAIR_STATUSES, STATUS_GROUPS, computeTotals, sanitizeCustomer, sanitizeIntake, sanitizeItem, sanitizePart,
  sanitizeChecks, sanitizeCustomerCard, sanitizePrice, sanitizeRepairSettings, sanitizeSaleLine, sanitizeUsed, validateCustomer, validateIntake, validateUsed,
  type InvoiceSnapshot, type PaymentMethod, type SaleLine, type RepairOrder, type RepairStatus, type StatusGroup,
} from "../../shared/repairs";

// Schnittstellen des Systems „Handy- & IT-Service“ unter /api/repairs (angemeldet)
// und /api/repair-status (Statusseite für Endkunden, ohne Anmeldung).

interface User { id: string; tenantId: string; tenantName: string; name: string; role: "owner" | "admin" | "staff" }
type RepairEnv = { Bindings: Env; Variables: { user: User } };
type Ctx = Context<RepairEnv>;

/** Alle Methoden des Speichers als asynchrone Aufrufe ins Durable Object der Firma. */
type Remote = { [K in keyof RepairStore]: RepairStore[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<ModuleResult<R>> : never };

function store(env: Env, tenantId: string): Remote {
  const stub = tenantStub(env, tenantId);
  return new Proxy({} as Remote, {
    get: (_, action: string) => (...args: unknown[]) => stub.repairs(action, args),
  });
}

/** Fehler aus dem Speicher als Antwort; der Code wird im Browser übersetzt. */
function moduleError(c: Ctx, code: string) {
  const status = code === "notFound" ? 404 : 409;
  return c.json({ code: `repairs.${code}`, error: code }, status);
}

async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

const param = (c: Ctx, name: string) => c.req.param(name) ?? "";
const actor = (c: Ctx) => ({ id: c.get("user").id, name: c.get("user").name });
const today = () => new Date().toISOString().slice(0, 10);
const deviceName = (o: RepairOrder) => [o.intake.device.brand, o.intake.device.model].filter(Boolean).join(" ") || "Gerät";
const statusLink = (c: Ctx, tenantId: string, token: string) => new URL(`/status/${tenantId}/${token}`, c.req.url).toString();

function audit(c: Ctx, action: string, detail: Record<string, unknown>) {
  const user = c.get("user");
  const done = tenantStub(c.env, user.tenantId)
    .logEvent({ userId: user.id, userName: user.name, action, detail })
    .catch((err) => console.error("[audit]", err));
  c.executionCtx.waitUntil(done);
}

/** Firmendaten für die Rechnung, IBAN und BIC entschlüsselt. */
async function companyForInvoice(env: Env, tenantId: string): Promise<InvoiceSnapshot["company"]> {
  const company = await tenantStub(env, tenantId).getCompany();
  return {
    name: company?.name ?? "", street: company?.street ?? "", postalCode: company?.postalCode ?? "", city: company?.city ?? "",
    phone: company?.phone ?? "", email: company?.email ?? "", taxNumber: company?.taxNumber ?? "", vatId: company?.vatId ?? "",
    iban: await decryptField(env.DATA_KEY, company?.iban ?? ""), bic: await decryptField(env.DATA_KEY, company?.bic ?? ""),
    bankName: company?.bankName ?? "", logoDataUrl: company?.logoDataUrl ?? "",
  };
}

/** Kunde per E-Mail benachrichtigen, wenn eingeschaltet und eine Adresse da ist. Gibt zurück, ob gesendet wird. */
async function notifyCustomer(c: Ctx, order: RepairOrder, kind: RepairMailKind): Promise<boolean> {
  if (!order.customer.email || !mailEnabled(c.env)) return false;
  const user = c.get("user");
  const content = renderRepairMail(kind, order.intake.customerLang, statusLink(c, user.tenantId, order.publicToken), {
    name: order.customer.name, device: deviceName(order), number: `#${order.number}`, company: user.tenantName,
  });
  const company = await tenantStub(c.env, user.tenantId).getCompany();
  c.executionCtx.waitUntil(
    sendMail(c.env, order.customer.email, content, fetch, company?.email ? { replyTo: company.email } : {}).catch((err) => console.error("[mail]", err)),
  );
  return true;
}

const MAIL_FOR: Partial<Record<RepairStatus, RepairMailKind>> = { quote: "quote", ready: "ready", notRepaired: "notRepaired" };

/** Antwort mit Auftrag und früheren Aufträgen zum selben Gerät. */
async function orderResponse(c: Ctx, order: RepairOrder, extra: Record<string, unknown> = {}) {
  const related = await store(c.env, c.get("user").tenantId).sameDevice(order.id);
  return c.json({ order, related: related.ok ? related.value : [], ...extra });
}

const managers = async (c: Ctx, next: () => Promise<void>) => {
  if (c.get("user").role === "staff") return fail(c, "forbidden", 403);
  await next();
};

export const repairRoutes = new Hono<RepairEnv>();

// Nur nutzbar, wenn die Firma das System installiert hat
repairRoutes.use("*", async (c, next) => {
  const installed = await tenantStub(c.env, c.get("user").tenantId).installedApps();
  if (!installed.includes(REPAIR_APP_ID)) return fail(c, "unknownApp", 404);
  await next();
});

repairRoutes.get("/orders", async (c) => {
  const group = (c.req.query("group") ?? "open") as StatusGroup;
  const valid = group === "all" || group in STATUS_GROUPS;
  const db = store(c.env, c.get("user").tenantId);
  const [list, lowStock] = await Promise.all([db.list(valid ? group : "open", c.req.query("q") ?? ""), db.lowStockCount()]);
  if (!list.ok) return moduleError(c, list.code);
  return c.json({ ...list.value, lowStock: lowStock.ok ? lowStock.value : 0 });
});

repairRoutes.post("/orders", async (c) => {
  const body = await readBody(c);
  const customer = sanitizeCustomer(body.customer);
  const intake = sanitizeIntake(body.intake);
  const errors = { ...validateCustomer(customer), ...validateIntake(intake) };
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  const code = typeof body.unlockCode === "string" ? body.unlockCode.trim().slice(0, 100) : "";
  const customerId = typeof body.customerId === "string" ? body.customerId : null;
  const result = await store(c.env, c.get("user").tenantId).create(
    { id: customerId, data: customer }, intake, code ? await encryptField(c.env.DATA_KEY, code) : null, actor(c),
  );
  if (!result.ok) return moduleError(c, result.code);
  audit(c, "repairCreated", { number: result.value.number });
  return orderResponse(c, result.value);
});

repairRoutes.get("/orders/:id", async (c) => {
  const order = await store(c.env, c.get("user").tenantId).get(param(c, "id"));
  if (!order.ok || !order.value) return moduleError(c, "notFound");
  return orderResponse(c, order.value);
});

repairRoutes.put("/orders/:id", async (c) => {
  const body = await readBody(c);
  const customer = sanitizeCustomer(body.customer);
  const intake = sanitizeIntake(body.intake);
  const errors = { ...validateCustomer(customer), ...validateIntake(intake) };
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  // Entsperr-Code: fehlt = unverändert, leer = löschen
  let code: string | null | undefined;
  if (typeof body.unlockCode === "string") code = body.unlockCode.trim() ? await encryptField(c.env.DATA_KEY, body.unlockCode.trim().slice(0, 100)) : null;
  const result = await store(c.env, c.get("user").tenantId).update(param(c, "id"), customer, intake, code, actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return orderResponse(c, result.value);
});

/** Entsperr-Code anzeigen; jedes Ansehen steht im Protokoll. */
repairRoutes.get("/orders/:id/unlock", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).unlockCode(param(c, "id"));
  if (!result.ok) return moduleError(c, result.code);
  audit(c, "repairUnlockViewed", { order: param(c, "id") });
  return c.json({ code: result.value ? await decryptField(c.env.DATA_KEY, result.value) : "" });
});

repairRoutes.post("/orders/:id/status", async (c) => {
  const body = await readBody(c);
  const status = body.status as RepairStatus;
  if (!REPAIR_STATUSES.includes(status) || status === "pickedUp") return fail(c, "checkFields", 400);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  const result = await store(c.env, c.get("user").tenantId).setStatus(param(c, "id"), status, note, actor(c));
  if (!result.ok) return moduleError(c, result.code);
  const kind = MAIL_FOR[status];
  const settings = await store(c.env, c.get("user").tenantId).settings();
  const mailed = kind && body.notify !== false && settings.ok && settings.value.notifyByMail ? await notifyCustomer(c, result.value, kind) : false;
  return orderResponse(c, result.value, { mailed });
});

repairRoutes.post("/orders/:id/quote", async (c) => {
  const body = await readBody(c);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  const result = await store(c.env, c.get("user").tenantId).decideQuote(param(c, "id"), body.approve === true, note, actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return orderResponse(c, result.value);
});

repairRoutes.post("/orders/:id/items", async (c) => {
  const item = sanitizeItem(await readBody(c));
  if (!item) return fail(c, "checkFields", 400);
  const result = await store(c.env, c.get("user").tenantId).addItem(param(c, "id"), item, actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return orderResponse(c, result.value);
});

repairRoutes.delete("/orders/:id/items/:itemId", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).removeItem(param(c, "id"), param(c, "itemId"), actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return orderResponse(c, result.value);
});

repairRoutes.post("/orders/:id/pickup", async (c) => {
  const body = await readBody(c);
  const payment = (PAYMENT_METHODS.includes(body.paymentMethod as PaymentMethod) ? body.paymentMethod : "cash") as PaymentMethod;
  const tenantId = c.get("user").tenantId;
  const result = await store(c.env, tenantId).pickUp(param(c, "id"), payment, await companyForInvoice(c.env, tenantId), actor(c), today(), body.loanerReturned === true);
  if (!result.ok) return moduleError(c, result.code);
  audit(c, "repairPickedUp", { number: result.value.number, invoice: result.value.invoice?.number ?? null });
  return orderResponse(c, result.value);
});

repairRoutes.put("/orders/:id/out-checks", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).saveOutChecks(param(c, "id"), sanitizeChecks((await readBody(c)).checks), actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return orderResponse(c, result.value);
});

repairRoutes.post("/orders/:id/price", async (c) => {
  const body = await readBody(c);
  const result = await store(c.env, c.get("user").tenantId).applyPrice(param(c, "id"), typeof body.priceId === "string" ? body.priceId : "", actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return orderResponse(c, result.value);
});

/** Leihgerät ausgeben ({ loanerId }) oder zurücknehmen ({ loanerId: null }). */
repairRoutes.put("/orders/:id/loaner", async (c) => {
  const body = await readBody(c);
  const result = await store(c.env, c.get("user").tenantId).lend(param(c, "id"), typeof body.loanerId === "string" ? body.loanerId : null, actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return orderResponse(c, result.value);
});

repairRoutes.delete("/orders/:id", managers, async (c) => {
  const result = await store(c.env, c.get("user").tenantId).remove(param(c, "id"), actor(c));
  if (!result.ok) return moduleError(c, result.code);
  audit(c, "repairDeleted", { order: param(c, "id") });
  return c.json({ ok: true });
});

repairRoutes.get("/customers", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).customers(c.req.query("q") ?? "", 10);
  return c.json({ customers: result.ok ? result.value : [] });
});

// ---------- Kundenkartei ----------

repairRoutes.get("/customer-list", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).customerList(c.req.query("q") ?? "");
  return c.json({ customers: result.ok ? result.value : [] });
});

repairRoutes.post("/customer-list", async (c) => {
  const data = sanitizeCustomerCard(await readBody(c));
  const errors = validateCustomer(data);
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  const result = await store(c.env, c.get("user").tenantId).addCustomer(data);
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ customer: result.value });
});

repairRoutes.get("/customer-list/:id", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).customerCard(param(c, "id"));
  if (!result.ok || !result.value) return moduleError(c, "notFound");
  return c.json(result.value);
});

repairRoutes.put("/customer-list/:id", async (c) => {
  const data = sanitizeCustomerCard(await readBody(c));
  const errors = validateCustomer(data);
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  const result = await store(c.env, c.get("user").tenantId).saveCustomer(param(c, "id"), data);
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ customer: result.value });
});

repairRoutes.delete("/customer-list/:id", managers, async (c) => {
  const result = await store(c.env, c.get("user").tenantId).removeCustomer(param(c, "id"), actor(c));
  if (!result.ok) return moduleError(c, result.code);
  audit(c, "repairCustomerDeleted", { id: param(c, "id") });
  return c.json({ ok: true });
});

repairRoutes.get("/invoices/:number", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).invoice(param(c, "number"));
  if (!result.ok || !result.value) return moduleError(c, "notFound");
  return c.json({ invoice: result.value });
});

repairRoutes.get("/invoices", async (c) => {
  const year = Number(c.req.query("year")) || new Date().getUTCFullYear();
  const result = await store(c.env, c.get("user").tenantId).invoices(year);
  return c.json({ invoices: result.ok ? result.value : [] });
});

// ---------- Lager ----------

repairRoutes.get("/parts", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).parts(c.req.query("q") ?? "");
  return c.json({ parts: result.ok ? result.value : [] });
});

repairRoutes.get("/parts/:id/moves", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).stockMoves(param(c, "id"));
  return c.json({ moves: result.ok ? result.value : [] });
});

const savePart = async (c: Ctx, id: string | null) => {
  const part = sanitizePart(await readBody(c));
  if (!part.name) return fail(c, "checkFields", 400, { errors: { name: "required" } });
  const result = await store(c.env, c.get("user").tenantId).savePart(id, part, actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ part: result.value });
};
repairRoutes.post("/parts", (c) => savePart(c, null));
repairRoutes.put("/parts/:id", (c) => savePart(c, param(c, "id")));

repairRoutes.post("/parts/:id/stock", async (c) => {
  const body = await readBody(c);
  const delta = typeof body.delta === "number" && Number.isInteger(body.delta) ? body.delta : 0;
  const reasons = ["received", "counted", "damaged", "sold"] as const;
  const reason = reasons.find((r) => r === body.reason) ?? (delta > 0 ? "received" : "damaged");
  if (!delta || Math.abs(delta) > 100_000) return fail(c, "checkFields", 400);
  const result = await store(c.env, c.get("user").tenantId).adjustStock(param(c, "id"), delta, reason, actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ part: result.value });
});

repairRoutes.delete("/parts/:id", managers, async (c) => {
  await store(c.env, c.get("user").tenantId).removePart(param(c, "id"));
  return c.json({ ok: true });
});

// ---------- Preisliste ----------

repairRoutes.get("/prices", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).prices(c.req.query("q") ?? "");
  return c.json({ prices: result.ok ? result.value : [] });
});

const savePrice = async (c: Ctx, id: string | null) => {
  const price = sanitizePrice(await readBody(c));
  if (!price) return fail(c, "checkFields", 400, { errors: { service: "required" } });
  const result = await store(c.env, c.get("user").tenantId).savePrice(id, price);
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ price: result.value });
};
repairRoutes.post("/prices", managers, (c) => savePrice(c, null));
repairRoutes.put("/prices/:id", managers, (c) => savePrice(c, param(c, "id")));
repairRoutes.delete("/prices/:id", managers, async (c) => {
  await store(c.env, c.get("user").tenantId).removePrice(param(c, "id"));
  return c.json({ ok: true });
});

// ---------- Leihgeräte ----------

repairRoutes.get("/loaners", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).loaners();
  return c.json({ loaners: result.ok ? result.value : [] });
});

const saveLoaner = async (c: Ctx, id: string | null) => {
  const body = await readBody(c);
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const data = { name: text(body.name, 120), serial: text(body.serial, 60), note: text(body.note, 500) };
  if (!data.name) return fail(c, "checkFields", 400, { errors: { name: "required" } });
  const result = await store(c.env, c.get("user").tenantId).saveLoaner(id, data);
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ loaners: result.value });
};
repairRoutes.post("/loaners", (c) => saveLoaner(c, null));
repairRoutes.put("/loaners/:id", (c) => saveLoaner(c, param(c, "id")));
repairRoutes.delete("/loaners/:id", managers, async (c) => {
  const result = await store(c.env, c.get("user").tenantId).removeLoaner(param(c, "id"));
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ loaners: result.value });
});

// ---------- Kasse und Auswertung ----------


repairRoutes.get("/cash", async (c) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query("day") ?? "") ? c.req.query("day")! : berlinDay(new Date().toISOString());
  const result = await store(c.env, c.get("user").tenantId).cashDay(day);
  if (!result.ok) return moduleError(c, result.code);
  return c.json(result.value);
});

repairRoutes.get("/stats", managers, async (c) => {
  const month = /^\d{4}-\d{2}$/.test(c.req.query("month") ?? "") ? c.req.query("month")! : berlinDay(new Date().toISOString()).slice(0, 7);
  const result = await store(c.env, c.get("user").tenantId).stats(month);
  if (!result.ok) return moduleError(c, result.code);
  return c.json(result.value);
});

// ---------- An- und Verkauf ----------

repairRoutes.get("/used", async (c) => {
  const status = c.req.query("status");
  const result = await store(c.env, c.get("user").tenantId).usedDevices(status === "sold" || status === "all" ? status : "inStock", c.req.query("q") ?? "");
  return c.json({ devices: result.ok ? result.value : [] });
});

repairRoutes.post("/used", async (c) => {
  const input = sanitizeUsed(await readBody(c));
  const errors = validateUsed(input, true);
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  const idNumber = input.idNumber ? await encryptField(c.env.DATA_KEY, input.idNumber) : null;
  const result = await store(c.env, c.get("user").tenantId).buyDevice(input, idNumber, actor(c));
  if (!result.ok) return moduleError(c, result.code);
  audit(c, "usedDeviceBought", { number: result.value.number, cents: result.value.purchaseCents });
  return c.json({ device: result.value });
});

repairRoutes.put("/used/:id", async (c) => {
  const input = sanitizeUsed(await readBody(c));
  const errors = validateUsed(input, false);
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  const result = await store(c.env, c.get("user").tenantId).updateUsed(param(c, "id"), input);
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ device: result.value });
});

repairRoutes.delete("/used/:id", managers, async (c) => {
  const result = await store(c.env, c.get("user").tenantId).removeUsed(param(c, "id"));
  if (!result.ok) return moduleError(c, result.code);
  audit(c, "usedDeviceDeleted", { id: param(c, "id") });
  return c.json({ ok: true });
});

/** Ausweisnummer des Verkäufers anzeigen; jedes Ansehen steht im Protokoll. */
repairRoutes.get("/used/:id/id-number", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).usedIdNumber(param(c, "id"));
  if (!result.ok) return moduleError(c, result.code);
  audit(c, "usedIdNumberViewed", { id: param(c, "id") });
  return c.json({ idNumber: result.value ? await decryptField(c.env.DATA_KEY, result.value) : "" });
});

repairRoutes.post("/sales", async (c) => {
  const body = await readBody(c);
  const lines = (Array.isArray(body.lines) ? body.lines : []).slice(0, 100).map(sanitizeSaleLine);
  if (!lines.length || lines.some((l) => !l)) return fail(c, "checkFields", 400);
  const raw = (body.customer && typeof body.customer === "object" ? body.customer : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const customer = { name: text(raw.name, 120), phone: text(raw.phone, 40), email: text(raw.email, 200), address: text(raw.address, 300) };
  const payment = (PAYMENT_METHODS.includes(body.paymentMethod as PaymentMethod) ? body.paymentMethod : "cash") as PaymentMethod;
  const tenantId = c.get("user").tenantId;
  const customerId = typeof body.customerId === "string" ? body.customerId : null;
  const result = await store(c.env, tenantId).sell(lines as SaleLine[], customer, payment, await companyForInvoice(c.env, tenantId), actor(c), today(), customerId);
  if (!result.ok) return moduleError(c, result.code);
  audit(c, "repairSale", { invoice: result.value.number, cents: result.value.totalCents });
  return c.json({ invoice: result.value });
});

// ---------- Garantie ----------

repairRoutes.get("/warranties", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).warranties(c.req.query("q") ?? "");
  return c.json({ warranties: result.ok ? result.value : [] });
});

// ---------- Einstellungen ----------

repairRoutes.get("/settings", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).settings();
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ settings: result.value, mailEnabled: mailEnabled(c.env) });
});

repairRoutes.put("/settings", managers, async (c) => {
  const result = await store(c.env, c.get("user").tenantId).saveSettings(sanitizeRepairSettings(await readBody(c)));
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ settings: result.value, mailEnabled: mailEnabled(c.env) });
});

// ---------- Statusseite für Endkunden (ohne Anmeldung) ----------

export const repairStatusRoutes = new Hono<{ Bindings: Env }>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function publicOrder(env: Env, tenantId: string, token: string) {
  if (!UUID.test(tenantId) || !/^[0-9a-f]{36}$/.test(token)) return null;
  const db = tenantStub(env, tenantId);
  if (!(await db.installedApps()).includes(REPAIR_APP_ID)) return null;
  const result = await store(env, tenantId).byToken(token);
  return result.ok ? result.value : null;
}

/** Nur was der Kunde sehen soll: kein Name, keine Telefonnummer, keine internen Notizen. */
async function publicView(env: Env, tenantId: string, order: RepairOrder) {
  const company = await tenantStub(env, tenantId).getCompany();
  const settings = await store(env, tenantId).settings();
  const smallBusiness = settings.ok ? settings.value.smallBusiness : false;
  const showPrices = ["quote", "waitingParts", "repairing", "ready", "notRepaired", "pickedUp"].includes(order.status);
  return {
    company: {
      name: company?.name ?? "", phone: company?.phone ?? "", email: company?.email ?? "", street: company?.street ?? "",
      postalCode: company?.postalCode ?? "", city: company?.city ?? "", logoDataUrl: company?.logoDataUrl ?? "",
    },
    number: order.number,
    status: order.status,
    quote: order.quote,
    device: { type: order.intake.device.type, brand: order.intake.device.brand, model: order.intake.device.model },
    problem: order.intake.problem,
    dueDay: order.intake.dueDay,
    createdAt: order.createdAt,
    items: showPrices ? order.items.map(({ name, qty, unitCents }) => ({ name, qty, unitCents })) : [],
    totals: showPrices ? computeTotals(order.items, smallBusiness) : null,
    smallBusiness,
    history: order.history.filter((e) => e.status).map((e) => ({ at: e.at, status: e.status, event: e.event })),
    warrantyUntil: order.invoice?.warrantyUntil ?? "",
  };
}

repairStatusRoutes.get("/:tenantId/:token", async (c) => {
  const order = await publicOrder(c.env, c.req.param("tenantId") ?? "", c.req.param("token") ?? "");
  if (!order) return fail(c, "linkInvalid", 404);
  c.header("Cache-Control", "no-store");
  return c.json(await publicView(c.env, c.req.param("tenantId") ?? "", order));
});

repairStatusRoutes.post("/:tenantId/:token/decision", async (c) => {
  const tenantId = c.req.param("tenantId");
  const order = await publicOrder(c.env, tenantId, c.req.param("token"));
  if (!order) return fail(c, "linkInvalid", 404);
  if (billingEnabled(c.env)) {
    const sub = await getSubscription(c.env, tenantId);
    if (!hasAccess(sub.status, sub.trialEndsAt)) return fail(c, "subscriptionRequired", 402);
  }
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const result = await store(c.env, tenantId).decideQuote(order.id, body.approve === true, "", { id: null, name: null });
  if (!result.ok) return c.json({ code: `repairs.${result.code}`, error: result.code }, 409);
  return c.json(await publicView(c.env, tenantId, result.value));
});
