// Passwörter und Sitzungen. Nur Web Crypto, keine Zusatzbibliotheken.

const PBKDF2_ITERATIONS = 100_000; // Höchstwert, den Cloudflare Workers erlauben
const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !expected) return false;
  const actual = toHex(await derive(password, fromHex(salt), Number(iterations)));
  // Vergleich in konstanter Zeit
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < actual.length && i < expected.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function newSessionToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** In der Datenbank liegt nur der Hash des Tokens, nie das Token selbst. */
export async function hashToken(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 10) return "Das Passwort braucht mindestens 10 Zeichen.";
  if (password.length > 200) return "Das Passwort ist zu lang.";
  return null;
}
