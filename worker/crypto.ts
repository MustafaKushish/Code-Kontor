// Zusätzliche Verschlüsselung für besonders sensible Felder (IBAN, Zwei-Faktor-Geheimnis).
// AES-256-GCM mit dem Schlüssel DATA_KEY (32 Byte, Base64), gesetzt als Cloudflare-Secret.
// Ohne Schlüssel bleiben Werte unverschlüsselt; verschlüsselte Werte beginnen mit "enc1:".

const PREFIX = "enc1:";
const keyCache = new Map<string, Promise<CryptoKey>>();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function importKey(dataKey: string): Promise<CryptoKey> {
  let key = keyCache.get(dataKey);
  if (!key) {
    const raw = unb64(dataKey.trim());
    if (raw.length !== 32) throw new Error("DATA_KEY muss 32 Byte (Base64) lang sein");
    key = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    keyCache.set(dataKey, key);
  }
  return key;
}

export const isEncrypted = (value: string) => value.startsWith(PREFIX);

export async function encryptField(dataKey: string | undefined, value: string): Promise<string> {
  if (!dataKey || !value || isEncrypted(value)) return value;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(dataKey), new TextEncoder().encode(value)));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv);
  out.set(cipher, iv.length);
  return PREFIX + b64(out);
}

export async function decryptField(dataKey: string | undefined, value: string): Promise<string> {
  if (!isEncrypted(value)) return value;
  if (!dataKey) throw new Error("Verschlüsselter Wert, aber kein DATA_KEY gesetzt");
  const data = unb64(value.slice(PREFIX.length));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, await importKey(dataKey), data.slice(12));
  return new TextDecoder().decode(plain);
}

/** Neuer Schlüssel im richtigen Format, z. B. für `wrangler secret put DATA_KEY`. */
export function newDataKey(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}
