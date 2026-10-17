import { ApiError } from "../../api";
import { currency, currencySymbol } from "../../money";
import {
  CONTRACT_STATUS_LABEL,
  LEAD_STATUS_LABEL,
  TESTDRIVE_STATUS_LABEL,
  TRADEIN_STATUS_LABEL,
  VEHICLE_STATUS_LABEL,
  type ContractStatus,
  type LeadStatus,
  type StockVehicle,
  type TestDriveStatus,
  type TradeInStatus,
  type VehicleStatus,
} from "../../../shared/autohaus";

export const BASE = "/app/autohaus";

/** Betrag in der Währung der Firma (aus den Einstellungen), ganze Beträge ohne Nachkommastellen. */
export const euro = (n: number) => {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: currency(), minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency()}`;
  }
};
/** Währungszeichen für Feldbeschriftungen, z. B. „€“ oder „IQD“. */
export const sym = () => currencySymbol("de-DE");
export const km = (n: number) => `${n.toLocaleString("de-DE")} km`;
export const psFromKw = (kw: number) => Math.round(kw * 1.35962);
export const monthLabel = (ym: string) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : "");
export const dateLabel = (d: string) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("de-DE") : "");
export const timeLabel = (dt: string) => new Date(dt).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const ERRORS: Record<string, string> = {
  vehicleNotFound: "Das Fahrzeug gibt es nicht mehr.",
  vehicleMissingFields: "Bitte mindestens Marke und Modell angeben.",
  vehicleInContract: "Für dieses Fahrzeug gibt es einen Kaufvertrag. Storniere ihn zuerst.",
  vehicleNotAvailable: "Das Fahrzeug ist schon reserviert oder verkauft.",
  vehicleSold: "Das Fahrzeug ist bereits verkauft.",
  photoInvalid: "Bitte ein Bild im Format JPG, PNG oder WebP wählen.",
  photoTooLarge: "Das Bild ist zu groß.",
  photoLimit: "Höchstens 8 Fotos je Fahrzeug.",
  leadMissingName: "Bitte einen Namen angeben.",
  testDriveMissingFields: "Bitte Fahrzeug, Kunde und Termin angeben.",
  testDriveConflict: "Das Fahrzeug ist zu dieser Zeit schon für eine Probefahrt eingeplant.",
  testDriveNoLicense: "Bitte zuerst den Führerschein prüfen und die Nummer eintragen.",
  testDriveMileage: "Der Kilometerstand bei Rückgabe ist kleiner als bei Abfahrt.",
  testDriveWrongStatus: "Diese Probefahrt wurde schon geändert. Bitte neu laden.",
  tradeInLocked: "Diese Inzahlungnahme gehört schon zu einem Kaufvertrag.",
  tradeInNotAccepted: "Erst wenn die Inzahlungnahme in einem Kaufvertrag angenommen ist, kann sie in den Bestand.",
  tradeInInStock: "Das Fahrzeug ist schon im Bestand.",
  contractMissingBuyer: "Bitte den Namen des Käufers angeben.",
  contractMissingPrice: "Bitte einen Verkaufspreis angeben.",
  contractOverpaid: "Anzahlung und Inzahlungnahme sind höher als der Kaufpreis.",
  contractWrongStatus: "Dieser Schritt ist für den Vertrag nicht mehr möglich.",
  forbidden: "Das dürfen nur Inhaber und Verwalter.",
  noConnection: "Keine Verbindung. Bitte später noch einmal versuchen.",
};

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return ERRORS[err.message] ?? ERRORS[err.code?.replace(/^autohaus\./, "") ?? ""] ?? "Etwas ist schiefgelaufen.";
  return "Etwas ist schiefgelaufen.";
}

const VEHICLE_TONE: Record<VehicleStatus, string> = { aufbereitung: "warn", verfuegbar: "pos", reserviert: "", verkauft: "neg" };
const LEAD_TONE: Record<LeadStatus, string> = { neu: "warn", kontaktiert: "", probefahrt: "", angebot: "", gewonnen: "pos", verloren: "neg" };
const DRIVE_TONE: Record<TestDriveStatus, string> = { geplant: "", unterwegs: "warn", abgeschlossen: "pos", abgesagt: "neg" };
const TRADE_TONE: Record<TradeInStatus, string> = { bewertet: "", angenommen: "pos", abgelehnt: "neg" };
const CONTRACT_TONE: Record<ContractStatus, string> = { entwurf: "warn", unterschrieben: "pos", ausgeliefert: "pos", storniert: "neg" };

export const VehicleStatusPill = ({ status }: { status: VehicleStatus }) => <span className={`pill ${VEHICLE_TONE[status]}`}>{VEHICLE_STATUS_LABEL[status]}</span>;
export const LeadStatusPill = ({ status }: { status: LeadStatus }) => <span className={`pill ${LEAD_TONE[status]}`}>{LEAD_STATUS_LABEL[status]}</span>;
export const DriveStatusPill = ({ status }: { status: TestDriveStatus }) => <span className={`pill ${DRIVE_TONE[status]}`}>{TESTDRIVE_STATUS_LABEL[status]}</span>;
export const TradeStatusPill = ({ status }: { status: TradeInStatus }) => <span className={`pill ${TRADE_TONE[status]}`}>{TRADEIN_STATUS_LABEL[status]}</span>;
export const ContractStatusPill = ({ status }: { status: ContractStatus }) => <span className={`pill ${CONTRACT_TONE[status]}`}>{CONTRACT_STATUS_LABEL[status]}</span>;

/** Eckdaten eines Fahrzeugs in einer Zeile, z. B. „EZ 04/2021 · 38.500 km · 96 kW (131 PS) · Benzin“. */
export function vehicleFacts(v: Pick<StockVehicle, "condition" | "firstRegistration" | "mileage" | "powerKw" | "fuel">): string {
  return [
    v.condition === "neu" ? "Neuwagen" : v.firstRegistration ? `EZ ${monthLabel(v.firstRegistration)}` : "",
    km(v.mileage),
    v.powerKw ? `${v.powerKw} kW (${psFromKw(v.powerKw)} PS)` : "",
    v.fuel,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Verkleinert ein Foto im Browser auf höchstens 1280 px und speichert es als JPEG. */
export async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    for (const [size, quality] of [[1280, 0.8], [1024, 0.72], [800, 0.65]] as const) {
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= 440_000) return data;
    }
    throw new Error("photoTooLarge");
  } finally {
    URL.revokeObjectURL(url);
  }
}
