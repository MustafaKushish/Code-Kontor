import { describe, expect, it } from "vitest";
import {
  emptyEmployee, employedInMonth, isValidMonth, monthReportCsv, sanitizeAdvisor, sanitizeEmployee, sanitizeMonthEntry, validateEmployee,
  type Employee,
} from "../shared/accounting";

const base = { ...emptyEmployee, firstName: "Anna", lastName: "Berg", startDate: "2026-01-15" };

describe("Mitarbeiter", () => {
  it("bereinigt Eingaben und erzwingt gültige Werte", () => {
    const e = sanitizeEmployee({ firstName: "  Anna ", employmentType: "boss", payType: "x", payAmount: "2.500,5".replace(".", ""), weeklyHours: 900, socialSecurityNumber: "12 345678 a 123", taxId: "12 345 678 901" });
    expect(e.firstName).toBe("Anna");
    expect(e.employmentType).toBe("fullTime");
    expect(e.payType).toBe("monthly");
    expect(e.payAmount).toBe(2500.5);
    expect(e.weeklyHours).toBeLessThanOrEqual(80);
    expect(e.socialSecurityNumber).toBe("12345678A123");
    expect(e.taxId).toBe("12345678901");
  });

  it("prüft Pflichtfelder und Formate", () => {
    expect(validateEmployee(base)).toEqual({});
    expect(validateEmployee({ ...emptyEmployee })).toMatchObject({ firstName: "required", lastName: "required", startDate: "required" });
    expect(validateEmployee({ ...base, taxId: "123" }).taxId).toBe("taxIdInvalid");
    expect(validateEmployee({ ...base, socialSecurityNumber: "12345678123" }).socialSecurityNumber).toBe("ssnInvalid");
    expect(validateEmployee({ ...base, iban: "DE00123" }).iban).toBe("ibanInvalid");
    expect(validateEmployee({ ...base, endDate: "2025-12-31" }).endDate).toBe("endBeforeStart");
  });

  it("weiß, wer in einem Monat beschäftigt ist", () => {
    expect(employedInMonth(base, "2026-01")).toBe(true);
    expect(employedInMonth(base, "2025-12")).toBe(false);
    expect(employedInMonth({ ...base, endDate: "2026-03-01" }, "2026-03")).toBe(true);
    expect(employedInMonth({ ...base, endDate: "2026-03-01" }, "2026-04")).toBe(false);
  });
});

describe("Monatsmeldung", () => {
  it("akzeptiert nur echte Monate", () => {
    expect(isValidMonth("2026-10")).toBe(true);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("../x")).toBe(false);
  });

  it("begrenzt Werte in der Monatszeile", () => {
    const m = sanitizeMonthEntry({ employeeId: "a", hours: "160,5", sickDays: 99, bonus: -5 }, "2026-10");
    expect(m).toMatchObject({ employeeId: "a", month: "2026-10", hours: 160.5, sickDays: 31, bonus: 0 });
  });

  it("baut eine CSV für den Steuerberater ohne Formel-Einschleusung", () => {
    const employee: Employee = { ...base, id: "a", personnelNumber: "1001", lastName: "=HYPERLINK(1)", payAmount: 2500.5 };
    const csv = monthReportCsv({
      company: "Salon; Berg",
      month: "2026-10",
      advisor: sanitizeAdvisor({ consultantNumber: "12a34567", clientNumber: "00012" }),
      employees: [employee],
      entries: [{ employeeId: "a", month: "2026-10", hours: 160.5, overtimeHours: 2, vacationDays: 1, sickDays: 0, bonus: 0, note: "ok" }],
    });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Salon; Berg"');
    expect(csv).toContain("Beraternummer;1234567;Mandantennummer;00012");
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("2.500,5");
    expect(csv).toContain("160,5");
  });
});
