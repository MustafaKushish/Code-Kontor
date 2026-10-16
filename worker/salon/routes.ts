import { Hono, type Context } from "hono";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import type { SalonStore } from "./store";
import { fail } from "../errors";
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
  // Öffentliche Buchung hat keinen User-Context
  if (c.req.path.startsWith("/api/salon/public")) {
    return next();
  }
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

// ---------- ÖFFENTLICHE ONLINE-TERMINBUCHUNG FÜR KUNDEN ----------

salonRoutes.get("/public/:tenantId/info", async (c) => {
  const tenantId = c.req.param("tenantId");
  const s = store(c.env, tenantId);
  const [settingsRes, servicesRes, staffRes] = await Promise.all([
    s.getSettings(),
    s.listServices(),
    s.listStaff(),
  ]);

  if (!settingsRes.ok || !servicesRes.ok || !staffRes.ok) {
    return fail(c, "notFound", 404);
  }

  return c.json({
    settings: settingsRes.value,
    services: servicesRes.value,
    staff: staffRes.value,
  });
});

salonRoutes.get("/public/:tenantId/slots", async (c) => {
  const tenantId = c.req.param("tenantId");
  const day = c.req.query("day");
  const duration = parseInt(c.req.query("duration") || "45", 10);
  const staffId = c.req.query("staffId") || undefined;
  if (!day) return c.json({ code: "salon.dayRequired", error: "dayRequired" }, 400);

  const res = await store(c.env, tenantId).getFreeSlots(day, duration, staffId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ slots: res.value });
});

salonRoutes.post("/public/:tenantId/book", async (c) => {
  const tenantId = c.req.param("tenantId");
  const body = await readBody(c);

  const res = await store(c.env, tenantId).saveAppointment({
    ...body,
    source: "online",
    status: "booked",
  });
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ appointment: res.value });
});
