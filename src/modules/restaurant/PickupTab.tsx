import { useState } from "react";
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  Tv,
  Search,
  ExternalLink,
  Phone,
  User,
  Plus,
  AlertTriangle,
  Printer,
  X,
  CreditCard,
  Banknote,
  Utensils,
  ChevronRight,
  Flame,
} from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type {
  MenuItem,
  OrderItem,
  RestaurantOrder,
} from "../../../shared/restaurant";
import { RestaurantPrint } from "./RestaurantPrint";

interface PickupTabProps {
  orders: RestaurantOrder[];
  menu: MenuItem[];
  tenantId: string;
  onRefresh: () => void;
}

export function PickupTab({ orders, menu, tenantId, onRefresh }: PickupTabProps) {
  const [filterStatus, setFilterStatus] = useState<"alle" | "zubereitung" | "bereit" | "abgeschlossen">("alle");
  const [search, setSearch] = useState("");
  const [isNewPickupModalOpen, setIsNewPickupModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [selectedItems, setSelectedItems] = useState<{ menuItem: MenuItem; quantity: number }[]>([]);
  const [activePrintOrder, setActivePrintOrder] = useState<RestaurantOrder | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  // Filter only pickup / takeaway orders
  const pickupOrders = orders.filter((o) => o.type === "abholung");

  const filteredOrders = pickupOrders.filter((order) => {
    // Status filter
    if (filterStatus === "zubereitung" && order.status !== "offen" && order.status !== "in_zubereitung") return false;
    if (filterStatus === "bereit" && order.status !== "fertig") return false;
    if (filterStatus === "abgeschlossen" && order.status !== "abgeschlossen") return false;

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      const matchNum = order.pickupNumber?.toString().includes(q) || false;
      const matchOrder = order.orderNumber.toLowerCase().includes(q);
      const matchName = order.customerName?.toLowerCase().includes(q) || false;
      const matchPhone = order.customerPhone?.toLowerCase().includes(q) || false;
      return matchNum || matchOrder || matchName || matchPhone;
    }
    return true;
  });

  const preparingCount = pickupOrders.filter((o) => o.status === "offen" || o.status === "in_zubereitung").length;
  const readyCount = pickupOrders.filter((o) => o.status === "fertig").length;

  const handleUpdateStatus = async (orderId: string, status: "in_zubereitung" | "fertig" | "abgeschlossen") => {
    setIsBusy(true);
    try {
      await api(`/restaurant/orders/${orderId}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCheckoutAndComplete = async (orderId: string, paymentMethod: "bar" | "karte") => {
    setIsBusy(true);
    try {
      await api(`/restaurant/orders/${orderId}/checkout`, {
        method: "POST",
        body: JSON.stringify({ paymentMethod }),
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreatePhoneOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) return;
    setIsBusy(true);
    try {
      const items: OrderItem[] = selectedItems.map(({ menuItem, quantity }) => ({
        id: "item-" + Math.random().toString(36).slice(2, 9),
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity,
        unitPriceGross: menuItem.priceGross,
        taxRate: 7, // Takeaway = 7% MwSt
        course: "Sofort",
        status: "bestellt",
        destination: menuItem.destination,
      }));

      await api("/restaurant/orders", {
        method: "POST",
        body: JSON.stringify({
          type: "abholung",
          customerName: newCustomerName.trim() || undefined,
          customerPhone: newCustomerPhone.trim() || undefined,
          notes: newNotes.trim() || undefined,
          items,
          guestCount: 1,
        }),
      });

      setIsNewPickupModalOpen(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewNotes("");
      setSelectedItems([]);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const addItemToNewOrder = (menuItem: MenuItem) => {
    const existing = selectedItems.find((i) => i.menuItem.id === menuItem.id);
    if (existing) {
      setSelectedItems(
        selectedItems.map((i) =>
          i.menuItem.id === menuItem.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setSelectedItems([...selectedItems, { menuItem, quantity: 1 }]);
    }
  };

  const removeItemFromNewOrder = (itemId: string) => {
    setSelectedItems(selectedItems.filter((i) => i.menuItem.id !== itemId));
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Monitor Link & Quick Info */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-slate-900/10 dark:from-amber-950/40 dark:to-slate-900/60 p-5 rounded-2xl border border-amber-300/40 dark:border-amber-800/40 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-sm">
            <Tv className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              Digitaler Abholaufruf-Monitor
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                Live TV-Modus
              </span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Zeigt Gästen im Wartebereich automatisch große Abholnummern für „In Zubereitung“ und „Abholbereit“.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <a
            href={`/abholung/${tenantId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Aufruf-Monitor öffnen
          </a>
          <button
            onClick={() => setIsNewPickupModalOpen(true)}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Telefon-Vorbestellung
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setFilterStatus("alle")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === "alle"
                ? "bg-amber-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            Alle ({pickupOrders.length})
          </button>
          <button
            onClick={() => setFilterStatus("zubereitung")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              filterStatus === "zubereitung"
                ? "bg-amber-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            In Zubereitung ({preparingCount})
          </button>
          <button
            onClick={() => setFilterStatus("bereit")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              filterStatus === "bereit"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Abholbereit ({readyCount})
          </button>
          <button
            onClick={() => setFilterStatus("abgeschlossen")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === "abgeschlossen"
                ? "bg-slate-900 text-white dark:bg-slate-700"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            Abgeschlossen
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Nummer, Name, Telefon..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          />
        </div>
      </div>

      {/* Orders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredOrders.length === 0 ? (
          <div className="col-span-full text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
            <ShoppingBag className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">Keine Abholaufträge vorhanden</p>
            <p className="text-xs text-slate-500 mt-1">
              Bestellungen vom Kundenschalter oder per Telefon erscheinen hier automatisch.
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isReady = order.status === "fertig";
            const isCompleted = order.status === "abgeschlossen";
            const isPreparing = order.status === "in_zubereitung" || order.status === "offen";

            return (
              <div
                key={order.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 shadow-sm flex flex-col justify-between transition-all ${
                  isReady
                    ? "border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-400/20"
                    : isPreparing
                    ? "border-amber-300 dark:border-amber-700"
                    : "border-slate-200 dark:border-slate-800 opacity-75"
                }`}
              >
                <div>
                  {/* Top Header of Card: Pickup Number */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-mono font-black ${
                          isReady
                            ? "bg-emerald-500 text-white animate-pulse"
                            : isPreparing
                            ? "bg-amber-500 text-slate-950"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <span className="text-[10px] font-sans font-bold uppercase tracking-tighter">
                          Abhol-Nr
                        </span>
                        <span className="text-2xl leading-none">#{order.pickupNumber || "?"}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-400 font-bold">
                            {order.orderNumber}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              isReady
                                ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                                : isPreparing
                                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {isReady ? "Abholbereit" : isPreparing ? "In Zubereitung" : "Ausgegeben"}
                          </span>
                        </div>
                        <h4 className="font-semibold text-slate-900 dark:text-white text-sm mt-0.5">
                          {order.customerName || "Gast / Laufkundschaft"}
                        </h4>
                        {order.customerPhone && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                            <Phone className="w-3 h-3" />
                            <span>{order.customerPhone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <span className="font-mono font-bold text-base text-slate-900 dark:text-white">
                      {fmtEuro(order.totalGross)}
                    </span>
                  </div>

                  {/* Items summary */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-slate-700 dark:text-slate-300">
                        <span>
                          <strong className="font-mono text-slate-900 dark:text-white">
                            {item.quantity}x
                          </strong>{" "}
                          {item.name}
                        </span>
                        <span className="font-mono text-slate-400">
                          {fmtEuro(item.unitPriceGross * item.quantity)}
                        </span>
                      </div>
                    ))}
                    {order.notes && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 italic pt-1">
                        Hinweis: {order.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer Status Actions */}
                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActivePrintOrder(order)}
                      className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Bon drucken"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        order.paymentStatus === "bezahlt"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                      }`}
                    >
                      {order.paymentStatus === "bezahlt" ? "Bezahlt" : "Offen"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isPreparing && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, "fertig")}
                        disabled={isBusy}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Fertig melden
                      </button>
                    )}

                    {isReady && order.paymentStatus === "offen" && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCheckoutAndComplete(order.id, "bar")}
                          disabled={isBusy}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                        >
                          Bar
                        </button>
                        <button
                          onClick={() => handleCheckoutAndComplete(order.id, "karte")}
                          disabled={isBusy}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                        >
                          Karte
                        </button>
                      </div>
                    )}

                    {isReady && order.paymentStatus === "bezahlt" && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, "abgeschlossen")}
                        disabled={isBusy}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                      >
                        Ausgeben
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: New Phone / Pre-Order */}
      {isNewPickupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">Telefon- / Vorbestellung aufnehmen</h3>
              <button onClick={() => setIsNewPickupModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePhoneOrder} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Kundenname" required>
                  <input
                    type="text"
                    required
                    placeholder="Frau Müller"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </Field>
                <Field label="Telefonnummer">
                  <input
                    type="tel"
                    placeholder="0171 1234567"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </Field>
              </div>

              <Field label="Besondere Notiz">
                <input
                  type="text"
                  placeholder="z.B. Abholung um 13:15 Uhr, Besteck beilegen"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </Field>

              {/* Dish Selection */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                  Speisen & Getränke auswählen:
                </label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                  {menu.filter((m) => m.active).map((item) => (
                    <div key={item.id} className="p-2 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <div>
                        <span className="font-medium text-slate-900 dark:text-white">{item.name}</span>
                        <span className="text-[10px] text-slate-400 ml-2 font-mono">{fmtEuro(item.priceGross)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => addItemToNewOrder(item)}
                        className="px-2 py-1 bg-amber-600 text-white rounded text-[11px] font-semibold hover:bg-amber-700"
                      >
                        + Hinzufügen
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Selected Items */}
              {selectedItems.length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">Ausgewählt:</span>
                  {selectedItems.map(({ menuItem, quantity }) => (
                    <div key={menuItem.id} className="flex justify-between items-center text-xs">
                      <span>
                        {quantity}x {menuItem.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{fmtEuro(menuItem.priceGross * quantity)}</span>
                        <button
                          type="button"
                          onClick={() => removeItemFromNewOrder(menuItem.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewPickupModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-lg"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isBusy || selectedItems.length === 0}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-40"
                >
                  Abholauftrag anlegen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Overlay */}
      {activePrintOrder && (
        <RestaurantPrint
          order={activePrintOrder}
          type="kitchen"
          onClose={() => setActivePrintOrder(null)}
        />
      )}
    </div>
  );
}
