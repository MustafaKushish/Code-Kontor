import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
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

/** Preise, Stammdaten, Einstellungen und Löschen nur für Inhaber und Admins; Mitarbeiter arbeiten nur damit. */
const managers = createMiddleware<OfficeEnv>(async (c, next) => {
  if (c.get("user").role === "staff") return fail(c, "forbidden", 403);
  await next();
});

export const officeRoutes = new Hono<OfficeEnv>();

// Überprüfen, ob das Modul „buero“ installiert ist
officeRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  const apps = await tenantStub(c.env, user.tenantId).installedApps();
  if (!apps.includes(OFFICE_APP_ID)) return fail(c, "forbidden", 403);
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
  if (!res.value) return moduleError(c, "clientNotFound");
  return c.json({ client: res.value });
});

officeRoutes.post("/clients", managers, async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveClient(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ client: res.value }, 201);
});

officeRoutes.delete("/clients/:id", managers, async (c) => {
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
  if (!res.value) return moduleError(c, "projectNotFound");
  return c.json({ project: res.value });
});

officeRoutes.post("/projects", managers, async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveProject(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ project: res.value }, 201);
});

officeRoutes.delete("/projects/:id", managers, async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).deleteProject(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- Aufgaben & Meilensteine ----------

officeRoutes.get("/tasks", async (c) => {
  const projectId = c.req.query("projectId");
  if (!projectId) return moduleError(c, "projectRequired");
  const res = await store(c.env, c.get("user").tenantId).listTasks(projectId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ tasks: res.value });
});

officeRoutes.post("/tasks", async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveTask(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ task: res.value }, 201);
});

officeRoutes.post("/tasks/:id/toggle", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).toggleTask(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ task: res.value });
});

officeRoutes.delete("/tasks/:id", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).deleteTask(id);
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

officeRoutes.get("/timesheet", async (c) => {
  const projectId = c.req.query("projectId");
  const clientId = c.req.query("clientId");
  const fromDay = c.req.query("from");
  const toDay = c.req.query("to");
  const res = await store(c.env, c.get("user").tenantId).getTimesheet(projectId, clientId, fromDay, toDay);
  if (!res.ok) return moduleError(c, res.code);
  return c.json(res.value);
});

// ---------- Auslagen & Reisekosten ----------

officeRoutes.get("/expenses", async (c) => {
  const projectId = c.req.query("projectId");
  const clientId = c.req.query("clientId");
  const fromDay = c.req.query("from");
  const toDay = c.req.query("to");
  const res = await store(c.env, c.get("user").tenantId).listExpenses(projectId, clientId, fromDay, toDay);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ expenses: res.value });
});

officeRoutes.post("/expenses", managers, async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveExpense(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ expense: res.value }, 201);
});

officeRoutes.delete("/expenses/:id", managers, async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).deleteExpense(id);
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
  if (!res.value) return moduleError(c, "quoteNotFound");
  return c.json({ quote: res.value });
});

officeRoutes.post("/quotes", managers, async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveQuote(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ quote: res.value }, 201);
});

officeRoutes.post("/quotes/:id/convert", managers, async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).convertQuoteToInvoice(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ invoice: res.value }, 201);
});

officeRoutes.delete("/quotes/:id", managers, async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).deleteQuote(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- Rechnungen ----------

officeRoutes.get("/invoices", async (c) => {
  const status = c.req.query("status");
  const clientId = c.req.query("clientId");
  // Fällige wiederkehrende Rechnungen als Entwurf anlegen, bevor die Liste gezeigt wird
  await store(c.env, c.get("user").tenantId).runDueRecurring();
  const res = await store(c.env, c.get("user").tenantId).listInvoices(status, clientId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ invoices: res.value });
});

officeRoutes.get("/invoices/:id", async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).getInvoice(id);
  if (!res.ok) return moduleError(c, res.code);
  if (!res.value) return moduleError(c, "invoiceNotFound");
  return c.json({ invoice: res.value });
});

officeRoutes.post("/invoices", managers, async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveInvoice(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ invoice: res.value }, 201);
});

officeRoutes.post("/invoices/:id/finalize", managers, async (c) => {
  const res = await store(c.env, c.get("user").tenantId).finalizeInvoice(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ invoice: res.value });
});

officeRoutes.post("/invoices/:id/cancel", managers, async (c) => {
  const res = await store(c.env, c.get("user").tenantId).cancelInvoice(c.req.param("id"));
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ invoice: res.value });
});

officeRoutes.post("/invoices/:id/pay", managers, async (c) => {
  const id = c.req.param("id");
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).markInvoicePaid(id, typeof body.method === "string" ? body.method : "Überweisung");
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ invoice: res.value });
});

officeRoutes.delete("/invoices/:id", managers, async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).deleteInvoice(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- Mahnwesen (Dunning) ----------

officeRoutes.get("/dunning", async (c) => {
  const invoiceId = c.req.query("invoiceId");
  const res = await store(c.env, c.get("user").tenantId).listDunning(invoiceId);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ dunning: res.value });
});

officeRoutes.post("/dunning", managers, async (c) => {
  const body = await readBody(c);
  const invoiceId = String(body.invoiceId || "");
  const level = Number(body.level) as 1 | 2 | 3;
  const notes = String(body.notes || "");
  if (!invoiceId || !level) return moduleError(c, "checkFields");
  const res = await store(c.env, c.get("user").tenantId).createDunning(invoiceId, level, notes);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ dunning: res.value }, 201);
});

// ---------- Wiederkehrende Rechnungen (Recurring) ----------

officeRoutes.get("/recurring", async (c) => {
  const res = await store(c.env, c.get("user").tenantId).listRecurring();
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ recurring: res.value });
});

officeRoutes.post("/recurring", managers, async (c) => {
  const body = await readBody(c);
  const res = await store(c.env, c.get("user").tenantId).saveRecurring(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ recurring: res.value }, 201);
});

officeRoutes.post("/recurring/:id/trigger", managers, async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).triggerRecurring(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ invoice: res.value }, 201);
});

officeRoutes.delete("/recurring/:id", managers, async (c) => {
  const id = c.req.param("id");
  const res = await store(c.env, c.get("user").tenantId).deleteRecurring(id);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ ok: true });
});

// ---------- DATEV Export ----------

// DATEV liest ANSI (Windows-1252); als UTF-8 geschickt wurden Umlaute zu „Ã¤“
const CP1252: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99,
};
function windows1252(text: string): ArrayBuffer {
  const out = new Uint8Array(text.length);
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    out[n++] = CP1252[ch] ?? (code < 0x80 || (code >= 0xa0 && code <= 0xff) ? code : 0x3f);
  }
  return out.slice(0, n).buffer;
}

officeRoutes.get("/export/datev", managers, async (c) => {
  const res = await store(c.env, c.get("user").tenantId).exportDatevCsv();
  if (!res.ok) return moduleError(c, res.code);

  const filename = `DATEV-Export-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(windows1252(res.value), {
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

officeRoutes.put("/settings", managers, async (c) => {
  const body = (await readBody(c)) as unknown as Parameters<OfficeStore["saveSettings"]>[0];
  const res = await store(c.env, c.get("user").tenantId).saveSettings(body);
  if (!res.ok) return moduleError(c, res.code);
  return c.json({ settings: res.value });
});
