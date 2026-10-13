export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public errors?: Record<string, string>) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("offline", 0, "noConnection");
  }
  const data = (await response.json().catch(() => ({}))) as { code?: string; error?: string; errors?: Record<string, string> };
  if (!response.ok) throw new ApiError(data.error ?? "Etwas ist schiefgelaufen.", response.status, data.code, data.errors);
  return data as unknown as T;
}

export type Role = "owner" | "admin" | "staff";

export interface Me {
  user: { id: string; tenantId: string; tenantName: string; email: string; name: string; role: Role; emailVerified: boolean; twoFactor: boolean };
  setupComplete: boolean;
  mailEnabled: boolean;
  installedApps: string[];
  /** Nur gesetzt, wenn die Bezahlung eingerichtet ist */
  billing: { status: "trialing" | "active" | "past_due" | "canceled" | "expired"; daysLeft: number; access: boolean } | null;
  /** Offene Zeit-Anträge (nur für Inhaber und Admins) */
  timeRequests?: number;
}
