import { Hono, type Context } from "hono";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import type { OfficeStore } from "./store";
import { fail } from "../errors";
import { OFFICE_APP_ID } from "../../shared/office";

interface User {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  role: "owner" | "admin" | "staff";
}

type OfficeEnv = { Bindings: Env; Variables: { user: User } };
type Ctx = Context<OfficeEnv>;

type Remote = {
  [K in keyof OfficeStore]: OfficeStore[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<ModuleResult<R>>
    : never;
};

function store(env: Env, tenantId: string): Remote {
  const stub = tenantStub(env, tenantId);
  return new Proxy({} as Remote, {
    get: (_, action: string) => (...args: unknown[]) => stub.office(action, args),
  });
}

function moduleError(c: Ctx, code: string) {
  const status = code.endsWith("NotFound") ? 404 : 400;
  return c.json({ code: `office.${code}`, error: code }, status);
}

async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export const officeRoutes = new Hono<OfficeEnv>();

// Überprüfen, ob das Modul „buero“ installiert ist
officeRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  const apps = await tenantStub(c.env, user.tenantId).installedApps();
  if (!apps.includes(OFFICE_APP_ID)) return fail(c, "appNotInstalled", 403);
  await next();
});

// ---------- Kunden ----------

officeRoutes.get("/clients", async (c) => {
  const q = c.req.query("q") ?? "";
  const res = await store(c.env, c.get("user").tenantId).listClients(q);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ clients: res.value });
});

officeRoutes.get("/clients/:id", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).getClient(id);
  if (!res.ok) return moduleError(c, res.code);
  if (!res.value) return fail(c, "clientNotFound", 404);
  return c.json({ client: res.value });
});

officeRoutes.post("/clients", async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveClient(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ client: res.value }, 201);
});

officeRoutes.delete("/clients/:id", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).deleteClient(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- Projekte ----------

officeRoutes.get("/projects", async (c) => {
  const status = c.req.query("status");
  const clientId = c.req.query("clientId");
  const res = await store(c.env, c.get("user").tenantId).listProjects(status, clientId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ projects: res.value });
});

officeRoutes.get("/projects/:id", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).getProject(id);
  if (!res.ok) return moduleError(c, res.code);
  if (!res.value) return fail(c, "projectNotFound", 404);
  return c.json({ project: res.value });
});

officeRoutes.post("/projects", async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveProject(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ project: res.value }, 201);
});

officeRoutes.delete("/projects/:id", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).deleteProject(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- Zeiterfassung ----------

officeRoutes.get("/times", async (c) => {
  const projectId = c.req.query("projectId");
  const clientId = c.req.query("clientId");
  const fromDay = c.req.query("from");
  const toDay = c.req.query("to");
  const res = await store(c.env, c.get("user").tenantId).listTimes(projectId, clientId, fromDay, toDay);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ times: res.value });
});

officeRoutes.post("/times", async (c) => {
  const user = c.get("user");
  const body = await readBody(c);
  const res = await store(c.env, user.tenantId).saveTime(body, { id: user.id, name: user.name });
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ time: res.value }, 201);
});

officeRoutes.delete("/times/:id", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).deleteTime(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- Angebote ----------

officeRoutes.get("/quotes", async (c) => {
  const status = c.req.query("status");
  const clientId = c.req.query("clientId");
  const res = await store(c.env, c.get("user").tenantId).listQuotes(status, clientId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ quotes: res.value });
});

officeRoutes.get("/quotes/:id", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).getQuote(id);
  if (!res.ok) return moduleError(c, res.code);
  if (!res.value) return fail(c, "quoteNotFound", 404);
  return c.json({ quote: res.value });
});

officeRoutes.post("/quotes", async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveQuote(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ quote: res.value }, 201);
});

officeRoutes.post("/quotes/:id/convert", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).convertQuoteToInvoice(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ invoice: res.value }, 201);
});

officeRoutes.delete("/quotes/:id", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).deleteQuote(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- Rechnungen ----------

officeRoutes.get("/invoices", async (c) => {
  const status = c.req.query("status");
  const clientId = c.req.query("clientId");
  const res = await store(c.env, c.get("user").tenantId).listInvoices(status, clientId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ invoices: res.value });
});

officeRoutes.get("/invoices/:id", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).getInvoice(id);
  if (!res.ok) return moduleError(c, res.code);
  if (!res.value) return fail(c, "invoiceNotFound", 404);
  return c.json({ invoice: res.value });
});

officeRoutes.post("/invoices", async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveInvoice(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ invoice: res.value }, 201);
});

officeRoutes.post("/invoices/:id/pay", async (c) => {
  const id = c.req.param("id");
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).markInvoicePaid(id, typeof body.method === "string" ? body.method : "Überweisung");
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ invoice: res.value });
});

officeRoutes.delete("/invoices/:id", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).deleteInvoice(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- DATEV Export ----------

officeRoutes.get("/export/datev", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).exportDatevCsv();
  if (!res.ok) return moduleError(c, res.code);

  const filename = `DATEV-Export-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(res.value, {
    headers: {
      "Content-Type": "text/csv; charset=windows-1252",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});

// ---------- Einstellungen ----------

officeRoutes.get("/settings", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).getSettings();
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ settings: res.value });
});

officeRoutes.put("/settings", async (c) => {
  const body = (await readBody(c)) as unknown as Parameters<OfficeStore["saveSettings"]>[0];
  const res = await store(c.env, c.get("user").tenantId).saveSettings(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ settings: res.value });
});
