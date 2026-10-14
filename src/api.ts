export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public errors?: Record<string, string>) {
    super(message);
  }
}

/** Kassenplatz dieses Geräts; die Kasse bucht Bargeld und Abschlüsse darauf. */
export const POS_REGISTER_KEY = "ck-pos-register";
export const TOKEN_STORAGE_KEY = "ck_session_token";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ohne Speicher
  }
}

function deviceHeaders(json: boolean): Record<string, string> {
  const headers: Record<string, string> = json ? { "Content-Type": "application/json" } : {};
  try {
    const register = localStorage.getItem(POS_REGISTER_KEY);
    if (register) headers["x-pos-register"] = register;
    const token = getStoredToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  } catch {
    // ohne Speicher gilt der Hauptkassenplatz
  }
  return headers;
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers: deviceHeaders(options.body !== undefined),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "include",
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
  /** Land, Währung und Steuersätze der Firma */
  tax?: { country: string; custom: boolean; currency: string; vatRates: number[] };
  /** Welche Hilfen Daten an fremde Dienste senden dürfen */
  privacy?: { assistant: boolean; addressLookup: boolean };
}
