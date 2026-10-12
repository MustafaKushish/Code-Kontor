import { describe, expect, it } from "vitest";
import { CATALOG, findApp } from "../shared/apps";

describe("App-Katalog", () => {
  it("hat eindeutige IDs, die in Adressen funktionieren", () => {
    const ids = CATALOG.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
  it("findet Systeme nach ID", () => {
    expect(findApp("friseur")?.name).toBe("Friseur & Kosmetik");
    expect(findApp("gibt-es-nicht")).toBeUndefined();
  });
});
