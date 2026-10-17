import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import type { RetailStore } from "./store";
import { fail } from "../errors";
import { RETAIL_APP_ID } from "../../shared/retail";

interface User {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  role: "owner" | "admin" | "staff";
}

type RetailEnv = { Bindings: Env; Variables: { user: User } };
type Ctx = Context<RetailEnv>;

type Remote = {
  [K in keyof RetailStore]: RetailStore[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<ModuleResult<R>>
    : never;
};

function store(env: Env, tenantId: string): Remote {
  const stub = tenantStub(env, tenantId);
  return new Proxy({} as Remote, {
    get: (_, action: string) => (...args: unknown[]) => stub.retail(action, args),
  });
}

function moduleError(c: Ctx, code: string) {
  const status = code.endsWith("NotFound") ? 404 : 400;
  return c.json({ code: `retail.${code}`, error: code }, status);
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
const managers = createMiddleware<RetailEnv>(async (c, next) => {
  if (c.get("user").role === "staff") return fail(c, "forbidden", 403);
  await next();
});

export const retailRoutes = new Hono<RetailEnv>();

// Prüfung: Modul „einzelhandel“ muss installiert sein
retailRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  const apps = await tenantStub(c.env, user.tenantId).installedApps();
  if (!apps.includes(RETAIL_APP_ID)) return fail(c, "forbidden", 403);
  await next();
});

// ---------- ARTIKEL / PRODUKTE ----------

retailRoutes.get("/products", async (c) => {
  const q = c.req.query("q") ?? "";
  const category = c.req.query("category") ?? "all";
  const lowStock = c.req.query("lowStock") === "true";

  const res = await store(c.env, c.get("user").tenantId).listProducts(q, category, lowStock);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ products: res.value });
});

retailRoutes.get("/products/:id", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).getProduct(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  if (!res.value) return fail(c, "notFound", 404);
  return c.json({ product: res.value });
});

retailRoutes.get("/products/barcode/:ean", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).getProductByEan(c.req.param("ean"));
  if (!res.ok) return moduleError(c, res.code);
  if (!res.value) return fail(c, "notFound", 404);
  return c.json({ product: res.value });
});

retailRoutes.post("/products", managers, async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveProduct(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ product: res.value });
});

retailRoutes.delete("/products/:id", managers, async (c) => {
  const res = await store(c.env, c.get("user").tenantId).deleteProduct(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

retailRoutes.post("/products/:id/stock", async (c) => {
  const body = await readBody(c);
  const deltaQty = Number(body.deltaQty || 0);
  const reason = String(body.reason || "correction") as any;
  const note = String(body.note || "");
  const user = c.get("user");

  const res = await store(c.env, user.tenantId).adjustStock(c.req.param("id"), deltaQty, reason, note, user.name);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ product: res.value });
});

// ---------- LIEFERANTEN ----------

retailRoutes.get("/suppliers", async (c) => {
  const q = c.req.query("q") ?? "";
  const res = await store(c.env, c.get("user").tenantId).listSuppliers(q);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ suppliers: res.value });
});

retailRoutes.post("/suppliers", managers, async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveSupplier(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ supplier: res.value });
});

retailRoutes.delete("/suppliers/:id", managers, async (c) => {
  const res = await store(c.env, c.get("user").tenantId).deleteSupplier(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- BESTELLWESEN & WARENEINGANG ----------

retailRoutes.get("/orders", async (c) => {
  const status = c.req.query("status") ?? "all";
  const res = await store(c.env, c.get("user").tenantId).listOrders(status);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ orders: res.value });
});

retailRoutes.get("/orders/:id", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).getOrder(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  if (!res.value) return fail(c, "notFound", 404);
  return c.json({ order: res.value });
});

retailRoutes.post("/orders", async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveOrder(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ order: res.value });
});

retailRoutes.post("/orders/:id/receive", async (c) => {
  const body = await readBody(c);
  const receivedItems = Array.isArray(body.receivedItems) ? (body.receivedItems as any) : [];
  const user = c.get("user");

  const res = await store(c.env, user.tenantId).receiveOrder(c.req.param("id"), receivedItems, user);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ order: res.value });
});

retailRoutes.delete("/orders/:id", managers, async (c) => {
  const res = await store(c.env, c.get("user").tenantId).deleteOrder(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- LAGERJOURNAL ----------

retailRoutes.get("/stock/movements", async (c) => {
  const productId = c.req.query("productId") || undefined;
  const limit = parseInt(c.req.query("limit") || "100", 10);

  const res = await store(c.env, c.get("user").tenantId).listStockMovements(productId, limit);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ movements: res.value });
});

// ---------- EINSTELLUNGEN ----------

retailRoutes.get("/settings", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).getSettings();
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ settings: res.value });
});

retailRoutes.post("/settings", managers, async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveSettings(body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ settings: res.value });
});
