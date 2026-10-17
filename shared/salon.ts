// Gemeinsame Typen für das Modul „Friseur & Kosmetik“ (friseur)

export const SALON_APP_ID = "friseur";

export type AppointmentStatus =
  | "booked"        // Gebucht / Reserviert
  | "confirmed"     // Bestätigt
  | "in_progress"   // In Behandlung (Kunde sitzt auf dem Stuhl)
  | "completed"     // Abgeschlossen
  | "canceled"      // Storniert
  | "no_show";      // Nicht erschienen

export type ServiceCategory =
  | "cut_style"     // Waschen, Schneiden, Föhnen & Styling
  | "color"         // Coloration, Strähnen, Balayage, Tönung
  | "care"          // Pflege, Haarkur, Olaplex, Kopfmassage
  | "beard"         // Bartpflege, Rasur, Konturen
  | "cosmetics"     // Kosmetik, Augenbrauen, Wimpern, Make-Up
  | "package";      // Komplettpakete & Specials

export interface SalonService {
  id: string;
  name: string;
  category: ServiceCategory;
  description: string;
  durationMinutes: number; // z.B. 45 min
  priceCents: number;      // z.B. 4800 = 48,00 €
  vatRate: number;         // 19%
  active: boolean;
  colorHex?: string;
  sortOrder: number;
}

export interface SalonStaff {
  id: string;
  name: string;
  title: string;           // z.B. „Master Stylist“, „Colorist“, „Barbier“
  email?: string;
  phone?: string;
  colorHex: string;        // Farbliche Unterscheidung im Kalender
  specialties: string[];   // z.B. ["Balayage", "Herrenschnitt", "Brautstyling"]
  active: boolean;
  workingDays: number[];   // 1=Mo, 2=Di, ..., 6=Sa
  workStart: string;       // "09:00"
  workEnd: string;         // "18:00"
}

export interface SalonColorFormula {
  id: string;
  clientId: string;
  date: string;            // YYYY-MM-DD
  staffId: string;
  staffName: string;
  brand: string;           // z.B. "Wella Koleston", "L'Oréal Majirel", "Schwarzkopf Igora"
  formula: string;         // z.B. "40g 8/1 + 20g 9/16 mit 6% Welloxon (1:1)"
  developmentMinutes: number; // Einwirkzeit in Minuten (z.B. 35)
  notes: string;           // z.B. "Ansatz 6%, Längen & Spitzen mit 1.9% glossed"
  createdAt: string;
}

export interface SalonClient {
  id: string;
  number: number;
  name: string;
  email: string;
  phone: string;
  birthday?: string;       // YYYY-MM-DD
  notes: string;           // Haareigenschaften, Vorlieben, Kaffee/Tee-Wunsch
  allergies?: string;      // z.B. PPD-Allergie, empfindliche Kopfhaut
  preferredStaffId?: string;
  createdAt: string;
  updatedAt: string;
  totalVisits?: number;
  totalSpentCents?: number;
  lastVisit?: string;
  formulas?: SalonColorFormula[];
}

export interface SalonAppointment {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  staffId: string;
  staffName: string;
  serviceIds: string[];
  serviceNames: string[];
  day: string;             // YYYY-MM-DD
  startTime: string;       // "10:30"
  endTime: string;         // "11:15"
  durationMinutes: number;
  totalCents: number;
  status: AppointmentStatus;
  notes: string;
  source: "salon" | "online";
  paid: boolean;
  billedInvoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalonSettings {
  salonName: string;
  slotIntervalMinutes: number; // 15 oder 30 Minuten
  openDays: number[];          // [1, 2, 3, 4, 5, 6]
  openTime: string;            // "09:00"
  closeTime: string;           // "19:00"
  onlineBookingEnabled: boolean;
  bookingAdvanceDays: number;  // Bis zu 60 Tage im Voraus
  cancellationHours: number;   // Stornierung bis 24h vor Termin
  noticeText: string;
}

export const DEFAULT_SALON_SETTINGS: SalonSettings = {
  salonName: "Salon & Beauty Studio",
  slotIntervalMinutes: 15,
  openDays: [1, 2, 3, 4, 5, 6],
  openTime: "08:30",
  closeTime: "18:30",
  onlineBookingEnabled: true,
  bookingAdvanceDays: 45,
  cancellationHours: 24,
  noticeText: "Bitte erscheinen Sie 5 Minuten vor Ihrem gebuchten Termin.",
};

/** Hilfsfunktion: Berechnet Endzeit anhand Startzeit und Dauer */
export function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

/** Hilfsfunktion: Konvertiert "HH:MM" in Minuten seit Mitternacht */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Prüft Kollision zweier Zeitspannen */
export function timeSlotsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const a1 = timeToMinutes(startA);
  const a2 = timeToMinutes(endA);
  const b1 = timeToMinutes(startB);
  const b2 = timeToMinutes(endB);
  return Math.max(a1, b1) < Math.min(a2, b2);
}

/** Heutiges (bzw. angegebenes) Datum als JJJJ-MM-TT in der Ortszeit des Geräts, nicht in UTC. */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
