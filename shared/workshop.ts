// Datenmodelle für das Kfz-Werkstatt-Modul in Code Kontor

export type WorkshopOrderStatus =
  | "annahme" // Neu angenommen, Hebebühne zugewiesen
  | "diagnose" // Fehlerdiagnose läuft / Teile werden ermittelt
  | "wartet_teile" // Ersatzteile bestellt / Warten auf Lieferung
  | "in_arbeit" // Reparatur/Inspektion aktiv auf der Hebebühne
  | "endkontrolle" // Probefahrt & Meisterabnahme
  | "abholbereit" // Fertiggestellt, Kunde benachrichtigt
  | "abgerechnet"; // Bezahlt oder Rechnung erstellt

export type EstimateStatus = "draft" | "sent" | "approved" | "rejected";

export type PositionType = "labor" | "part" | "external"; // Arbeitswert (AW/Std), Ersatzteil, Fremdleistung (z.B. Lackierer, TÜV-Gebühr)

export interface OrderPosition {
  id: string;
  type: PositionType;
  code?: string; // z.B. AW-Nummer oder Teilenummer
  name: string;
  quantity: number;
  unit: "AW" | "Std" | "Stück" | "Liter" | "Satz" | "Pauschal";
  unitPriceNet: number; // in Euro
  taxRate: number; // z.B. 19 oder 0
  discountPercent?: number;
  approvedByCustomer?: boolean; // relevant für Kostenvoranschläge
}

export interface InspectionItem {
  id: string;
  category: "bremsen" | "reifen" | "motor_abgas" | "fahrwerk" | "beleuchtung" | "fluessigkeiten" | "karosserie";
  name: string;
  status: "ok" | "warning" | "defect" | "not_checked";
  note?: string;
  value?: string; // z.B. "4.5 mm" oder "-30 °C"
}

export interface Vehicle {
  id: string;
  licensePlate: string; // z.B. "HH-WM 2024"
  vin: string; // Fahrgestellnummer (17-stellig)
  brand: string; // z.B. "Volkswagen"
  model: string; // z.B. "Golf VII Variant 2.0 TDI"
  year: number; // z.B. 2018
  mileage: number; // z.B. 142500
  hsn?: string; // z.B. "0603"
  tsn?: string; // z.B. "BPY"
  fuelType: "Benzin" | "Diesel" | "Hybrid" | "Elektro" | "LPG";
  transmission: "Schaltgetriebe" | "Automatik" | "DSG";
  powerHp?: number; // PS
  nextInspection: string; // HU/AU YYYY-MM
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  notes?: string;
  createdAt: string;
}

export interface TireStorage {
  id: string;
  vehicleId?: string;
  licensePlate: string;
  customerName: string;
  customerPhone: string;
  type: "Sommer" | "Winter" | "Ganzjahr";
  brand: string; // z.B. "Continental PremiumContact 6"
  dimension: string; // z.B. "205/55 R16 91V"
  dot: string; // z.B. "1822"
  rimType: "Alufelge" | "Stahlfelge";
  treadDepthFL: number; // Vorn links in mm
  treadDepthFR: number; // Vorn rechts in mm
  treadDepthRL: number; // Hinten links in mm
  treadDepthRR: number; // Hinten rechts in mm
  condition: "gut" | "grenzwertig" | "erneuern";
  storageLocation: string; // z.B. "Regal B - Fach 04"
  storedAt: string;
}

export interface SparePart {
  id: string;
  partNumber: string; // z.B. "04L 115 562" oder "0 986 424 797"
  oemNumber?: string;
  name: string;
  manufacturer: string; // z.B. "Bosch", "Mann-Filter", "ATE", "Brembo", "Febi"
  category: "Filter" | "Bremsen" | "Zündung" | "Fahrwerk" | "Elektrik" | "Öle & Chemie" | "Karosserie" | "Sonstiges";
  stock: number;
  minStock: number;
  purchasePriceNet: number; // EK
  salePriceNet: number; // VK
  taxRate: number; // 19%
  storageBin: string; // z.B. "Fach A-12"
}

export interface WorkshopOrder {
  id: string;
  orderNumber: string; // z.B. "WO-2026-0042"
  vehicleId: string;
  licensePlate: string;
  vehicleInfo: string; // "VW Golf VII Variant 2.0 TDI"
  mileage: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  status: WorkshopOrderStatus;
  liftBay: "Bühne 1" | "Bühne 2" | "Bühne 3" | "Bühne 4 (Achsmessung)" | "Prüfstraße" | "Hof / Parkplatz";
  mechanicName?: string;
  issueDescription: string; // Kundenangabe ("Klappern Vorderachse rechts bei Bodenwellen, Bremsen quietschen")
  diagnosticNotes?: string;
  positions: OrderPosition[];
  checklist?: InspectionItem[];
  estimateStatus: EstimateStatus;
  estimateTotalGross?: number;
  statusToken: string; // Zufallstoken für Kunden-Statusportal
  paymentMethod?: "bar" | "karte" | "rechnung" | "pos";
  paymentStatus?: "offen" | "bezahlt";
  totalNet: number;
  totalTax: number;
  totalGross: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WorkshopStats {
  activeOrders: number;
  inProgressCount: number;
  waitingForPartsCount: number;
  readyForPickupCount: number;
  billedTodayCount: number;
  revenueTodayGross: number;
  tireSetsStored: number;
  lowStockPartsCount: number;
}
