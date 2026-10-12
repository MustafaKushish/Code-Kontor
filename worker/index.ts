import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { hashPassword, hashToken, newSessionToken, passwordProblem, verifyPassword } from "./auth";
import { TenantDatabase } from "./tenant";
import { sanitizeCompany, validateCompany } from "../shared/company";
import { findApp } from "../shared/apps";

export { TenantDatabase };

export interface Env {
  PLATFORM_DB: D1Database;
  TENANT_DB: DurableObjectNamespace<TenantDatabase>;
  ASSETS: Fetcher;
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
  if (!companyName) return c.json({ error: "Bitte den Firmennamen angeben." }, 400);
  if (!name) return c.json({ error: "Bitte deinen Namen angeben." }, 400);
  if (!EMAIL_PATTERN.test(email)) return c.json({ error: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
  if (problem) return c.json({ error: problem }, 400);

  const exists = await c.env.PLATFORM_DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) return c.json({ error: "Diese E-Mail-Adresse ist schon registriert." }, 409);

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
    return c.json({ error: "E-Mail oder Passwort ist falsch." }, 401);
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
  if (!token) return c.json({ error: "Nicht angemeldet." }, 401);
  const user = await c.env.PLATFORM_DB.prepare(
    `SELECT u.id, u.tenant_id AS tenantId, t.name AS tenantName, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN tenants t ON t.id = u.tenant_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await hashToken(token), new Date().toISOString())
    .first<SessionUser>();
  if (!user) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ error: "Sitzung abgelaufen. Bitte neu anmelden." }, 401);
  }
  c.set("user", user);
  await next();
});

const requireRole = (...roles: Role[]) =>
  async (c: Ctx, next: () => Promise<void>) => {
    if (!roles.includes(c.get("user").role)) return c.json({ error: "Dafür fehlt dir die Berechtigung." }, 403);
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
  if (Object.keys(errors).length) return c.json({ error: "Bitte die markierten Felder prüfen.", errors }, 400);
  await tenantDb(c.env, user.tenantId).saveCompany(company);
  if (company.name !== user.tenantName)
    await c.env.PLATFORM_DB.prepare("UPDATE tenants SET name = ? WHERE id = ?").bind(company.name, user.tenantId).run();
  return c.json({ company });
});

// ---------- App-Katalog ----------

app.post("/apps/:id", requireRole("owner", "admin"), async (c) => {
  const catalogApp = findApp(c.req.param("id") ?? "");
  if (!catalogApp) return c.json({ error: "Dieses System gibt es nicht." }, 404);
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
  if (!name) return c.json({ error: "Bitte einen Namen angeben." }, 400);
  if (!EMAIL_PATTERN.test(email)) return c.json({ error: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
  if (role !== "admin" && role !== "staff") return c.json({ error: "Rolle muss Admin oder Mitarbeiter sein." }, 400);
  if (role === "admin" && me.role !== "owner") return c.json({ error: "Nur der Inhaber kann Admins anlegen." }, 403);
  if (problem) return c.json({ error: problem }, 400);
  const exists = await c.env.PLATFORM_DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) return c.json({ error: "Diese E-Mail-Adresse ist schon registriert." }, 409);
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
  if (!target) return c.json({ error: "Benutzer nicht gefunden." }, 404);
  if (target.id === me.id) return c.json({ error: "Du kannst dich nicht selbst entfernen." }, 400);
  if (target.role === "owner") return c.json({ error: "Der Inhaber kann nicht entfernt werden." }, 403);
  if (target.role === "admin" && me.role !== "owner") return c.json({ error: "Nur der Inhaber kann Admins entfernen." }, 403);
  await c.env.PLATFORM_DB.prepare("DELETE FROM users WHERE id = ?").bind(target.id).run();
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: "Nicht gefunden." }, 404));

export default app;
