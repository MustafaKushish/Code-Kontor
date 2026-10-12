// Buchhaltung: Mitarbeiter mit Lohndaten, Steuerberater und die Monatsmeldung für die Lohnabrechnung.
// Code Kontor rechnet keine Löhne aus; die Daten gehen an den Steuerberater, der die Abrechnung macht.

import { isValidIban, normalizeIban } from "./company";

export const EMPLOYMENT_TYPES = ["fullTime", "partTime", "miniJob", "trainee", "student", "freelance"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const TAX_CLASSES = ["", "1", "2", "3", "4", "5", "6"] as const;

export interface Employee {
  id: string;
  personnelNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  street: string;
  postalCode: string;
  city: string;
  employmentType: EmploymentType;
  startDate: string;
  endDate: string;
  weeklyHours: number;
  payType: "monthly" | "hourly";
  /** Bruttolohn in Euro (Monatsgehalt oder Stundenlohn) */
  payAmount: number;
  taxClass: (typeof TAX_CLASSES)[number];
  taxId: string;
  socialSecurityNumber: string;
  healthInsurance: string;
  iban: string;
  vacationDays: number;
  notes: string;
}

export interface Advisor {
  firm: string;
  contactName: string;
  email: string;
  phone: string;
  /** DATEV-Beraternummer */
  consultantNumber: string;
  /** DATEV-Mandantennummer */
  clientNumber: string;
  chartOfAccounts: "" | "SKR03" | "SKR04";
  notes: string;
}

export interface MonthEntry {
  employeeId: string;
  month: string;
  hours: number;
  overtimeHours: number;
  vacationDays: number;
  sickDays: number;
  bonus: number;
  note: string;
}

export const emptyEmployee: Omit<Employee, "id" | "personnelNumber"> = {
  firstName: "", lastName: "", email: "", phone: "", birthDate: "", street: "", postalCode: "", city: "",
  employmentType: "fullTime", startDate: "", endDate: "", weeklyHours: 40, payType: "monthly", payAmount: 0,
  taxClass: "", taxId: "", socialSecurityNumber: "", healthInsurance: "", iban: "", vacationDays: 24, notes: "",
};

export const emptyAdvisor: Advisor = { firm: "", contactName: "", email: "", phone: "", consultantNumber: "", clientNumber: "", chartOfAccounts: "", notes: "" };

/** Felder, die zusätzlich verschlüsselt gespeichert werden. */
export const SENSITIVE_EMPLOYEE_FIELDS = ["taxId", "socialSecurityNumber", "iban"] as const;

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, min = 0, max = 1_000_000) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n * 100) / 100, min), max) : 0;
};
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export function sanitizeEmployee(input: Record<string, unknown>): Omit<Employee, "id" | "personnelNumber"> {
  const type = EMPLOYMENT_TYPES.includes(input.employmentType as EmploymentType) ? (input.employmentType as EmploymentType) : "fullTime";
  const taxClass = TAX_CLASSES.includes(input.taxClass as never) ? (input.taxClass as Employee["taxClass"]) : "";
  return {
    firstName: str(input.firstName, 100),
    lastName: str(input.lastName, 100),
    email: str(input.email, 200).toLowerCase(),
    phone: str(input.phone, 50),
    birthDate: date(input.birthDate),
    street: str(input.street),
    postalCode: str(input.postalCode, 10),
    city: str(input.city, 100),
    employmentType: type,
    startDate: date(input.startDate),
    endDate: date(input.endDate),
    weeklyHours: num(input.weeklyHours, 0, 80),
    payType: input.payType === "hourly" ? "hourly" : "monthly",
    payAmount: num(input.payAmount, 0, 1_000_000),
    taxClass,
    taxId: str(input.taxId, 20).replace(/\s+/g, ""),
    socialSecurityNumber: str(input.socialSecurityNumber, 20).replace(/\s+/g, "").toUpperCase(),
    healthInsurance: str(input.healthInsurance, 100),
    iban: normalizeIban(str(input.iban, 40)),
    vacationDays: num(input.vacationDays, 0, 60),
    notes: str(input.notes, 2000),
  };
}

export type EmployeeErrorCode = "required" | "taxIdInvalid" | "ssnInvalid" | "ibanInvalid" | "emailInvalid" | "endBeforeStart";

export function validateEmployee(e: Omit<Employee, "id" | "personnelNumber">): Partial<Record<keyof Employee, EmployeeErrorCode>> {
  const errors: Partial<Record<keyof Employee, EmployeeErrorCode>> = {};
  if (!e.firstName) errors.firstName = "required";
  if (!e.lastName) errors.lastName = "required";
  if (!e.startDate) errors.startDate = "required";
  if (e.endDate && e.startDate && e.endDate < e.startDate) errors.endDate = "endBeforeStart";
  if (e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) errors.email = "emailInvalid";
  // Steuer-ID: 11 Ziffern
  if (e.taxId && !/^\d{11}$/.test(e.taxId)) errors.taxId = "taxIdInvalid";
  // Sozialversicherungsnummer: 2 Ziffern Bereich, 6 Ziffern Geburtsdatum, Buchstabe, 3 Ziffern
  if (e.socialSecurityNumber && !/^\d{8}[A-Z]\d{3}$/.test(e.socialSecurityNumber)) errors.socialSecurityNumber = "ssnInvalid";
  if (e.iban && !isValidIban(e.iban)) errors.iban = "ibanInvalid";
  return errors;
}

export function sanitizeAdvisor(input: Record<string, unknown>): Advisor {
  const chart = input.chartOfAccounts === "SKR03" || input.chartOfAccounts === "SKR04" ? input.chartOfAccounts : "";
  return {
    firm: str(input.firm),
    contactName: str(input.contactName, 100),
    email: str(input.email, 200).toLowerCase(),
    phone: str(input.phone, 50),
    consultantNumber: str(input.consultantNumber, 40).replace(/\D/g, "").slice(0, 7),
    clientNumber: str(input.clientNumber, 40).replace(/\D/g, "").slice(0, 5),
    chartOfAccounts: chart,
    notes: str(input.notes, 2000),
  };
}

export const isValidMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export function sanitizeMonthEntry(input: Record<string, unknown>, month: string): MonthEntry {
  return {
    employeeId: str(input.employeeId, 64),
    month,
    hours: num(input.hours, 0, 400),
    overtimeHours: num(input.overtimeHours, 0, 200),
    vacationDays: num(input.vacationDays, 0, 31),
    sickDays: num(input.sickDays, 0, 31),
    bonus: num(input.bonus, 0, 1_000_000),
    note: str(input.note, 500),
  };
}

/** Ist die Person im Monat beschäftigt (Eintritt vor Monatsende, Austritt nicht vor Monatsanfang)? */
export function employedInMonth(e: Pick<Employee, "startDate" | "endDate">, month: string): boolean {
  const first = `${month}-01`;
  const last = `${month}-31`;
  return !!e.startDate && e.startDate <= last && (!e.endDate || e.endDate >= first);
}

const TYPE_LABELS_DE: Record<EmploymentType, string> = {
  fullTime: "Vollzeit", partTime: "Teilzeit", miniJob: "Minijob", trainee: "Auszubildende/r", student: "Werkstudent/in", freelance: "Freie Mitarbeit",
};

const csvCell = (v: string | number) => {
  const s = typeof v === "number" ? v.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : v;
  // Formeln in Excel verhindern und Trennzeichen schützen
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Monatsmeldung als CSV (Semikolon, deutsche Zahlen, mit BOM für Excel). Spalten auf Deutsch für den Steuerberater. */
export function monthReportCsv(opts: { company: string; month: string; advisor: Advisor | null; employees: Employee[]; entries: MonthEntry[] }): string {
  const byId = new Map(opts.entries.map((e) => [e.employeeId, e]));
  const lines: (string | number)[][] = [
    ["Monatsmeldung Lohn", opts.month],
    ["Firma", opts.company],
    ["Beraternummer", opts.advisor?.consultantNumber ?? "", "Mandantennummer", opts.advisor?.clientNumber ?? ""],
    [],
    ["Personalnr.", "Nachname", "Vorname", "Beschäftigung", "Eintritt", "Austritt", "Std./Woche", "Lohnart", "Brutto (EUR)", "Steuerklasse",
      "Arbeitsstunden", "Überstunden", "Urlaubstage", "Krankheitstage", "Zuschlag/Prämie (EUR)", "Bemerkung"],
  ];
  for (const e of opts.employees) {
    const m = byId.get(e.id);
    lines.push([
      e.personnelNumber, e.lastName, e.firstName, TYPE_LABELS_DE[e.employmentType], e.startDate, e.endDate, e.weeklyHours,
      e.payType === "hourly" ? "Stundenlohn" : "Monatsgehalt", e.payAmount, e.taxClass,
      m?.hours ?? 0, m?.overtimeHours ?? 0, m?.vacationDays ?? 0, m?.sickDays ?? 0, m?.bonus ?? 0, m?.note ?? "",
    ]);
  }
  return "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
