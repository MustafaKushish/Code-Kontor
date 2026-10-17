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
  RestaurantTable,
} from "../../../shared/restaurant";
import { RestaurantPrint } from "./RestaurantPrint";
import { useRestaurantI18n } from "./i18n";

interface KitchenTabProps {
  orders: RestaurantOrder[];
  tables: RestaurantTable[];
  onRefresh: () => void;
}

export function KitchenTab({ orders, tables, onRefresh }: KitchenTabProps) {
  const { t, course, itemStatus, restaurantError } = useRestaurantI18n();
  const [error, setError] = useState("");
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
    setError("");
    try {
      await api(`/restaurant/orders/${orderId}/items/${itemId}/status`, {
        method: "POST",
        body: { status: nextStatus },
      });
      onRefresh();
    } catch (err) {
      setError(restaurantError(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleMarkAllFinished = async (order: RestaurantOrder) => {
    setIsBusy(true);
    setError("");
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
      setError(restaurantError(err));
    } finally {
      setIsBusy(false);
    }
  };

  // Name des Tisches; fehlt er an der Bestellung, aus dem Tischplan, sonst nur „Tisch“ (die Bon-Nr. steht daneben)
  const tableLabel = (order: RestaurantOrder) => {
    if (order.tableName) return order.tableName;
    const table = tables.find((x) => x.id === order.tableId);
    if (table?.name) return table.name;
    if (table?.tableNumber) return t("kitchen.table", { id: table.tableNumber });
    return t("print.table");
  };

  const calculateElapsedMinutes = (createdAt: string) => {
    const createdTime = new Date(createdAt).getTime();
    const diffMs = Math.max(0, now - createdTime);
    return Math.floor(diffMs / 60000);
  };

  const stations = [
    { id: "alle" as const, label: t("kitchen.allStations"), icon: null },
    { id: "kueche" as const, label: t("kitchen.hotKitchen"), icon: Flame },
    { id: "bar" as const, label: t("kitchen.bar"), icon: Coffee },
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
            <span>{t("kitchen.showServed")}</span>
          </label>
          <button onClick={onRefresh} className="icon-button" title={t("common.refresh")} aria-label={t("common.refresh")}>
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="restaurant-tickets">
        {kdsOrders.length === 0 ? (
          <div className="card restaurant-empty wide-card">
            <span className="restaurant-success-icon"><CheckCircle2 size={30} /></span>
            <strong>{t("kitchen.emptyTitle")}</strong>
            <p className="muted small">
              {t("kitchen.emptyHint")}
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
                        <strong>{tableLabel(order)}</strong>
                      ) : order.type === "abholung" ? (
                        <strong className="restaurant-accent">{t("kitchen.pickup", { n: order.pickupNumber || "?" })}</strong>
                      ) : (
                        <strong>{t("kitchen.counter")}</strong>
                      )}
                      <small className="muted restaurant-code">({order.orderNumber})</small>
                    </span>
                    {order.customerName && <small className="muted">{order.customerName}</small>}
                  </span>

                  <span className="restaurant-timer">
                    <Clock size={14} aria-hidden />
                    {t("kitchen.minutes", { n: elapsed })}
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
                            {course(item.course)} · {item.destination === "bar" ? t("common.bar") : t("common.kitchen")}
                          </small>
                          {item.note && <span className="restaurant-wish">{item.note}</span>}
                        </span>
                        <span className={`pill ${isItemDone ? "pos" : isItemCooking ? "warn" : ""}`}>
                          {itemStatus(item.status)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="restaurant-ticket-foot">
                  <button
                    onClick={() => setActivePrintOrder(order)}
                    className="icon-button"
                    title={t("kitchen.reprint")}
                    aria-label={t("kitchen.reprint")}
                  >
                    <Printer size={18} />
                  </button>

                  <button
                    onClick={() => handleMarkAllFinished(order)}
                    disabled={isBusy || isReady}
                    className="button primary"
                  >
                    <CheckCircle2 size={18} />
                    {isReady ? t("kitchen.alreadyDone") : t("kitchen.finishAll")}
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
