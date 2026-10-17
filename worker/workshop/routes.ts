import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import type { WorkshopStore } from "./store";
import { fail } from "../errors";
import { publicCompany, publicTenant } from "../public";
import type { WorkshopOrder } from "../../shared/workshop";

interface User {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  role: "owner" | "admin" | "staff";
}

type WorkshopEnv = { Bindings: Env; Variables: { user: User } };
type Ctx = Context<WorkshopEnv>;

type Remote = {
  [K in keyof WorkshopStore]: WorkshopStore[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<ModuleResult<R>>
    : never;
};

function store(env: Env, tenantId: string): Remote {
  const stub = tenantStub(env, tenantId);
  return new Proxy({} as Remote, {
    get: (_, action: string) => (...args: unknown[]) => stub.workshop(action, args),
  });
}

// Deutscher Klartext für Aufrufer ohne Übersetzung; die App übersetzt jeden Code selbst (lang/*.ts → errors).
// Muss alle Codes enthalten, die der WorkshopStore wirft.
export const ERROR_TEXT: Record<string, string> = {
  orderNotFound: "Auftrag nicht gefunden.",
  vehicleNotFound: "Fahrzeug nicht gefunden.",
  notFound: "Nicht gefunden.",
  plateTaken: "Dieses Kennzeichen ist schon angelegt.",
  partNumberTaken: "Diese Teilenummer gibt es schon.",
  orderClosed: "Der Auftrag ist abgeschlossen und kann nicht mehr geändert werden.",
  estimateDecided: "Über den Kostenvoranschlag wurde bereits entschieden.",
  notPayable: "Dieser Auftrag ist bereits abgerechnet und kann nicht noch einmal bezahlt werden.",
};

function moduleError(c: Ctx, code: string) {
  const status = code.endsWith("NotFound") ? 404 : code.endsWith("Taken") ? 409 : 400;
  return c.json({ code: `workshop.${code}`, error: ERROR_TEXT[code] ?? code }, status);
}

async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

/** Preise, Stammdaten, Einstellungen und Löschen nur für Inhaber und Admins; Mitarbeiter arbeiten nur damit. */
const managers = createMiddleware<WorkshopEnv>(async (c, next) => {
  if (c.get("user").role === "staff") return fail(c, "forbidden", 403);
  await next();
});

export const workshopRoutes = new Hono<WorkshopEnv>();

// App-Buchung prüfen für interne Routen
workshopRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) return fail(c, "notLoggedIn", 401);

  const apps = await tenantStub(c.env, user.tenantId).installedApps();
  if (!apps.includes("werkstatt")) return fail(c, "forbidden", 403);
  await next();
});

/** Bezahlt wird nur über die Kasse (mit Beleg); Zahlungsfelder aus dem Browser zählen nicht. */
const unpaid = ({ paymentStatus: _s, paymentMethod: _m, ...rest }: Record<string, unknown>) => rest;

// ---------- STATS ----------
workshopRoutes.get("/stats", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).getStats();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- AUFTRÄGE (ORDERS) ----------
workshopRoutes.get("/orders", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).listOrders();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.get("/orders/:id", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).getOrder(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.post("/orders", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (!body.licensePlate || !body.customerName) {
    return fail(c, "checkFields", 400);
  }
  const res = await store(c.env, user.tenantId).createOrder(unpaid(body) as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value, 201);
});

workshopRoutes.put("/orders/:id", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const res = await store(c.env, user.tenantId).updateOrder(c.req.param("id"), unpaid(body) as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.post("/orders/:id/status", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (typeof body.status !== "string") return fail(c, "checkFields", 400);
  const res = await store(c.env, user.tenantId).updateOrderStatus(c.req.param("id"), body.status as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.delete("/orders/:id", managers, async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).deleteOrder(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- FAHRZEUGE (VEHICLES) ----------
workshopRoutes.get("/vehicles", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).listVehicles();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.get("/vehicles/:id", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).getVehicle(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.post("/vehicles", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (!body.licensePlate || !body.customerName) {
    return fail(c, "checkFields", 400);
  }
  const res = await store(c.env, user.tenantId).saveVehicle(body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.delete("/vehicles/:id", managers, async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).deleteVehicle(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- TEILELAGER (SPARE PARTS) ----------
workshopRoutes.get("/parts", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).listParts();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.post("/parts", managers, async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (!body.partNumber || !body.name) {
    return fail(c, "checkFields", 400);
  }
  const res = await store(c.env, user.tenantId).savePart(body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.post("/parts/:id/stock", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const diff = typeof body.diff === "number" ? body.diff : 0;
  const res = await store(c.env, user.tenantId).adjustPartStock(c.req.param("id"), diff);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.delete("/parts/:id", managers, async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).deletePart(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- REIFENDEPOT (TIRES) ----------
workshopRoutes.get("/tires", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).listTires();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.post("/tires", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (!body.licensePlate || !body.brand || !body.dimension) {
    return fail(c, "checkFields", 400);
  }
  const res = await store(c.env, user.tenantId).saveTireStorage(body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.delete("/tires/:id", managers, async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).deleteTireStorage(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- Statusseite und Freigabe des Kostenvoranschlags für Kunden (ohne Anmeldung) ----------
// Wird in worker/index.ts vor der Anmeldung eingehängt.

export const workshopPublicRoutes = new Hono<{ Bindings: Env }>();

const TOKEN = /^[a-z0-9-]{8,64}$/;

/** Nur was der Kunde sehen soll: keine Telefonnummer, keine E-Mail, keine Zahlungsdaten. */
const publicOrder = (o: WorkshopOrder) => ({
  orderNumber: o.orderNumber, licensePlate: o.licensePlate, vehicleInfo: o.vehicleInfo, mileage: o.mileage,
  customerName: o.customerName.split(" ")[0] ?? "", status: o.status, issueDescription: o.issueDescription, diagnosticNotes: o.diagnosticNotes ?? "",
  positions: o.positions.map(({ id, name, quantity, unit, unitPriceNet, taxRate, approvedByCustomer }) => ({ id, name, quantity, unit, unitPriceNet, taxRate, approvedByCustomer })),
  estimateStatus: o.estimateStatus, paid: o.paymentStatus === "bezahlt",
  totalNet: o.totalNet, totalTax: o.totalTax, totalGross: o.totalGross, createdAt: o.createdAt, updatedAt: o.updatedAt,
});

async function orderFor(env: Env, tenantId: string, token: string) {
  if (!TOKEN.test(token) || !(await publicTenant(env, tenantId, "werkstatt"))) return null;
  const res = await store(env, tenantId).getOrderByStatusToken(token);
  return res.ok ? res.value : null;
}

workshopPublicRoutes.get("/:tenantId/status/:token", async (c) => {
  const tenantId = c.req.param("tenantId");
  const order = await orderFor(c.env, tenantId, c.req.param("token"));
  if (!order) return fail(c, "linkInvalid", 404);
  c.header("Cache-Control", "no-store");
  return c.json({ ...(await publicCompany(c.env, tenantId)), order: publicOrder(order) });
});

workshopPublicRoutes.post("/:tenantId/approve-estimate/:token", async (c) => {
  const tenantId = c.req.param("tenantId");
  const token = c.req.param("token");
  if (!(await orderFor(c.env, tenantId, token))) return fail(c, "linkInvalid", 404);
  const res = await store(c.env, tenantId).approveEstimateByToken(token);
  if (!res.ok) return c.json({ code: `workshop.${res.code}`, error: ERROR_TEXT[res.code] ?? res.code }, 409);
  return c.json({ ok: true, order: publicOrder(res.value) });
});
