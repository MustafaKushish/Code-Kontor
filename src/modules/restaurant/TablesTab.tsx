import { useState } from "react";
import {
  Users,
  Plus,
  Receipt,
  UtensilsCrossed,
  Clock,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Banknote,
  Printer,
  X,
  Search,
  ChevronRight,
  Flame,
} from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type {
  MenuItem,
  OrderItem,
  RestaurantOrder,
  RestaurantTable,
  TableArea,
} from "../../../shared/restaurant";
import { RestaurantPrint } from "./RestaurantPrint";

interface TablesTabProps {
  tables: RestaurantTable[];
  menu: MenuItem[];
  orders: RestaurantOrder[];
  onRefresh: () => void;
}

export function TablesTab({ tables, menu, orders, onRefresh }: TablesTabProps) {
  const [selectedArea, setSelectedArea] = useState<TableArea | "alle">("alle");
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [isEditTableModalOpen, setIsEditTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Partial<RestaurantTable>>({
    area: "innen",
    seats: 4,
    status: "frei",
  });
  const [isAddItemsModalOpen, setIsAddItemsModalOpen] = useState(false);
  const [menuFilterCategory, setMenuFilterCategory] = useState<string>("alle");
  const [menuSearch, setMenuSearch] = useState("");
  const [itemCourse, setItemCourse] = useState<OrderItem["course"]>("1. Gang");
  const [itemNote, setItemNote] = useState("");
  const [activePrintOrder, setActivePrintOrder] = useState<{
    order: RestaurantOrder;
    type: "kitchen" | "bar" | "guest";
  } | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Format currency
  const fmtEuro = (amount?: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount || 0);

  const areas: { id: TableArea | "alle"; label: string }[] = [
    { id: "alle", label: "Alle Bereiche" },
    { id: "innen", label: "Innenbereich" },
    { id: "terrasse", label: "Terrasse" },
    { id: "bar", label: "Bar & Theke" },
    { id: "lounge", label: "Lounge" },
  ];

  const filteredTables = tables.filter(
    (t) => selectedArea === "alle" || t.area === selectedArea
  );

  const activeOrder = selectedTable?.currentOrderId
    ? orders.find((o) => o.id === selectedTable.currentOrderId) || null
    : null;

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTable.tableNumber || !editingTable.name) return;
    setIsBusy(true);
    try {
      await api("/restaurant/tables", {
        method: "POST",
        body: JSON.stringify(editingTable),
      });
      setIsEditTableModalOpen(false);
      setEditingTable({ area: "innen", seats: 4, status: "frei" });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddItemToTable = async (menuItem: MenuItem) => {
    if (!selectedTable) return;
    setIsBusy(true);
    try {
      const newItem: OrderItem = {
        id: "item-" + Math.random().toString(36).slice(2, 9),
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: 1,
        unitPriceGross: menuItem.priceGross,
        taxRate: menuItem.taxRate,
        course: menuItem.destination === "bar" ? "Getränke" : itemCourse,
        note: itemNote.trim() || undefined,
        status: "bestellt",
        destination: menuItem.destination,
      };

      if (activeOrder) {
        // Update existing order
        const updatedItems = [...activeOrder.items, newItem];
        await api(`/restaurant/orders/${activeOrder.id}`, {
          method: "PUT",
          body: JSON.stringify({ items: updatedItems }),
        });
      } else {
        // Create new order for this table
        await api("/restaurant/orders", {
          method: "POST",
          body: JSON.stringify({
            type: "tisch",
            tableId: selectedTable.id,
            tableName: selectedTable.name,
            guestCount: selectedTable.seats || 2,
            items: [newItem],
          }),
        });
      }
      setItemNote("");
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!activeOrder) return;
    setIsBusy(true);
    try {
      const updatedItems = activeOrder.items.filter((i) => i.id !== itemId);
      if (updatedItems.length === 0) {
        // Cancel/reset table order
        await api(`/restaurant/orders/${activeOrder.id}/status`, {
          method: "POST",
          body: JSON.stringify({ status: "storniert" }),
        });
      } else {
        await api(`/restaurant/orders/${activeOrder.id}`, {
          method: "PUT",
          body: JSON.stringify({ items: updatedItems }),
        });
      }
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleTableCheckout = async (method: "bar" | "karte") => {
    if (!activeOrder) return;
    setIsBusy(true);
    try {
      await api(`/restaurant/orders/${activeOrder.id}/checkout`, {
        method: "POST",
        body: JSON.stringify({ paymentMethod: method }),
      });
      setSelectedTable(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const categories = Array.from(new Set(menu.map((m) => m.category)));
  const filteredMenu = menu.filter((item) => {
    if (!item.active) return false;
    const matchesCat = menuFilterCategory === "alle" || item.category === menuFilterCategory;
    const matchesSearch =
      !menuSearch ||
      item.name.toLowerCase().includes(menuSearch.toLowerCase()) ||
      item.itemNumber.toLowerCase().includes(menuSearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Filter and Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
          {areas.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedArea(a.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                selectedArea === a.id
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            onClick={() => {
              setEditingTable({
                area: selectedArea === "alle" ? "innen" : selectedArea,
                seats: 4,
                status: "frei",
              });
              setIsEditTableModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Neuer Tisch
          </button>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filteredTables.map((table) => {
          const isSelected = selectedTable?.id === table.id;
          const isOccupied = table.status === "belegt";
          const isBillRequested = table.status === "rechnung_angefordert";

          return (
            <button
              key={table.id}
              onClick={() => setSelectedTable(table)}
              className={`relative text-left p-4 rounded-2xl border transition-all flex flex-col justify-between min-h-[140px] shadow-sm hover:shadow-md ${
                isSelected
                  ? "ring-2 ring-amber-500 border-amber-500 bg-amber-50/50 dark:bg-amber-950/20"
                  : isBillRequested
                  ? "border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20"
                  : isOccupied
                  ? "border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between w-full">
                <div>
                  <span className="text-xs font-mono font-bold tracking-tight text-slate-500 dark:text-slate-400 uppercase">
                    {table.tableNumber}
                  </span>
                  <h4 className="font-semibold text-slate-900 dark:text-white text-sm line-clamp-1">
                    {table.name}
                  </h4>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Users className="w-3.5 h-3.5" />
                  <span>{table.seats}</span>
                </div>
              </div>

              <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-end justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-mono">
                    {table.area}
                  </span>
                  <span
                    className={`text-[11px] font-medium ${
                      isBillRequested
                        ? "text-blue-600 dark:text-blue-400"
                        : isOccupied
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {isBillRequested ? "Rechnung" : isOccupied ? "Belegt" : "Frei"}
                  </span>
                </div>
                {table.totalGross && table.totalGross > 0 ? (
                  <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                    {fmtEuro(table.totalGross)}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Table Drawer / Modal View */}
      {selectedTable && (
        <div className="fixed inset-0 z-40 flex items-center justify-center sm:justify-end bg-black/40 backdrop-blur-xs p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border-l sm:border border-slate-200 dark:border-slate-800 w-full sm:max-w-lg h-full sm:h-[95vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                  <UtensilsCrossed className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 uppercase">
                      {selectedTable.tableNumber}
                    </span>
                    <span className="text-xs text-slate-400">· {selectedTable.area}</span>
                  </div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                    {selectedTable.name}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content: Active Order items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeOrder && activeOrder.items.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <span>Bon #{activeOrder.orderNumber}</span>
                    <span>{activeOrder.items.length} Positionen</span>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeOrder.items.map((item) => (
                      <div key={item.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {item.quantity}x
                            </span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {item.name}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                item.destination === "bar"
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                              }`}
                            >
                              {item.course}
                            </span>
                          </div>
                          {item.note && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 italic mt-0.5">
                              Hinweis: {item.note}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-slate-900 dark:text-white">
                            {fmtEuro(item.unitPriceGross * item.quantity)}
                          </span>
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-slate-300 hover:text-red-500 p-1"
                            title="Position entfernen"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Zwischensumme Netto</span>
                      <span className="font-mono">{fmtEuro(activeOrder.totalNet)}</span>
                    </div>
                    {activeOrder.totalTax7 > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>MwSt. 7% (Speisen)</span>
                        <span className="font-mono">{fmtEuro(activeOrder.totalTax7)}</span>
                      </div>
                    )}
                    {activeOrder.totalTax19 > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>MwSt. 19% (Getränke / Verzehr)</span>
                        <span className="font-mono">{fmtEuro(activeOrder.totalTax19)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-sm text-slate-900 dark:text-white pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span>Gesamtsumme Brutto</span>
                      <span className="font-mono text-base text-amber-600 dark:text-amber-400">
                        {fmtEuro(activeOrder.totalGross)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Tisch ist derzeit unbesetzt</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Füge Speisen oder Getränke hinzu, um eine Bestellung zu starten.
                  </p>
                </div>
              )}

              {/* Quick Add Menu Selection */}
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 tracking-wider">
                    Positionen zubuchen
                  </h4>
                  <div className="flex items-center gap-1">
                    <select
                      value={itemCourse}
                      onChange={(e) => setItemCourse(e.target.value as any)}
                      className="text-xs bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 border border-slate-200 dark:border-slate-700"
                    >
                      <option value="Sofort">Sofort</option>
                      <option value="1. Gang">1. Gang</option>
                      <option value="2. Gang">2. Gang</option>
                      <option value="Dessert">Dessert</option>
                      <option value="Getränke">Getränke</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2 mb-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Speise oder Getränk suchen..."
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Sonderwunsch (z.B. ohne Zwiebeln, medium)..."
                    value={itemNote}
                    onChange={(e) => setItemNote(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg italic"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {filteredMenu.slice(0, 15).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleAddItemToTable(item)}
                      disabled={isBusy}
                      className="w-full text-left p-2 rounded-lg bg-slate-50 hover:bg-amber-50 dark:bg-slate-800/60 dark:hover:bg-amber-950/20 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs transition-colors group"
                    >
                      <div>
                        <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                          {item.name}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-2">
                          ({item.destination === "bar" ? "Bar" : "Küche"})
                        </span>
                      </div>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {fmtEuro(item.priceGross)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            {activeOrder && activeOrder.items.length > 0 && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setActivePrintOrder({ order: activeOrder, type: "kitchen" })}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Küchenbon
                  </button>
                  <button
                    onClick={() => setActivePrintOrder({ order: activeOrder, type: "bar" })}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Schankbon
                  </button>
                  <button
                    onClick={() => setActivePrintOrder({ order: activeOrder, type: "guest" })}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Zwischenbon
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleTableCheckout("bar")}
                    disabled={isBusy}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                  >
                    <Banknote className="w-4 h-4" />
                    Bar kassieren
                  </button>
                  <button
                    onClick={() => handleTableCheckout("karte")}
                    disabled={isBusy}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                  >
                    <CreditCard className="w-4 h-4" />
                    Karte zahlen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: New / Edit Table */}
      {isEditTableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white">Tisch anlegen / bearbeiten</h3>
              <button
                onClick={() => setIsEditTableModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTable} className="space-y-4">
              <Field label="Tischnummer / Kürzel" required hint="z.B. T-01, T-12 oder B-3">
                <input
                  type="text"
                  required
                  placeholder="T-01"
                  value={editingTable.tableNumber || ""}
                  onChange={(e) =>
                    setEditingTable({ ...editingTable, tableNumber: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </Field>

              <Field label="Tischbezeichnung" required hint="z.B. Fensterplatz 1, Ecktisch 4">
                <input
                  type="text"
                  required
                  placeholder="Fensterplatz 1"
                  value={editingTable.name || ""}
                  onChange={(e) => setEditingTable({ ...editingTable, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Bereich / Zone">
                  <select
                    value={editingTable.area || "innen"}
                    onChange={(e) =>
                      setEditingTable({ ...editingTable, area: e.target.value as TableArea })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="innen">Innenbereich</option>
                    <option value="terrasse">Terrasse</option>
                    <option value="bar">Bar & Theke</option>
                    <option value="lounge">Lounge</option>
                  </select>
                </Field>

                <Field label="Sitzplätze">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={editingTable.seats || 4}
                    onChange={(e) =>
                      setEditingTable({ ...editingTable, seats: parseInt(e.target.value) || 2 })
                    }
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </Field>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditTableModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold shadow-sm"
                >
                  Tisch speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Overlay */}
      {activePrintOrder && (
        <RestaurantPrint
          order={activePrintOrder.order}
          type={activePrintOrder.type}
          onClose={() => setActivePrintOrder(null)}
        />
      )}
    </div>
  );
}
