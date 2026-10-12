import { describe, expect, it } from "vitest";
import { cityForPostalCode, suggestAddresses, toSuggestion } from "../worker/geo";

const fakeFetch = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("Adressvorschläge", () => {
  it("baut aus einem Treffer Straße, PLZ, Ort und Land", () => {
    expect(
      toSuggestion({ properties: { type: "house", street: "Hauptstraße", housenumber: "12", postcode: "10115", city: "Berlin", countrycode: "DE" } }),
    ).toEqual({ street: "Hauptstraße 12", postalCode: "10115", city: "Berlin", country: "DE", label: "Hauptstraße 12, 10115 Berlin" });
    expect(toSuggestion({ properties: { type: "street", name: "Ringstraße", postcode: "1010", city: "Wien", countrycode: "AT" } })?.street).toBe("Ringstraße");
    expect(toSuggestion({ properties: { type: "city", name: "Berlin" } })).toBeNull();
  });

  it("zeigt Treffer im Land der Firma zuerst und ohne Doppelte", async () => {
    const features = [
      { properties: { type: "street", name: "Hauptstraße", postcode: "1010", city: "Wien", countrycode: "AT" } },
      { properties: { type: "house", street: "Hauptstraße", housenumber: "1", postcode: "10115", city: "Berlin", countrycode: "DE" } },
      { properties: { type: "house", street: "Hauptstraße", housenumber: "1", postcode: "10115", city: "Berlin", countrycode: "DE" } },
    ];
    const result = await suggestAddresses("Hauptstr", { country: "DE", fetch: fakeFetch({ features }) });
    expect(result.map((r) => r.label)).toEqual(["Hauptstraße 1, 10115 Berlin"]);
  });

  it("behält die getippte Hausnummer, wenn nur die Straße gefunden wird", async () => {
    const features = [{ properties: { type: "street", name: "Hauptstraße", postcode: "12159", city: "Berlin", countrycode: "DE" } }];
    const [first] = await suggestAddresses("Hauptstraße 12a", { country: "DE", fetch: fakeFetch({ features }) });
    expect(first?.street).toBe("Hauptstraße 12a");
  });

  it("findet den Ort zur Postleitzahl", async () => {
    expect(await cityForPostalCode("DE", "10115", fakeFetch({ places: [{ "place name": "Berlin" }] }))).toBe("Berlin");
    expect(await cityForPostalCode("DE", "00000", fakeFetch({}, 404))).toBeNull();
    expect(await cityForPostalCode("D", "10115", fakeFetch({}))).toBeNull();
  });
});
