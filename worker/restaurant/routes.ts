import { Hono, type Context } from "hono";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import type { RestaurantStore } from "./store";
import { fail } from "../errors";

interface User {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  role: "owner" | "admin" | "staff";
}

type RestaurantEnv = { Bindings: Env; Variables: { user: User } };
type Ctx = Context<RestaurantEnv>;

type Remote = {
  [K in keyof RestaurantStore]: RestaurantStore[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<ModuleResult<R>>
    : never;
};

function store(env: Env, tenantId: string): Remote {
  const stub = tenantStub(env, tenantId);
  return new Proxy({} as Remote, {
    get: (_, action: string) => (...args: unknown[]) => stub.restaurant(action, args),
  });
}

function moduleError(c: Ctx, code: string) {
  const status = code.endsWith("NotFound") ? 404 : 400;
  return c.json({ code: `restaurant.${code}`, error: code }, status);
}

async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export const restaurantRoutes = new Hono<RestaurantEnv>();

// Öffentliche Abholanzeige (Kunden-Aufruf-Monitor) ohne Login
restaurantRoutes.get("/public/:tenantId/pickup-queue", async (c) => {
  const tenantId = c.req.param("tenantId");
  const res = await store(c.env, tenantId).getPickupQueue();
  if (!res.ok) return moduleError(c, res.code);

  const company = await tenantStub(c.env, tenantId).getCompany();

  return c.json({
    queue: res.value,
    company: company || {
      name: "Restaurant & Café",
      phone: "+49 40 123456",
    },
  });
});

// App-Buchung prüfen für interne Routen
restaurantRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) return fail(c, "notLoggedIn", 401);

  const apps = await tenantStub(c.env, user.tenantId).installedApps();
  if (!apps.includes("restaurant")) return fail(c, "forbidden", 403);
  await next();
});

// ---------- STATS ----------
restaurantRoutes.get("/stats", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).getStats();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- TISCHE (TABLES) ----------
restaurantRoutes.get("/tables", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).listTables();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

restaurantRoutes.post("/tables", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (!body.tableNumber || !body.name) return fail(c, "checkFields", 400);

  const res = await store(c.env, user.tenantId).saveTable(body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

restaurantRoutes.delete("/tables/:id", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).deleteTable(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- SPEISEKARTE (MENU) ----------
restaurantRoutes.get("/menu", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).listMenu();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

restaurantRoutes.post("/menu", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (!body.itemNumber || !body.name || typeof body.priceGross !== "number") {
    return fail(c, "checkFields", 400);
  }
  const res = await store(c.env, user.tenantId).saveMenuItem(body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

restaurantRoutes.delete("/menu/:id", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).deleteMenuItem(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- BESTELLUNGEN & KÜCHE (ORDERS & KDS) ----------
restaurantRoutes.get("/orders", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).listOrders();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

restaurantRoutes.get("/orders/:id", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).getOrder(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

restaurantRoutes.post("/orders", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return fail(c, "checkFields", 400);
  }
  const res = await store(c.env, user.tenantId).createOrder(body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value, 201);
});

restaurantRoutes.put("/orders/:id", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const res = await store(c.env, user.tenantId).updateOrder(c.req.param("id"), body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

restaurantRoutes.post("/orders/:id/status", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (typeof body.status !== "string") return fail(c, "checkFields", 400);
  const res = await store(c.env, user.tenantId).updateOrderStatus(c.req.param("id"), body.status as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

restaurantRoutes.post("/orders/:id/items/:itemId/status", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (typeof body.status !== "string") return fail(c, "checkFields", 400);
  const res = await store(c.env, user.tenantId).updateOrderItemStatus(
    c.req.param("id"),
    c.req.param("itemId"),
    body.status as any,
  );
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

restaurantRoutes.post("/orders/:id/checkout", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const method = (typeof body.paymentMethod === "string" ? body.paymentMethod : "bar") as any;
  const res = await store(c.env, user.tenantId).checkoutOrder(c.req.param("id"), method);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

restaurantRoutes.get("/pickup-queue", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).getPickupQueue();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});
