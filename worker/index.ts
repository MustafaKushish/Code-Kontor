import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { hashPassword, hashToken, newSessionToken, passwordProblem, verifyPassword } from "./auth";
import { TenantDatabase } from "./tenant";
import { sanitizeCompany, validateCompany } from "../shared/company";
import { findApp } from "../shared/apps";
import { fail } from "./errors";
import Anthropic from "@anthropic-ai/sdk";
import { askAssistant, DAILY_QUESTION_LIMIT, parseConversation } from "./assistant";

export { TenantDatabase };

export interface Env {
  PLATFORM_DB: D1Database;
  TENANT_DB: DurableObjectNamespace<TenantDatabase>;
  ASSETS: Fetcher;
  /** Schlüssel für den KI-Assistenten, gesetzt mit `wrangler secret put ANTHROPIC_API_KEY`. */
  ANTHROPIC_API_KEY?: string;
}

type Role = "owner" | "admin" | "staff";
interface SessionUser {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  name: string;
  role: Role;
}

type App = { Bindings: Env; Variables: { user: SessionUser } };
type Ctx = Context<App>;

const SESSION_COOKIE = "ck_session";
const SESSION_DAYS = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = new Hono<App>().basePath("/api");
app.use(csrf());

function tenantDb(env: Env, tenantId: string) {
  return env.TENANT_DB.get(env.TENANT_DB.idFromName(tenantId));
}

async function startSession(c: Ctx, userId: string) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await c.env.PLATFORM_DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await hashToken(token), userId, expires.toISOString())
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    expires,
  });
}

async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

// ---------- Anmeldung ----------

app.post("/auth/register", async (c) => {
  const body = await readBody(c);
  const companyName = text(body.companyName);
  const name = text(body.name);
  const email = text(body.email).toLowerCase();
  const problem = passwordProblem(body.password);
  if (!companyName) return fail(c, "companyNameRequired", 400);
  if (!name) return fail(c, "nameRequired", 400);
  if (!EMAIL_PATTERN.test(email)) return fail(c, "emailInvalid", 400);
  if (problem) return fail(c, problem, 400);

  const exists = await c.env.PLATFORM_DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) return fail(c, "emailTaken", 409);

  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await c.env.PLATFORM_DB.batch([
    c.env.PLATFORM_DB.prepare("INSERT INTO tenants (id, name) VALUES (?, ?)").bind(tenantId, companyName),
    c.env.PLATFORM_DB.prepare(
      "INSERT INTO users (id, tenant_id, email, name, role, password_hash) VALUES (?, ?, ?, ?, 'owner', ?)",
    ).bind(userId, tenantId, email, name, await hashPassword(body.password as string)),
  ]);

  // Eigene Datenbank des Kunden anlegen und mit dem Firmennamen vorbelegen
  const db = tenantDb(c.env, tenantId);
  await db.saveCompany({ ...sanitizeCompany({ name: companyName, email }) });

  await startSession(c, userId);
  return c.json({ ok: true }, 201);
});

app.post("/auth/login", async (c) => {
  const body = await readBody(c);
  const email = text(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const user = await c.env.PLATFORM_DB.prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; password_hash: string }>();
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return fail(c, "wrongCredentials", 401);
  await startSession(c, user.id);
  return c.json({ ok: true });
});

app.post("/auth/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.PLATFORM_DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// ---------- Ab hier nur mit Anmeldung ----------

app.use("*", async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return fail(c, "notLoggedIn", 401);
  const user = await c.env.PLATFORM_DB.prepare(
    `SELECT u.id, u.tenant_id AS tenantId, t.name AS tenantName, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN tenants t ON t.id = u.tenant_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await hashToken(token), new Date().toISOString())
    .first<SessionUser>();
  if (!user) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return fail(c, "sessionExpired", 401);
  }
  c.set("user", user);
  await next();
});

const requireRole = (...roles: Role[]) =>
  async (c: Ctx, next: () => Promise<void>) => {
    if (!roles.includes(c.get("user").role)) return fail(c, "forbidden", 403);
    await next();
  };

app.get("/me", async (c) => {
  const user = c.get("user");
  const db = tenantDb(c.env, user.tenantId);
  const company = await db.getCompany();
  const setupComplete = !!company && Object.keys(validateCompany(company)).length === 0;
  return c.json({ user, setupComplete, installedApps: await db.installedApps() });
});

// ---------- Firmendaten ----------

app.get("/company", async (c) => {
  const company = await tenantDb(c.env, c.get("user").tenantId).getCompany();
  return c.json({ company });
});

app.put("/company", requireRole("owner", "admin"), async (c) => {
  const user = c.get("user");
  const company = sanitizeCompany(await readBody(c));
  const errors = validateCompany(company);
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  await tenantDb(c.env, user.tenantId).saveCompany(company);
  if (company.name !== user.tenantName)
    await c.env.PLATFORM_DB.prepare("UPDATE tenants SET name = ? WHERE id = ?").bind(company.name, user.tenantId).run();
  return c.json({ company });
});

// ---------- App-Katalog ----------

app.post("/apps/:id", requireRole("owner", "admin"), async (c) => {
  const catalogApp = findApp(c.req.param("id") ?? "");
  if (!catalogApp) return fail(c, "unknownApp", 404);
  const db = tenantDb(c.env, c.get("user").tenantId);
  await db.installApp(catalogApp.id);
  return c.json({ installedApps: await db.installedApps() });
});

app.delete("/apps/:id", requireRole("owner", "admin"), async (c) => {
  const db = tenantDb(c.env, c.get("user").tenantId);
  await db.uninstallApp(c.req.param("id") ?? "");
  return c.json({ installedApps: await db.installedApps() });
});

// ---------- Benutzer und Rollen ----------

app.get("/users", requireRole("owner", "admin"), async (c) => {
  const { results } = await c.env.PLATFORM_DB.prepare(
    "SELECT id, email, name, role, created_at AS createdAt FROM users WHERE tenant_id = ? ORDER BY created_at",
  )
    .bind(c.get("user").tenantId)
    .all();
  return c.json({ users: results });
});

app.post("/users", requireRole("owner", "admin"), async (c) => {
  const me = c.get("user");
  const body = await readBody(c);
  const name = text(body.name);
  const email = text(body.email).toLowerCase();
  const role = body.role as Role;
  const problem = passwordProblem(body.password);
  if (!name) return fail(c, "nameRequired", 400);
  if (!EMAIL_PATTERN.test(email)) return fail(c, "emailInvalid", 400);
  if (role !== "admin" && role !== "staff") return fail(c, "roleInvalid", 400);
  if (role === "admin" && me.role !== "owner") return fail(c, "ownerOnlyAdmins", 403);
  if (problem) return fail(c, problem, 400);
  const exists = await c.env.PLATFORM_DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) return fail(c, "emailTaken", 409);
  const id = crypto.randomUUID();
  await c.env.PLATFORM_DB.prepare(
    "INSERT INTO users (id, tenant_id, email, name, role, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, me.tenantId, email, name, role, await hashPassword(body.password as string))
    .run();
  return c.json({ user: { id, email, name, role } }, 201);
});

app.delete("/users/:id", requireRole("owner", "admin"), async (c) => {
  const me = c.get("user");
  const target = await c.env.PLATFORM_DB.prepare("SELECT id, role FROM users WHERE id = ? AND tenant_id = ?")
    .bind(c.req.param("id"), me.tenantId)
    .first<{ id: string; role: Role }>();
  if (!target) return fail(c, "userNotFound", 404);
  if (target.id === me.id) return fail(c, "cannotRemoveSelf", 400);
  if (target.role === "owner") return fail(c, "cannotRemoveOwner", 403);
  if (target.role === "admin" && me.role !== "owner") return fail(c, "ownerOnlyRemoveAdmins", 403);
  await c.env.PLATFORM_DB.prepare("DELETE FROM users WHERE id = ?").bind(target.id).run();
  return c.json({ ok: true });
});

// ---------- KI-Assistent ----------

app.post("/assistant", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const messages = parseConversation(body.messages);
  if (!messages) return fail(c, "messageInvalid", 400);
  const apiKey = c.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fail(c, "assistantNotConfigured", 503);

  const db = tenantDb(c.env, user.tenantId);
  if (!(await db.countAssistantQuestion(user.id, DAILY_QUESTION_LIMIT))) return fail(c, "assistantLimit", 429);

  const context = {
    companyName: user.tenantName,
    userName: user.name,
    role: user.role,
    installedApps: await db.installedApps(),
    lang: typeof body.lang === "string" ? body.lang : "de",
  };

  // Antwort als Zeilen mit je einem JSON-Ereignis, damit der Text sofort erscheint.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of askAssistant(new Anthropic({ apiKey }), context, messages)) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
});

app.notFound((c) => fail(c, "notFound", 404));

export default app;
