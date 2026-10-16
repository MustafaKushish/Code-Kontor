// Gemeinsame Typen und Hilfsfunktionen für das Modul „Einzelhandel“ (einzelhandel)

export const RETAIL_APP_ID = "einzelhandel";

export type ProductUnit = "Stk" | "kg" | "g" | "l" | "ml" | "m" | "Pck" | "Set";

export type ProductCategory =
  | "lebensmittel"   // Lebensmittel & Feinkost
  | "getraenke"      // Getränke & Weine
  | "drogerie"       // Kosmetik, Drogerie & Pflege
  | "mode"           // Kleidung, Accessoires & Schuhe
  | "schreibwaren"   // Papeterie, Bücher & Bürobedarf
  | "wohnen"         // Deko, Haushalt & Geschenke
  | "elektronik"     // Zubehör & Elektronik
  | "sonstiges";     // Sonstige Artikel

export interface RetailProduct {
  id: string;
  number: number;              // z.B. 1001
  ean: string;                 // Barcode / EAN-13 oder intern
  name: string;
  category: ProductCategory;
  brand: string;
  supplierId?: string;
  supplierName?: string;
  supplierArticleNo?: string;
  purchasePriceCents: number;  // Netto-Einkaufspreis
  sellingPriceCents: number;   // Brutto-Verkaufspreis
  vatRate: number;             // 19 oder 7 %
  stockQty: number;            // Ist-Bestand
  minStockQty: number;         // Mindestbestand (Meldebestand)
  unit: ProductUnit;
  location?: string;           // Regal / Lagerplatz (z.B. A-02-3)
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RetailSupplier {
  id: string;
  number: number;              // z.B. 5001
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  vatId?: string;
  paymentTermsDays: number;    // Zahlungsziel in Tagen
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus =
  | "draft"              // Entwurf
  | "ordered"            // Bestellt beim Lieferanten
  | "partially_received" // Teilgeliefert
  | "received"           // Vollständig eingebucht
  | "canceled";          // Storniert

export interface RetailOrderItem {
  productId: string;
  name: string;
  ean: string;
  qtyOrdered: number;
  qtyReceived: number;
  purchasePriceCents: number;
}

export interface RetailPurchaseOrder {
  id: string;
  number: number;              // z.B. 3001
  supplierId: string;
  supplierName: string;
  supplierEmail?: string;
  date: string;                // YYYY-MM-DD
  expectedDeliveryDate?: string;
  status: OrderStatus;
  items: RetailOrderItem[];
  totalCents: number;
  notes: string;
  receivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type MovementReason =
  | "purchase"    // Wareneingang
  | "sale"        // Verkauf über Kasse
  | "correction"  // Inventur / Manuelle Korrektur
  | "loss"        // Bruch / Verderb / Diebstahl
  | "return";     // Kundenrückgabe

export interface RetailStockMovement {
  id: string;
  productId: string;
  productName: string;
  deltaQty: number;            // z.B. +10 oder -2
  previousQty: number;
  newQty: number;
  reason: MovementReason;
  referenceId?: string;        // Bestell-ID oder Kassenbeleg-ID
  note?: string;
  createdAt: string;
  createdByName?: string;
}

export interface RetailSettings {
  storeName: string;
  defaultVatRate: number;      // 19%
  lowStockAlert: boolean;      // Benachrichtigung bei Mindestbestand
  barcodePrefix: string;       // z.B. "200" für interne EANs
}

export const DEFAULT_RETAIL_SETTINGS: RetailSettings = {
  storeName: "Einzelhandel & Concept Store",
  defaultVatRate: 19,
  lowStockAlert: true,
  barcodePrefix: "200",
};

/**
 * Berechnet Rohertrag / Marge in Prozent:
 * ((Verkaufspreis Netto - Einkaufspreis Netto) / Verkaufspreis Netto) * 100
 */
export function calculateMarginPercent(purchasePriceCents: number, sellingPriceCents: number, vatRate: number): number {
  const sellingNettoCents = sellingPriceCents / (1 + vatRate / 100);
  if (sellingNettoCents <= 0) return 0;
  const marginCents = sellingNettoCents - purchasePriceCents;
  return Math.round((marginCents / sellingNettoCents) * 1000) / 10;
}

/** Generiert eine interne 13-stellige Pseudo-EAN mit Prüfziffer */
export function generateInternalEan(prefix = "200", seedNum = 1001): string {
  const base = `${prefix}${String(seedNum).padStart(9, "0")}`;
  // EAN-13 Prüfziffer-Berechnung
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(base[i], 10) || 0;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${base}${checkDigit}`;
}
