// Datenmodelle für das Fitnessstudio- & Kurs-Modul in Code Kontor

export type MemberStatus = "aktiv" | "pausiert" | "gekuendigt" | "gesperrt";

export type Weekday = "Montag" | "Dienstag" | "Mittwoch" | "Donnerstag" | "Freitag" | "Samstag" | "Sonntag";

export interface FitnessPlan {
  id: string;
  name: string; // z.B. "All-Inclusive", "Basic", "10er-Karte", "Student"
  priceMonthly: number; // in Euro
  admissionFee: number; // Aufnahmegebühr einmalig
  durationMonths: number; // z.B. 12 oder 24 Monate
  includesSauna: boolean;
  includesCourses: boolean;
  includesDrinks: boolean;
  isPass10: boolean; // 10er Karte
  active: boolean;
}

export interface FitnessMember {
  id: string;
  memberNumber: string; // z.B. "M-1042"
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  birthDate?: string;
  planId: string;
  planName: string;
  monthlyFee: number;
  status: MemberStatus;
  joinDate: string;
  validUntil?: string;
  checkInsCount: number;
  remainingUnits?: number; // für 10er-Karten
  notes?: string;
  emergencyContact?: string;
  iban?: string;
  createdAt: string;
}

export interface FitnessCheckIn {
  id: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  planName: string;
  checkedInAt: string;
  checkedOutAt?: string;
  status: "anwesend" | "verlassen";
}

export interface FitnessClass {
  id: string;
  name: string; // z.B. "Vinyasa Yoga", "Indoor Cycling / Spinning", "HIIT Power", "Pilates"
  coachName: string;
  weekday: Weekday;
  startTime: string; // z.B. "18:00"
  endTime: string; // z.B. "19:00"
  room: string; // z.B. "Kursraum 1", "Spinning-Box", "Open Mat"
  maxParticipants: number;
  bookedMemberIds: string[];
  /** Termin (YYYY-MM-DD), für den die Buchungen gelten: der nächste Kurstag */
  bookingsFor?: string;
  attendedMemberIds?: string[];
  description?: string;
}

export interface FitnessStats {
  activeMembersCount: number;
  totalMembersCount: number;
  checkedInNowCount: number;
  maxCapacity: number;
  classesTodayCount: number;
  monthlyRevenueGross: number;
  visitsTodayCount: number;
}

export interface FitnessCheckInResult {
  success: boolean;
  member?: FitnessMember;
  checkIn?: FitnessCheckIn;
  message: string;
  /** Meldung als Code für die Übersetzung (checkinMsg.*), `message` bleibt die deutsche Fassung. */
  code?: string;
  vars?: Record<string, string | number>;
  alertLevel: "success" | "warning" | "error";
  remainingUnits?: number;
}
