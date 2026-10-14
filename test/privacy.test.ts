import { describe, expect, it } from "vitest";
import { DEFAULT_PRIVACY, sanitizePrivacy } from "../shared/privacy";

describe("Daten an fremde Dienste", () => {
  it("ist ohne Einstellung für alles ausgeschaltet", () => {
    expect(DEFAULT_PRIVACY).toEqual({ assistant: false, addressLookup: false });
    expect(sanitizePrivacy(null)).toEqual(DEFAULT_PRIVACY);
  });
  it("übernimmt nur echte Ja-Werte und keine fremden Felder", () => {
    expect(sanitizePrivacy({ assistant: true, addressLookup: "yes", other: true })).toEqual({ assistant: true, addressLookup: false });
  });
});
