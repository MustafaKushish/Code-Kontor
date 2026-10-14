import { describe, expect, it } from "vitest";
import { emptyCompanyProfile, sanitizeCompany, validateCompany } from "../shared/company";
import { countryTax } from "../shared/countries";
import { containsCardNumber, countryMethods, defaultMethods, methodLabels, parseMethods } from "../shared/payments";

const base = { ...emptyCompanyProfile, name: "Firma", street: "Weg 1", postalCode: "10001", city: "Bagdad" };

describe("Zahlarten je Land", () => {
  it("Irak: keine IBAN, dafür Qi Card, ZainCash und Co.", () => {
    expect(countryTax("IQ").iban).toBe(false);
    expect(countryMethods("IQ")).toEqual(expect.arrayContaining(["qi", "zaincash", "fastpay"]));
    expect(defaultMethods("IQ")).toEqual(["cash", "qi", "transfer"]);
    expect(validateCompany({ ...base, country: "IQ", iban: "" })).toEqual({});
  });

  it("schlägt für jedes Land etwas vor, auch ohne eigenen Eintrag", () => {
    expect(countryMethods("DE")[0]).toBe("girocard");
    expect(countryMethods("SA")[0]).toBe("mada");
    expect(countryMethods("CZ")).toContain("visa_mc");
    expect(countryMethods("ZZ")).toContain("visa_mc");
  });

  it("speichert nur bekannte Zahlarten, ohne Doppelte", () => {
    expect(parseMethods("cash, qi,qi,hack,zaincash")).toEqual(["cash", "qi", "zaincash"]);
    expect(sanitizeCompany({ ...base, paymentMethods: "qi,<script>,cash" }).paymentMethods).toBe("qi,cash");
    expect(methodLabels("cash,qi,transfer", { cash: "Bar", transfer: "Überweisung" })).toBe("Bar, Qi Card, Überweisung");
  });
});

describe("Keine Kartennummern", () => {
  it("erkennt Kartennummern mit Luhn-Prüfung", () => {
    expect(containsCardNumber("4111 1111 1111 1111")).toBe(true);
    expect(containsCardNumber("Qi 6262-1234-5678-9014")).toBe(false);
    expect(containsCardNumber("5555555555554444")).toBe(true);
    expect(containsCardNumber("ZainCash 0770 123 4567")).toBe(false);
  });

  it("lehnt eine Karte als Empfänger ab", () => {
    expect(validateCompany({ ...base, country: "IQ", paymentAccount: "4111 1111 1111 1111" })).toEqual({ paymentAccount: "cardNumberNotAllowed" });
    expect(validateCompany({ ...base, country: "IQ", paymentAccount: "ZainCash 0770 123 4567" })).toEqual({});
  });
});
