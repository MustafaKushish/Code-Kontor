import { defaultTaxSettings } from "../../shared/countries";
import { Hono, type Context } from "hono";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import { berlinDay, type RepairStore } from "./store";
import { posContext } from "../pos/routes";
import { PAY_METHODS, type PayMethod } from "../../shared/pos";
import { fail } from "../errors";
import { decryptField, encryptField } from "../crypto";
import { mailEnabled, sendMail } from "../mail";
import { billingEnabled, getSubscription } from "../billing";
import { hasAccess } from "../../shared/billing";
import { renderBookingMail, renderRepairMail, type RepairMailKind } from "./mail";
import { isLocked, recordFailure } from "../throttle";
import {
  REPAIR_APP_ID, REPAIR_STATUSES, STATUS_GROUPS, computeTotals, sanitizeCustomer, sanitizeIntake, sanitizeItem, sanitizePart,
  sanitizeChecks, sanitizeCustomerCard, sanitizePrice, sanitizeRepairSettings, sanitizeUsed, validateCustomer, validateIntake, validateUsed,
  type RepairOrder, type RepairStatus, type StatusGroup,
  PHOTO_STAGES, freeSlots, isPhotoDataUrl, isSignatureDataUrl, sanitizeBooking, sanitizePurchaseLines, sanitizeSupplier, validateBooking,
  type BookingStatus, type PhotoStage, type RepairBooking,
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
  const status = code.endsWith("notFound") ? 404 : 409;
  // Fehler der Kasse kommen schon mit Vorsilbe („pos.…“)
  return c.json({ code: code.includes(".") ? code : `repairs.${code}`, error: code }, status);
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
const berlinToday = () => berlinDay(new Date().toISOString());
const berlinTime = () => new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false });
const deviceName = (o: RepairOrder) => [o.intake.device.brand, o.intake.device.model].filter(Boolean).join(" ") || "Gerät";
const statusLink = (c: Ctx, tenantId: string, token: string) => new URL(`/status/${tenantId}/${token}`, c.req.url).toString();

function audit(c: Ctx, action: string, detail: Record<string, unknown>) {
  const user = c.get("user");
  const done = tenantStub(c.env, user.tenantId)
    .logEvent({ userId: user.id, userName: user.name, action, detail })
    .catch((err) => console.error("[audit]", err));
  c.executionCtx.waitUntil(done);
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
  const [list, lowStock, bookings] = await Promise.all([db.list(valid ? group : "open", c.req.query("q") ?? ""), db.lowStockCount(), db.bookingCounts(berlinToday())]);
  if (!list.ok) return moduleError(c, list.code);
  return c.json({ ...list.value, lowStock: lowStock.ok ? lowStock.value : 0, bookings: bookings.ok ? bookings.value : { new: 0, today: 0 } });
});

repairRoutes.post("/orders", async (c) => {
  const body = await readBody(c);
  const customer = sanitizeCustomer(body.customer);
  const intake = sanitizeIntake(body.intake);
  const errors = { ...validateCustomer(customer), ...validateIntake(intake) };
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  const code = typeof body.unlockCode === "string" ? body.unlockCode.trim().slice(0, 100) : "";
  const customerId = typeof body.customerId === "string" ? body.customerId : null;
  const tenantId = c.get("user").tenantId;
  // Anzahlung bekommt einen Beleg in der Kasse
  const depositMethod = (PAY_METHODS.includes(body.depositMethod as PayMethod) ? body.depositMethod : "cash") as PayMethod;
  const result = await store(c.env, tenantId).create(
    { id: customerId, data: customer }, intake, code ? await encryptField(c.env.DATA_KEY, code) : null, actor(c),
    intake.depositCents > 0 ? await posContext(c.env, tenantId, actor(c)) : null, depositMethod,
  );
  if (!result.ok) return moduleError(c, result.code);
  audit(c, "repairCreated", { number: result.value.number });
  const db = store(c.env, c.get("user").tenantId);
  if (typeof body.bookingId === "string") await db.linkBooking(body.bookingId, result.value.id);
  if (isSignatureDataUrl(body.signature)) {
    const signed = await db.sign(result.value.id, "intake", body.signature, actor(c));
    if (signed.ok) return orderResponse(c, signed.value);
  }
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
  const tenantId = c.get("user").tenantId;
  const result = await store(c.env, tenantId).update(param(c, "id"), customer, intake, code, actor(c), intake.depositCents > 0 ? await posContext(c.env, tenantId, actor(c)) : null);
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

// ---------- Fotos, Unterschrift, Nachrichten ----------

repairRoutes.get("/orders/:id/photos/:photoId", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).photo(param(c, "id"), param(c, "photoId"));
  if (!result.ok || !result.value) return moduleError(c, "notFound");
  const [head, data] = result.value.split(",", 2);
  const type = head!.slice(5, head!.indexOf(";"));
  const bytes = Uint8Array.from(atob(data ?? ""), (ch) => ch.charCodeAt(0));
  return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
});

repairRoutes.post("/orders/:id/photos", async (c) => {
  const body = await readBody(c);
  if (!isPhotoDataUrl(body.data)) return fail(c, "checkFields", 400);
  const stage = (PHOTO_STAGES.includes(body.stage as PhotoStage) ? body.stage : "intake") as PhotoStage;
  const result = await store(c.env, c.get("user").tenantId).addPhoto(param(c, "id"), stage, body.data, actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ photos: result.value });
});

repairRoutes.delete("/orders/:id/photos/:photoId", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).removePhoto(param(c, "id"), param(c, "photoId"));
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ photos: result.value });
});

/** Unterschrift des Kunden nachträglich ({ kind: "intake" | "pickup", data }). */
repairRoutes.put("/orders/:id/signature", async (c) => {
  const body = await readBody(c);
  if (!isSignatureDataUrl(body.data)) return fail(c, "checkFields", 400);
  const result = await store(c.env, c.get("user").tenantId).sign(param(c, "id"), body.kind === "pickup" ? "pickup" : "intake", body.data, actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return orderResponse(c, result.value);
});

/** WhatsApp oder SMS wurde auf dem Gerät geöffnet: im Verlauf festhalten. */
repairRoutes.post("/orders/:id/message", async (c) => {
  const body = await readBody(c);
  const channel = body.channel === "sms" ? "sms" : body.channel === "copy" ? "copy" : "whatsapp";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  const result = await store(c.env, c.get("user").tenantId).logMessage(param(c, "id"), channel, name, actor(c));
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

// ---------- Auswertung ----------


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

// ---------- Garantie ----------

repairRoutes.get("/warranties", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).warranties(c.req.query("q") ?? "");
  return c.json({ warranties: result.ok ? result.value : [] });
});

// ---------- Termine ----------

const bookingLink = (c: { req: { url: string } }, tenantId: string, token: string) => new URL(`/termin/${tenantId}/${token}`, c.req.url).toString();

/** Kunde über Bestätigung oder Absage informieren, wenn eine E-Mail-Adresse da ist. */
async function mailBooking(c: Ctx, booking: RepairBooking, kind: "confirmed" | "declined") {
  if (!booking.email || !mailEnabled(c.env)) return false;
  const user = c.get("user");
  const token = await store(c.env, user.tenantId).bookingToken(booking.id);
  if (!token.ok || !token.value) return false;
  const company = await tenantStub(c.env, user.tenantId).getCompany();
  const content = renderBookingMail(kind, booking.lang, bookingLink(c, user.tenantId, token.value), {
    name: booking.name, company: user.tenantName, day: booking.day, time: booking.time, address: [company?.street, [company?.postalCode, company?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  });
  c.executionCtx.waitUntil(sendMail(c.env, booking.email, content, fetch, company?.email ? { replyTo: company.email } : {}).catch((err) => console.error("[mail]", err)));
  return true;
}

repairRoutes.get("/bookings", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).bookings(c.req.query("scope") === "all" ? "all" : "open", berlinToday());
  return c.json({ bookings: result.ok ? result.value : [] });
});

repairRoutes.post("/bookings", async (c) => {
  const input = sanitizeBooking(await readBody(c));
  const errors = validateBooking(input);
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  const result = await store(c.env, c.get("user").tenantId).addBooking(input, "shop", 0);
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ booking: result.value });
});

repairRoutes.put("/bookings/:id", async (c) => {
  const input = sanitizeBooking(await readBody(c));
  const errors = validateBooking(input);
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  const result = await store(c.env, c.get("user").tenantId).updateBooking(param(c, "id"), input);
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ booking: result.value });
});

repairRoutes.post("/bookings/:id/status", async (c) => {
  const body = await readBody(c);
  const allowed: BookingStatus[] = ["new", "confirmed", "declined", "canceled", "noShow"];
  if (!allowed.includes(body.status as BookingStatus)) return fail(c, "checkFields", 400);
  const status = body.status as BookingStatus;
  const result = await store(c.env, c.get("user").tenantId).setBookingStatus(param(c, "id"), status);
  if (!result.ok) return moduleError(c, result.code);
  const mailed = (status === "confirmed" || status === "declined") && body.notify !== false ? await mailBooking(c, result.value, status) : false;
  return c.json({ booking: result.value, mailed });
});

repairRoutes.delete("/bookings/:id", managers, async (c) => {
  await store(c.env, c.get("user").tenantId).removeBooking(param(c, "id"));
  return c.json({ ok: true });
});

// ---------- Lieferanten und Bestellungen ----------

repairRoutes.get("/suppliers", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).suppliers();
  return c.json({ suppliers: result.ok ? result.value : [] });
});

const saveSupplier = async (c: Ctx, id: string | null) => {
  const data = sanitizeSupplier(await readBody(c));
  if (!data) return fail(c, "checkFields", 400, { errors: { name: "required" } });
  const result = await store(c.env, c.get("user").tenantId).saveSupplier(id, data);
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ suppliers: result.value });
};
repairRoutes.post("/suppliers", managers, (c) => saveSupplier(c, null));
repairRoutes.put("/suppliers/:id", managers, (c) => saveSupplier(c, param(c, "id")));
repairRoutes.delete("/suppliers/:id", managers, async (c) => {
  const result = await store(c.env, c.get("user").tenantId).removeSupplier(param(c, "id"));
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ suppliers: result.value });
});

repairRoutes.get("/purchases", async (c) => {
  const scope = c.req.query("scope");
  const result = await store(c.env, c.get("user").tenantId).purchases(scope === "done" || scope === "all" ? scope : "open");
  return c.json({ purchases: result.ok ? result.value : [] });
});

repairRoutes.get("/purchases/:id", async (c) => {
  const result = await store(c.env, c.get("user").tenantId).purchase(param(c, "id"));
  if (!result.ok || !result.value) return moduleError(c, "notFound");
  return c.json({ purchase: result.value });
});

const savePurchase = async (c: Ctx, id: string | null) => {
  const body = await readBody(c);
  const supplierId = typeof body.supplierId === "string" ? body.supplierId : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  const result = await store(c.env, c.get("user").tenantId).savePurchase(id, supplierId, note, sanitizePurchaseLines(body.lines), actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ purchase: result.value });
};
repairRoutes.post("/purchases", (c) => savePurchase(c, null));
repairRoutes.put("/purchases/:id", (c) => savePurchase(c, param(c, "id")));

repairRoutes.post("/purchases/:id/status", async (c) => {
  const status = (await readBody(c)).status;
  if (status !== "draft" && status !== "ordered" && status !== "canceled") return fail(c, "checkFields", 400);
  const result = await store(c.env, c.get("user").tenantId).setPurchaseStatus(param(c, "id"), status, actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ purchase: result.value });
});

/** Wareneingang: { quantities: { [Positions-ID]: Menge } } */
repairRoutes.post("/purchases/:id/receive", async (c) => {
  const raw = (await readBody(c)).quantities;
  const quantities: Record<string, number> = {};
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) if (typeof v === "number" && Number.isFinite(v)) quantities[k] = v;
  const result = await store(c.env, c.get("user").tenantId).receivePurchase(param(c, "id"), quantities, actor(c));
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ purchase: result.value });
});

repairRoutes.delete("/purchases/:id", managers, async (c) => {
  const result = await store(c.env, c.get("user").tenantId).removePurchase(param(c, "id"));
  if (!result.ok) return moduleError(c, result.code);
  return c.json({ ok: true });
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
  const tax = await tenantStub(env, tenantId).getTaxSettings();
  const settings = await store(env, tenantId).settings();
  const smallBusiness = settings.ok ? settings.value.smallBusiness : false;
  const showPrices = ["quote", "waitingParts", "repairing", "ready", "notRepaired", "pickedUp"].includes(order.status);
  return {
    company: {
      name: company?.name ?? "", phone: company?.phone ?? "", email: company?.email ?? "", street: company?.street ?? "",
      postalCode: company?.postalCode ?? "", city: company?.city ?? "", logoDataUrl: company?.logoDataUrl ?? "",
    },
    currency: tax?.currency ?? defaultTaxSettings(company?.country ?? "DE").currency,
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

// ---------- Online-Termine für Endkunden (ohne Anmeldung) ----------
// Vor der Statusseite registriert, weil /booking/:tenantId sonst als /:tenantId/:token gelesen würde.

async function bookingSetup(env: Env, tenantId: string) {
  if (!UUID.test(tenantId)) return null;
  if (!(await tenantStub(env, tenantId).installedApps()).includes(REPAIR_APP_ID)) return null;
  const settings = await store(env, tenantId).settings();
  if (!settings.ok || !settings.value.booking.enabled) return null;
  return settings.value.booking;
}

async function publicCompany(env: Env, tenantId: string) {
  const company = await tenantStub(env, tenantId).getCompany();
  return {
    name: company?.name ?? "", phone: company?.phone ?? "", email: company?.email ?? "", street: company?.street ?? "",
    postalCode: company?.postalCode ?? "", city: company?.city ?? "", logoDataUrl: company?.logoDataUrl ?? "",
  };
}

repairStatusRoutes.get("/booking/:tenantId", async (c) => {
  const tenantId = c.req.param("tenantId");
  const setup = await bookingSetup(c.env, tenantId);
  if (!setup) return fail(c, "linkInvalid", 404);
  const taken = await store(c.env, tenantId).bookingTaken(berlinToday());
  c.header("Cache-Control", "no-store");
  return c.json({ company: await publicCompany(c.env, tenantId), note: setup.note, slots: freeSlots(setup, berlinToday(), berlinTime(), taken.ok ? taken.value : {}) });
});

repairStatusRoutes.post("/booking/:tenantId", async (c) => {
  const tenantId = c.req.param("tenantId");
  const setup = await bookingSetup(c.env, tenantId);
  if (!setup) return fail(c, "linkInvalid", 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  // Unsichtbares Feld: nur Bots füllen es aus
  if (typeof body.website === "string" && body.website) return c.json({ ok: true, token: "" });
  const ip = c.req.header("CF-Connecting-IP");
  const keys = [{ key: `booking:${tenantId}`, limit: 60 }, ...(ip ? [{ key: `booking-ip:${ip}`, limit: 5 }] : [])];
  if (await isLocked(c.env.PLATFORM_DB, keys)) return fail(c, "tooManyAttempts", 429);
  if (billingEnabled(c.env)) {
    const sub = await getSubscription(c.env, tenantId);
    if (!hasAccess(sub.status, sub.trialEndsAt)) return fail(c, "linkInvalid", 404);
  }
  const input = sanitizeBooking(body);
  const errors = validateBooking(input);
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  const db = store(c.env, tenantId);
  const taken = await db.bookingTaken(berlinToday());
  const free = freeSlots(setup, berlinToday(), berlinTime(), taken.ok ? taken.value : {});
  if (!free.some((d) => d.day === input.day && d.times.includes(input.time))) return c.json({ code: "repairs.slotTaken", error: "slotTaken" }, 409);
  const result = await db.addBooking(input, "online", setup.perSlot);
  if (!result.ok) return c.json({ code: `repairs.${result.code}`, error: result.code }, 409);
  await recordFailure(c.env.PLATFORM_DB, keys);
  const token = await db.bookingToken(result.value.id);
  const link = bookingLink(c, tenantId, token.ok && token.value ? token.value : "");
  if (mailEnabled(c.env)) {
    const company = await tenantStub(c.env, tenantId).getCompany();
    const vars = {
      name: input.name, company: company?.name ?? "", day: input.day, time: input.time,
      address: [company?.street, [company?.postalCode, company?.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    };
    if (input.email) c.executionCtx.waitUntil(sendMail(c.env, input.email, renderBookingMail("received", input.lang, link, vars), fetch, company?.email ? { replyTo: company.email } : {}).catch((err) => console.error("[mail]", err)));
    // Laden informieren
    if (company?.email) {
      const device = [input.device.brand, input.device.model].filter(Boolean).join(" ");
      c.executionCtx.waitUntil(
        sendMail(c.env, company.email, renderBookingMail("shopNew", "de", new URL("/app/handy-it/termine", c.req.url).toString(), { ...vars, name: input.name, device, problem: input.problem }), fetch,
          input.email ? { replyTo: input.email } : {}).catch((err) => console.error("[mail]", err)),
      );
    }
  }
  return c.json({ ok: true, token: token.ok ? token.value : "" });
});

async function publicBooking(env: Env, tenantId: string, token: string) {
  if (!UUID.test(tenantId) || !/^[0-9a-f]{40}$/.test(token)) return null;
  if (!(await tenantStub(env, tenantId).installedApps()).includes(REPAIR_APP_ID)) return null;
  const result = await store(env, tenantId).bookingByToken(token);
  return result.ok ? result.value : null;
}

const bookingView = (b: RepairBooking) => ({ status: b.status, day: b.day, time: b.time, name: b.name, device: b.device, problem: b.problem });

repairStatusRoutes.get("/booking/:tenantId/:token", async (c) => {
  const tenantId = c.req.param("tenantId");
  const booking = await publicBooking(c.env, tenantId, c.req.param("token"));
  if (!booking) return fail(c, "linkInvalid", 404);
  c.header("Cache-Control", "no-store");
  return c.json({ company: await publicCompany(c.env, tenantId), booking: bookingView(booking) });
});

repairStatusRoutes.post("/booking/:tenantId/:token/cancel", async (c) => {
  const tenantId = c.req.param("tenantId");
  const booking = await publicBooking(c.env, tenantId, c.req.param("token"));
  if (!booking) return fail(c, "linkInvalid", 404);
  if (booking.status !== "new" && booking.status !== "confirmed") return c.json({ code: "repairs.statusNotAllowed", error: "statusNotAllowed" }, 409);
  const result = await store(c.env, tenantId).setBookingStatus(booking.id, "canceled");
  if (!result.ok) return c.json({ code: `repairs.${result.code}`, error: result.code }, 409);
  return c.json({ company: await publicCompany(c.env, tenantId), booking: bookingView(result.value) });
});

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
