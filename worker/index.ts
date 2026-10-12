import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { hashPassword, hashToken, newSessionToken, passwordProblem, verifyPassword, DUMMY_PASSWORD_HASH } from "./auth";
import { attemptKeys, clearFailures, isLocked, recordFailure } from "./throttle";
import { TenantDatabase } from "./tenant";
import { sanitizeCompany, validateCompany } from "../shared/company";
import { findApp } from "../shared/apps";
import { fail } from "./errors";
import { cityForPostalCode, suggestAddresses } from "./geo";
import { askAssistant, DAILY_QUESTION_LIMIT, parseConversation } from "./assistant";
import { mailEnabled, renderMail, sendMail, type MailKind } from "./mail";
import { decryptField, encryptField, isEncrypted } from "./crypto";
import { newRecoveryCodes, newTotpSecret, normalizeRecoveryCode, otpauthUrl, verifyTotp } from "./totp";
import type { CompanyProfile } from "../shared/company";

export { TenantDatabase };

export interface Env {
  PLATFORM_DB: D1Database;
  TENANT_DB: DurableObjectNamespace<TenantDatabase>;
  ASSETS: Fetcher;
  /** Schlüssel für den KI-Assistenten (Google Gemini), gesetzt mit `wrangler secret put GEMINI_API_KEY`. */
  GEMINI_API_KEY?: string;
  /** Optional anderes Gemini-Modell, z. B. "gemini-2.5-pro". */
  GEMINI_MODEL?: string;
  /** E-Mail-Versand über Resend. Ohne beide Werte werden keine E-Mails gesendet. */
  RESEND_API_KEY?: string;
  /** Absender, z. B. "Code Kontor <noreply@code-kontor.de>". */
  MAIL_FROM?: string;
  /** Schlüssel für zusätzlich verschlüsselte Felder (IBAN, Zwei-Faktor). Wird beim Veröffentlichen einmalig erzeugt. */
  DATA_KEY?: string;
}

type Role = "owner" | "admin" | "staff";
interface SessionUser {
  id: string;
  tenantId: string;
  tenantName: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  twoFactor: boolean;
}

type App = { Bindings: Env; Variables: { user: SessionUser; sessionHash: string } };
type Ctx = Context<App>;

const SESSION_COOKIE = "ck_session";
const SESSION_DAYS = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOUR = 3_600_000;
const TOKEN_HOURS = { verify: 72, reset: 1 } as const;
const INVITE_DAYS = 7;

const app = new Hono<App>().basePath("/api");
app.use(csrf());
app.use(secureHeaders({ crossOriginResourcePolicy: "same-origin" }));

function tenantDb(env: Env, tenantId: string) {
  return env.TENANT_DB.get(env.TENANT_DB.idFromName(tenantId));
}

async function startSession(c: Ctx, userId: string) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const now = new Date().toISOString();
  await c.env.PLATFORM_DB.batch([
    // Abgelaufene Sitzungen dieses Benutzers aufräumen
    c.env.PLATFORM_DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").bind(userId, now),
    c.env.PLATFORM_DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(await hashToken(token), userId, expires.toISOString(), now, now, (c.req.header("User-Agent") ?? "").slice(0, 300)),
  ]);
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
const langOf = (body: Record<string, unknown>) => (typeof body.lang === "string" && /^[a-z]{2}$/.test(body.lang) ? body.lang : "de");
const nowIso = () => new Date().toISOString();

/** Link zu einer Seite der App, auf derselben Adresse, über die die Anfrage kam. */
const appLink = (c: Ctx, path: string) => new URL(path, c.req.url).toString();

/** Einmal-Link anlegen (Bestätigung oder neues Passwort) und per E-Mail senden. */
async function sendUserLink(c: Ctx, kind: "verify" | "reset", user: { id: string; email: string; name: string }, lang: string) {
  const token = newSessionToken();
  const db = c.env.PLATFORM_DB;
  await db.batch([
    // Ältere Links derselben Art werden ungültig
    db.prepare("DELETE FROM user_tokens WHERE user_id = ? AND kind = ?").bind(user.id, kind),
    db.prepare("INSERT INTO user_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await hashToken(token), user.id, kind, new Date(Date.now() + TOKEN_HOURS[kind] * HOUR).toISOString()),
  ]);
  const path = kind === "verify" ? `/bestaetigen/${token}` : `/passwort-neu/${token}`;
  return mail(c, kind, user.email, lang, appLink(c, path), { name: user.name });
}

function mail(c: Ctx, kind: MailKind, to: string, lang: string, link: string, vars: Record<string, string>) {
  const content = renderMail(kind, lang, link, vars);
  // Antwort nicht auf den Versand warten lassen
  const sending = sendMail(c.env, to, content).catch((err) => (console.error("[mail]", err), false));
  c.executionCtx.waitUntil(sending);
  return sending;
}

/** Gültigen Einmal-Link einlösen: gibt die Benutzer-ID zurück und löscht den Link. */
async function useUserToken(c: Ctx, kind: "verify" | "reset", token: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = await hashToken(token);
  const row = await c.env.PLATFORM_DB.prepare("SELECT user_id FROM user_tokens WHERE token_hash = ? AND kind = ? AND expires_at > ?")
    .bind(hash, kind, nowIso())
    .first<{ user_id: string }>();
  if (!row) return null;
  await c.env.PLATFORM_DB.prepare("DELETE FROM user_tokens WHERE token_hash = ?").bind(hash).run();
  return row.user_id;
}

async function findInvite(c: Ctx, token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return c.env.PLATFORM_DB.prepare(
    `SELECT i.id, i.tenant_id AS tenantId, i.email, i.name, i.role, t.name AS companyName
       FROM invites i JOIN tenants t ON t.id = i.tenant_id
      WHERE i.token_hash = ? AND i.expires_at > ?`,
  )
    .bind(await hashToken(token), nowIso())
    .first<{ id: string; tenantId: string; email: string; name: string; role: "admin" | "staff"; companyName: string }>();
}

/** Protokoll-Eintrag in der Datenbank der Firma. Fehler beim Protokollieren stoppen die Aktion nicht. */
function audit(c: Ctx, tenantId: string, who: { id: string; name: string } | null, action: string, detail?: Record<string, unknown>) {
  const done = tenantDb(c.env, tenantId)
    .logEvent({ userId: who?.id ?? null, userName: who?.name ?? null, action, detail })
    .catch((err) => console.error("[audit]", err));
  c.executionCtx.waitUntil(done);
}

const SENSITIVE_COMPANY_FIELDS = ["iban", "bic"] as const;

/** Firmendaten lesen; IBAN und BIC werden entschlüsselt. Alte, noch offene Werte werden dabei verschlüsselt. */
async function loadCompany(env: Env, tenantId: string): Promise<CompanyProfile | null> {
  const db = tenantDb(env, tenantId);
  const stored = await db.getCompany();
  if (!stored) return null;
  const company = { ...stored };
  let needsUpgrade = false;
  for (const field of SENSITIVE_COMPANY_FIELDS) {
    const value = company[field];
    if (!value) continue;
    if (!isEncrypted(value) && env.DATA_KEY) needsUpgrade = true;
    company[field] = await decryptField(env.DATA_KEY, value);
  }
  if (needsUpgrade) await storeCompany(env, tenantId, company);
  return company;
}

async function storeCompany(env: Env, tenantId: string, company: CompanyProfile) {
  const stored = { ...company };
  for (const field of SENSITIVE_COMPANY_FIELDS) stored[field] = await encryptField(env.DATA_KEY, stored[field]);
  await tenantDb(env, tenantId).saveCompany(stored);
}

const LOGIN_CHALLENGE_MINUTES = 10;

/** Benutzer anmelden und Anmeldung protokollieren. */
async function completeLogin(c: Ctx, user: { id: string; name: string; tenantId: string }, method: string) {
  await startSession(c, user.id);
  audit(c, user.tenantId, user, "login", { method, device: (c.req.header("User-Agent") ?? "").slice(0, 160) });
}

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
  await storeCompany(c.env, tenantId, sanitizeCompany({ name: companyName, email }));
  audit(c, tenantId, { id: userId, name }, "accountCreated");

  c.executionCtx.waitUntil(sendUserLink(c, "verify", { id: userId, email, name }, langOf(body)));
  await startSession(c, userId);
  return c.json({ ok: true }, 201);
});

app.post("/auth/login", async (c) => {
  const body = await readBody(c);
  const email = text(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const keys = attemptKeys(email, c.req.header("CF-Connecting-IP"));
  if (await isLocked(c.env.PLATFORM_DB, keys)) return fail(c, "tooManyAttempts", 429);
  const user = await c.env.PLATFORM_DB.prepare("SELECT id, name, tenant_id AS tenantId, password_hash, totp_secret FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; name: string; tenantId: string; password_hash: string; totp_secret: string | null }>();
  // Auch ohne passenden Benutzer ein Passwort prüfen, damit die Antwortzeit nicht verrät, ob es die E-Mail gibt.
  const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid) {
    await recordFailure(c.env.PLATFORM_DB, keys);
    if (user) audit(c, user.tenantId, user, "loginFailed", { ip: c.req.header("CF-Connecting-IP") ?? null });
    return fail(c, "wrongCredentials", 401);
  }
  await clearFailures(c.env.PLATFORM_DB, email);
  if (user.totp_secret) {
    // Passwort stimmt, jetzt fehlt noch der Code aus der Authenticator-App
    const ticket = newSessionToken();
    await c.env.PLATFORM_DB.batch([
      c.env.PLATFORM_DB.prepare("DELETE FROM login_challenges WHERE user_id = ? OR expires_at <= ?").bind(user.id, nowIso()),
      c.env.PLATFORM_DB.prepare("INSERT INTO login_challenges (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .bind(await hashToken(ticket), user.id, new Date(Date.now() + LOGIN_CHALLENGE_MINUTES * 60_000).toISOString()),
    ]);
    return c.json({ twoFactor: true, ticket });
  }
  await completeLogin(c, user, "password");
  return c.json({ ok: true });
});

// Zweiter Schritt: Code aus der App oder ein Notfall-Code
app.post("/auth/login/2fa", async (c) => {
  const body = await readBody(c);
  const ticket = text(body.ticket);
  const code = text(body.code);
  if (!/^[0-9a-f]{64}$/.test(ticket)) return fail(c, "linkInvalid", 400);
  const hash = await hashToken(ticket);
  const row = await c.env.PLATFORM_DB.prepare(
    `SELECT u.id, u.name, u.tenant_id AS tenantId, u.totp_secret, u.recovery_codes, l.attempts
       FROM login_challenges l JOIN users u ON u.id = l.user_id
      WHERE l.token_hash = ? AND l.expires_at > ?`,
  )
    .bind(hash, nowIso())
    .first<{ id: string; name: string; tenantId: string; totp_secret: string | null; recovery_codes: string | null; attempts: number }>();
  if (!row || !row.totp_secret) return fail(c, "loginExpired", 400);
  if (row.attempts >= 5) {
    await c.env.PLATFORM_DB.prepare("DELETE FROM login_challenges WHERE token_hash = ?").bind(hash).run();
    return fail(c, "loginExpired", 400);
  }

  let method = "";
  if (await verifyTotp(await decryptField(c.env.DATA_KEY, row.totp_secret), code)) method = "2fa";
  else {
    const codes = JSON.parse(row.recovery_codes ?? "[]") as string[];
    const codeHash = await hashToken(normalizeRecoveryCode(code));
    if (codes.includes(codeHash)) {
      method = "recoveryCode";
      await c.env.PLATFORM_DB.prepare("UPDATE users SET recovery_codes = ? WHERE id = ?")
        .bind(JSON.stringify(codes.filter((h) => h !== codeHash)), row.id)
        .run();
    }
  }
  if (!method) {
    await c.env.PLATFORM_DB.prepare("UPDATE login_challenges SET attempts = attempts + 1 WHERE token_hash = ?").bind(hash).run();
    audit(c, row.tenantId, row, "loginFailed", { step: "2fa" });
    return fail(c, "codeWrong", 400);
  }
  await c.env.PLATFORM_DB.prepare("DELETE FROM login_challenges WHERE token_hash = ?").bind(hash).run();
  await completeLogin(c, row, method);
  return c.json({ ok: true });
});

app.post("/auth/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.PLATFORM_DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// E-Mail-Adresse bestätigen (Link aus der E-Mail, auch ohne Anmeldung)
app.post("/auth/verify", async (c) => {
  const userId = await useUserToken(c, "verify", text((await readBody(c)).token));
  if (!userId) return fail(c, "linkInvalid", 400);
  await c.env.PLATFORM_DB.prepare("UPDATE users SET email_verified_at = ? WHERE id = ? AND email_verified_at IS NULL").bind(nowIso(), userId).run();
  return c.json({ ok: true });
});

// Passwort vergessen: Antwort ist immer gleich, damit niemand prüfen kann, welche E-Mails es gibt.
app.post("/auth/forgot", async (c) => {
  const body = await readBody(c);
  const email = text(body.email).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return fail(c, "emailInvalid", 400);
  const keys = [{ key: `reset:${email}`, limit: 3 }];
  if (!(await isLocked(c.env.PLATFORM_DB, keys))) {
    await recordFailure(c.env.PLATFORM_DB, keys);
    const user = await c.env.PLATFORM_DB.prepare("SELECT id, email, name FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string; email: string; name: string }>();
    if (user) c.executionCtx.waitUntil(sendUserLink(c, "reset", user, langOf(body)));
  }
  return c.json({ ok: true });
});

// Neues Passwort über den Link aus der E-Mail. Alle bisherigen Sitzungen werden beendet.
app.post("/auth/reset", async (c) => {
  const body = await readBody(c);
  const problem = passwordProblem(body.password);
  if (problem) return fail(c, problem, 400);
  const userId = await useUserToken(c, "reset", text(body.token));
  if (!userId) return fail(c, "linkInvalid", 400);
  const user = await c.env.PLATFORM_DB.prepare("SELECT id, email, name, tenant_id AS tenantId FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; email: string; name: string; tenantId: string }>();
  await c.env.PLATFORM_DB.batch([
    // Wer den Link aus der E-Mail nutzt, hat die Adresse damit auch bestätigt
    c.env.PLATFORM_DB.prepare("UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?")
      .bind(await hashPassword(body.password as string), nowIso(), userId),
    c.env.PLATFORM_DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
  ]);
  if (user) {
    await clearFailures(c.env.PLATFORM_DB, user.email);
    audit(c, user.tenantId, user, "passwordReset");
  }
  await startSession(c, userId);
  return c.json({ ok: true });
});

// Einladung ansehen und annehmen
app.get("/auth/invite/:token", async (c) => {
  const invite = await findInvite(c, c.req.param("token"));
  if (!invite) return fail(c, "linkInvalid", 404);
  return c.json({ invite: { email: invite.email, name: invite.name, role: invite.role, companyName: invite.companyName } });
});

app.post("/auth/invite/:token", async (c) => {
  const body = await readBody(c);
  const invite = await findInvite(c, c.req.param("token"));
  if (!invite) return fail(c, "linkInvalid", 404);
  const name = text(body.name) || invite.name;
  const problem = passwordProblem(body.password);
  if (problem) return fail(c, problem, 400);
  const exists = await c.env.PLATFORM_DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(invite.email).first();
  if (exists) return fail(c, "emailTaken", 409);
  const userId = crypto.randomUUID();
  await c.env.PLATFORM_DB.batch([
    c.env.PLATFORM_DB.prepare(
      "INSERT INTO users (id, tenant_id, email, name, role, password_hash, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(userId, invite.tenantId, invite.email, name, invite.role, await hashPassword(body.password as string), nowIso()),
    c.env.PLATFORM_DB.prepare("DELETE FROM invites WHERE id = ?").bind(invite.id),
  ]);
  audit(c, invite.tenantId, { id: userId, name }, "inviteAccepted", { email: invite.email, role: invite.role });
  await startSession(c, userId);
  return c.json({ ok: true }, 201);
});

// ---------- Ab hier nur mit Anmeldung ----------

app.use("*", async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return fail(c, "notLoggedIn", 401);
  const user = await c.env.PLATFORM_DB.prepare(
    `SELECT u.id, u.tenant_id AS tenantId, t.name AS tenantName, u.email, u.name, u.role,
            u.email_verified_at IS NOT NULL AS emailVerified, u.totp_secret IS NOT NULL AS twoFactor, s.last_seen_at AS lastSeen
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN tenants t ON t.id = u.tenant_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await hashToken(token), new Date().toISOString())
    .first<SessionUser & { lastSeen: string | null }>();
  if (!user) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return fail(c, "sessionExpired", 401);
  }
  const { lastSeen, ...rest } = user;
  c.set("user", { ...rest, emailVerified: !!user.emailVerified, twoFactor: !!user.twoFactor });
  const sessionHash = await hashToken(token);
  c.set("sessionHash", sessionHash);
  // „Zuletzt aktiv“ für die Geräte-Übersicht, höchstens alle 10 Minuten schreiben
  if (!lastSeen || Date.now() - Date.parse(lastSeen) > 10 * 60_000)
    c.executionCtx.waitUntil(
      c.env.PLATFORM_DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").bind(nowIso(), sessionHash).run(),
    );
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
  const company = await loadCompany(c.env, user.tenantId);
  const setupComplete = !!company && Object.keys(validateCompany(company)).length === 0;
  return c.json({ user, setupComplete, installedApps: await db.installedApps(), mailEnabled: mailEnabled(c.env) });
});

// ---------- Eigenes Konto ----------

app.post("/account/password", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const problem = passwordProblem(body.newPassword);
  if (problem) return fail(c, problem, 400);
  const row = await c.env.PLATFORM_DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(typeof body.currentPassword === "string" ? body.currentPassword : "", row.password_hash)))
    return fail(c, "currentPasswordWrong", 400);
  await c.env.PLATFORM_DB.batch([
    c.env.PLATFORM_DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(body.newPassword as string), user.id),
    // Alle anderen Geräte abmelden, dieses bleibt angemeldet
    c.env.PLATFORM_DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, c.get("sessionHash")),
  ]);
  audit(c, user.tenantId, user, "passwordChanged");
  return c.json({ ok: true });
});

// Angemeldete Geräte
app.get("/account/sessions", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.PLATFORM_DB.prepare(
    `SELECT substr(token_hash, 1, 16) AS id, created_at AS createdAt, last_seen_at AS lastSeen, user_agent AS userAgent, token_hash = ? AS current
       FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC`,
  )
    .bind(c.get("sessionHash"), user.id, nowIso())
    .all<{ id: string; createdAt: string | null; lastSeen: string | null; userAgent: string | null; current: number }>();
  return c.json({ sessions: results.map((r) => ({ ...r, current: !!r.current })) });
});

app.delete("/account/sessions/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!/^[0-9a-f]{16}$/.test(id)) return fail(c, "notFound", 404);
  await c.env.PLATFORM_DB.prepare("DELETE FROM sessions WHERE user_id = ? AND substr(token_hash, 1, 16) = ? AND token_hash != ?")
    .bind(user.id, id, c.get("sessionHash"))
    .run();
  audit(c, user.tenantId, user, "deviceSignedOut");
  return c.json({ ok: true });
});

app.post("/account/sessions/sign-out-others", async (c) => {
  const user = c.get("user");
  await c.env.PLATFORM_DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, c.get("sessionHash")).run();
  audit(c, user.tenantId, user, "allDevicesSignedOut");
  return c.json({ ok: true });
});

// Zwei-Faktor-Anmeldung: Geheimnis erzeugen, mit erstem Code bestätigen, wieder ausschalten
app.post("/account/2fa/setup", async (c) => {
  const user = c.get("user");
  const secret = newTotpSecret();
  return c.json({ secret, url: otpauthUrl(secret, user.email) });
});

app.post("/account/2fa/enable", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const secret = text(body.secret).toUpperCase();
  if (!/^[A-Z2-7]{32}$/.test(secret) || !(await verifyTotp(secret, text(body.code)))) return fail(c, "codeWrong", 400);
  const recoveryCodes = newRecoveryCodes();
  const hashes = await Promise.all(recoveryCodes.map((code) => hashToken(normalizeRecoveryCode(code))));
  await c.env.PLATFORM_DB.batch([
    c.env.PLATFORM_DB.prepare("UPDATE users SET totp_secret = ?, recovery_codes = ? WHERE id = ?")
      .bind(await encryptField(c.env.DATA_KEY, secret), JSON.stringify(hashes), user.id),
    // Sicherheitshalber alle anderen Geräte abmelden
    c.env.PLATFORM_DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, c.get("sessionHash")),
  ]);
  audit(c, user.tenantId, user, "twoFactorOn");
  return c.json({ recoveryCodes });
});

app.post("/account/2fa/disable", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const row = await c.env.PLATFORM_DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(typeof body.password === "string" ? body.password : "", row.password_hash)))
    return fail(c, "currentPasswordWrong", 400);
  await c.env.PLATFORM_DB.prepare("UPDATE users SET totp_secret = NULL, recovery_codes = NULL WHERE id = ?").bind(user.id).run();
  audit(c, user.tenantId, user, "twoFactorOff");
  return c.json({ ok: true });
});

// Protokoll der Firma
app.get("/audit", requireRole("owner", "admin"), async (c) => {
  const entries = await tenantDb(c.env, c.get("user").tenantId).auditLog(Number(c.req.query("limit") ?? 100));
  return c.json({ entries });
});

// Datenexport (DSGVO): alles, was zu dieser Firma gespeichert ist
app.get("/account/export", requireRole("owner"), async (c) => {
  const user = c.get("user");
  const db = c.env.PLATFORM_DB;
  const [tenant, users, invites] = await Promise.all([
    db.prepare("SELECT id, name, created_at AS createdAt FROM tenants WHERE id = ?").bind(user.tenantId).first(),
    db.prepare("SELECT id, email, name, role, created_at AS createdAt, email_verified_at AS emailVerifiedAt, totp_secret IS NOT NULL AS twoFactor FROM users WHERE tenant_id = ?")
      .bind(user.tenantId).all(),
    db.prepare("SELECT email, name, role, created_at AS createdAt, expires_at AS expiresAt FROM invites WHERE tenant_id = ?").bind(user.tenantId).all(),
  ]);
  // Die Tabelle "settings" enthält die Firmendaten verschlüsselt; sie kommen unten entschlüsselt als "company" dazu.
  const { settings: _settings, ...data } = (await tenantDb(c.env, user.tenantId).exportAll()) as Record<string, unknown[]>;
  const company = await loadCompany(c.env, user.tenantId);
  audit(c, user.tenantId, user, "dataExported");
  const file = { exportedAt: nowIso(), tenant, company, users: users.results, invites: invites.results, data };
  return new Response(JSON.stringify(file, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="code-kontor-export-${nowIso().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});

// Firma mit allen Daten endgültig löschen (nur Inhaber, mit Passwort und Firmenname)
app.post("/account/delete-company", requireRole("owner"), async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const row = await c.env.PLATFORM_DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(typeof body.password === "string" ? body.password : "", row.password_hash)))
    return fail(c, "currentPasswordWrong", 400);
  if (text(body.companyName) !== user.tenantName) return fail(c, "companyNameMismatch", 400);
  await tenantDb(c.env, user.tenantId).destroy();
  const db = c.env.PLATFORM_DB;
  const users = "SELECT id FROM users WHERE tenant_id = ?";
  await db.batch([
    db.prepare(`DELETE FROM sessions WHERE user_id IN (${users})`).bind(user.tenantId),
    db.prepare(`DELETE FROM user_tokens WHERE user_id IN (${users})`).bind(user.tenantId),
    db.prepare(`DELETE FROM login_challenges WHERE user_id IN (${users})`).bind(user.tenantId),
    db.prepare("DELETE FROM invites WHERE tenant_id = ?").bind(user.tenantId),
    db.prepare("DELETE FROM users WHERE tenant_id = ?").bind(user.tenantId),
    db.prepare("DELETE FROM tenants WHERE id = ?").bind(user.tenantId),
  ]);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.post("/account/verify-email", async (c) => {
  const user = c.get("user");
  if (user.emailVerified) return c.json({ ok: true, sent: false });
  const keys = [{ key: `verify:${user.id}`, limit: 3 }];
  if (await isLocked(c.env.PLATFORM_DB, keys)) return fail(c, "tooManyAttempts", 429);
  await recordFailure(c.env.PLATFORM_DB, keys);
  const sent = await sendUserLink(c, "verify", user, langOf(await readBody(c)));
  return c.json({ ok: true, sent });
});

// ---------- Firmendaten ----------

app.get("/company", async (c) => {
  const company = await loadCompany(c.env, c.get("user").tenantId);
  return c.json({ company });
});

app.put("/company", requireRole("owner", "admin"), async (c) => {
  const user = c.get("user");
  const company = sanitizeCompany(await readBody(c));
  const errors = validateCompany(company);
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  const before = await loadCompany(c.env, user.tenantId);
  await storeCompany(c.env, user.tenantId, company);
  // Im Protokoll nur, welche Felder sich geändert haben, nicht die Werte
  const changed = (Object.keys(company) as (keyof CompanyProfile)[]).filter((k) => before?.[k] !== company[k]);
  if (changed.length) audit(c, user.tenantId, user, "companyChanged", { fields: changed });
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
  audit(c, c.get("user").tenantId, c.get("user"), "appInstalled", { app: catalogApp.id });
  return c.json({ installedApps: await db.installedApps() });
});

app.delete("/apps/:id", requireRole("owner", "admin"), async (c) => {
  const db = tenantDb(c.env, c.get("user").tenantId);
  await db.uninstallApp(c.req.param("id") ?? "");
  audit(c, c.get("user").tenantId, c.get("user"), "appUninstalled", { app: c.req.param("id") });
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

app.get("/invites", requireRole("owner", "admin"), async (c) => {
  const { results } = await c.env.PLATFORM_DB.prepare(
    "SELECT id, email, name, role, expires_at AS expiresAt FROM invites WHERE tenant_id = ? AND expires_at > ? ORDER BY created_at",
  )
    .bind(c.get("user").tenantId, nowIso())
    .all();
  return c.json({ invites: results });
});

app.post("/invites", requireRole("owner", "admin"), async (c) => {
  const me = c.get("user");
  const body = await readBody(c);
  const name = text(body.name);
  const email = text(body.email).toLowerCase();
  const role = body.role as Role;
  if (!name) return fail(c, "nameRequired", 400);
  if (!EMAIL_PATTERN.test(email)) return fail(c, "emailInvalid", 400);
  if (role !== "admin" && role !== "staff") return fail(c, "roleInvalid", 400);
  if (role === "admin" && me.role !== "owner") return fail(c, "ownerOnlyAdmins", 403);
  const exists = await c.env.PLATFORM_DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) return fail(c, "emailTaken", 409);

  const token = newSessionToken();
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + INVITE_DAYS * 24 * HOUR).toISOString();
  await c.env.PLATFORM_DB.batch([
    // Eine neue Einladung an dieselbe Adresse ersetzt die alte
    c.env.PLATFORM_DB.prepare("DELETE FROM invites WHERE tenant_id = ? AND email = ?").bind(me.tenantId, email),
    c.env.PLATFORM_DB.prepare(
      "INSERT INTO invites (id, token_hash, tenant_id, email, name, role, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, await hashToken(token), me.tenantId, email, name, role, me.id, expires),
  ]);
  const link = appLink(c, `/einladung/${token}`);
  const sent = await mail(c, "invite", email, langOf(body), link, { name, inviter: me.name, company: me.tenantName });
  audit(c, me.tenantId, me, "inviteCreated", { email, role });
  // Der Link wird nur dieses eine Mal angezeigt, damit man ihn notfalls selbst weitergeben kann.
  return c.json({ invite: { id, email, name, role, expiresAt: expires }, link, sent }, 201);
});

app.delete("/invites/:id", requireRole("owner", "admin"), async (c) => {
  const me = c.get("user");
  // Admins dürfen nur Einladungen für Mitarbeiter zurückziehen
  const roles = me.role === "owner" ? ["admin", "staff"] : ["staff"];
  await c.env.PLATFORM_DB.prepare(`DELETE FROM invites WHERE id = ? AND tenant_id = ? AND role IN (${roles.map(() => "?").join(", ")})`)
    .bind(c.req.param("id"), me.tenantId, ...roles)
    .run();
  audit(c, me.tenantId, me, "inviteWithdrawn");
  return c.json({ ok: true });
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
  audit(c, me.tenantId, me, "userRemoved", { userId: target.id });
  return c.json({ ok: true });
});

// ---------- Adressvorschläge ----------

app.get("/geo/address", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 3 || q.length > 120) return c.json({ suggestions: [] });
  try {
    const suggestions = await suggestAddresses(q, { lang: c.req.query("lang"), country: c.req.query("country") });
    return c.json({ suggestions });
  } catch (error) {
    console.error("geo/address", error);
    return c.json({ suggestions: [] });
  }
});

app.get("/geo/postal", async (c) => {
  try {
    const city = await cityForPostalCode(c.req.query("country") ?? "", c.req.query("code") ?? "");
    return c.json({ city }, 200, { "Cache-Control": "private, max-age=86400" });
  } catch (error) {
    console.error("geo/postal", error);
    return c.json({ city: null });
  }
});

// ---------- KI-Assistent ----------

app.post("/assistant", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const messages = parseConversation(body.messages);
  if (!messages) return fail(c, "messageInvalid", 400);
  const apiKey = c.env.GEMINI_API_KEY;
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
      for await (const event of askAssistant({ apiKey, model: c.env.GEMINI_MODEL }, context, messages)) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
});

app.notFound((c) => fail(c, "notFound", 404));

export default app;
