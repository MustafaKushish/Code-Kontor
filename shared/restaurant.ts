// Datenmodelle für das Restaurant- & Gastronomie-Modul in Code Kontor

export type TableArea = "innen" | "terrasse" | "bar" | "lounge";
export type TableStatus = "frei" | "belegt" | "rechnung_angefordert";

export type OrderType = "tisch" | "theke" | "abholung" | "lieferung";
export type RestaurantOrderStatus = "offen" | "in_zubereitung" | "fertig" | "abgeschlossen" | "storniert";
export type ItemStatus = "bestellt" | "in_arbeit" | "fertig" | "serviert";
export type ItemCourse = "1. Gang" | "2. Gang" | "Dessert" | "Getränke" | "Sofort";
export type PrintDestination = "kueche" | "bar" | "theke";

export interface RestaurantTable {
  id: string;
  tableNumber: string; // z.B. "Tisch 1", "T4", "Terrasse 2"
  name: string;
  area: TableArea;
  seats: number;
  status: TableStatus;
  currentOrderId?: string;
  totalGross?: number;
  guestCount?: number;
}

export interface MenuItem {
  id: string;
  itemNumber: string; // z.B. "SP-01", "GET-04"
  name: string;
  category: "Vorspeisen" | "Hauptspeisen" | "Pizza & Pasta" | "Desserts" | "Heißgetränke" | "Alkoholfrei" | "Bier & Wein" | "Cocktails";
  description?: string;
  priceGross: number; // in Euro (inkl. MwSt)
  taxRate: number; // 7% für Speisen/Takeaway, 19% für In-Haus Verzehr / Getränke
  destination: PrintDestination; // kueche oder bar
  allergens?: string[]; // z.B. ["A", "C", "G"]
  active: boolean;
  isFavorite: boolean; // für Theken-Schnellkasse
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPriceGross: number;
  taxRate: number;
  course: ItemCourse;
  note?: string; // z.B. "Ohne Zwiebeln, medium gebraten"
  status: ItemStatus;
  destination: PrintDestination;
}

export interface RestaurantOrder {
  id: string;
  orderNumber: string; // z.B. "BON-1042"
  type: OrderType;
  tableId?: string;
  tableName?: string;
  pickupNumber?: number; // z.B. 42 für Abholschalter
  customerName?: string;
  customerPhone?: string;
  status: RestaurantOrderStatus;
  items: OrderItem[];
  guestCount: number;
  notes?: string;
  totalNet: number;
  totalTax7: number;
  totalTax19: number;
  totalGross: number;
  paymentMethod?: "bar" | "karte" | "rechnung" | "pos";
  paymentStatus: "offen" | "bezahlt";
  createdAt: string;
  kitchenStartedAt?: string;
  readyAt?: string;
  completedAt?: string;
}

export interface RestaurantStats {
  openTablesCount: number;
  totalTablesCount: number;
  activeKitchenTicketsCount: number;
  waitingPickupCount: number;
  ordersTodayCount: number;
  revenueTodayGross: number;
  averagePrepTimeMinutes: number;
}
