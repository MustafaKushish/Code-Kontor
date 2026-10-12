export class ApiError extends Error {
  constructor(message: string, public status: number, public errors?: Record<string, string>) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string; errors?: Record<string, string> };
  if (!response.ok) throw new ApiError(data.error ?? "Etwas ist schiefgelaufen.", response.status, data.errors);
  return data as unknown as T;
}

export type Role = "owner" | "admin" | "staff";

export interface Me {
  user: { id: string; tenantId: string; tenantName: string; email: string; name: string; role: Role };
  setupComplete: boolean;
  installedApps: string[];
}

export const roleLabel: Record<Role, string> = { owner: "Inhaber", admin: "Admin", staff: "Mitarbeiter" };
