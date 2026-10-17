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
import { ModuleCheckout } from "../../pos/ModuleCheckout";
import { RestaurantPrint } from "./RestaurantPrint";
import { useRestaurantI18n } from "./i18n";

interface PickupTabProps {
  orders: RestaurantOrder[];
  menu: MenuItem[];
  tenantId: string;
  onRefresh: () => void;
}

export function PickupTab({ orders, menu, tenantId, onRefresh }: PickupTabProps) {
  const { t, euro } = useRestaurantI18n();
  const [filterStatus, setFilterStatus] = useState<"alle" | "zubereitung" | "bereit" | "abgeschlossen">("alle");
  const [search, setSearch] = useState("");
  const [isNewPickupModalOpen, setIsNewPickupModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [selectedItems, setSelectedItems] = useState<{ menuItem: MenuItem; quantity: number }[]>([]);
  const [activePrintOrder, setActivePrintOrder] = useState<RestaurantOrder | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const fmtEuro = euro;

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

  const [paying, setPaying] = useState<string | null>(null);

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
        taxRate: menuItem.taxRate,
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
    { id: "alle" as const, label: t("pickup.filterAll", { n: pickupOrders.length }), icon: null },
    { id: "zubereitung" as const, label: t("pickup.filterPreparing", { n: preparingCount }), icon: Clock },
    { id: "bereit" as const, label: t("pickup.filterReady", { n: readyCount }), icon: CheckCircle2 },
    { id: "abgeschlossen" as const, label: t("pickup.filterDone"), icon: null },
  ];

  return (
    <div className="stack">
      <section className="card restaurant-callout">
        <span className="stat-icon"><Tv size={20} /></span>
        <div className="stack-sm">
          <h2 className="restaurant-callout-title">
            {t("pickup.monitorTitle")}
            <span className="pill">{t("pickup.liveTv")}</span>
          </h2>
          <p className="muted small">
            {t("pickup.monitorHint")}
          </p>
        </div>
        <div className="row gap push-end restaurant-callout-actions">
          <a href={`/abholung/${tenantId}`} target="_blank" rel="noopener noreferrer" className="button">
            <ExternalLink size={18} />
            {t("pickup.openMonitor")}
          </a>
          <button onClick={() => setIsNewPickupModalOpen(true)} className="button primary">
            <Plus size={18} />
            {t("pickup.phoneOrder")}
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
            placeholder={t("pickup.search")}
            aria-label={t("pickup.searchLabel")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <div className="restaurant-orders">
        {filteredOrders.length === 0 ? (
          <div className="card restaurant-empty wide-card">
            <ShoppingBag size={32} aria-hidden />
            <strong>{t("pickup.emptyTitle")}</strong>
            <p className="muted small">
              {t("pickup.emptyHint")}
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
                    <small>{t("pickup.pickupNo")}</small>
                    <strong>#{order.pickupNumber || "?"}</strong>
                  </div>
                  <span className="list-main">
                    <span className="row gap">
                      <small className="muted restaurant-code">{order.orderNumber}</small>
                      <span className={`pill ${isReady ? "pos" : isPreparing ? "warn" : ""}`}>
                        {isReady ? t("pickup.ready") : isPreparing ? t("pickup.preparing") : t("pickup.handedOut")}
                      </span>
                    </span>
                    <strong>{order.customerName || t("common.walkIn")}</strong>
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
                  {order.notes && <small className="restaurant-note">{t("common.note", { note: order.notes })}</small>}
                </div>

                <div className="restaurant-order-foot">
                  <div className="row gap">
                    <button
                      onClick={() => setActivePrintOrder(order)}
                      className="icon-button"
                      title={t("pickup.printTicket")}
                      aria-label={t("pickup.printTicket")}
                    >
                      <Printer size={18} />
                    </button>
                    <span className={`pill ${order.paymentStatus === "bezahlt" ? "pos" : "neg"}`}>
                      {order.paymentStatus === "bezahlt" ? t("common.paid") : t("common.open")}
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
                        {t("pickup.markReady")}
                      </button>
                    )}

                    {order.paymentStatus === "offen" && (
                      <button onClick={() => setPaying(order.id)} disabled={isBusy} className="button primary small-button">
                        <Banknote size={16} />
                        {t("common.pay")}
                      </button>
                    )}

                    {isReady && order.paymentStatus === "bezahlt" && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, "abgeschlossen")}
                        disabled={isBusy}
                        className="button primary small-button"
                      >
                        {t("pickup.handOut")}
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
        <Dialog title={t("pickup.newTitle")} onClose={() => setIsNewPickupModalOpen(false)} wide>
          <form onSubmit={handleCreatePhoneOrder} className="restaurant-dialog stack">
            <div className="grid form-grid">
              <Field label={t("pickup.customerName")} required>
                <input
                  type="text"
                  required
                  placeholder={t("pickup.customerNamePlaceholder")}
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                />
              </Field>
              <Field label={t("pickup.phone")}>
                <input
                  type="tel"
                  placeholder="0171 1234567"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                />
              </Field>
              <Field label={t("pickup.notes")} wide>
                <input
                  type="text"
                  placeholder={t("pickup.notesPlaceholder")}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </Field>
            </div>

            <div className="stack-sm">
              <span className="field-label">{t("pickup.chooseItems")}</span>
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
                      {t("pickup.add")}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {selectedItems.length > 0 && (
              <div className="restaurant-selected stack-sm">
                <strong>{t("pickup.selected")}</strong>
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
                        aria-label={t("common.remove")}
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
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={isBusy || selectedItems.length === 0}
                className="button primary"
              >
                {t("pickup.create")}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {paying && (
        <ModuleCheckout
          source="restaurant"
          kind="order"
          refId={paying}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            onRefresh();
          }}
        />
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
