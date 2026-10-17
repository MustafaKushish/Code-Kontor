// Datenmodelle für das Autohaus-Modul in Code Kontor

export const AUTOHAUS_APP_ID = "autohaus";

export type VehicleStatus = "aufbereitung" | "verfuegbar" | "reserviert" | "verkauft";
export type VehicleCondition = "neu" | "gebraucht" | "jahreswagen" | "vorfuehr";
export type FuelType = "Benzin" | "Diesel" | "Hybrid" | "Elektro" | "LPG";
export type Transmission = "Schaltgetriebe" | "Automatik";
/** Differenzbesteuerung nach § 25a UStG oder Regelbesteuerung mit ausgewiesener MwSt. */
export type Taxation = "differenz" | "regel";

export interface StockVehicle {
  id: string;
  stockNumber: string; // z. B. "FZ-1001"
  make: string;
  model: string;
  variant: string;
  condition: VehicleCondition;
  firstRegistration: string; // JJJJ-MM, leer bei Neuwagen
  mileage: number;
  fuel: FuelType;
  transmission: Transmission;
  powerKw: number;
  color: string;
  vin: string;
  licensePlate: string;
  previousOwners: number;
  nextInspection: string; // JJJJ-MM
  price: number; // Verkaufspreis brutto in Euro
  purchasePrice: number; // Einkaufspreis in Euro
  taxation: Taxation;
  status: VehicleStatus;
  equipment: string;
  notes: string;
  source: "einkauf" | "inzahlungnahme";
  photoCount: number;
  coverPhoto: string | null;
  createdAt: string;
  soldAt: string | null;
}

export interface VehiclePhoto {
  id: string;
  vehicleId: string;
  dataUrl: string;
  position: number;
}

export type LeadStatus = "neu" | "kontaktiert" | "probefahrt" | "angebot" | "gewonnen" | "verloren";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehicleId: string | null;
  vehicleLabel: string;
  source: string; // z. B. "Laufkundschaft", "mobile.de", "Telefon"
  status: LeadStatus;
  budget: number;
  notes: string;
  nextContact: string; // JJJJ-MM-TT
  createdAt: string;
  updatedAt: string;
}

export type TestDriveStatus = "geplant" | "unterwegs" | "abgeschlossen" | "abgesagt";

export interface TestDrive {
  id: string;
  vehicleId: string;
  vehicleLabel: string;
  leadId: string | null;
  customerName: string;
  customerPhone: string;
  licenseNumber: string; // Führerscheinnummer
  scheduledAt: string; // JJJJ-MM-TTTHH:MM
  durationMin: number;
  status: TestDriveStatus;
  mileageStart: number | null;
  mileageEnd: number | null;
  notes: string;
  createdAt: string;
}

export type TradeInStatus = "bewertet" | "angenommen" | "abgelehnt";

export interface TradeIn {
  id: string;
  make: string;
  model: string;
  firstRegistration: string;
  mileage: number;
  vin: string;
  licensePlate: string;
  ownerName: string;
  ownerPhone: string;
  damages: string;
  offeredPrice: number;
  status: TradeInStatus;
  contractId: string | null;
  vehicleId: string | null; // Fahrzeug im Bestand, wenn übernommen
  createdAt: string;
}

export type ContractStatus = "entwurf" | "unterschrieben" | "ausgeliefert" | "storniert";
export type PaymentMethod = "ueberweisung" | "bar" | "finanzierung" | "leasing";

export interface SalesContract {
  id: string;
  contractNumber: string; // z. B. "KV-2026-0001"
  vehicleId: string;
  vehicle: Pick<StockVehicle, "stockNumber" | "make" | "model" | "variant" | "condition" | "firstRegistration" | "mileage" | "fuel" | "powerKw" | "color" | "vin" | "licensePlate" | "previousOwners" | "nextInspection">;
  leadId: string | null;
  buyerName: string;
  buyerAddress: string;
  buyerPhone: string;
  buyerEmail: string;
  price: number;
  discount: number;
  tradeInId: string | null;
  tradeInAmount: number;
  deposit: number;
  paymentMethod: PaymentMethod;
  deliveryDate: string;
  warranty: string;
  taxation: Taxation;
  notes: string;
  status: ContractStatus;
  createdAt: string;
  signedAt: string | null;
  deliveredAt: string | null;
}

export interface AutohausStats {
  inStock: number;
  reserved: number;
  stockValue: number;
  avgDaysInStock: number;
  openLeads: number;
  testDrivesToday: number;
  salesThisMonth: number;
  revenueThisMonth: number;
}

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  aufbereitung: "In Aufbereitung",
  verfuegbar: "Verfügbar",
  reserviert: "Reserviert",
  verkauft: "Verkauft",
};

export const CONDITION_LABEL: Record<VehicleCondition, string> = {
  neu: "Neuwagen",
  gebraucht: "Gebrauchtwagen",
  jahreswagen: "Jahreswagen",
  vorfuehr: "Vorführwagen",
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  neu: "Neu",
  kontaktiert: "Kontaktiert",
  probefahrt: "Probefahrt",
  angebot: "Angebot",
  gewonnen: "Gekauft",
  verloren: "Verloren",
};

export const TESTDRIVE_STATUS_LABEL: Record<TestDriveStatus, string> = {
  geplant: "Geplant",
  unterwegs: "Unterwegs",
  abgeschlossen: "Abgeschlossen",
  abgesagt: "Abgesagt",
};

export const TRADEIN_STATUS_LABEL: Record<TradeInStatus, string> = {
  bewertet: "Bewertet",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  entwurf: "Entwurf",
  unterschrieben: "Unterschrieben",
  ausgeliefert: "Ausgeliefert",
  storniert: "Storniert",
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  ueberweisung: "Überweisung",
  bar: "Barzahlung",
  finanzierung: "Finanzierung",
  leasing: "Leasing",
};

/** Restbetrag eines Kaufvertrags: Preis minus Nachlass, Inzahlungnahme und Anzahlung. */
export function contractTotal(c: Pick<SalesContract, "price" | "discount">): number {
  return Math.max(0, round2(c.price - c.discount));
}

export function contractBalance(c: Pick<SalesContract, "price" | "discount" | "tradeInAmount" | "deposit">): number {
  return round2(contractTotal(c) - c.tradeInAmount - c.deposit);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function vehicleLabel(v: Pick<StockVehicle, "make" | "model" | "variant">): string {
  return [v.make, v.model, v.variant].filter(Boolean).join(" ");
}
