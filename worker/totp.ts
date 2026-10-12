// Zwei-Faktor-Anmeldung mit Authenticator-App (TOTP nach RFC 6238: 6 Ziffern, 30 Sekunden, SHA-1).
// Funktioniert mit Google Authenticator, Microsoft Authenticator, 1Password, Authy usw.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  const out: number[] = [];
  let bits = 0, value = 0;
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Ungültiges Base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const bytes = new Uint8Array(new ArrayBuffer(out.length));
  bytes.set(out);
  return bytes;
}

export function newTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export async function totpCode(secret: string, timeMs = Date.now(), step = 30): Promise<string> {
  const counter = Math.floor(timeMs / 1000 / step);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1]! & 15;
  const num = ((mac[offset]! & 127) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(num % 1_000_000).padStart(6, "0");
}

/** Prüft einen Code und lässt je 30 Sekunden Abweichung der Uhr zu. */
export async function verifyTotp(secret: string, code: string, timeMs = Date.now()): Promise<boolean> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  for (const drift of [0, -1, 1]) if ((await totpCode(secret, timeMs + drift * 30_000)) === clean) return true;
  return false;
}

export function otpauthUrl(secret: string, account: string, issuer = "Code Kontor"): string {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** 8 Notfall-Codes im Format xxxx-xxxx, falls das Handy weg ist. */
export function newRecoveryCodes(): string[] {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const s = [...bytes].map((b) => chars[b % chars.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

export const normalizeRecoveryCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");
