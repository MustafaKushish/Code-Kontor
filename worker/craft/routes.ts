import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import type { CraftStore } from "./store";
import { fail } from "../errors";

interface User {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  role: "owner" | "admin" | "staff";
}

type CraftEnv = { Bindings: Env; Variables: { user: User } };
type Ctx = Context<CraftEnv>;

type Remote = {
  [K in keyof CraftStore]: CraftStore[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<ModuleResult<R>>
    : never;
};

function store(env: Env, tenantId: string): Remote {
  const stub = tenantStub(env, tenantId);
  return new Proxy({} as Remote, {
    get: (_, action: string) => (...args: unknown[]) => stub.craft(action, args),
  });
}

function moduleError(c: Ctx, code: string) {
  const status = code.endsWith("NotFound") ? 404 : 400;
  return c.json({ code: `craft.${code}`, error: code }, status);
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
const managers = createMiddleware<CraftEnv>(async (c, next) => {
  if (c.get("user").role === "staff") return fail(c, "forbidden", 403);
  await next();
});

export const craftRoutes = new Hono<CraftEnv>();

// Prüfung ob App installiert ist
craftRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) return fail(c, "notLoggedIn", 401);

  const apps = await tenantStub(c.env, user.tenantId).installedApps();
  if (!apps.includes("handwerk")) return fail(c, "forbidden", 403);
  await next();
});

// ---------- STATS ----------
craftRoutes.get("/stats", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).getStats();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- PROJECTS (BAUSTELLEN) ----------
craftRoutes.get("/projects", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).listProjects();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

craftRoutes.get("/projects/:id", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).getProject(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

craftRoutes.post("/projects", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (!body.title || !body.customerName || !body.siteAddress) {
    return fail(c, "checkFields", 400);
  }
  const res = await store(c.env, user.tenantId).saveProject(body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

craftRoutes.delete("/projects/:id", managers, async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).deleteProject(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- MEASUREMENTS (AUFMAß) ----------
craftRoutes.get("/measurements", async (c) => {
  const user = c.get("user");
  const projectId = c.req.query("projectId");
  const res = await store(c.env, user.tenantId).listMeasurements(projectId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

craftRoutes.post("/measurements", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (!body.projectId || !body.roomName) {
    return fail(c, "checkFields", 400);
  }
  const res = await store(c.env, user.tenantId).saveMeasurement(body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

craftRoutes.delete("/measurements/:id", managers, async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).deleteMeasurement(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- REPORTS (ARBEITSBERICHTE & UNTERSCHRIFT) ----------
craftRoutes.get("/reports", async (c) => {
  const user = c.get("user");
  const projectId = c.req.query("projectId");
  const res = await store(c.env, user.tenantId).listReports(projectId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

craftRoutes.get("/reports/:id", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).getReport(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

craftRoutes.post("/reports", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (!body.projectId || !body.workerName || !body.workDescription) {
    return fail(c, "checkFields", 400);
  }
  const res = await store(c.env, user.tenantId).createReport(body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value, 201);
});

craftRoutes.post("/reports/:id/sign", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (!body.signatureDataUrl || !body.signedByName) {
    return fail(c, "checkFields", 400);
  }
  const res = await store(c.env, user.tenantId).signReport(
    c.req.param("id"),
    body.signatureDataUrl as string,
    body.signedByName as string
  );
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

craftRoutes.post("/reports/:id/checkout", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const method = (typeof body.paymentMethod === "string" ? body.paymentMethod : "bar") as any;
  const res = await store(c.env, user.tenantId).checkoutReport(c.req.param("id"), method);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

craftRoutes.delete("/reports/:id", managers, async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).deleteReport(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- SITE DIARY (BAUTAGEBUCH) ----------
craftRoutes.get("/site-diary", async (c) => {
  const user = c.get("user");
  const projectId = c.req.query("projectId");
  const res = await store(c.env, user.tenantId).listSiteDiary(projectId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

craftRoutes.post("/site-diary", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if (!body.projectId || !body.activitiesSummary) {
    return fail(c, "checkFields", 400);
  }
  const res = await store(c.env, user.tenantId).saveSiteDiaryEntry(body as any);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});
