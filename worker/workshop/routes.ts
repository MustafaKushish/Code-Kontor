import { Hono, type Context } from "hono";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import type { WorkshopStore } from "./store";
import { fail } from "../errors";

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

function moduleError(c: Ctx, code: string) {
  const status = code.endsWith("NotFound") ? 404 : 400;
  return c.json({ code: `workshop.${code}`, error: code }, status);
}

async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export const workshopRoutes = new Hono<WorkshopEnv>();

// Öffentliche Kunden-Statusabfrage ohne Login
workshopRoutes.get("/public/:tenantId/status/:token", async (c) => {
  const tenantId = c.req.param("tenantId");
  const token = c.req.param("token");

  const res = await store(c.env, tenantId).getOrderByStatusToken(token);
  if (!res.ok) return moduleError(c, res.code);

  const company = await tenantStub(c.env, tenantId).getCompany();

  return c.json({
    order: res.value,
    company: company || {
      name: "Kfz-Meisterbetrieb",
      phone: "+49 40 12345678",
      email: "service@werkstatt.de",
      street: "Werkstattstraße 1",
      postalCode: "20095",
      city: "Hamburg",
    },
  });
});

// Öffentliche KVA-Online-Freigabe durch Kunden
workshopRoutes.post("/public/:tenantId/approve-estimate/:token", async (c) => {
  const tenantId = c.req.param("tenantId");
  const token = c.req.param("token");
  const body = await readBody(c);
  const positionIds = Array.isArray(body.approvedPositionIds) ? (body.approvedPositionIds as string[]) : undefined;

  const res = await store(c.env, tenantId).approveEstimateByToken(token, positionIds);
  if (!res.ok) return moduleError(c, res.code);

  return c.json({ ok: true, order: res.value });
});

// App-Buchung prüfen für interne Routen
workshopRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) return fail(c, "notLoggedIn", 401);

  const apps = await tenantStub(c.env, user.tenantId).installedApps();
  if (!apps.includes("werkstatt")) return fail(c, "forbidden", 403);
  await next();
});

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
  const res = await store(c.env, user.tenantId).createOrder(body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value, 201);
});

workshopRoutes.put("/orders/:id", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const res = await store(c.env, user.tenantId).updateOrder(c.req.param("id"), body as any);
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

workshopRoutes.post("/orders/:id/checkout", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const method = (typeof body.paymentMethod === "string" ? body.paymentMethod : "bar") as any;
  const res = await store(c.env, user.tenantId).checkoutOrder(c.req.param("id"), method);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

workshopRoutes.delete("/orders/:id", async (c) => {
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

workshopRoutes.delete("/vehicles/:id", async (c) => {
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

workshopRoutes.post("/parts", async (c) => {
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

workshopRoutes.delete("/parts/:id", async (c) => {
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

workshopRoutes.delete("/tires/:id", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).deleteTireStorage(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});
