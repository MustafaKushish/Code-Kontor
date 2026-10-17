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
import { Dialog } from "../../pos/ui";
import { RestaurantPrint } from "./RestaurantPrint";
import { currency as companyCurrency } from "../../money";

interface TablesTabProps {
  isManager: boolean;
  tables: RestaurantTable[];
  menu: MenuItem[];
  orders: RestaurantOrder[];
  onRefresh: () => void;
}

export function TablesTab({ tables, menu, orders, isManager, onRefresh }: TablesTabProps) {
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
    new Intl.NumberFormat("de-DE", { style: "currency", currency: companyCurrency() }).format(amount || 0);

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
        body: editingTable,
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
          body: { items: updatedItems },
        });
      } else {
        // Create new order for this table
        await api("/restaurant/orders", {
          method: "POST",
          body: {
            type: "tisch",
            tableId: selectedTable.id,
            tableName: selectedTable.name,
            guestCount: selectedTable.seats || 2,
            items: [newItem],
          },
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
          body: { status: "storniert" },
        });
      } else {
        await api(`/restaurant/orders/${activeOrder.id}`, {
          method: "PUT",
          body: { items: updatedItems },
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
        body: { paymentMethod: method },
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
    <div className="stack">
      <div className="restaurant-bar">
        <div className="chips" role="tablist">
          {areas.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={selectedArea === a.id}
              onClick={() => setSelectedArea(a.id)}
              className={selectedArea === a.id ? "chip active" : "chip"}
            >
              {a.label}
            </button>
          ))}
        </div>

        {isManager && <button
          onClick={() => {
            setEditingTable({
              area: selectedArea === "alle" ? "innen" : selectedArea,
              seats: 4,
              status: "frei",
            });
            setIsEditTableModalOpen(true);
          }}
          className="button primary"
        >
          <Plus size={18} />
          Neuer Tisch
        </button>}
      </div>

      <div className="restaurant-tables">
        {filteredTables.map((table) => {
          const isSelected = selectedTable?.id === table.id;
          const isOccupied = table.status === "belegt";
          const isBillRequested = table.status === "rechnung_angefordert";

          return (
            <button
              key={table.id}
              onClick={() => setSelectedTable(table)}
              className={`tile restaurant-table ${isSelected ? "selected" : isBillRequested ? "bill" : isOccupied ? "occupied" : ""}`}
            >
              <span className="restaurant-table-top">
                <span className="list-main">
                  <small className="restaurant-code">{table.tableNumber}</small>
                  <strong>{table.name}</strong>
                </span>
                <span className="restaurant-seats">
                  <Users size={14} aria-hidden />
                  {table.seats}
                </span>
              </span>

              <span className="restaurant-table-foot">
                <span className="stack-sm">
                  <small className="muted restaurant-area">{table.area}</small>
                  <span className={`pill ${isBillRequested ? "restaurant-pill-info" : isOccupied ? "warn" : "pos"}`}>
                    {isBillRequested ? "Rechnung" : isOccupied ? "Belegt" : "Frei"}
                  </span>
                </span>
                {table.totalGross && table.totalGross > 0 ? (
                  <strong className="restaurant-amount">{fmtEuro(table.totalGross)}</strong>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {selectedTable && (
        <Dialog title={selectedTable.name} onClose={() => setSelectedTable(null)} wide>
          <div className="restaurant-dialog stack">
            <p className="muted restaurant-dialog-sub">
              <UtensilsCrossed size={15} aria-hidden />
              <span className="restaurant-code">{selectedTable.tableNumber}</span> · {selectedTable.area}
            </p>

            {activeOrder && activeOrder.items.length > 0 ? (
              <div className="stack-sm">
                <div className="restaurant-split muted small">
                  <span>Bon #{activeOrder.orderNumber}</span>
                  <span>{activeOrder.items.length} Positionen</span>
                </div>

                <div className="restaurant-lines">
                  {activeOrder.items.map((item) => (
                    <div key={item.id} className="restaurant-line">
                      <span className="list-main">
                        <span className="restaurant-line-title">
                          <span><strong>{item.quantity}x</strong> {item.name}</span>
                          <span className={`pill ${item.destination === "bar" ? "restaurant-pill-info" : "warn"}`}>{item.course}</span>
                        </span>
                        {item.note && <small className="restaurant-note">Hinweis: {item.note}</small>}
                      </span>
                      <strong className="restaurant-amount">{fmtEuro(item.unitPriceGross * item.quantity)}</strong>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="icon-button danger"
                        title="Position entfernen"
                        aria-label="Position entfernen"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="repair-totals">
                  <p className="muted">
                    <span>Zwischensumme Netto</span>
                    <span>{fmtEuro(activeOrder.totalNet)}</span>
                  </p>
                  {activeOrder.totalTax7 > 0 && (
                    <p className="muted">
                      <span>MwSt. 7% (Speisen)</span>
                      <span>{fmtEuro(activeOrder.totalTax7)}</span>
                    </p>
                  )}
                  {activeOrder.totalTax19 > 0 && (
                    <p className="muted">
                      <span>MwSt. 19% (Getränke / Verzehr)</span>
                      <span>{fmtEuro(activeOrder.totalTax19)}</span>
                    </p>
                  )}
                  <p className="grand">
                    <span>Gesamtsumme Brutto</span>
                    <strong>{fmtEuro(activeOrder.totalGross)}</strong>
                  </p>
                </div>
              </div>
            ) : (
              <div className="restaurant-empty">
                <UtensilsCrossed size={28} aria-hidden />
                <strong>Tisch ist derzeit unbesetzt</strong>
                <p className="muted small">
                  Füge Speisen oder Getränke hinzu, um eine Bestellung zu starten.
                </p>
              </div>
            )}

            <div className="stack-sm restaurant-add">
              <div className="section-head">
                <h3>Positionen zubuchen</h3>
                <select
                  value={itemCourse}
                  onChange={(e) => setItemCourse(e.target.value as any)}
                  className="restaurant-course"
                  aria-label="Gang"
                >
                  <option value="Sofort">Sofort</option>
                  <option value="1. Gang">1. Gang</option>
                  <option value="2. Gang">2. Gang</option>
                  <option value="Dessert">Dessert</option>
                  <option value="Getränke">Getränke</option>
                </select>
              </div>

              <label className="search restaurant-search">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Speise oder Getränk suchen..."
                  aria-label="Speise oder Getränk suchen"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                />
              </label>
              <input
                type="text"
                placeholder="Sonderwunsch (z.B. ohne Zwiebeln, medium)..."
                aria-label="Sonderwunsch"
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value)}
              />

              <div className="restaurant-picker">
                {filteredMenu.slice(0, 15).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleAddItemToTable(item)}
                    disabled={isBusy}
                    className="list-row"
                  >
                    <span className="list-main">
                      <strong>{item.name}</strong>
                      <small className="muted">{item.destination === "bar" ? "Bar" : "Küche"}</small>
                    </span>
                    <strong className="restaurant-amount">{fmtEuro(item.priceGross)}</strong>
                    <Plus size={16} aria-hidden className="muted" />
                  </button>
                ))}
              </div>
            </div>

            {activeOrder && activeOrder.items.length > 0 && (
              <div className="stack-sm restaurant-dialog-foot">
                <div className="restaurant-actions three">
                  <button
                    onClick={() => setActivePrintOrder({ order: activeOrder, type: "kitchen" })}
                    className="button"
                  >
                    <Printer size={17} />
                    Küchenbon
                  </button>
                  <button
                    onClick={() => setActivePrintOrder({ order: activeOrder, type: "bar" })}
                    className="button"
                  >
                    <Printer size={17} />
                    Schankbon
                  </button>
                  <button
                    onClick={() => setActivePrintOrder({ order: activeOrder, type: "guest" })}
                    className="button"
                  >
                    <Receipt size={17} />
                    Zwischenbon
                  </button>
                </div>

                <div className="restaurant-actions">
                  <button
                    onClick={() => handleTableCheckout("bar")}
                    disabled={isBusy}
                    className="button primary"
                  >
                    <Banknote size={18} />
                    Bar kassieren
                  </button>
                  <button
                    onClick={() => handleTableCheckout("karte")}
                    disabled={isBusy}
                    className="button primary"
                  >
                    <CreditCard size={18} />
                    Karte zahlen
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog>
      )}

      {isEditTableModalOpen && (
        <Dialog title="Tisch anlegen / bearbeiten" onClose={() => setIsEditTableModalOpen(false)}>
          <form onSubmit={handleSaveTable} className="restaurant-dialog stack">
            <Field label="Tischnummer / Kürzel" required hint="z.B. T-01, T-12 oder B-3">
              <input
                type="text"
                required
                placeholder="T-01"
                value={editingTable.tableNumber || ""}
                onChange={(e) =>
                  setEditingTable({ ...editingTable, tableNumber: e.target.value })
                }
              />
            </Field>

            <Field label="Tischbezeichnung" required hint="z.B. Fensterplatz 1, Ecktisch 4">
              <input
                type="text"
                required
                placeholder="Fensterplatz 1"
                value={editingTable.name || ""}
                onChange={(e) => setEditingTable({ ...editingTable, name: e.target.value })}
              />
            </Field>

            <div className="grid form-grid">
              <Field label="Bereich / Zone">
                <select
                  value={editingTable.area || "innen"}
                  onChange={(e) =>
                    setEditingTable({ ...editingTable, area: e.target.value as TableArea })
                  }
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
                />
              </Field>
            </div>

            <div className="row gap restaurant-form-actions">
              <button
                type="button"
                onClick={() => setIsEditTableModalOpen(false)}
                className="button"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={isBusy}
                className="button primary"
              >
                Tisch speichern
              </button>
            </div>
          </form>
        </Dialog>
      )}

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
