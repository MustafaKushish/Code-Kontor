import { Hono, type Context } from "hono";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import type { SalonStore } from "./store";
import { fail } from "../errors";
import { isLocked, recordFailure } from "../throttle";
import { addDays, berlinTime, berlinToday, isDay, publicCompany, publicTenant } from "../public";
import { SALON_APP_ID } from "../../shared/salon";

interface User {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  role: "owner" | "admin" | "staff";
}

type SalonEnv = { Bindings: Env; Variables: { user: User } };
type Ctx = Context<SalonEnv>;

type Remote = {
  [K in keyof SalonStore]: SalonStore[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<ModuleResult<R>>
    : never;
};

function store(env: Env, tenantId: string): Remote {
  const stub = tenantStub(env, tenantId);
  return new Proxy({} as Remote, {
    get: (_, action: string) => (...args: unknown[]) => stub.salon(action, args),
  });
}

function moduleError(c: Ctx, code: string) {
  const status = code.endsWith("NotFound") ? 404 : 400;
  return c.json({ code: `salon.${code}`, error: code }, status);
}

async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export const salonRoutes = new Hono<SalonEnv>();

// Überprüfen, ob das Modul „friseur“ gebucht ist
salonRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  const apps = await tenantStub(c.env, user.tenantId).installedApps();
  if (!apps.includes(SALON_APP_ID)) return fail(c, "forbidden", 403);
  await next();
});

// ---------- DIENSTLEISTUNGEN ----------

salonRoutes.get("/services", async (c) => {
  const all = c.req.query("all") === "true";
  const res = all
    ? await store(c.env, c.get("user").tenantId).listAllServices()
    : await store(c.env, c.get("user").tenantId).listServices();
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ services: res.value });
});

salonRoutes.post("/services", async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveService(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ service: res.value });
});

salonRoutes.delete("/services/:id", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).deleteService(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- MITARBEITER / STYLISTEN ----------

salonRoutes.get("/staff", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).listStaff();
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ staff: res.value });
});

salonRoutes.post("/staff", async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveStaff(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ staff: res.value });
});

salonRoutes.delete("/staff/:id", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).deleteStaff(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- KUNDEN & FARBREZEPTUREN ----------

salonRoutes.get("/clients", async (c) => {
  const q = c.req.query("q") ?? "";
  const res = await store(c.env, c.get("user").tenantId).listClients(q);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ clients: res.value });
});

salonRoutes.get("/clients/:id", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).getClient(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  if (!res.value) return fail(c, "notFound", 404);
  return c.json({ client: res.value });
});

salonRoutes.post("/clients", async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveClient(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ client: res.value });
});

salonRoutes.delete("/clients/:id", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).deleteClient(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

salonRoutes.get("/formulas", async (c) => {
  const clientId = c.req.query("clientId");
  if (!clientId) return c.json({ code: "salon.clientIdRequired", error: "clientIdRequired" }, 400);
  const res = await store(c.env, c.get("user").tenantId).listFormulas(clientId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ formulas: res.value });
});

salonRoutes.post("/formulas", async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveFormula(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ formula: res.value });
});

salonRoutes.delete("/formulas/:id", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).deleteFormula(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- TERMINE & KALENDER ----------

salonRoutes.get("/appointments", async (c) => {
  const day = c.req.query("day");
  const staffId = c.req.query("staffId");
  const clientId = c.req.query("clientId");
  const status = c.req.query("status");

  const res = await store(c.env, c.get("user").tenantId).listAppointments({
    day: day || undefined,
    staffId: staffId || undefined,
    clientId: clientId || undefined,
    status: status || undefined,
  });
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ appointments: res.value });
});

salonRoutes.get("/appointments/:id", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).getAppointment(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  if (!res.value) return fail(c, "notFound", 404);
  return c.json({ appointment: res.value });
});

salonRoutes.post("/appointments", async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveAppointment(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ appointment: res.value });
});

salonRoutes.post("/appointments/:id/status", async (c) => {
  const body = await readBody(c);
  const status = String(body.status || "confirmed") as any;
  const res = await store(c.env, c.get("user").tenantId).updateAppointmentStatus(
    c.req.param("id"),
    status
  );
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ appointment: res.value });
});

salonRoutes.delete("/appointments/:id", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).deleteAppointment(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

salonRoutes.get("/slots", async (c) => {
  const day = c.req.query("day");
  const duration = parseInt(c.req.query("duration") || "45", 10);
  const staffId = c.req.query("staffId") || undefined;
  if (!day) return c.json({ code: "salon.dayRequired", error: "dayRequired" }, 400);

  const res = await store(c.env, c.get("user").tenantId).getFreeSlots(day, duration, staffId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ slots: res.value });
});

// ---------- CHECKOUT / BEZAHLUNG ----------

salonRoutes.post("/appointments/:id/checkout", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).getAppointment(id);
  if (!res.ok || !res.value) return fail(c, "notFound", 404);
  const app = res.value;

  // Markiere als bezahlt und abgeschlossen
  await store(c.env, c.get("user").tenantId).updateAppointmentStatus(id, "completed");
  await store(c.env, c.get("user").tenantId).saveAppointment({ ...app, status: "completed", paid: true });

  return c.json({ ok: true, appointmentId: id });
});

// ---------- EINSTELLUNGEN ----------

salonRoutes.get("/settings", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).getSettings();
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ settings: res.value });
});

salonRoutes.post("/settings", async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveSettings(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ settings: res.value });
});

// ---------- Online-Termine für Kunden (ohne Anmeldung) ----------
// Wird in worker/index.ts vor der Anmeldung eingehängt. Gibt nur heraus, was Kunden sehen sollen:
// keine Telefonnummern oder E-Mails des Teams, keine Preise vom Browser.

export const salonPublicRoutes = new Hono<{ Bindings: Env }>();

async function bookingOpen(env: Env, tenantId: string) {
  if (!(await publicTenant(env, tenantId, SALON_APP_ID))) return null;
  const settings = await store(env, tenantId).getSettings();
  return settings.ok && settings.value.onlineBookingEnabled ? settings.value : null;
}

salonPublicRoutes.get("/:tenantId/info", async (c) => {
  const tenantId = c.req.param("tenantId");
  const settings = await bookingOpen(c.env, tenantId);
  if (!settings) return fail(c, "linkInvalid", 404);
  const s = store(c.env, tenantId);
  const [services, staff] = await Promise.all([s.listServices(), s.listStaff()]);
  if (!services.ok || !staff.ok) return fail(c, "linkInvalid", 404);
  c.header("Cache-Control", "no-store");
  return c.json({
    ...(await publicCompany(c.env, tenantId)),
    today: berlinToday(),
    lastDay: addDays(berlinToday(), settings.bookingAdvanceDays),
    settings: {
      salonName: settings.salonName, openDays: settings.openDays, openTime: settings.openTime, closeTime: settings.closeTime,
      bookingAdvanceDays: settings.bookingAdvanceDays, cancellationHours: settings.cancellationHours, noticeText: settings.noticeText,
    },
    services: services.value.map(({ id, name, category, description, durationMinutes, priceCents }) => ({ id, name, category, description, durationMinutes, priceCents })),
    staff: staff.value.map(({ id, name, title, colorHex }) => ({ id, name, title, colorHex })),
  });
});

salonPublicRoutes.get("/:tenantId/slots", async (c) => {
  const tenantId = c.req.param("tenantId");
  const settings = await bookingOpen(c.env, tenantId);
  if (!settings) return fail(c, "linkInvalid", 404);
  const day = c.req.query("day");
  const duration = Number(c.req.query("duration"));
  const staffId = c.req.query("staffId") || undefined;
  const today = berlinToday();
  if (!isDay(day) || !Number.isInteger(duration) || duration < 5 || duration > 12 * 60) return fail(c, "checkFields", 400);
  if (day < today || day > addDays(today, settings.bookingAdvanceDays)) return c.json({ slots: [] });
  const res = await store(c.env, tenantId).getFreeSlots(day, duration, staffId, day === today ? berlinTime() : undefined);
  if (!res.ok) return fail(c, "linkInvalid", 404);
  c.header("Cache-Control", "no-store");
  return c.json({ slots: res.value });
});

salonPublicRoutes.post("/:tenantId/book", async (c) => {
  const tenantId = c.req.param("tenantId");
  const settings = await bookingOpen(c.env, tenantId);
  if (!settings) return fail(c, "linkInvalid", 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  // Unsichtbares Feld: nur Bots füllen es aus
  if (typeof body.website === "string" && body.website) return c.json({ ok: true });
  const ip = c.req.header("CF-Connecting-IP");
  const keys = [{ key: `salon-booking:${tenantId}`, limit: 60 }, ...(ip ? [{ key: `salon-booking-ip:${ip}`, limit: 5 }] : [])];
  if (await isLocked(c.env.PLATFORM_DB, keys)) return fail(c, "tooManyAttempts", 429);

  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const input = {
    serviceIds: Array.isArray(body.serviceIds) ? body.serviceIds.filter((id): id is string => typeof id === "string").slice(0, 10) : [],
    staffId: text(body.staffId, 64),
    day: text(body.day, 10),
    startTime: text(body.startTime, 5),
    name: text(body.clientName, 120),
    phone: text(body.clientPhone, 40),
    email: text(body.clientEmail, 200).toLowerCase(),
    notes: text(body.notes, 500),
  };
  const errors: Record<string, string> = {};
  if (!input.name) errors.clientName = "required";
  if (input.phone.replace(/\D/g, "").length < 5) errors.clientPhone = "invalid";
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.clientEmail = "invalid";
  if (!isDay(input.day) || !/^\d{2}:\d{2}$/.test(input.startTime) || !input.staffId || !input.serviceIds.length) errors.slot = "required";
  if (Object.keys(errors).length) return fail(c, "checkFields", 400, { errors });

  const today = berlinToday();
  const res = await store(c.env, tenantId).bookOnline(input, today, berlinTime(), addDays(today, settings.bookingAdvanceDays));
  if (!res.ok) return c.json({ code: `salon.${res.code}`, error: res.code }, res.code === "slotTaken" ? 409 : 400);
  await recordFailure(c.env.PLATFORM_DB, keys);
  const a = res.value;
  return c.json({ ok: true, appointment: { day: a.day, startTime: a.startTime, endTime: a.endTime, staffName: a.staffName, serviceNames: a.serviceNames, totalCents: a.totalCents, durationMinutes: a.durationMinutes } });
});
