import { COUNTRY_TAX, defaultTaxSettings, sanitizeTaxSettings, type TaxSettings } from "../shared/countries";
import { Hono, type Context } from "hono";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { hashPassword, hashToken, newSessionToken, passwordProblem, verifyPassword, DUMMY_PASSWORD_HASH } from "./auth";
import { attemptKeys, clearFailures, clearKey, isLocked, recordFailure, registerKey, twoFactorKey } from "./throttle";
import { TenantDatabase, tenantStub } from "./tenant";
import { emptyCompanyProfile, sanitizeCompany, validateCompany } from "../shared/company";
import { defaultMethods } from "../shared/payments";
import { findApp } from "../shared/apps";
import { fail } from "./errors";
import { cityForPostalCode, suggestAddresses } from "./geo";
import { askAssistant, DAILY_QUESTION_LIMIT, parseConversation, type AssistantContext } from "./assistant";
import { mailEnabled, renderMail, renderReportMail, sendMail, type MailKind } from "./mail";
import {
  employedInMonth, isValidMonth, monthReportCsv, sanitizeAdvisor, sanitizeEmployee, sanitizeMonthEntry, SENSITIVE_EMPLOYEE_FIELDS,
  validateEmployee, type Employee,
} from "../shared/accounting";
import { decryptField, encryptField, isEncrypted } from "./crypto";
import { billingEnabled, cancelForDeletion, countUsers, createCheckout, createPortal, getSubscription, handleStripeEvent, syncSubscription, trialEnd } from "./billing";
import { verifyWebhook } from "./stripe";
import { daysLeft, hasAccess, quote } from "../shared/billing";
import {
  computeDays, computeYear, localDay, monthTotals, nextStampKind, sanitizeAbsence, sanitizeTimeSettings,
  type StampKind, type WorkProfile,
  sanitizeRequest,
} from "../shared/time";
import { newRecoveryCodes, newTotpSecret, normalizeRecoveryCode, otpauthUrl, verifyTotp } from "./totp";
import type { CompanyProfile } from "../shared/company";
import { sanitizePrivacy } from "../shared/privacy";
import { repairRoutes, repairStatusRoutes } from "./repairs/routes";
import { posRoutes } from "./pos/routes";
import { officeRoutes } from "./office/routes";
import { sanitizeRange } from "../shared/insights";
import { REPAIR_APP_ID } from "../shared/repairs";
import { OFFICE_APP_ID } from "../shared/office";

export { TenantDatabase };

export interface Env {
  PLATFORM_DB: D1Database;
  TENANT_DB: DurableObjectNamespace<TenantDatabase>;
  /** Nur für wrangler dev: „1“ schaltet die EU-Jurisdiktion ab, die lokal nicht unterstützt wird */
  LOCAL_NO_JURISDICTION?: string;
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
  /** Stripe für das Abo (sk_test_… oder sk_live_…). Ohne Schlüssel gibt es keine Bezahlung und keine Sperre. */
  STRIPE_SECRET_KEY?: string;
  /** Signatur-Geheimnis des Stripe-Webhooks (whsec_…). */
  STRIPE_WEBHOOK_SECRET?: string;
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
app.use(secureHeaders({ xFrameOptions: false, crossOriginOpenerPolicy: false, crossOriginResourcePolicy: false }));

function tenantDb(env: Env, tenantId: string) {
  return tenantStub(env, tenantId);
}

async function startSession(c: Ctx, userId: string): Promise<string> {
  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const now = new Date().toISOString();
  await c.env.PLATFORM_DB.batch([
    // Abgelaufene Sitzungen dieses Benutzers aufräumen
    c.env.PLATFORM_DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").bind(userId, now),
    c.env.PLATFORM_DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(await hashToken(token), userId, expires.toISOString(), now, now, (c.req.header("User-Agent") ?? "").slice(0, 300)),
  ]);
  const isHttps = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? "None" : "Lax",
    path: "/",
    expires,
  });
  return token;
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

const SENSITIVE_COMPANY_FIELDS = ["iban", "bic", "paymentAccount"] as const;

/** Firmendaten lesen; IBAN, BIC und Zahlungs-Empfänger werden entschlüsselt. Alte, noch offene Werte werden dabei verschlüsselt. */
async function loadCompany(env: Env, tenantId: string): Promise<CompanyProfile | null> {
  const db = tenantDb(env, tenantId);
  const stored = await db.getCompany();
  if (!stored) return null;
  // Ältere Firmen haben neue Felder (z. B. Zahlarten) noch nicht: mit leeren Werten ergänzen
  const company: CompanyProfile = { ...emptyCompanyProfile, ...stored };
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

/** Steuer-Einstellungen der Firma: eigene Werte oder die Vorgaben ihres Landes. */
async function loadTax(env: Env, tenantId: string, country?: string): Promise<{ country: string; custom: boolean } & TaxSettings> {
  const db = tenantDb(env, tenantId);
  const [own, company] = await Promise.all([db.getTaxSettings(), country ? null : db.getCompany()]);
  const land = country ?? company?.country ?? "DE";
  return { country: land, custom: !!own, ...(own ?? defaultTaxSettings(land)) };
}

const LOGIN_CHALLENGE_MINUTES = 10;

/** Benutzer anmelden und Anmeldung protokollieren. */
async function completeLogin(c: Ctx, user: { id: string; name: string; tenantId: string }, method: string): Promise<string> {
  const token = await startSession(c, user.id);
  audit(c, user.tenantId, user, "login", { method, device: (c.req.header("User-Agent") ?? "").slice(0, 160) });
  return token;
}

// ---------- Anmeldung ----------

const DEMO_EMAIL = "demo@code-kontor.de";
const DEMO_TENANT_ID = "demo-tenant-id";
const DEMO_USER_ID = "demo-user-id";

async function ensureDemoAccount(env: Env) {
  const existing = await env.PLATFORM_DB.prepare("SELECT id FROM users WHERE email = ?").bind(DEMO_EMAIL).first();
  const now = new Date().toISOString();
  if (!existing) {
    const pwHash = await hashPassword("Password123!");
    await env.PLATFORM_DB.batch([
      env.PLATFORM_DB.prepare("INSERT OR REPLACE INTO tenants (id, name, created_at) VALUES (?, ?, ?)")
        .bind(DEMO_TENANT_ID, "Handy & IT Service Berlin", now),
      env.PLATFORM_DB.prepare(
        "INSERT OR REPLACE INTO users (id, tenant_id, email, name, role, password_hash, email_verified_at, created_at) VALUES (?, ?, ?, ?, 'owner', ?, ?, ?)",
      ).bind(DEMO_USER_ID, DEMO_TENANT_ID, DEMO_EMAIL, "Mustafa Al-Zurgany", pwHash, now, now),
      env.PLATFORM_DB.prepare("INSERT OR REPLACE INTO subscriptions (tenant_id, status, trial_ends_at) VALUES (?, 'active', '2099-01-01T00:00:00.000Z')")
        .bind(DEMO_TENANT_ID),
    ]);
  }

  const db = tenantDb(env, DEMO_TENANT_ID);
  const comp = await loadCompany(env, DEMO_TENANT_ID);
  if (!comp || Object.keys(validateCompany(comp)).length > 0) {
    await storeCompany(env, DEMO_TENANT_ID, {
      name: "Handy & IT Service Berlin",
      legalForm: "GmbH",
      street: "Friedrichstraße 123",
      postalCode: "10117",
      city: "Berlin",
      country: "DE",
      email: DEMO_EMAIL,
      phone: "+49 30 98765432",
      taxNumber: "1234567890",
      vatId: "DE123456789",
      iban: "DE89370400440532013000",
      bic: "COBADEFFXXX",
      bankName: "Commerzbank Berlin",
      paymentMethods: "cash,card,bank",
      paymentAccount: "",
      logoDataUrl: "",
    });
  }
  const apps = await db.installedApps();
  if (!apps.includes("handy-it")) await db.installApp("handy-it");
  if (!apps.includes("kasse")) await db.installApp("kasse");
  if (!apps.includes("buero")) await db.installApp("buero");

  try {
    const listRes = (await db.repairs("list", ["all", "", 10])) as { ok: boolean; value?: { orders: unknown[] } };
    if (listRes.ok && (!listRes.value?.orders || listRes.value.orders.length === 0)) {
      await db.repairs("create", [
        { id: null, data: { name: "Anna Schmidt", phone: "+49 170 1234567", email: "anna.schmidt@beispiel.de" } },
        {
          device: { type: "phone", brand: "Apple", model: "iPhone 13", serial: "F2LX1234N70M", color: "Mitternacht" },
          problem: "Display gebrochen, Glas splittert ab, Touch reagiert nur sporadisch",
          accessories: "Hülle",
          pin: "1234",
          checks: { powersOn: true, touchWorks: false, screenIntact: false, cameraWorks: true, chargingWorks: true },
          costLimitCents: 15000,
          depositCents: 0,
        },
        "1234",
        { id: DEMO_USER_ID, name: "Mustafa Al-Zurgany" },
      ]);
      await db.repairs("create", [
        { id: null, data: { name: "Bernd Meyer", phone: "+49 171 9876543", email: "b.meyer@beispiel.de" } },
        {
          device: { type: "laptop", brand: "Lenovo", model: "ThinkPad T14", serial: "PF298XAA", color: "Schwarz" },
          problem: "Akku lädt nicht mehr und Gerät schaltet sich nach 5 Minuten aus",
          accessories: "Netzteil",
          pin: "",
          checks: { powersOn: true, touchWorks: null, screenIntact: true, cameraWorks: true, chargingWorks: false },
          costLimitCents: 12000,
          depositCents: 0,
        },
        null,
        { id: DEMO_USER_ID, name: "Mustafa Al-Zurgany" },
      ]);
    }

    // Büro-Dienstleister Beispieldaten
    const clientsRes = (await db.office("listClients", [""])) as { ok: boolean; value?: { id: string }[] };
    if (clientsRes.ok && (!clientsRes.value || clientsRes.value.length === 0)) {
      const c1 = (await db.office("saveClient", [{
        name: "KreativAgentur Berlin GmbH",
        contactPerson: "Sarah Wagner",
        email: "s.wagner@kreativberlin.de",
        phone: "+49 30 5551234",
        street: "Torstraße 178",
        postalCode: "10115",
        city: "Berlin",
        country: "DE",
        vatId: "DE987654321",
        paymentTermsDays: 14,
        hourlyRateCents: 11000,
        notes: "Key-Account für Web-Entwicklung und Consulting",
      }])) as { ok: boolean; value?: { id: string } };

      const c2 = (await db.office("saveClient", [{
        name: "Finanzberatung Richter & Partner",
        contactPerson: "Dr. Thomas Richter",
        email: "info@richter-partner.de",
        phone: "+49 30 8887766",
        street: "Kurfürstendamm 45",
        postalCode: "10707",
        city: "Berlin",
        country: "DE",
        vatId: "DE812345678",
        paymentTermsDays: 30,
        hourlyRateCents: 12500,
        notes: "Dauerhafter IT-Betreuungsvertrag",
      }])) as { ok: boolean; value?: { id: string } };

      if (c1.value?.id) {
        const p1 = (await db.office("saveProject", [{
          clientId: c1.value.id,
          name: "Website-Relaunch & E-Commerce Integration",
          status: "active",
          budgetCents: 650000,
          hourlyRateCents: 11000,
          startDate: new Date().toISOString().slice(0, 10),
          dueDate: new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10),
          description: "Neuer responsiver Webauftritt inklusive Shop-Schnittstelle und DSGVO-Compliance.",
        }])) as { ok: boolean; value?: { id: string } };

        if (p1.value?.id) {
          await db.office("saveTime", [
            {
              projectId: p1.value.id,
              day: new Date().toISOString().slice(0, 10),
              minutes: 180,
              hourlyRateCents: 11000,
              description: "Architektur-Konzept und Datenbank-Entwurf",
              billable: true,
            },
            { id: DEMO_USER_ID, name: "Mustafa Al-Zurgany" },
          ]);
          await db.office("saveTime", [
            {
              projectId: p1.value.id,
              day: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
              minutes: 240,
              hourlyRateCents: 11000,
              description: "Frontend-Prototyping & Komponentendesign",
              billable: true,
            },
            { id: DEMO_USER_ID, name: "Mustafa Al-Zurgany" },
          ]);

          await db.office("saveQuote", [{
            clientId: c1.value.id,
            projectId: p1.value.id,
            status: "accepted",
            title: "Website-Relaunch & Shop-Anbindung",
            items: [
              { id: "1", title: "Konzeption & UX/UI-Design", description: "Designsystem und Wireframes", qty: 15, unit: "Std", unitCents: 11000, vatRate: 19, totalCents: 165000 },
              { id: "2", title: "Frontend- & Backend-Entwicklung", description: "Umsetzung mit React & Node.js", qty: 35, unit: "Std", unitCents: 11000, vatRate: 19, totalCents: 385000 },
              { id: "3", title: "DSGVO-Audit & Go-Live", description: "Rechtssichere Konfiguration", qty: 5, unit: "Std", unitCents: 11000, vatRate: 19, totalCents: 55000 },
            ],
            notes: "Zahlbar 50% bei Projektstart, 50% nach Abnahme.",
          }]);

          await db.office("saveInvoice", [{
            clientId: c1.value.id,
            projectId: p1.value.id,
            status: "paid",
            title: "Abschlagsrechnung 1 - Konzeption & Meilenstein 1",
            items: [
              { id: "1", title: "Konzeption & UX/UI-Design", description: "Designsystem und Wireframes", qty: 15, unit: "Std", unitCents: 11000, vatRate: 19, totalCents: 165000 },
            ],
            dueDate: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10),
            buyerReference: "04011000-12345-67",
            notes: "Vielen Dank für Ihren Auftrag!",
          }]);
        }
      }

      if (c2.value?.id) {
        await db.office("saveProject", [{
          clientId: c2.value.id,
          name: "IT-Infrastruktur & Cloud-Betreuung 2026",
          status: "active",
          budgetCents: 1200000,
          hourlyRateCents: 12500,
          startDate: new Date().toISOString().slice(0, 10),
          dueDate: new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10),
          description: "Laufende Betreuung der Serversysteme und IT-Sicherheit.",
        }]);
      }
    }
  } catch (err) {
    console.error("[demo seed]", err);
  }
}

app.post("/auth/demo", async (c) => {
  await ensureDemoAccount(c.env);
  const user = await c.env.PLATFORM_DB.prepare("SELECT id, name, tenant_id AS tenantId FROM users WHERE email = ?")
    .bind(DEMO_EMAIL)
    .first<{ id: string; name: string; tenantId: string }>();
  if (!user) return fail(c, "wrongCredentials", 500);
  const token = await completeLogin(c, user, "demo");
  return c.json({ ok: true, token, email: DEMO_EMAIL });
});

app.post("/auth/register", async (c) => {
  const body = await readBody(c);
  const companyName = text(body.companyName);
  const name = text(body.name);
  const email = text(body.email).toLowerCase();
  const problem = passwordProblem(body.password);
  // Land aus dem Formular, sonst aus dem Standort der Verbindung
  const requested = text(body.country).toUpperCase();
  const located = (c.req.header("CF-IPCountry") ?? "").toUpperCase();
  const country = /^[A-Z]{2}$/.test(requested) ? requested : COUNTRY_TAX[located] ? located : "DE";
  if (!companyName) return fail(c, "companyNameRequired", 400);
  if (!name) return fail(c, "nameRequired", 400);
  if (!EMAIL_PATTERN.test(email)) return fail(c, "emailInvalid", 400);
  if (problem) return fail(c, problem, 400);
  const ip = c.req.header("CF-Connecting-IP");
  const ipKeys = ip ? [registerKey(ip)] : [];
  if (await isLocked(c.env.PLATFORM_DB, ipKeys)) return fail(c, "tooManyAttempts", 429);

  const exists = await c.env.PLATFORM_DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (exists) return fail(c, "emailTaken", 409);

  // Jede neue Firma zählt, nicht nur Fehlversuche
  if (ipKeys.length) await recordFailure(c.env.PLATFORM_DB, ipKeys);
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await c.env.PLATFORM_DB.batch([
    c.env.PLATFORM_DB.prepare("INSERT INTO tenants (id, name) VALUES (?, ?)").bind(tenantId, companyName),
    c.env.PLATFORM_DB.prepare(
      "INSERT INTO users (id, tenant_id, email, name, role, password_hash) VALUES (?, ?, ?, ?, 'owner', ?)",
    ).bind(userId, tenantId, email, name, await hashPassword(body.password as string)),
    c.env.PLATFORM_DB.prepare("INSERT INTO subscriptions (tenant_id, status, trial_ends_at) VALUES (?, 'trialing', ?)").bind(tenantId, trialEnd()),
  ]);

  // Eigene Datenbank des Kunden anlegen und mit dem Firmennamen vorbelegen
  const db = tenantDb(c.env, tenantId);
  await storeCompany(c.env, tenantId, sanitizeCompany({ name: companyName, email, country, paymentMethods: defaultMethods(country).join(",") }));
  audit(c, tenantId, { id: userId, name }, "accountCreated");

  c.executionCtx.waitUntil(sendUserLink(c, "verify", { id: userId, email, name }, langOf(body)));
  const token = await startSession(c, userId);
  return c.json({ ok: true, token }, 201);
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
  const token = await completeLogin(c, user, "password");
  return c.json({ ok: true, token });
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
  // Auch über neue Anmeldungen hinweg nur begrenzt viele Codes probieren
  const userKeys = [twoFactorKey(row.id)];
  if (await isLocked(c.env.PLATFORM_DB, userKeys)) return fail(c, "tooManyAttempts", 429);

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
    await recordFailure(c.env.PLATFORM_DB, userKeys);
    audit(c, row.tenantId, row, "loginFailed", { step: "2fa" });
    return fail(c, "codeWrong", 400);
  }
  await c.env.PLATFORM_DB.prepare("DELETE FROM login_challenges WHERE token_hash = ?").bind(hash).run();
  await clearKey(c.env.PLATFORM_DB, twoFactorKey(row.id).key);
  const token = await completeLogin(c, row, method);
  return c.json({ ok: true, token });
});

app.post("/auth/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const token = bearerToken || getCookie(c, SESSION_COOKIE);
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
  const user = await c.env.PLATFORM_DB.prepare("SELECT id, email, name, tenant_id AS tenantId, totp_secret IS NOT NULL AS twoFactor FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; email: string; name: string; tenantId: string; twoFactor: number }>();
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
  // Mit Zwei-Faktor reicht der E-Mail-Link allein nicht: anmelden mit neuem Passwort und Code
  if (user?.twoFactor) return c.json({ ok: true, login: true });
  const token = await startSession(c, userId);
  return c.json({ ok: true, token });
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
  c.executionCtx.waitUntil(tenantDb(c.env, invite.tenantId).installedApps().then((apps) => syncSubscription(c.env, invite.tenantId, apps)));
  const token = await startSession(c, userId);
  return c.json({ ok: true, token }, 201);
});

// ---------- Stripe meldet Zahlungen (ohne Anmeldung, mit Signatur) ----------

app.post("/billing/webhook", async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return fail(c, "notFound", 404);
  const payload = await c.req.text();
  if (!(await verifyWebhook(payload, c.req.header("Stripe-Signature"), secret))) return fail(c, "forbidden", 400);
  try {
    await handleStripeEvent(c.env, JSON.parse(payload));
  } catch (error) {
    console.error("stripe webhook", error);
    return c.json({ ok: false }, 500);
  }
  return c.json({ received: true });
});

// ---------- Stempel-Terminal (ohne Anmeldung, mit Geräteschlüssel) ----------

async function terminalFor(c: Ctx) {
  const token = c.req.param("token") ?? c.req.header("X-Terminal-Key") ?? "";
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return c.env.PLATFORM_DB.prepare(
    "SELECT t.id, t.tenant_id AS tenantId, t.name, n.name AS company FROM terminals t JOIN tenants n ON n.id = t.tenant_id WHERE t.token_hash = ?",
  )
    .bind(await hashToken(token))
    .first<{ id: string; tenantId: string; name: string; company: string }>();
}

app.get("/terminal/:token", async (c) => {
  const terminal = await terminalFor(c);
  if (!terminal) return fail(c, "terminalInvalid", 404);
  return c.json({ name: terminal.name, company: terminal.company });
});

/** Eigenes App-Manifest je Stempeluhr: Installiert öffnet sie direkt die Stempeluhr statt der Startseite. */
app.get("/terminal/:token/manifest", async (c) => {
  const terminal = await terminalFor(c);
  if (!terminal) return fail(c, "terminalInvalid", 404);
  const url = `/terminal/${c.req.param("token")}`;
  c.header("Content-Type", "application/manifest+json");
  c.header("Cache-Control", "no-store");
  return c.body(JSON.stringify({
    id: url, name: `Stempeluhr ${terminal.name}`, short_name: terminal.name, start_url: url, scope: url,
    display: "fullscreen", display_override: ["fullscreen", "standalone"], background_color: "#0a0b10", theme_color: "#0a0b10",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }));
});

// Eigene Stempelgeräte schicken den Schlüssel im Header X-Terminal-Key an /api/terminal/stamp
const terminalStamp = async (c: Ctx) => {
  const terminal = await terminalFor(c);
  if (!terminal) return fail(c, "terminalInvalid", 404);
  if (billingEnabled(c.env)) {
    const sub = await getSubscription(c.env, terminal.tenantId);
    if (!hasAccess(sub.status, sub.trialEndsAt)) return fail(c, "subscriptionRequired", 402);
  }
  const body = await readBody(c);
  const chip = text(body.chip).replace(/\s+/g, "").toUpperCase().slice(0, 64);
  const keys = [{ key: `terminal:${terminal.id}`, limit: 30 }];
  if (await isLocked(c.env.PLATFORM_DB, keys)) return fail(c, "tooManyAttempts", 429);
  const db = tenantDb(c.env, terminal.tenantId);
  const employee = chip ? (await db.listEmployees()).find((e) => e.chipId === chip && (!e.endDate || e.endDate >= localDay(nowIso()))) : undefined;
  c.executionCtx.waitUntil(c.env.PLATFORM_DB.prepare("UPDATE terminals SET last_seen_at = ? WHERE id = ?").bind(nowIso(), terminal.id).run());
  if (!employee) {
    await recordFailure(c.env.PLATFORM_DB, keys);
    return fail(c, "unknownChip", 404);
  }
  const result = await stamp(c.env, terminal.tenantId, employee.id, "terminal", null);
  return c.json({ name: `${employee.firstName} ${employee.lastName}`.trim(), ...result });
};
app.post("/terminal/stamp", terminalStamp);
app.post("/terminal/:token/stamp", terminalStamp);

/** Stempeln: nächste Richtung bestimmen, doppelte Stempel innerhalb einer Minute ignorieren. */
async function stamp(env: Env, tenantId: string, employeeId: string, source: "app" | "terminal", userId: string | null, wanted?: StampKind) {
  const db = tenantDb(env, tenantId);
  const last = await db.lastTimeEntry(employeeId);
  const now = new Date();
  if (last && now.getTime() - Date.parse(last.at) < 60_000) return { kind: last.kind, at: last.at, duplicate: true };
  const kind = wanted ?? nextStampKind(last, now);
  const at = now.toISOString();
  await db.addTimeEntry({ employeeId, kind, at, source, note: "" }, userId);
  return { kind, at, duplicate: false };
}

// Reparatur-Status für Endkunden (Handy- & IT-Service), ohne Anmeldung
app.route("/repair-status", repairStatusRoutes);

// ---------- Ab hier nur mit Anmeldung ----------

app.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const token = bearerToken || getCookie(c, SESSION_COOKIE);
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

// Nach Ende der Testphase ohne Abo: alles lesbar und exportierbar, aber keine Änderungen mehr (nur wenn Stripe eingerichtet ist).
const ALWAYS_ALLOWED = ["/api/billing/", "/api/auth/", "/api/account/"];
app.use("*", async (c, next) => {
  if (c.req.method === "GET" || !billingEnabled(c.env) || ALWAYS_ALLOWED.some((p) => c.req.path.startsWith(p))) return next();
  const sub = await getSubscription(c.env, c.get("user").tenantId);
  if (!hasAccess(sub.status, sub.trialEndsAt)) return fail(c, "subscriptionRequired", 402);
  await next();
});

/** Kurzfassung des Abos für die Kopfzeile (Hinweis auf Testphase oder Sperre). */
async function billingSummary(c: Ctx) {
  if (!billingEnabled(c.env)) return null;
  const sub = await getSubscription(c.env, c.get("user").tenantId);
  return { status: sub.status, daysLeft: daysLeft(sub.trialEndsAt), access: hasAccess(sub.status, sub.trialEndsAt) };
}

/** Abo an geänderte Systeme oder Benutzerzahl anpassen, im Hintergrund. */
function resyncBilling(c: Ctx) {
  const tenantId = c.get("user").tenantId;
  c.executionCtx.waitUntil(tenantDb(c.env, tenantId).installedApps().then((apps) => syncSubscription(c.env, tenantId, apps)));
}

app.get("/me", async (c) => {
  const user = c.get("user");
  const db = tenantDb(c.env, user.tenantId);
  const company = await loadCompany(c.env, user.tenantId);
  const setupComplete = !!company && Object.keys(validateCompany(company)).length === 0;
  const [installedApps, timeRequests, tax, privacy] = await Promise.all([
    db.installedApps(),
    user.role === "staff" ? 0 : db.pendingRequestCount(),
    loadTax(c.env, user.tenantId, company?.country ?? "DE"),
    db.getPrivacy(),
  ]);
  return c.json({ user, setupComplete, installedApps, mailEnabled: mailEnabled(c.env), billing: await billingSummary(c), timeRequests, tax, privacy });
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
  const id = c.req.param("id") ?? "";
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
  await c.env.PLATFORM_DB.batch([
    c.env.PLATFORM_DB.prepare("UPDATE users SET totp_secret = NULL, recovery_codes = NULL WHERE id = ?").bind(user.id),
    // Wie beim Einschalten: alle anderen Geräte abmelden
    c.env.PLATFORM_DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, c.get("sessionHash")),
  ]);
  audit(c, user.tenantId, user, "twoFactorOff");
  return c.json({ ok: true });
});

// Protokoll der Firma
app.get("/audit", requireRole("owner", "admin"), async (c) => {
  const entries = await tenantDb(c.env, c.get("user").tenantId).auditLog(Number(c.req.query("limit")) || 100);
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
  await cancelForDeletion(c.env, user.tenantId);
  await tenantDb(c.env, user.tenantId).destroy();
  const db = c.env.PLATFORM_DB;
  const users = "SELECT id FROM users WHERE tenant_id = ?";
  await db.batch([
    db.prepare(`DELETE FROM sessions WHERE user_id IN (${users})`).bind(user.tenantId),
    db.prepare(`DELETE FROM user_tokens WHERE user_id IN (${users})`).bind(user.tenantId),
    db.prepare(`DELETE FROM login_challenges WHERE user_id IN (${users})`).bind(user.tenantId),
    db.prepare("DELETE FROM invites WHERE tenant_id = ?").bind(user.tenantId),
    db.prepare("DELETE FROM subscriptions WHERE tenant_id = ?").bind(user.tenantId),
    db.prepare("DELETE FROM terminals WHERE tenant_id = ?").bind(user.tenantId),
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
  // Neues Land: Währung und Steuersätze wieder aus dessen Vorgaben
  if (before && before.country !== company.country) await tenantDb(c.env, user.tenantId).saveTaxSettings(null);
  if (company.name !== user.tenantName)
    await c.env.PLATFORM_DB.prepare("UPDATE tenants SET name = ? WHERE id = ?").bind(company.name, user.tenantId).run();
  return c.json({ company });
});

// ---------- Steuern und Währung ----------

app.get("/tax", async (c) => {
  const tax = await loadTax(c.env, c.get("user").tenantId);
  return c.json({ tax, defaults: defaultTaxSettings(tax.country) });
});

app.put("/tax", requireRole("owner", "admin"), async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const company = await tenantDb(c.env, user.tenantId).getCompany();
  const country = company?.country ?? "DE";
  const settings = body.reset === true ? null : sanitizeTaxSettings(body, country);
  await tenantDb(c.env, user.tenantId).saveTaxSettings(settings);
  audit(c, user.tenantId, user, "taxChanged", settings ? { currency: settings.currency, vatRates: settings.vatRates } : { reset: true });
  const tax = await loadTax(c.env, user.tenantId, country);
  return c.json({ tax, defaults: defaultTaxSettings(country) });
});

// ---------- Daten an fremde Dienste ----------

app.get("/privacy", async (c) => {
  return c.json({ privacy: await tenantDb(c.env, c.get("user").tenantId).getPrivacy() });
});

app.put("/privacy", requireRole("owner", "admin"), async (c) => {
  const user = c.get("user");
  const privacy = sanitizePrivacy(await readBody(c));
  await tenantDb(c.env, user.tenantId).savePrivacy(privacy);
  audit(c, user.tenantId, user, "privacyChanged", { ...privacy });
  return c.json({ privacy });
});

// ---------- App-Katalog ----------

app.post("/apps/:id", requireRole("owner", "admin"), async (c) => {
  const catalogApp = findApp(c.req.param("id") ?? "");
  if (!catalogApp) return fail(c, "unknownApp", 404);
  const db = tenantDb(c.env, c.get("user").tenantId);
  await db.installApp(catalogApp.id);
  audit(c, c.get("user").tenantId, c.get("user"), "appInstalled", { app: catalogApp.id });
  resyncBilling(c);
  return c.json({ installedApps: await db.installedApps() });
});

app.delete("/apps/:id", requireRole("owner", "admin"), async (c) => {
  const db = tenantDb(c.env, c.get("user").tenantId);
  await db.uninstallApp(c.req.param("id") ?? "");
  audit(c, c.get("user").tenantId, c.get("user"), "appUninstalled", { app: c.req.param("id") });
  resyncBilling(c);
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
  resyncBilling(c);
  return c.json({ ok: true });
});

// ---------- Buchhaltung (nur Inhaber und Admins) ----------

async function loadEmployees(env: Env, tenantId: string): Promise<Employee[]> {
  const list = await tenantDb(env, tenantId).listEmployees();
  for (const e of list) for (const f of SENSITIVE_EMPLOYEE_FIELDS) e[f] = await decryptField(env.DATA_KEY, e[f]);
  return list;
}

async function encryptEmployee(env: Env, data: Omit<Employee, "id" | "personnelNumber">) {
  const out = { ...data };
  for (const f of SENSITIVE_EMPLOYEE_FIELDS) out[f] = await encryptField(env.DATA_KEY, out[f]);
  return out;
}

const accounting = requireRole("owner", "admin");

app.get("/accounting/employees", accounting, async (c) => {
  return c.json({ employees: await loadEmployees(c.env, c.get("user").tenantId) });
});

/** Chip und Benutzerkonto dürfen nur einer Person gehören. */
async function linkErrors(c: Ctx, data: Pick<Employee, "chipId" | "userId">, selfId: string | null) {
  const errors: Record<string, string> = {};
  const others = (await tenantDb(c.env, c.get("user").tenantId).listEmployees()).filter((e) => e.id !== selfId);
  if (data.chipId && others.some((e) => e.chipId === data.chipId)) errors.chipId = "chipTaken";
  if (data.userId) {
    if (others.some((e) => e.userId === data.userId)) errors.userId = "userTaken";
    const exists = await c.env.PLATFORM_DB.prepare("SELECT 1 FROM users WHERE id = ? AND tenant_id = ?").bind(data.userId, c.get("user").tenantId).first();
    if (!exists) errors.userId = "userUnknown";
  }
  return errors;
}

app.post("/accounting/employees", accounting, async (c) => {
  const user = c.get("user");
  const data = sanitizeEmployee(await readBody(c));
  const errors = { ...validateEmployee(data), ...(await linkErrors(c, data, null)) };
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  const id = await tenantDb(c.env, user.tenantId).saveEmployee(null, await encryptEmployee(c.env, data));
  audit(c, user.tenantId, user, "employeeAdded", { name: `${data.firstName} ${data.lastName}` });
  return c.json({ id }, 201);
});

app.put("/accounting/employees/:id", accounting, async (c) => {
  const user = c.get("user");
  const data = sanitizeEmployee(await readBody(c));
  const errors = { ...validateEmployee(data), ...(await linkErrors(c, data, c.req.param("id") ?? "")) };
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });
  try {
    await tenantDb(c.env, user.tenantId).saveEmployee(c.req.param("id") ?? "", await encryptEmployee(c.env, data));
  } catch {
    return fail(c, "notFound", 404);
  }
  audit(c, user.tenantId, user, "employeeChanged", { name: `${data.firstName} ${data.lastName}` });
  return c.json({ ok: true });
});

app.delete("/accounting/employees/:id", accounting, async (c) => {
  const user = c.get("user");
  await tenantDb(c.env, user.tenantId).deleteEmployee(c.req.param("id") ?? "");
  audit(c, user.tenantId, user, "employeeRemoved");
  return c.json({ ok: true });
});

app.get("/accounting/advisor", accounting, async (c) => {
  return c.json({ advisor: await tenantDb(c.env, c.get("user").tenantId).getAdvisor() });
});

app.put("/accounting/advisor", accounting, async (c) => {
  const user = c.get("user");
  const advisor = sanitizeAdvisor(await readBody(c));
  if (advisor.email && !EMAIL_PATTERN.test(advisor.email)) return fail(c, "checkFields", 400, { errors: { email: "emailInvalid" } });
  await tenantDb(c.env, user.tenantId).saveAdvisor(advisor);
  audit(c, user.tenantId, user, "advisorChanged");
  return c.json({ advisor });
});

app.get("/accounting/month/:month", accounting, async (c) => {
  const month = c.req.param("month") ?? "";
  if (!isValidMonth(month)) return fail(c, "notFound", 404);
  return c.json({ entries: await tenantDb(c.env, c.get("user").tenantId).monthEntries(month) });
});

app.put("/accounting/month/:month", accounting, async (c) => {
  const user = c.get("user");
  const month = c.req.param("month") ?? "";
  if (!isValidMonth(month)) return fail(c, "notFound", 404);
  const body = await readBody(c);
  const ids = new Set((await tenantDb(c.env, user.tenantId).listEmployees()).map((e) => e.id));
  const entries = (Array.isArray(body.entries) ? body.entries : [])
    .slice(0, 500)
    .map((e) => sanitizeMonthEntry((e ?? {}) as Record<string, unknown>, month))
    .filter((e) => ids.has(e.employeeId));
  await tenantDb(c.env, user.tenantId).saveMonthEntries(month, entries);
  audit(c, user.tenantId, user, "monthSaved", { month });
  return c.json({ ok: true });
});

async function buildMonthReport(c: Ctx, month: string) {
  const user = c.get("user");
  const db = tenantDb(c.env, user.tenantId);
  const [employees, entries, advisor] = await Promise.all([loadEmployees(c.env, user.tenantId), db.monthEntries(month), db.getAdvisor()]);
  const csv = monthReportCsv({ company: user.tenantName, month, advisor, employees: employees.filter((e) => employedInMonth(e, month)), entries });
  return { csv, advisor, filename: `Monatsmeldung-${month}.csv` };
}

app.get("/accounting/month/:month/export", accounting, async (c) => {
  const month = c.req.param("month") ?? "";
  if (!isValidMonth(month)) return fail(c, "notFound", 404);
  const { csv, filename } = await buildMonthReport(c, month);
  audit(c, c.get("user").tenantId, c.get("user"), "monthExported", { month });
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
});

app.post("/accounting/month/:month/send", accounting, async (c) => {
  const user = c.get("user");
  const month = c.req.param("month") ?? "";
  if (!isValidMonth(month)) return fail(c, "notFound", 404);
  if (!mailEnabled(c.env)) return fail(c, "mailNotConfigured", 400);
  const { csv, advisor, filename } = await buildMonthReport(c, month);
  if (!advisor?.email) return fail(c, "advisorEmailMissing", 400);
  const bytes = new TextEncoder().encode(csv);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const content = renderReportMail(langOf(await readBody(c)), { company: user.tenantName, month, sender: user.name, replyTo: user.email });
  const sent = await sendMail(c.env, advisor.email, content, fetch, { attachments: [{ filename, content: btoa(binary) }], replyTo: user.email });
  if (!sent) return fail(c, "mailFailed", 502);
  audit(c, user.tenantId, user, "monthSent", { month, email: advisor.email });
  return c.json({ ok: true, to: advisor.email });
});

// ---------- Abo ----------

app.get("/billing", requireRole("owner", "admin"), async (c) => {
  const user = c.get("user");
  const sub = await getSubscription(c.env, user.tenantId);
  const [apps, users] = await Promise.all([tenantDb(c.env, user.tenantId).installedApps(), countUsers(c.env, user.tenantId)]);
  return c.json({
    enabled: billingEnabled(c.env),
    status: sub.status,
    trialEndsAt: sub.trialEndsAt,
    daysLeft: daysLeft(sub.trialEndsAt),
    access: hasAccess(sub.status, sub.trialEndsAt),
    interval: sub.interval,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    hasCustomer: !!sub.customerId,
    users,
    quotes: { month: quote(apps, users, "month"), year: quote(apps, users, "year") },
  });
});

app.post("/billing/checkout", requireRole("owner"), async (c) => {
  const user = c.get("user");
  if (!billingEnabled(c.env)) return fail(c, "billingNotConfigured", 400);
  const body = await readBody(c);
  const apps = await tenantDb(c.env, user.tenantId).installedApps();
  if (apps.length === 0) return fail(c, "noSystems", 400);
  try {
    const url = await createCheckout(c.env, {
      tenantId: user.tenantId, tenantName: user.tenantName, email: user.email, installedApps: apps,
      interval: body.interval === "year" ? "year" : "month", origin: new URL(c.req.url).origin,
    });
    return c.json({ url });
  } catch (error) {
    console.error("billing checkout", error);
    return fail(c, "paymentFailed", 502);
  }
});

app.post("/billing/portal", requireRole("owner"), async (c) => {
  const user = c.get("user");
  if (!billingEnabled(c.env)) return fail(c, "billingNotConfigured", 400);
  const sub = await getSubscription(c.env, user.tenantId);
  if (!sub.customerId) return fail(c, "notFound", 404);
  try {
    return c.json({ url: await createPortal(c.env, sub.customerId, new URL(c.req.url).origin) });
  } catch (error) {
    console.error("billing portal", error);
    return fail(c, "paymentFailed", 502);
  }
});

// ---------- Zeitwirtschaft ----------

const profileOf = (e: Employee): WorkProfile => ({
  id: e.id, startDate: e.startDate, endDate: e.endDate, weeklyHours: e.weeklyHours, workDays: e.workDays,
  vacationDays: e.vacationDays, openingBalance: e.openingBalance, vacationCarryover: e.vacationCarryover,
});
const publicEmployee = (e: Employee) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim(), personnelNumber: e.personnelNumber, chip: !!e.chipId, linked: !!e.userId });
/** UTC-Grenzen mit Puffer, damit Stempel kurz vor/nach Mitternacht (Zeitzone) mitkommen. */
const utcRange = (from: string, to: string) => ({ from: `${shiftDay(from, -1)}T00:00:00Z`, to: `${shiftDay(to, 2)}T00:00:00Z` });
function shiftDay(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const yearOf = (c: Ctx) => {
  const y = Number(c.req.query("year"));
  return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : new Date().getUTCFullYear();
};

async function yearData(env: Env, tenantId: string, employeeId: string | null, year: number) {
  const db = tenantDb(env, tenantId);
  const r = utcRange(`${year}-01-01`, `${year}-12-31`);
  const [entries, absences, settings] = await Promise.all([
    db.timeEntries(employeeId, r.from, r.to),
    db.absences(employeeId, `${year}-01-01`, `${year}-12-31`),
    db.getTimeSettings(),
  ]);
  return { entries, absences, settings };
}

/** Eigene Zeiten: Stempelstatus, heute, Jahreskonto. Für alle Rollen, sofern das Konto mit einer Person verknüpft ist. */
async function myTime(c: Ctx) {
  const user = c.get("user");
  const employee = (await tenantDb(c.env, user.tenantId).listEmployees()).find((e) => e.userId === user.id);
  if (!employee) return { employee: null };
  const year = new Date().getUTCFullYear();
  const { entries, absences, settings } = await yearData(c.env, user.tenantId, employee.id, year);
  const today = localDay(nowIso());
  const last = entries.at(-1) ?? null;
  return {
    employee: publicEmployee(employee),
    next: nextStampKind(last),
    lastAt: last?.at ?? null,
    today: computeDays(profileOf(employee), entries, absences, { from: today, to: today }, settings)[0],
    account: computeYear(profileOf(employee), entries, absences, year, settings),
    upcomingAbsences: absences.filter((a) => a.to >= today).slice(0, 5),
    requests: await tenantDb(c.env, user.tenantId).requests(employee.id, 20),
  };
}

app.get("/time/me", async (c) => c.json(await myTime(c)));

app.post("/time/me/stamp", async (c) => {
  const user = c.get("user");
  const employee = (await tenantDb(c.env, user.tenantId).listEmployees()).find((e) => e.userId === user.id);
  if (!employee) return fail(c, "notLinked", 400);
  const body = await readBody(c);
  const wanted = body.kind === "in" || body.kind === "out" ? (body.kind as StampKind) : undefined;
  await stamp(c.env, user.tenantId, employee.id, "app", user.id, wanted);
  return c.json(await myTime(c));
});

// Nachträge und Urlaub beantragen: Die Person selbst stellt den Antrag, Inhaber oder Admin entscheidet.
app.post("/time/me/requests", async (c) => {
  const user = c.get("user");
  const db = tenantDb(c.env, user.tenantId);
  const employee = (await db.listEmployees()).find((e) => e.userId === user.id);
  if (!employee) return fail(c, "notLinked", 400);
  const request = sanitizeRequest(await readBody(c));
  if (!request) return fail(c, "checkFields", 400);
  if ((await db.requests(employee.id, 200)).filter((r) => r.status === "pending").length >= 30) return fail(c, "tooManyRequests", 429);
  const id = await db.addRequest(employee.id, request.data, request.note, user.id);
  audit(c, user.tenantId, user, "requestCreated", { type: request.data.type });
  return c.json({ id }, 201);
});

app.delete("/time/me/requests/:id", async (c) => {
  const user = c.get("user");
  const db = tenantDb(c.env, user.tenantId);
  const employee = (await db.listEmployees()).find((e) => e.userId === user.id);
  if (!employee || !(await db.withdrawRequest(c.req.param("id") ?? "", employee.id))) return fail(c, "notFound", 404);
  return c.json({ ok: true });
});

const timeManager = requireRole("owner", "admin");

app.get("/time/requests", timeManager, async (c) => {
  const db = tenantDb(c.env, c.get("user").tenantId);
  const [requests, employees] = await Promise.all([db.requests(null, 100), db.listEmployees()]);
  const names = new Map(employees.map((e) => [e.id, publicEmployee(e).name]));
  return c.json({ requests: requests.map((r) => ({ ...r, name: names.get(r.employeeId) ?? "?" })) });
});

app.post("/time/requests/:id/decide", timeManager, async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const approve = body.approve === true;
  const request = await tenantDb(c.env, user.tenantId).decideRequest(c.req.param("id") ?? "", approve, text(body.reply).slice(0, 300), user.id, user.name);
  if (!request) return fail(c, "notFound", 404);
  audit(c, user.tenantId, user, approve ? "requestApproved" : "requestRejected", { type: request.data.type });
  return c.json({ request });
});

app.get("/time/overview", timeManager, async (c) => {
  const user = c.get("user");
  const year = yearOf(c);
  const employees = await tenantDb(c.env, user.tenantId).listEmployees();
  const { entries, absences, settings } = await yearData(c.env, user.tenantId, null, year);
  const today = localDay(nowIso());
  const rows = employees
    .filter((e) => e.startDate && e.startDate <= `${year}-12-31` && (!e.endDate || e.endDate >= `${year}-01-01`))
    .map((e) => {
      const own = entries.filter((t) => t.employeeId === e.id);
      const ownAbs = absences.filter((a) => a.employeeId === e.id);
      const last = own.at(-1) ?? null;
      const present = nextStampKind(last) === "out";
      const absentToday = ownAbs.find((a) => a.from <= today && a.to >= today)?.type ?? null;
      return { ...publicEmployee(e), present, since: present ? last!.at : null, absentToday, account: computeYear(profileOf(e), own, ownAbs, year, settings) };
    });
  return c.json({ year, settings, employees: rows });
});

app.get("/time/days/:employeeId/:month", timeManager, async (c) => {
  const user = c.get("user");
  const month = c.req.param("month") ?? "";
  if (!isValidMonth(month)) return fail(c, "notFound", 404);
  const employee = (await tenantDb(c.env, user.tenantId).listEmployees()).find((e) => e.id === c.req.param("employeeId"));
  if (!employee) return fail(c, "notFound", 404);
  const db = tenantDb(c.env, user.tenantId);
  const from = `${month}-01`;
  const to = shiftDay(`${shiftMonth(month)}-01`, -1);
  const r = utcRange(from, to);
  const [entries, absences, settings] = await Promise.all([db.timeEntries(employee.id, r.from, r.to), db.absences(employee.id, from, to), db.getTimeSettings()]);
  const days = computeDays(profileOf(employee), entries, absences, { from, to }, settings);
  return c.json({
    employee: publicEmployee(employee),
    days,
    totals: monthTotals(days),
    entries: entries.filter((e) => { const d = localDay(e.at); return d >= from && d <= to; }),
    absences,
  });
});
function shiftMonth(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

const isIsoTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v);

app.post("/time/entries", timeManager, async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const employees = await tenantDb(c.env, user.tenantId).listEmployees();
  const employee = employees.find((e) => e.id === body.employeeId);
  if (!employee || (body.kind !== "in" && body.kind !== "out") || !isIsoTime(body.at)) return fail(c, "checkFields", 400);
  const at = new Date(body.at).toISOString();
  const id = await tenantDb(c.env, user.tenantId).addTimeEntry({ employeeId: employee.id, kind: body.kind, at, source: "manual", note: text(body.note).slice(0, 300) }, user.id);
  audit(c, user.tenantId, user, "timeCorrected", { name: publicEmployee(employee).name, at, kind: body.kind });
  return c.json({ id }, 201);
});

app.put("/time/entries/:id", timeManager, async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  if ((body.kind !== "in" && body.kind !== "out") || !isIsoTime(body.at)) return fail(c, "checkFields", 400);
  const at = new Date(body.at).toISOString();
  const entry = await tenantDb(c.env, user.tenantId).updateTimeEntry(c.req.param("id") ?? "", { kind: body.kind, at, note: text(body.note).slice(0, 300) });
  if (!entry) return fail(c, "notFound", 404);
  audit(c, user.tenantId, user, "timeCorrected", { at, kind: body.kind });
  return c.json({ entry });
});

app.delete("/time/entries/:id", timeManager, async (c) => {
  const user = c.get("user");
  const employeeId = await tenantDb(c.env, user.tenantId).deleteTimeEntry(c.req.param("id") ?? "");
  if (!employeeId) return fail(c, "notFound", 404);
  audit(c, user.tenantId, user, "timeDeleted");
  return c.json({ ok: true });
});

app.get("/time/absences", timeManager, async (c) => {
  const year = yearOf(c);
  const absences = await tenantDb(c.env, c.get("user").tenantId).absences(null, `${year}-01-01`, `${year}-12-31`);
  return c.json({ absences });
});

app.post("/time/absences", timeManager, async (c) => {
  const user = c.get("user");
  const absence = sanitizeAbsence(await readBody(c));
  const employee = absence && (await tenantDb(c.env, user.tenantId).listEmployees()).find((e) => e.id === absence.employeeId);
  if (!absence || !employee) return fail(c, "checkFields", 400);
  const id = await tenantDb(c.env, user.tenantId).addAbsence(absence);
  audit(c, user.tenantId, user, "absenceAdded", { name: publicEmployee(employee).name, type: absence.type, from: absence.from, to: absence.to });
  return c.json({ id }, 201);
});

app.delete("/time/absences/:id", timeManager, async (c) => {
  const user = c.get("user");
  await tenantDb(c.env, user.tenantId).deleteAbsence(c.req.param("id") ?? "");
  audit(c, user.tenantId, user, "absenceRemoved");
  return c.json({ ok: true });
});

app.put("/time/settings", timeManager, async (c) => {
  const user = c.get("user");
  const settings = sanitizeTimeSettings(await readBody(c));
  await tenantDb(c.env, user.tenantId).saveTimeSettings(settings);
  return c.json({ settings });
});

app.get("/time/terminals", timeManager, async (c) => {
  const { results } = await c.env.PLATFORM_DB.prepare(
    "SELECT id, name, created_at AS createdAt, last_seen_at AS lastSeenAt FROM terminals WHERE tenant_id = ? ORDER BY created_at",
  )
    .bind(c.get("user").tenantId)
    .all();
  return c.json({ terminals: results });
});

app.post("/time/terminals", timeManager, async (c) => {
  const user = c.get("user");
  const name = text((await readBody(c)).name).slice(0, 80) || "Terminal";
  const token = newSessionToken();
  await c.env.PLATFORM_DB.prepare("INSERT INTO terminals (id, tenant_id, token_hash, name) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), user.tenantId, await hashToken(token), name)
    .run();
  audit(c, user.tenantId, user, "terminalAdded", { name });
  // Der Schlüssel wird nur jetzt einmal angezeigt
  return c.json({ token, link: appLink(c, `/terminal/${token}`) }, 201);
});

app.delete("/time/terminals/:id", timeManager, async (c) => {
  const user = c.get("user");
  await c.env.PLATFORM_DB.prepare("DELETE FROM terminals WHERE id = ? AND tenant_id = ?").bind(c.req.param("id") ?? "", user.tenantId).run();
  audit(c, user.tenantId, user, "terminalRemoved");
  return c.json({ ok: true });
});

/** Monatsmeldung aus der Zeiterfassung vorschlagen. */
app.get("/accounting/month/:month/from-time", accounting, async (c) => {
  const user = c.get("user");
  const month = c.req.param("month") ?? "";
  if (!isValidMonth(month)) return fail(c, "notFound", 404);
  const db = tenantDb(c.env, user.tenantId);
  const from = `${month}-01`;
  const to = shiftDay(`${shiftMonth(month)}-01`, -1);
  const r = utcRange(from, to);
  const [employees, entries, absences, settings] = await Promise.all([db.listEmployees(), db.timeEntries(null, r.from, r.to), db.absences(null, from, to), db.getTimeSettings()]);
  const result = employees
    .filter((e) => employedInMonth(e, month))
    .map((e) => {
      const days = computeDays(profileOf(e), entries.filter((t) => t.employeeId === e.id), absences.filter((a) => a.employeeId === e.id), { from, to }, settings);
      return { employeeId: e.id, ...monthTotals(days) };
    });
  return c.json({ entries: result });
});

// ---------- Adressvorschläge ----------

/** Adressvorschläge senden Eingaben an fremde Dienste, daher nur, wenn die Firma das erlaubt. */
const addressLookupAllowed = async (c: Ctx) => (await tenantDb(c.env, c.get("user").tenantId).getPrivacy()).addressLookup;

app.get("/geo/address", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 3 || q.length > 120 || !(await addressLookupAllowed(c))) return c.json({ suggestions: [] });
  try {
    const suggestions = await suggestAddresses(q, { lang: c.req.query("lang"), country: c.req.query("country") });
    return c.json({ suggestions });
  } catch (error) {
    console.error("geo/address", error);
    return c.json({ suggestions: [] });
  }
});

app.get("/geo/postal", async (c) => {
  if (!(await addressLookupAllowed(c))) return c.json({ city: null });
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
  const db = tenantDb(c.env, user.tenantId);
  if (!(await db.getPrivacy()).assistant) return fail(c, "assistantDisabled", 403);
  const apiKey = c.env.GEMINI_API_KEY;
  if (!apiKey) return fail(c, "assistantNotConfigured", 503);
  if (!(await db.countAssistantQuestion(user.id, DAILY_QUESTION_LIMIT))) return fail(c, "assistantLimit", 429);

  const installedApps = await db.installedApps();
  const context: AssistantContext = {
    companyName: user.tenantName,
    userName: user.name,
    role: user.role,
    installedApps,
    lang: typeof body.lang === "string" ? body.lang : "de",
  };
  // Aus der Auswertung gefragt: Zahlen des Zeitraums mitgeben, aber nur für Inhaber und Admins (wie die Auswertung selbst)
  if (body.insights && typeof body.insights === "object" && user.role !== "staff") {
    const today = localDay(new Date().toISOString());
    const range = sanitizeRange(body.insights as { from?: unknown; to?: unknown }, today);
    if (range) {
      const [data, tax, profile] = await Promise.all([db.insights(range, installedApps.includes(REPAIR_APP_ID), today), db.getTaxSettings(), db.getCompany()]);
      context.insights = { data, currency: tax?.currency ?? defaultTaxSettings(profile?.country ?? "DE").currency, today };
    }
  }

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

// ---------- Auswertung über alle Systeme ----------

app.get("/insights", requireRole("owner", "admin"), async (c) => {
  const user = c.get("user");
  const today = localDay(new Date().toISOString());
  const range = sanitizeRange({ from: c.req.query("from"), to: c.req.query("to") }, today);
  if (!range) return fail(c, "checkFields", 400);
  const db = tenantStub(c.env, user.tenantId);
  const installed = await db.installedApps();
  return c.json(await db.insights(range, installed.includes(REPAIR_APP_ID), today));
});

// ---------- Branchen-Systeme ----------

app.route("/pos", posRoutes);
app.route("/repairs", repairRoutes);
app.route("/office", officeRoutes);

app.notFound((c) => fail(c, "notFound", 404));

export default app;
