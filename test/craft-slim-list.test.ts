import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { CRAFT_MIGRATIONS, CraftStore } from "../worker/craft/store";
import { craftGrossShares, craftVatTotals } from "../shared/craft";

// Rapport-Liste ohne Unterschriftsbilder; Einzelabruf mit Bild. Steuer je Satz.

function memorySql(migrations: string[]) {
  const db = new DatabaseSync(":memory:");
  for (const step of migrations) db.exec(step);
  return {
    exec(query: string, ...params: (string | number | null)[]) {
      const stmt = db.prepare(query);
      if (/^\s*(SELECT|WITH)/i.test(query)) {
        const rows = stmt.all(...params) as Record<string, unknown>[];
        return { toArray: () => rows, one: () => rows[0], raw: () => rows.map((r) => Object.values(r)) };
      }
      const res = stmt.run(...params);
      return { rowsWritten: Number(res.changes), toArray: () => [], one: () => ({}), raw: () => [] };
    },
  } as unknown as SqlStorage;
}

describe("Handwerk: schlanke Rapport-Liste", () => {
  it("liefert in der Liste kein Unterschriftsbild, nur hasSignature; der Einzelabruf hat das Bild", () => {
    const s = new CraftStore(memorySql(CRAFT_MIGRATIONS));
    const p = s.saveProject({ title: "Bad", customerName: "A", siteAddress: "B" });
    const base = { projectId: p.id, date: "2026-10-17", workerName: "Tom", hoursWorked: 1, workDescription: "x" };
    const signed = s.createReport(base);
    const draft = s.createReport(base);
    const image = "data:image/png;base64,AAAA";
    s.signReport(signed.id, image, "Kunde");

    for (const list of [s.listReports(), s.listReports(p.id)]) {
      const a = list.find((r) => r.id === signed.id)!;
      const b = list.find((r) => r.id === draft.id)!;
      expect(a.signatureDataUrl).toBeUndefined();
      expect(a.hasSignature).toBe(true);
      expect(a.signedByName).toBe("Kunde");
      expect(b.hasSignature).toBe(false);
      expect(JSON.stringify(list)).not.toContain("base64");
    }
    expect(s.getReport(signed.id)).toMatchObject({ signatureDataUrl: image, hasSignature: true });
  });
});

describe("Handwerk: Steuer je Satz", () => {
  it("summiert Netto und Steuer je Satz und Brutto der Lohn- und Materialanteile", () => {
    const items = [
      { id: "a", type: "lohn" as const, name: "Arbeit", quantity: 2, unit: "Std." as const, unitPriceNet: 50, totalNet: 100, taxRate: 19 },
      { id: "b", type: "material" as const, name: "Fliesen", quantity: 1, unit: "Psch." as const, unitPriceNet: 100, totalNet: 100, taxRate: 7 },
      { id: "c", type: "fahrt" as const, name: "Fahrt", quantity: 10, unit: "km" as const, unitPriceNet: 1, totalNet: 10, taxRate: 19 },
    ];
    expect(craftVatTotals(items)).toEqual([
      { rate: 19, net: 110, tax: 20.9 },
      { rate: 7, net: 100, tax: 7 },
    ]);
    expect(craftGrossShares(items)).toEqual({ wageGross: 130.9, materialGross: 107 });
  });
});
