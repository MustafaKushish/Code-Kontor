import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import type { FitnessStore } from "./store";
import { fail } from "../errors";

interface User {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  role: "owner" | "admin" | "staff";
}

type FitnessEnv = { Bindings: Env; Variables: { user: User } };
type Ctx = Context<FitnessEnv>;

type Remote = {
  [K in keyof FitnessStore]: FitnessStore[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<ModuleResult<R>>
    : never;
};

function store(env: Env, tenantId: string): Remote {
  const stub = tenantStub(env, tenantId);
  return new Proxy({} as Remote, {
    get: (_, action: string) => (...args: unknown[]) => stub.fitness(action, args),
  });
}

function moduleError(c: Ctx, code: string) {
  const status = code.endsWith("NotFound") ? 404 : 400;
  return c.json({ code: `fitness.${code}`, error: code }, status);
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
const managers = createMiddleware<FitnessEnv>(async (c, next) => {
  if (c.get("user").role === "staff") return fail(c, "forbidden", 403);
  await next();
});

export const fitnessRoutes = new Hono<FitnessEnv>();

// Prüfung ob App installiert ist
fitnessRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) return fail(c, "notLoggedIn", 401);

  const apps = await tenantStub(c.env, user.tenantId).installedApps();
  if (!apps.includes("fitness")) return fail(c, "forbidden", 403);
  await next();
});

// ---------- STATS ----------
fitnessRoutes.get("/stats", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).getStats();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- CHECK-IN & CHECK-OUT ----------
fitnessRoutes.get("/active-visits", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).getActiveVisits();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

fitnessRoutes.post("/check-in", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const query = typeof body.query === "string" ? body.query : "";
  const res = await store(c.env, user.tenantId).checkIn(query);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value.member ? { ...res.value, member: hideIban(res.value.member, user.role) } : res.value);
});

fitnessRoutes.post("/check-out/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const res = await store(c.env, user.tenantId).checkOut(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- MITGLIEDER ----------
// Die IBAN der Mitglieder sehen und ändern nur Inhaber und Admins; Mitarbeiter sehen die letzten Stellen
type WithIban = { iban?: string };
function hideIban<T extends WithIban>(m: T, role: string): T {
  return role === "staff" && m.iban ? { ...m, iban: `•••• ${m.iban.replace(/\s/g, "").slice(-4)}` } : m;
}

fitnessRoutes.get("/members", async (c) => {
  const user = c.get("user");
  const search = c.req.query("search") || undefined;
  const status = c.req.query("status") || undefined;
  const res = await store(c.env, user.tenantId).listMembers(search, status);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value.map((m) => hideIban(m, user.role)));
});

fitnessRoutes.get("/members/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const res = await store(c.env, user.tenantId).getMember(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ...res.value, member: hideIban(res.value.member, user.role) });
});

fitnessRoutes.post("/members", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const res = await store(c.env, user.tenantId).createMember(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(hideIban(res.value, user.role), 201);
});

fitnessRoutes.put("/members/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readBody(c);
  if (user.role === "staff") delete body.iban;
  const res = await store(c.env, user.tenantId).updateMember(id, body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(hideIban(res.value, user.role));
});

fitnessRoutes.delete("/members/:id", managers, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const res = await store(c.env, user.tenantId).deleteMember(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- KURSPLAN ----------
fitnessRoutes.get("/classes", async (c) => {
  const user = c.get("user");
  const weekday = c.req.query("weekday") || undefined;
  const res = await store(c.env, user.tenantId).listClasses(weekday);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

fitnessRoutes.post("/classes", managers, async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const res = await store(c.env, user.tenantId).createClass(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value, 201);
});

fitnessRoutes.put("/classes/:id", managers, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readBody(c);
  const res = await store(c.env, user.tenantId).updateClass(id, body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

fitnessRoutes.delete("/classes/:id", managers, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const res = await store(c.env, user.tenantId).deleteClass(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

fitnessRoutes.post("/classes/:id/book", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readBody(c);
  const memberId = typeof body.memberId === "string" ? body.memberId : "";
  const res = await store(c.env, user.tenantId).bookClass(id, memberId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

fitnessRoutes.post("/classes/:id/cancel", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readBody(c);
  const memberId = typeof body.memberId === "string" ? body.memberId : "";
  const res = await store(c.env, user.tenantId).cancelClassBooking(id, memberId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- TARIFE ----------
fitnessRoutes.get("/plans", async (c) => {
  const user = c.get("user");
  const res = await store(c.env, user.tenantId).listPlans();
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

fitnessRoutes.post("/plans", managers, async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const res = await store(c.env, user.tenantId).createPlan(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value, 201);
});

fitnessRoutes.put("/plans/:id", managers, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readBody(c);
  const res = await store(c.env, user.tenantId).updatePlan(id, body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});
