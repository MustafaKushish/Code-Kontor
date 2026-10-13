import { describe, expect, it } from "vitest";
import { countryTax, defaultTaxSettings, guessCountry, sanitizeTaxSettings, selectableRates } from "../shared/countries";

describe("Länder und Steuern", () => {
  it("gibt Währung und Sätze je Land vor", () => {
    expect(defaultTaxSettings("DE")).toEqual({ currency: "EUR", vatRates: [19, 7] });
    expect(defaultTaxSettings("ch")).toEqual({ currency: "CHF", vatRates: [8.1, 3.8, 2.6] });
    expect(defaultTaxSettings("QA").vatRates).toEqual([]);
    expect(countryTax("ZZ").currency).toBe("EUR");
  });
  it("prüft eigene Einstellungen", () => {
    expect(sanitizeTaxSettings({ currency: "usd", vatRates: [8.875, 8.875, -1, 150, "x", 0] }, "US")).toEqual({ currency: "USD", vatRates: [8.88] });
    expect(sanitizeTaxSettings({ currency: "Euro" }, "AT")).toEqual({ currency: "EUR", vatRates: [20, 13, 10] });
    expect(selectableRates({ currency: "EUR", vatRates: [19, 7] })).toEqual([19, 7, 0]);
  });
  it("rät das Land aus der Browsersprache", () => {
    expect(guessCountry(["de-CH", "de"])).toBe("CH");
    expect(guessCountry(["ar"], "DE")).toBe("DE");
    expect(guessCountry(["en-AE"])).toBe("AE");
  });
});
