import { describe, expect, it } from "vitest";
import { adviceFor, industryOf, nextMonthOf, seasonOf } from "../shared/advice";
import type { Insights } from "../shared/insights";

const base: Insights = {
  from: "2026-10-01", to: "2026-10-31", bucket: "day",
  sales: {
    revenueCents: 253180, receipts: 52, cancels: 3, cancelCents: 11850,
    byMethod: { cash: 109980, card: 143200, transfer: 0, voucher: 0 },
    series: [], hours: Array.from({ length: 24 }, (_, h) => (h === 9 ? 2000 : h > 9 && h <= 18 ? h * 1000 : 0)),
    groups: [{ group: "Zubehör", cents: 117110, qty: 69 }], articles: [{ name: "Panzerglas", group: "Zubehör", cents: 41720, qty: 28 }],
    sources: [],
  },
  previous: { from: "2026-09-01", to: "2026-09-14", revenueCents: 300000, receipts: 60 },
  repairs: { open: 3, waiting: 1, pickup: 2, received: 7, pickedUp: 5 },
  time: { minutes: 12270, people: 3, present: 2 },
};

describe("Vorschläge zur Auswertung", () => {
  it("erkennt Branche, Saison und den nächsten Monat", () => {
    expect(industryOf(["kasse", "handy-it"])).toBe("handy");
    expect(industryOf(["friseur"])).toBe("salon");
    expect(industryOf(["autohaus"])).toBe("workshop");
    expect(industryOf([])).toBe("shop");
    expect(nextMonthOf("2026-10-14")).toBe("2026-11");
    expect(nextMonthOf("2026-12-31")).toBe("2027-01");
    expect(seasonOf(11)).toBe("christmas");
    expect(seasonOf(1)).toBe("newYear");
    expect(seasonOf(7)).toBe("summer");
  });

  it("nennt Probleme zuerst und endet mit der Saison", () => {
    const tips = adviceFor(base, ["handy-it"], "2026-10-14", 20);
    expect(tips.map((t) => t.id)).toEqual(["revenueDown", "waiting", "pickup", "cancels", "basket", "quietHours", "topGroup", "bestseller", "productivity", "season"]);
    expect(tips[0]!.vars).toEqual({ changePct: 16, beforeCents: 300000 });
    expect(tips.find((t) => t.id === "basket")!.vars).toMatchObject({ avgCents: 4869, targetCents: 5356, industry: "handy" });
    expect(tips.find((t) => t.id === "quietHours")!.vars).toMatchObject({ peak: 18, quiet: 9 });
    expect(tips.at(-1)!.vars).toEqual({ month: "2026-11", season: "christmas" });
  });

  it("begrenzt die Anzahl, die Saison bleibt", () => {
    const tips = adviceFor(base, [], "2026-10-14");
    expect(tips).toHaveLength(7);
    expect(tips.at(-1)!.id).toBe("season");
  });

  it("lobt Wachstum und hilft ohne Daten", () => {
    const up = adviceFor({ ...base, previous: { ...base.previous, revenueCents: 200000 }, repairs: null }, [], "2026-10-14", 20);
    expect(up.map((t) => t.id)).toContain("revenueUp");
    expect(up.map((t) => t.id)).not.toContain("revenueDown");
    const empty = adviceFor({ ...base, sales: { ...base.sales, revenueCents: 0, receipts: 0, cancels: 0 } }, [], "2026-10-14");
    expect(empty.map((t) => t.id)).toEqual(["empty", "season"]);
  });
});
