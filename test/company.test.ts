import { describe, expect, it } from "vitest";
import { emptyCompanyProfile, isValidIban, isValidTaxNumber, isValidVatId, sanitizeCompany, validateCompany } from "../shared/company";

const valid = {
  ...emptyCompanyProfile,
  name: "Salon Beispiel",
  street: "Hauptstraße 1",
  postalCode: "10115",
  city: "Berlin",
  taxNumber: "12/345/67890",
  iban: "DE89 3704 0044 0532 0130 00",
};

describe("IBAN", () => {
  it("akzeptiert gültige IBANs mit und ohne Leerzeichen", () => {
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("de89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("AT611904300234573201")).toBe(true);
  });
  it("lehnt falsche Prüfziffer und falsche Länge ab", () => {
    expect(isValidIban("DE88370400440532013000")).toBe(false);
    expect(isValidIban("DE8937040044053201300")).toBe(false);
    expect(isValidIban("")).toBe(false);
  });
});

describe("Steuerangaben", () => {
  it("prüft Steuernummer und USt-IdNr.", () => {
    expect(isValidTaxNumber("12/345/67890")).toBe(true);
    expect(isValidTaxNumber("123")).toBe(false);
    expect(isValidVatId("DE123456789")).toBe(true);
    expect(isValidVatId("DE12345678")).toBe(false);
  });
});

describe("validateCompany", () => {
  it("hat keine Fehler bei vollständigen Daten", () => {
    expect(validateCompany(sanitizeCompany(valid))).toEqual({});
  });
  it("verlangt Steuernummer oder USt-IdNr.", () => {
    expect(validateCompany({ ...valid, taxNumber: "" }).taxNumber).toBeDefined();
    expect(validateCompany({ ...valid, taxNumber: "", vatId: "DE123456789" })).toEqual({});
  });
  it("prüft deutsche PLZ", () => {
    expect(validateCompany({ ...valid, postalCode: "1011" }).postalCode).toBeDefined();
  });
});

describe("sanitizeCompany", () => {
  it("übernimmt nur bekannte Textfelder und normalisiert IBAN", () => {
    const result = sanitizeCompany({ ...valid, admin: true, name: 42 });
    expect(result).not.toHaveProperty("admin");
    expect(result.name).toBe("");
    expect(result.iban).toBe("DE89370400440532013000");
  });
});

describe("validateCompany weltweit", () => {
  const base = { ...emptyCompanyProfile, name: "Firma", street: "Weg 1", postalCode: "8001", city: "Zürich" };
  it("prüft Steuernummer und IBAN je nach Land", () => {
    // Schweiz: IBAN Pflicht, MWST-Nummer frei
    expect(validateCompany({ ...base, country: "CH", vatId: "CHE-123.456.789 MWST", iban: "" })).toEqual({ iban: "ibanRequired" });
    // Katar: keine Umsatzsteuer, also keine Steuernummer nötig
    expect(validateCompany({ ...base, country: "QA", iban: "QA58DOHB00001234567890ABCDEFG" })).toEqual({});
    // USA: keine IBAN, Kontonummer frei
    expect(validateCompany({ ...base, country: "US", iban: "" })).toEqual({});
    // Österreich: Steuernummer nicht im deutschen Format geprüft
    expect(validateCompany({ ...base, country: "AT", taxNumber: "12-345/6789", iban: "AT611904300234573201" })).toEqual({});
  });
});
