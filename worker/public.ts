// Gemeinsames für Seiten der Systeme, die Endkunden ohne Anmeldung öffnen
// (Online-Termine, Statusseite der Werkstatt, Abholanzeige im Restaurant).
import type { Env } from "./index";
import { tenantStub } from "./tenant";
import { billingEnabled, getSubscription } from "./billing";
import { hasAccess } from "../shared/billing";
import { defaultTaxSettings } from "../shared/countries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Nur echte Firmen mit gebuchtem System und laufendem Abo. Sonst würde jede ausgedachte ID
 * eine neue, leere Firmen-Datenbank anlegen.
 */
export async function publicTenant(env: Env, tenantId: string, appId: string): Promise<boolean> {
  if (!UUID.test(tenantId)) return false;
  if (!(await env.PLATFORM_DB.prepare("SELECT 1 FROM tenants WHERE id = ?").bind(tenantId).first())) return false;
  if (!(await tenantStub(env, tenantId).installedApps()).includes(appId)) return false;
  if (billingEnabled(env)) {
    const sub = await getSubscription(env, tenantId);
    if (!hasAccess(sub.status, sub.trialEndsAt)) return false;
  }
  return true;
}

/** Was Kunden von der Firma sehen dürfen: keine IBAN, keine Steuernummer. */
export async function publicCompany(env: Env, tenantId: string) {
  const db = tenantStub(env, tenantId);
  const [company, tax] = await Promise.all([db.getCompany(), db.getTaxSettings()]);
  return {
    company: {
      name: company?.name ?? "", phone: company?.phone ?? "", email: company?.email ?? "", street: company?.street ?? "",
      postalCode: company?.postalCode ?? "", city: company?.city ?? "", logoDataUrl: company?.logoDataUrl ?? "",
    },
    currency: tax?.currency ?? defaultTaxSettings(company?.country ?? "DE").currency,
  };
}

export const berlinToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
export const berlinTime = () => new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false });

/** Tag (YYYY-MM-DD) plus n Tage. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
