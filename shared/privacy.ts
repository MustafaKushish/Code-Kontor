// Welche Hilfen Daten an fremde Dienste senden dürfen. Je Firma, Vorgabe: keine.

export interface PrivacySettings {
  /** KI-Assistent: Fragen, Firmenname und Name gehen an Google Gemini. */
  assistant: boolean;
  /** Adressvorschläge: eingetippte Adresse oder Postleitzahl geht an Photon und Zippopotam. */
  addressLookup: boolean;
}

export const DEFAULT_PRIVACY: PrivacySettings = { assistant: false, addressLookup: false };

export function sanitizePrivacy(input: unknown): PrivacySettings {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return { assistant: s.assistant === true, addressLookup: s.addressLookup === true };
}
