import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// Fehler gehen als Code an die App, die sie in der Sprache des Nutzers anzeigt.
// Der deutsche Text ist nur Rückfall für andere Aufrufer (z. B. curl).
export const ERROR_TEXT = {
  companyNameRequired: "Bitte den Firmennamen angeben.",
  nameRequired: "Bitte einen Namen angeben.",
  emailInvalid: "Bitte eine gültige E-Mail-Adresse angeben.",
  emailTaken: "Diese E-Mail-Adresse ist schon registriert.",
  passwordTooShort: "Das Passwort braucht mindestens 10 Zeichen.",
  passwordTooLong: "Das Passwort ist zu lang.",
  wrongCredentials: "E-Mail oder Passwort ist falsch.",
  linkInvalid: "Dieser Link ist abgelaufen oder wurde schon benutzt.",
  currentPasswordWrong: "Das aktuelle Passwort stimmt nicht.",
  loginExpired: "Die Anmeldung hat zu lange gedauert. Bitte noch einmal mit Passwort anmelden.",
  codeWrong: "Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben.",
  companyNameMismatch: "Der Firmenname stimmt nicht.",
  mailNotConfigured: "Der E-Mail-Versand ist noch nicht eingerichtet.",
  advisorEmailMissing: "Bitte zuerst die E-Mail-Adresse des Steuerberaters eintragen.",
  mailFailed: "Die E-Mail konnte gerade nicht gesendet werden. Bitte später noch einmal versuchen.",
  subscriptionRequired: "Die Testphase ist abgelaufen. Bitte ein Abo abschließen, um wieder Änderungen zu speichern.",
  billingNotConfigured: "Die Bezahlung ist noch nicht eingerichtet.",
  noSystems: "Bitte zuerst ein System aus dem Katalog installieren.",
  paymentFailed: "Stripe ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.",
  terminalInvalid: "Dieses Terminal ist nicht (mehr) freigeschaltet.",
  unknownChip: "Dieser Chip ist keiner Person zugeordnet.",
  notLinked: "Dein Konto ist noch keiner Person in der Zeiterfassung zugeordnet.",
  tooManyRequests: "Es sind schon sehr viele Anträge offen. Bitte warte, bis sie bearbeitet sind.",
  tooManyAttempts: "Zu viele Fehlversuche. Bitte in 15 Minuten noch einmal versuchen.",
  notLoggedIn: "Nicht angemeldet.",
  sessionExpired: "Sitzung abgelaufen. Bitte neu anmelden.",
  forbidden: "Dafür fehlt dir die Berechtigung.",
  checkFields: "Bitte die markierten Felder prüfen.",
  unknownApp: "Dieses System gibt es nicht.",
  roleInvalid: "Rolle muss Admin oder Mitarbeiter sein.",
  ownerOnlyAdmins: "Nur der Inhaber kann Admins anlegen.",
  userNotFound: "Benutzer nicht gefunden.",
  cannotRemoveSelf: "Du kannst dich nicht selbst entfernen.",
  cannotRemoveOwner: "Der Inhaber kann nicht entfernt werden.",
  ownerOnlyRemoveAdmins: "Nur der Inhaber kann Admins entfernen.",
  notFound: "Nicht gefunden.",
  messageInvalid: "Bitte eine Frage eingeben.",
  assistantNotConfigured: "Der KI-Assistent ist noch nicht eingerichtet.",
  assistantLimit: "Das Tageslimit für Fragen ist erreicht. Morgen geht es weiter.",
  assistantFailed: "Der Assistent konnte gerade nicht antworten. Bitte gleich noch einmal versuchen.",
  assistantBusy: "Der Assistent ist gerade sehr gefragt. Bitte in einer Minute noch einmal versuchen.",
  assistantRefused: "Dabei kann der Assistent leider nicht helfen. Bitte stell die Frage anders.",
} as const;

export type ErrorCode = keyof typeof ERROR_TEXT;

export function fail(c: Context, code: ErrorCode, status: ContentfulStatusCode, extra: Record<string, unknown> = {}) {
  return c.json({ code, error: ERROR_TEXT[code], ...extra }, status);
}
