import { useState, useEffect } from "react";
import {
  Flame,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
  Check,
  Printer,
  Coffee,
  Utensils,
  ChevronRight,
  Maximize,
  Minimize,
  RefreshCw,
} from "lucide-react";
import { api } from "../../api";
import type {
  ItemStatus,
  PrintDestination,
  RestaurantOrder,
} from "../../../shared/restaurant";
import { RestaurantPrint } from "./RestaurantPrint";

interface KitchenTabProps {
  orders: RestaurantOrder[];
  onRefresh: () => void;
}

export function KitchenTab({ orders, onRefresh }: KitchenTabProps) {
  const [stationFilter, setStationFilter] = useState<PrintDestination | "alle">("alle");
  const [showCompleted, setShowCompleted] = useState(false);
  const [activePrintOrder, setActivePrintOrder] = useState<RestaurantOrder | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Update timer every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Filter orders for KDS
  const kdsOrders = orders.filter((order) => {
    if (order.status === "storniert") return false;
    if (!showCompleted && (order.status === "abgeschlossen" || order.status === "fertig")) {
      return false;
    }
    // Filter items by destination
    if (stationFilter !== "alle") {
      const hasRelevantItems = order.items.some((i) => i.destination === stationFilter);
      if (!hasRelevantItems) return false;
    }
    return true;
  });

  const handleToggleItemStatus = async (orderId: string, itemId: string, currentStatus: ItemStatus) => {
    const nextStatus: ItemStatus =
      currentStatus === "bestellt"
        ? "in_arbeit"
        : currentStatus === "in_arbeit"
        ? "fertig"
        : currentStatus === "fertig"
        ? "serviert"
        : "bestellt";

    setIsBusy(true);
    try {
      await api(`/restaurant/orders/${orderId}/items/${itemId}/status`, {
        method: "POST",
        body: { status: nextStatus },
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleMarkAllFinished = async (order: RestaurantOrder) => {
    setIsBusy(true);
    try {
      // Set all items to fertig
      for (const item of order.items) {
        if (item.status !== "fertig" && item.status !== "serviert") {
          await api(`/restaurant/orders/${order.id}/items/${item.id}/status`, {
            method: "POST",
            body: { status: "fertig" },
          });
        }
      }
      // Update order status to fertig
      await api(`/restaurant/orders/${order.id}/status`, {
        method: "POST",
        body: { status: "fertig" },
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const calculateElapsedMinutes = (createdAt: string) => {
    const createdTime = new Date(createdAt).getTime();
    const diffMs = Math.max(0, now - createdTime);
    return Math.floor(diffMs / 60000);
  };

  const stations = [
    { id: "alle" as const, label: "Alle Stationen", icon: null },
    { id: "kueche" as const, label: "Warme Küche", icon: Flame },
    { id: "bar" as const, label: "Schanktresen / Bar", icon: Coffee },
  ];

  return (
    <div className="stack restaurant-kds">
      <div className="restaurant-bar">
        <div className="chips" role="tablist">
          {stations.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={stationFilter === id}
              onClick={() => setStationFilter(id)}
              className={stationFilter === id ? "chip active" : "chip"}
            >
              {Icon && <Icon size={15} aria-hidden />}
              {label}
            </button>
          ))}
        </div>

        <div className="row gap">
          <label className="check">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            <span>Auch servierte Bons zeigen</span>
          </label>
          <button onClick={onRefresh} className="icon-button" title="Aktualisieren" aria-label="Aktualisieren">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="restaurant-tickets">
        {kdsOrders.length === 0 ? (
          <div className="card restaurant-empty wide-card">
            <span className="restaurant-success-icon"><CheckCircle2 size={30} /></span>
            <strong>Alle Bons sind abgearbeitet!</strong>
            <p className="muted small">
              Sobald Bestellungen am Kundenschalter, Tisch oder Abholschalter eingehen, erscheinen sie hier.
            </p>
          </div>
        ) : (
          kdsOrders.map((order) => {
            const elapsed = calculateElapsedMinutes(order.createdAt);
            const isCritical = elapsed >= 15;
            const isWarning = elapsed >= 10 && elapsed < 15;
            const isReady = order.status === "fertig";

            // Group items by course
            const relevantItems =
              stationFilter === "alle"
                ? order.items
                : order.items.filter((i) => i.destination === stationFilter);

            return (
              <div
                key={order.id}
                className={`card restaurant-ticket ${isCritical ? "critical" : isWarning ? "warning" : ""}`}
              >
                <div className="restaurant-ticket-head">
                  <span className="list-main">
                    <span className="restaurant-ticket-title">
                      {order.type === "tisch" ? (
                        <strong>{order.tableName || `Tisch ${order.tableId}`}</strong>
                      ) : order.type === "abholung" ? (
                        <strong className="restaurant-accent">Abholung #{order.pickupNumber || "?"}</strong>
                      ) : (
                        <strong>Theke</strong>
                      )}
                      <small className="muted restaurant-code">({order.orderNumber})</small>
                    </span>
                    {order.customerName && <small className="muted">{order.customerName}</small>}
                  </span>

                  <span className="restaurant-timer">
                    <Clock size={14} aria-hidden />
                    {elapsed}m
                  </span>
                </div>

                <div className="restaurant-ticket-items">
                  {relevantItems.map((item) => {
                    const isItemDone = item.status === "fertig" || item.status === "serviert";
                    const isItemCooking = item.status === "in_arbeit";

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleToggleItemStatus(order.id, item.id, item.status)}
                        className={`restaurant-ticket-item ${isItemDone ? "done" : isItemCooking ? "cooking" : ""}`}
                      >
                        <span className="restaurant-checkbox">
                          {isItemDone ? <Check size={15} /> : null}
                        </span>
                        <span className="list-main">
                          <span className="restaurant-ticket-name">
                            <strong>{item.quantity}x</strong> <span>{item.name}</span>
                          </span>
                          <small className="muted">
                            {item.course} · {item.destination === "bar" ? "Bar" : "Küche"}
                          </small>
                          {item.note && <span className="restaurant-wish">{item.note}</span>}
                        </span>
                        <span className={`pill ${isItemDone ? "pos" : isItemCooking ? "warn" : ""}`}>
                          {item.status}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="restaurant-ticket-foot">
                  <button
                    onClick={() => setActivePrintOrder(order)}
                    className="icon-button"
                    title="Küchenbon erneut drucken"
                    aria-label="Küchenbon erneut drucken"
                  >
                    <Printer size={18} />
                  </button>

                  <button
                    onClick={() => handleMarkAllFinished(order)}
                    disabled={isBusy || isReady}
                    className="button primary"
                  >
                    <CheckCircle2 size={18} />
                    {isReady ? "Bereits fertig" : "Alle fertigstellen"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

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
