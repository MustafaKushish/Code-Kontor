import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, newRecoveryCodes, newTotpSecret, totpCode, verifyTotp } from "../worker/totp";
import { decryptField, encryptField, isEncrypted, newDataKey } from "../worker/crypto";

describe("Zwei-Faktor (TOTP)", () => {
  const rfcSecret = base32Encode(new TextEncoder().encode("12345678901234567890"));
  it("liefert die Testwerte aus RFC 6238", async () => {
    expect(rfcSecret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(await totpCode(rfcSecret, 59_000)).toBe("287082");
    expect(await totpCode(rfcSecret, 1_111_111_109_000)).toBe("081804");
    expect(await totpCode(rfcSecret, 2_000_000_000_000)).toBe("279037");
  });
  it("akzeptiert 30 Sekunden Abweichung, aber nicht mehr", async () => {
    const now = 1_700_000_000_000;
    const code = await totpCode(rfcSecret, now);
    expect(await verifyTotp(rfcSecret, code, now + 30_000)).toBe(true);
    expect(await verifyTotp(rfcSecret, code, now + 95_000)).toBe(false);
    expect(await verifyTotp(rfcSecret, "12ab56", now)).toBe(false);
  });
  it("erzeugt 32-stellige Geheimnisse und 8 Notfall-Codes", () => {
    expect(newTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(newTotpSecret())).toHaveLength(20);
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) expect(c).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
  });
});

describe("Feld-Verschlüsselung", () => {
  const key = newDataKey();
  it("verschlüsselt und entschlüsselt, jedes Mal anders", async () => {
    const a = await encryptField(key, "DE89370400440532013000");
    const b = await encryptField(key, "DE89370400440532013000");
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toContain("DE89");
    expect(await decryptField(key, a)).toBe("DE89370400440532013000");
  });
  it("lässt Werte ohne Schlüssel unverändert und liest alte, offene Werte", async () => {
    expect(await encryptField(undefined, "DE89")).toBe("DE89");
    expect(await decryptField(key, "DE89")).toBe("DE89");
    expect(await encryptField(key, "")).toBe("");
  });
  it("lehnt einen falschen Schlüssel ab", async () => {
    const a = await encryptField(key, "geheim");
    await expect(decryptField(newDataKey(), a)).rejects.toThrow();
  });
});
