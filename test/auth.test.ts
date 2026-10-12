import { describe, expect, it } from "vitest";
import { DUMMY_PASSWORD_HASH, hashPassword, hashToken, passwordProblem, verifyPassword } from "../worker/auth";

describe("Passwörter", () => {
  it("prüft richtige und falsche Passwörter", async () => {
    const stored = await hashPassword("sehr-geheim-123");
    expect(stored.startsWith("pbkdf2$100000$")).toBe(true);
    expect(await verifyPassword("sehr-geheim-123", stored)).toBe(true);
    expect(await verifyPassword("falsch-falsch", stored)).toBe(false);
    expect(await verifyPassword("x", "kaputt")).toBe(false);
  });
  it("Ersatz-Hash für unbekannte E-Mails passt zu keinem Passwort", async () => {
    expect(await verifyPassword("", DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await verifyPassword("sehr-geheim-123", DUMMY_PASSWORD_HASH)).toBe(false);
  });
  it("verlangt mindestens 10 Zeichen", () => {
    expect(passwordProblem("kurz")).not.toBeNull();
    expect(passwordProblem("lang-genug-1")).toBeNull();
  });
  it("hasht Sitzungs-Tokens deterministisch", async () => {
    expect(await hashToken("abc")).toBe(await hashToken("abc"));
  });
});
