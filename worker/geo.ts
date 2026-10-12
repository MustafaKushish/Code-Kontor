// Adressvorschläge beim Ausfüllen der Firmendaten.
// Straße und Hausnummer: Photon (OpenStreetMap, komoot), kostenlos und ohne Schlüssel.
// Postleitzahl zu Ort: Zippopotam.us.

export interface AddressSuggestion {
  street: string;
  postalCode: string;
  city: string;
  country: string;
  label: string;
}

interface PhotonFeature {
  properties: {
    type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    locality?: string;
    district?: string;
    countrycode?: string;
  };
}

const PHOTON_LANGS = new Set(["de", "en", "fr", "it"]);

export function toSuggestion(feature: PhotonFeature): AddressSuggestion | null {
  const p = feature.properties;
  const streetName = p.street ?? (p.type === "street" ? p.name : undefined);
  if (!streetName) return null;
  const street = p.housenumber ? `${streetName} ${p.housenumber}` : streetName;
  const city = p.city ?? p.town ?? p.village ?? p.locality ?? p.district ?? "";
  const postalCode = p.postcode ?? "";
  const country = (p.countrycode ?? "").toUpperCase();
  return { street, postalCode, city, country, label: [street, `${postalCode} ${city}`.trim()].filter(Boolean).join(", ") };
}

export async function suggestAddresses(
  query: string,
  options: { lang?: string; country?: string; fetch?: typeof fetch } = {},
): Promise<AddressSuggestion[]> {
  const doFetch = options.fetch ?? fetch;
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "12");
  url.searchParams.append("layer", "house");
  url.searchParams.append("layer", "street");
  if (options.lang && PHOTON_LANGS.has(options.lang)) url.searchParams.set("lang", options.lang);
  const response = await doFetch(url, { headers: { "User-Agent": "CodeKontor/1.0 (https://code-kontor.mustafa-alzurgany.workers.dev)" } });
  if (!response.ok) return [];
  const data = (await response.json()) as { features?: PhotonFeature[] };
  const all = (data.features ?? []).map(toSuggestion).filter((s): s is AddressSuggestion => s !== null);
  // Treffer im Land der Firma zuerst, doppelte Einträge entfernen.
  const seen = new Set<string>();
  const unique = all.filter((s) => !seen.has(s.label + s.country) && seen.add(s.label + s.country));
  const country = options.country?.toUpperCase();
  const local = country ? unique.filter((s) => s.country === country) : [];
  return (local.length ? local : unique).slice(0, 6);
}

export async function cityForPostalCode(country: string, code: string, doFetch: typeof fetch = fetch): Promise<string | null> {
  if (!/^[A-Za-z]{2}$/.test(country) || !/^[A-Za-z0-9 -]{3,10}$/.test(code)) return null;
  const response = await doFetch(`https://api.zippopotam.us/${country.toLowerCase()}/${encodeURIComponent(code.trim())}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { places?: { "place name"?: string }[] };
  return data.places?.[0]?.["place name"] ?? null;
}
