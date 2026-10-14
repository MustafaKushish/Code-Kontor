import { describe, expect, it } from "vitest";
import { bucketKeys, bucketOf, comparisonRange, periodRange, previousRange, sanitizeRange, workTime } from "../shared/insights";
import type { TimeEntry } from "../shared/time";

describe("Auswertung: Zeiträume", () => {
  it("rechnet Tag, Woche (ab Montag), Monat und Jahr", () => {
    expect(periodRange("day", 0, "2026-10-14")).toEqual({ from: "2026-10-14", to: "2026-10-14" });
    expect(periodRange("day", -1, "2026-10-01")).toEqual({ from: "2026-09-30", to: "2026-09-30" });
    expect(periodRange("week", 0, "2026-10-14")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(periodRange("week", 0, "2026-10-18")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(periodRange("week", -1, "2026-10-14")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(periodRange("month", 0, "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("month", -2, "2026-01-31")).toEqual({ from: "2025-11-01", to: "2025-11-30" });
    expect(periodRange("year", -1, "2026-10-14")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });

  it("vergleicht ganze Monate mit dem Monat davor, sonst gleich viele Tage", () => {
    expect(previousRange({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousRange({ from: "2026-01-01", to: "2026-12-31" })).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(previousRange({ from: "2026-10-12", to: "2026-10-18" })).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(previousRange({ from: "2026-10-14", to: "2026-10-14" })).toEqual({ from: "2026-10-13", to: "2026-10-13" });
  });

  it("vergleicht einen laufenden Zeitraum nur bis zum selben Tag", () => {
    expect(comparisonRange({ from: "2026-10-01", to: "2026-10-31" }, "2026-10-14")).toEqual({ from: "2026-09-01", to: "2026-09-14" });
    expect(comparisonRange({ from: "2026-03-01", to: "2026-03-31" }, "2026-03-31")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(comparisonRange({ from: "2026-09-01", to: "2026-09-30" }, "2026-10-14")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(comparisonRange({ from: "2026-10-12", to: "2026-10-18" }, "2026-10-14")).toEqual({ from: "2026-10-05", to: "2026-10-07" });
  });

  it("wählt die Zeitachse und füllt Lücken", () => {
    expect(bucketOf({ from: "2026-10-14", to: "2026-10-14" })).toBe("hour");
    expect(bucketOf({ from: "2026-10-01", to: "2026-10-31" })).toBe("day");
    expect(bucketOf({ from: "2026-01-01", to: "2026-12-31" })).toBe("month");
    expect(bucketKeys({ from: "2026-10-14", to: "2026-10-14" }, "hour")).toHaveLength(24);
    expect(bucketKeys({ from: "2026-02-01", to: "2026-02-28" }, "day")).toHaveLength(28);
    expect(bucketKeys({ from: "2026-01-01", to: "2026-12-31" }, "month")).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`));
  });

  it("prüft die Anfrage", () => {
    expect(sanitizeRange({}, "2026-10-14")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(sanitizeRange({ from: "2026-10-01", to: "2026-10-07" }, "2026-10-14")).toEqual({ from: "2026-10-01", to: "2026-10-07" });
    expect(sanitizeRange({ from: "2026-10-07", to: "2026-10-01" }, "2026-10-14")).toBeNull();
    expect(sanitizeRange({ from: "2026-02-30", to: "2026-03-01" }, "2026-10-14")).toBeNull();
    expect(sanitizeRange({ from: "2024-01-01", to: "2026-01-01" }, "2026-10-14")).toBeNull();
    expect(sanitizeRange({ from: "x'; DROP", to: "2026-01-01" }, "2026-10-14")).toBeNull();
  });
});

describe("Auswertung: Arbeitszeit", () => {
  const stamp = (employeeId: string, kind: "in" | "out", at: string): TimeEntry => ({ id: `${employeeId}${at}`, employeeId, kind, at, source: "app", note: "" });

  it("zählt Schichten im Zeitraum je Person und wer gerade da ist", () => {
    const now = new Date("2026-10-14T12:00:00Z");
    const entries = [
      stamp("a", "in", "2026-10-13T07:00:00Z"), stamp("a", "out", "2026-10-13T15:30:00Z"),
      stamp("b", "in", "2026-10-13T08:00:00Z"), stamp("b", "out", "2026-10-13T12:00:00Z"),
      stamp("a", "in", "2026-10-14T07:00:00Z"),
      // Schicht am Tag davor zählt nicht
      stamp("b", "in", "2026-10-12T08:00:00Z"), stamp("b", "out", "2026-10-12T10:00:00Z"),
    ];
    expect(workTime(entries, { from: "2026-10-13", to: "2026-10-13" }, now)).toEqual({ minutes: 750, people: 2, present: 1 });
    expect(workTime(entries, { from: "2026-10-13", to: "2026-10-14" }, now).minutes).toBe(750 + 300);
  });
});
