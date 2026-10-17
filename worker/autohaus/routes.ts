import { Hono, type Context } from "hono";
import type { Env } from "../index";
import { tenantStub, type ModuleResult } from "../tenant";
import type { AutohausStore } from "./store";
import { fail } from "../errors";
import { AUTOHAUS_APP_ID, type StockVehicle } from "../../shared/autohaus";

interface User {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  role: "owner" | "admin" | "staff";
}

type AutohausEnv = { Bindings: Env; Variables: { user: User } };
type Ctx = Context<AutohausEnv>;

type Remote = {
  [K in keyof AutohausStore]: AutohausStore[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<ModuleResult<R>> : never;
};

function store(c: Ctx): Remote {
  const stub = tenantStub(c.env, c.get("user").tenantId);
  return new Proxy({} as Remote, {
    get: (_, action: string) => (...args: unknown[]) => stub.autohaus(action, args),
  });
}

function send<T>(c: Ctx, res: ModuleResult<T>, status: 200 | 201 = 200) {
  if (!res.ok) return c.json({ code: `autohaus.${res.code}`, error: res.code }, res.code.endsWith("NotFound") ? 404 : 400);
  return c.json(res.value as object, status);
}

async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

/** Einkaufspreise sehen nur Inhaber und Verwalter. */
function forRole(c: Ctx, v: StockVehicle): StockVehicle {
  return c.get("user").role === "staff" ? { ...v, purchasePrice: 0 } : v;
}

function managerOnly(c: Ctx) {
  return c.get("user").role === "staff" ? fail(c, "forbidden", 403) : null;
}

export const autohausRoutes = new Hono<AutohausEnv>();

autohausRoutes.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user) return fail(c, "notLoggedIn", 401);
  const apps = await tenantStub(c.env, user.tenantId).installedApps();
  if (!apps.includes(AUTOHAUS_APP_ID)) return fail(c, "forbidden", 403);
  await next();
});

autohausRoutes.get("/stats", async (c) => send(c, await store(c).getStats()));

// ---------- Fahrzeugbestand ----------
autohausRoutes.get("/vehicles", async (c) => {
  const res = await store(c).listVehicles();
  return res.ok ? c.json(res.value.map((v) => forRole(c, v))) : send(c, res);
});
autohausRoutes.get("/vehicles/:id", async (c) => {
  const res = await store(c).getVehicle(c.req.param("id"));
  return res.ok ? c.json(forRole(c, res.value)) : send(c, res);
});
autohausRoutes.post("/vehicles", async (c) => {
  const body = await readBody(c);
  // Mitarbeiter ändern den Einkaufspreis nicht (sie sehen ihn ja auch nicht)
  if (c.get("user").role === "staff") {
    if (typeof body.id === "string" && body.id) {
      const current = await store(c).getVehicle(body.id);
      if (!current.ok) return send(c, current);
      body.purchasePrice = current.value.purchasePrice;
    } else body.purchasePrice = 0;
  }
  const res = await store(c).saveVehicle(body);
  return res.ok ? c.json(forRole(c, res.value), body.id ? 200 : 201) : send(c, res);
});
autohausRoutes.post("/vehicles/:id/status", async (c) => {
  const body = await readBody(c);
  const res = await store(c).setVehicleStatus(c.req.param("id"), String(body.status ?? ""));
  return res.ok ? c.json(forRole(c, res.value)) : send(c, res);
});
autohausRoutes.delete("/vehicles/:id", async (c) => managerOnly(c) ?? send(c, await store(c).deleteVehicle(c.req.param("id"))));

autohausRoutes.get("/vehicles/:id/photos", async (c) => send(c, await store(c).listPhotos(c.req.param("id"))));
autohausRoutes.post("/vehicles/:id/photos", async (c) => {
  const body = await readBody(c);
  return send(c, await store(c).addPhoto(c.req.param("id"), body.dataUrl), 201);
});
autohausRoutes.post("/vehicles/:id/photos/:photoId/cover", async (c) => send(c, await store(c).coverPhoto(c.req.param("id"), c.req.param("photoId"))));
autohausRoutes.delete("/vehicles/:id/photos/:photoId", async (c) => send(c, await store(c).deletePhoto(c.req.param("id"), c.req.param("photoId"))));

// ---------- Interessenten ----------
autohausRoutes.get("/leads", async (c) => send(c, await store(c).listLeads()));
autohausRoutes.post("/leads", async (c) => {
  const body = await readBody(c);
  return send(c, await store(c).saveLead(body), body.id ? 200 : 201);
});
autohausRoutes.post("/leads/:id/status", async (c) => {
  const body = await readBody(c);
  return send(c, await store(c).setLeadStatus(c.req.param("id"), String(body.status ?? "")));
});
autohausRoutes.delete("/leads/:id", async (c) => send(c, await store(c).deleteLead(c.req.param("id"))));

// ---------- Probefahrten ----------
autohausRoutes.get("/testdrives", async (c) => send(c, await store(c).listTestDrives()));
autohausRoutes.post("/testdrives", async (c) => send(c, await store(c).scheduleTestDrive(await readBody(c)), 201));
autohausRoutes.post("/testdrives/:id/start", async (c) => {
  const body = await readBody(c);
  return send(c, await store(c).startTestDrive(c.req.param("id"), body.licenseNumber));
});
autohausRoutes.post("/testdrives/:id/finish", async (c) => {
  const body = await readBody(c);
  return send(c, await store(c).finishTestDrive(c.req.param("id"), body.mileageEnd, body.notes));
});
autohausRoutes.post("/testdrives/:id/cancel", async (c) => send(c, await store(c).cancelTestDrive(c.req.param("id"))));

// ---------- Inzahlungnahme ----------
autohausRoutes.get("/tradeins", async (c) => send(c, await store(c).listTradeIns()));
autohausRoutes.post("/tradeins", async (c) => {
  const body = await readBody(c);
  return send(c, await store(c).saveTradeIn(body), body.id ? 200 : 201);
});
autohausRoutes.post("/tradeins/:id/reject", async (c) => send(c, await store(c).rejectTradeIn(c.req.param("id"))));
autohausRoutes.post("/tradeins/:id/stock", async (c) => {
  const res = await store(c).tradeInToStock(c.req.param("id"));
  return res.ok ? c.json(forRole(c, res.value), 201) : send(c, res);
});
autohausRoutes.delete("/tradeins/:id", async (c) => send(c, await store(c).deleteTradeIn(c.req.param("id"))));

// ---------- Kaufverträge ----------
autohausRoutes.get("/contracts", async (c) => send(c, await store(c).listContracts()));
autohausRoutes.get("/contracts/:id", async (c) => send(c, await store(c).getContract(c.req.param("id"))));
autohausRoutes.post("/contracts", async (c) => send(c, await store(c).createContract(await readBody(c)), 201));
autohausRoutes.post("/contracts/:id/status", async (c) => {
  const body = await readBody(c);
  const status = String(body.status ?? "");
  // Stornieren nur durch Inhaber oder Verwalter
  if (status === "storniert") {
    const denied = managerOnly(c);
    if (denied) return denied;
  }
  return send(c, await store(c).setContractStatus(c.req.param("id"), status));
});
