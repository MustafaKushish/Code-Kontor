import { describe, expect, it } from "vitest";
import {
  computeDays, computeYear, formatMinutes, holidays, localDay, monthTotals, nextStampKind, requiredBreakMinutes,
  sanitizeAbsence, sanitizeRequest, vacationEntitlement, type Absence, type TimeEntry, type WorkProfile,
} from "../shared/time";

const profile: WorkProfile = {
  id: "e1", startDate: "2025-01-01", endDate: "", weeklyHours: 40, workDays: [1, 2, 3, 4, 5],
  vacationDays: 30, openingBalance: 0, vacationCarryover: 0,
};
let n = 0;
const stamp = (kind: "in" | "out", at: string): TimeEntry => ({ id: String(++n), employeeId: "e1", kind, at, source: "terminal", note: "" });
const absence = (type: Absence["type"], from: string, to = from, halfDay = false): Absence => ({ id: String(++n), employeeId: "e1", type, from, to, halfDay, note: "" });

describe("Feiertage", () => {
  it("berechnet Ostern-abhängige Feiertage", () => {
    const h = holidays(2026);
    expect(h.get("2026-04-03")).toBe("Karfreitag");
    expect(h.get("2026-04-06")).toBe("Ostermontag");
    expect(h.get("2026-05-14")).toBe("Christi Himmelfahrt");
    expect(h.get("2026-05-25")).toBe("Pfingstmontag");
  });
  it("kennt Feiertage je Bundesland", () => {
    expect(holidays(2026, "BY").has("2026-06-04")).toBe(true); // Fronleichnam
    expect(holidays(2026, "NI").has("2026-06-04")).toBe(false);
    expect(holidays(2026, "NI").has("2026-10-31")).toBe(true); // Reformationstag
    expect(holidays(2026, "SN").get("2026-11-18")).toBe("Buß- und Bettag");
    expect(holidays(2026).has("2026-01-06")).toBe(false);
  });
});

describe("Pausen", () => {
  it("folgt dem Arbeitszeitgesetz", () => {
    expect(requiredBreakMinutes(6 * 60)).toBe(0);
    expect(requiredBreakMinutes(6 * 60 + 1)).toBe(30);
    expect(requiredBreakMinutes(9 * 60 + 1)).toBe(45);
  });
});

describe("Tage", () => {
  const settings = { state: "" as const, since: "" };
  it("zieht die Pause automatisch ab, wenn durchgestempelt wurde", () => {
    // 8 bis 17 Uhr Berlin (Sommerzeit: UTC+2) = 9 Stunden brutto
    const [day] = computeDays(profile, [stamp("in", "2026-06-15T06:00:00Z"), stamp("out", "2026-06-15T15:00:00Z")], [], { from: "2026-06-15", to: "2026-06-15" }, settings);
    expect(day!.target).toBe(8 * 60);
    expect(day!.autoBreak).toBe(30);
    expect(day!.worked).toBe(8 * 60 + 30);
    expect(day!.sessions[0]).toMatchObject({ from: "08:00", to: "17:00" });
  });
  it("rechnet gestempelte Pausen an", () => {
    const entries = [
      stamp("in", "2026-06-16T06:00:00Z"), stamp("out", "2026-06-16T10:00:00Z"),
      stamp("in", "2026-06-16T10:30:00Z"), stamp("out", "2026-06-16T15:00:00Z"),
    ];
    const [day] = computeDays(profile, entries, [], { from: "2026-06-16", to: "2026-06-16" }, settings);
    expect(day!.autoBreak).toBe(0);
    expect(day!.worked).toBe(8 * 60 + 30);
  });
  it("zählt eine Nachtschicht zum Tag des Beginns", () => {
    const days = computeDays(profile, [stamp("in", "2026-06-16T20:00:00Z"), stamp("out", "2026-06-17T04:00:00Z")], [], { from: "2026-06-16", to: "2026-06-17" }, settings);
    expect(days[0]!.worked).toBe(8 * 60 - 30);
    expect(days[1]!.worked).toBe(0);
  });
  it("markiert vergessenes Gehen als unvollständig", () => {
    const [day] = computeDays(profile, [stamp("in", "2026-06-15T06:00:00Z")], [], { from: "2026-06-15", to: "2026-06-15" }, settings, new Date("2026-06-20T00:00:00Z"));
    expect(day!.incomplete).toBe(true);
    expect(day!.worked).toBe(0);
  });
  it("hat an Feiertagen und Wochenenden kein Soll", () => {
    const days = computeDays(profile, [], [], { from: "2026-12-25", to: "2026-12-27" }, settings);
    expect(days.map((d) => d.target)).toEqual([0, 0, 0]);
    expect(days[0]!.holiday).toBe("1. Weihnachtstag");
  });
  it("schreibt Urlaub und Krankheit mit dem Tagessoll gut, Freizeitausgleich nicht", () => {
    const days = computeDays(profile, [], [absence("vacation", "2026-06-15"), absence("sick", "2026-06-16"), absence("compensation", "2026-06-17"), absence("vacation", "2026-06-18", "2026-06-18", true)], { from: "2026-06-15", to: "2026-06-18" }, settings);
    expect(days.map((d) => d.credited)).toEqual([480, 480, 0, 240]);
    expect(days.map((d) => d.target)).toEqual([480, 480, 480, 480]);
  });
  it("teilt das Soll auf die Arbeitstage auf", () => {
    const part = { ...profile, weeklyHours: 20, workDays: [1, 3] };
    const days = computeDays(part, [], [], { from: "2026-06-15", to: "2026-06-17" }, settings);
    expect(days.map((d) => d.target)).toEqual([600, 0, 600]);
  });
});

describe("Jahreskonto", () => {
  const settings = { state: "" as const, since: "" };
  it("rechnet Soll, Ist, Saldo und Urlaub bis heute", () => {
    const now = new Date("2026-01-09T12:00:00Z");
    const entries = [
      stamp("in", "2026-01-05T07:00:00Z"), stamp("out", "2026-01-05T17:00:00Z"), // 10 h brutto, 45 Min Pause
    ];
    const account = computeYear({ ...profile, openingBalance: 2, vacationCarryover: 3 }, entries, [absence("vacation", "2026-01-06", "2026-01-07"), absence("vacation", "2026-03-02")], 2026, settings, now);
    // 2.–8. Januar: 5 Arbeitstage (1.1. Feiertag, 3./4. Wochenende); der 9. läuft noch
    expect(account.target).toBe(5 * 480);
    expect(account.actual).toBe(555 + 2 * 480);
    expect(account.balance).toBe(555 + 2 * 480 - 5 * 480);
    expect(account.balanceTotal).toBe(account.balance + 120);
    expect(account.vacationEntitlement).toBe(33);
    expect(account.vacationTaken).toBe(2);
    expect(account.vacationPlanned).toBe(1);
    expect(account.vacationLeft).toBe(30);
  });
  it("zählt den laufenden Tag erst, wenn sein Soll erreicht ist", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    expect(computeYear({ ...profile, startDate: "2026-06-15" }, [stamp("in", "2026-06-15T06:00:00Z")], [], 2026, settings, now).balance).toBe(0);
    const later = new Date("2026-06-15T16:00:00Z");
    expect(computeYear({ ...profile, startDate: "2026-06-15" }, [stamp("in", "2026-06-15T06:00:00Z")], [], 2026, settings, later).balance).toBe(75);
  });
  it("zählt das Soll erst ab Start der Zeiterfassung", () => {
    const account = computeYear(profile, [], [], 2026, { state: "", since: "2026-01-08" }, new Date("2026-01-09T12:00:00Z"));
    expect(account.target).toBe(480);
  });
  it("gibt anteiligen Urlaub bei Eintritt im Jahr", () => {
    expect(vacationEntitlement({ startDate: "2026-07-01", endDate: "", vacationDays: 30 }, 2026)).toBe(15);
    expect(vacationEntitlement({ startDate: "2026-07-15", endDate: "", vacationDays: 30 }, 2026)).toBe(12.5);
    expect(vacationEntitlement({ startDate: "2020-01-01", endDate: "2026-03-31", vacationDays: 24 }, 2026)).toBe(6);
  });
});

describe("Stempeln", () => {
  it("wechselt zwischen Kommen und Gehen", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(nextStampKind(null, now)).toBe("in");
    expect(nextStampKind({ kind: "in", at: "2026-06-15T06:00:00Z" }, now)).toBe("out");
    expect(nextStampKind({ kind: "out", at: "2026-06-15T10:00:00Z" }, now)).toBe("in");
    // Kommen von gestern ohne Gehen gilt als vergessen
    expect(nextStampKind({ kind: "in", at: "2026-06-14T06:00:00Z" }, now)).toBe("in");
  });
  it("nimmt den Kalendertag in deutscher Zeit", () => {
    expect(localDay("2026-06-15T22:30:00Z")).toBe("2026-06-16");
    expect(localDay("2026-01-15T22:30:00Z")).toBe("2026-01-15");
  });
});

describe("Hilfen", () => {
  it("fasst einen Monat für die Lohnmeldung zusammen", () => {
    const days = computeDays(profile, [stamp("in", "2026-06-15T06:00:00Z"), stamp("out", "2026-06-15T16:00:00Z")], [absence("sick", "2026-06-16")], { from: "2026-06-15", to: "2026-06-16" }, { state: "", since: "" });
    expect(monthTotals(days)).toEqual({ hours: 9.25, overtimeHours: 1.25, vacationDays: 0, sickDays: 1 });
  });
  it("prüft Abwesenheiten", () => {
    expect(sanitizeAbsence({ type: "holiday", from: "2026-01-01" })).toBeNull();
    expect(sanitizeAbsence({ employeeId: "e1", type: "vacation", from: "2026-01-05", to: "2026-01-01", halfDay: true })).toMatchObject({ to: "2026-01-05", halfDay: true });
    expect(sanitizeAbsence({ employeeId: "e1", type: "vacation", from: "2026-01-05", to: "2026-01-09", halfDay: true })).toMatchObject({ halfDay: false });
  });
  it("zeigt Minuten als Stunden", () => {
    expect(formatMinutes(450)).toBe("7:30");
    expect(formatMinutes(-75)).toBe("−1:15");
  });
});

describe("Anträge", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  it("nimmt vergessene Stempel aus der Vergangenheit an", () => {
    expect(sanitizeRequest({ type: "stamp", kind: "out", at: "2026-10-12T15:00:00.000Z", note: "Vergessen" }, now)).toEqual({
      data: { type: "stamp", kind: "out", at: "2026-10-12T15:00:00.000Z" }, note: "Vergessen",
    });
  });
  it("lehnt Stempel in der Zukunft oder zu weit zurück ab", () => {
    expect(sanitizeRequest({ type: "stamp", kind: "in", at: "2026-10-14T08:00:00Z" }, now)).toBeNull();
    expect(sanitizeRequest({ type: "stamp", kind: "in", at: "2026-06-01T08:00:00Z" }, now)).toBeNull();
    expect(sanitizeRequest({ type: "stamp", kind: "pause", at: "2026-10-12T08:00:00Z" }, now)).toBeNull();
  });
  it("nimmt Urlaubsanträge an", () => {
    expect(sanitizeRequest({ type: "absence", absence: "vacation", from: "2026-11-02", to: "2026-11-06" }, now)).toEqual({
      data: { type: "absence", absence: "vacation", from: "2026-11-02", to: "2026-11-06", halfDay: false }, note: "",
    });
    expect(sanitizeRequest({ type: "absence", absence: "party", from: "2026-11-02" }, now)).toBeNull();
    expect(sanitizeRequest({ type: "other" }, now)).toBeNull();
  });
});
