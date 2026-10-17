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
import { Dialog } from "../../pos/ui";
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
        body: { status },
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
        body: { paymentMethod },
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
        body: {
          type: "abholung",
          customerName: newCustomerName.trim() || undefined,
          customerPhone: newCustomerPhone.trim() || undefined,
          notes: newNotes.trim() || undefined,
          items,
          guestCount: 1,
        },
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

  const filters = [
    { id: "alle" as const, label: `Alle (${pickupOrders.length})`, icon: null },
    { id: "zubereitung" as const, label: `In Zubereitung (${preparingCount})`, icon: Clock },
    { id: "bereit" as const, label: `Abholbereit (${readyCount})`, icon: CheckCircle2 },
    { id: "abgeschlossen" as const, label: "Abgeschlossen", icon: null },
  ];

  return (
    <div className="stack">
      <section className="card restaurant-callout">
        <span className="stat-icon"><Tv size={20} /></span>
        <div className="stack-sm">
          <h2 className="restaurant-callout-title">
            Digitaler Abholaufruf-Monitor
            <span className="pill">Live TV-Modus</span>
          </h2>
          <p className="muted small">
            Zeigt Gästen im Wartebereich automatisch große Abholnummern für „In Zubereitung“ und „Abholbereit“.
          </p>
        </div>
        <div className="row gap push-end restaurant-callout-actions">
          <a href={`/abholung/${tenantId}`} target="_blank" rel="noopener noreferrer" className="button">
            <ExternalLink size={18} />
            Aufruf-Monitor öffnen
          </a>
          <button onClick={() => setIsNewPickupModalOpen(true)} className="button primary">
            <Plus size={18} />
            Telefon-Vorbestellung
          </button>
        </div>
      </section>

      <div className="restaurant-bar">
        <div className="chips" role="tablist">
          {filters.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={filterStatus === id}
              onClick={() => setFilterStatus(id)}
              className={filterStatus === id ? "chip active" : "chip"}
            >
              {Icon && <Icon size={14} aria-hidden />}
              {label}
            </button>
          ))}
        </div>

        <label className="search restaurant-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Nummer, Name, Telefon..."
            aria-label="Nummer, Name, Telefon"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <div className="restaurant-orders">
        {filteredOrders.length === 0 ? (
          <div className="card restaurant-empty wide-card">
            <ShoppingBag size={32} aria-hidden />
            <strong>Keine Abholaufträge vorhanden</strong>
            <p className="muted small">
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
                className={`card restaurant-order ${isReady ? "ready" : isPreparing ? "preparing" : "done"}`}
              >
                <div className="restaurant-order-head">
                  <div className="restaurant-ticket-number">
                    <small>Abhol-Nr</small>
                    <strong>#{order.pickupNumber || "?"}</strong>
                  </div>
                  <span className="list-main">
                    <span className="row gap">
                      <small className="muted restaurant-code">{order.orderNumber}</small>
                      <span className={`pill ${isReady ? "pos" : isPreparing ? "warn" : ""}`}>
                        {isReady ? "Abholbereit" : isPreparing ? "In Zubereitung" : "Ausgegeben"}
                      </span>
                    </span>
                    <strong>{order.customerName || "Gast / Laufkundschaft"}</strong>
                    {order.customerPhone && (
                      <small className="muted restaurant-inline">
                        <Phone size={12} aria-hidden />
                        {order.customerPhone}
                      </small>
                    )}
                  </span>
                  <strong className="restaurant-amount">{fmtEuro(order.totalGross)}</strong>
                </div>

                <div className="restaurant-order-items">
                  {order.items.map((item) => (
                    <p key={item.id} className="restaurant-split">
                      <span>
                        <strong>{item.quantity}x</strong> {item.name}
                      </span>
                      <span className="muted restaurant-amount">{fmtEuro(item.unitPriceGross * item.quantity)}</span>
                    </p>
                  ))}
                  {order.notes && <small className="restaurant-note">Hinweis: {order.notes}</small>}
                </div>

                <div className="restaurant-order-foot">
                  <div className="row gap">
                    <button
                      onClick={() => setActivePrintOrder(order)}
                      className="icon-button"
                      title="Bon drucken"
                      aria-label="Bon drucken"
                    >
                      <Printer size={18} />
                    </button>
                    <span className={`pill ${order.paymentStatus === "bezahlt" ? "pos" : "neg"}`}>
                      {order.paymentStatus === "bezahlt" ? "Bezahlt" : "Offen"}
                    </span>
                  </div>

                  <div className="row gap">
                    {isPreparing && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, "fertig")}
                        disabled={isBusy}
                        className="button primary small-button"
                      >
                        <CheckCircle2 size={16} />
                        Fertig melden
                      </button>
                    )}

                    {isReady && order.paymentStatus === "offen" && (
                      <>
                        <button
                          onClick={() => handleCheckoutAndComplete(order.id, "bar")}
                          disabled={isBusy}
                          className="button primary small-button"
                        >
                          <Banknote size={16} />
                          Bar
                        </button>
                        <button
                          onClick={() => handleCheckoutAndComplete(order.id, "karte")}
                          disabled={isBusy}
                          className="button primary small-button"
                        >
                          <CreditCard size={16} />
                          Karte
                        </button>
                      </>
                    )}

                    {isReady && order.paymentStatus === "bezahlt" && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, "abgeschlossen")}
                        disabled={isBusy}
                        className="button primary small-button"
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

      {isNewPickupModalOpen && (
        <Dialog title="Telefon- / Vorbestellung aufnehmen" onClose={() => setIsNewPickupModalOpen(false)} wide>
          <form onSubmit={handleCreatePhoneOrder} className="restaurant-dialog stack">
            <div className="grid form-grid">
              <Field label="Kundenname" required>
                <input
                  type="text"
                  required
                  placeholder="Frau Müller"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                />
              </Field>
              <Field label="Telefonnummer">
                <input
                  type="tel"
                  placeholder="0171 1234567"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                />
              </Field>
              <Field label="Besondere Notiz" wide>
                <input
                  type="text"
                  placeholder="z.B. Abholung um 13:15 Uhr, Besteck beilegen"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </Field>
            </div>

            <div className="stack-sm">
              <span className="field-label">Speisen & Getränke auswählen:</span>
              <div className="restaurant-picker">
                {menu.filter((m) => m.active).map((item) => (
                  <div key={item.id} className="list-row">
                    <span className="list-main">
                      <strong>{item.name}</strong>
                      <small className="muted">{fmtEuro(item.priceGross)}</small>
                    </span>
                    <button
                      type="button"
                      onClick={() => addItemToNewOrder(item)}
                      className="button small-button"
                    >
                      + Hinzufügen
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {selectedItems.length > 0 && (
              <div className="restaurant-selected stack-sm">
                <strong>Ausgewählt:</strong>
                {selectedItems.map(({ menuItem, quantity }) => (
                  <div key={menuItem.id} className="restaurant-split">
                    <span>
                      {quantity}x {menuItem.name}
                    </span>
                    <span className="row gap">
                      <span className="restaurant-amount">{fmtEuro(menuItem.priceGross * quantity)}</span>
                      <button
                        type="button"
                        onClick={() => removeItemFromNewOrder(menuItem.id)}
                        className="icon-button danger"
                        aria-label="Entfernen"
                      >
                        <X size={16} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="row gap restaurant-form-actions">
              <button type="button" onClick={() => setIsNewPickupModalOpen(false)} className="button">
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={isBusy || selectedItems.length === 0}
                className="button primary"
              >
                Abholauftrag anlegen
              </button>
            </div>
          </form>
        </Dialog>
      )}

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
