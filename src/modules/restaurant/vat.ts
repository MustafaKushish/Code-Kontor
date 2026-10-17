import { computeTotals } from "../../../shared/pos";
import type { OrderItem } from "../../../shared/restaurant";

/**
 * Netto, Steuer je Satz und Brutto aus den Positionen (Beträge in Euro), wie die Kasse rechnet:
 * die Steuer wird je Satz aus der Bruttosumme herausgerechnet, egal welche Sätze vorkommen.
 */
export function vatSummary(items: Pick<OrderItem, "quantity" | "unitPriceGross" | "taxRate">[]) {
  const totals = computeTotals(
    items.map((i) => ({ qty: i.quantity, unitCents: Math.round(i.unitPriceGross * 100), vatRate: Number(i.taxRate) || 0 })),
  );
  return {
    gross: totals.grossCents / 100,
    net: totals.netCents / 100,
    vat: totals.vat.filter((v) => v.vatCents > 0).map((v) => ({ rate: v.rate, amount: v.vatCents / 100 })),
  };
}
