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
        body: JSON.stringify({ status: nextStatus }),
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
            body: JSON.stringify({ status: "fertig" }),
          });
        }
      }
      // Update order status to fertig
      await api(`/restaurant/orders/${order.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: "fertig" }),
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

  return (
    <div className="space-y-6">
      {/* Top Filter and Station Bar */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Station Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setStationFilter("alle")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              stationFilter === "alle"
                ? "bg-amber-500 text-slate-950 font-bold shadow-xs"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Alle Stationen
          </button>
          <button
            onClick={() => setStationFilter("kueche")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              stationFilter === "kueche"
                ? "bg-amber-500 text-slate-950 font-bold shadow-xs"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            Warme Küche
          </button>
          <button
            onClick={() => setStationFilter("bar")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              stationFilter === "bar"
                ? "bg-amber-500 text-slate-950 font-bold shadow-xs"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <Coffee className="w-3.5 h-3.5" />
            Schanktresen / Bar
          </button>
        </div>

        {/* Status Mode & Quick Refresh */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
            />
            <span>Auch servierte Bons zeigen</span>
          </label>

          <button
            onClick={onRefresh}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Ticket Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {kdsOrders.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500/60" />
            <h4 className="font-bold text-base text-slate-900 dark:text-white">
              Alle Bons sind abgearbeitet!
            </h4>
            <p className="text-xs text-slate-500 mt-1">
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
                className={`bg-white dark:bg-slate-900 rounded-2xl border flex flex-col justify-between overflow-hidden shadow-sm transition-all ${
                  isCritical
                    ? "border-red-500 dark:border-red-600 ring-2 ring-red-500/20"
                    : isWarning
                    ? "border-amber-400 dark:border-amber-600"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                {/* Header Ticket Header */}
                <div
                  className={`p-3.5 flex items-start justify-between border-b ${
                    isCritical
                      ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200"
                      : isWarning
                      ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200"
                      : "bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      {order.type === "tisch" ? (
                        <span className="font-mono font-bold text-sm tracking-tight uppercase">
                          {order.tableName || `Tisch ${order.tableId}`}
                        </span>
                      ) : order.type === "abholung" ? (
                        <span className="font-mono font-black text-sm text-amber-600 dark:text-amber-400">
                          Abholung #{order.pickupNumber || "?"}
                        </span>
                      ) : (
                        <span className="font-mono font-bold text-sm">Theke</span>
                      )}
                      <span className="text-[10px] text-slate-500 font-mono">
                        ({order.orderNumber})
                      </span>
                    </div>
                    {order.customerName && (
                      <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block">
                        {order.customerName}
                      </span>
                    )}
                  </div>

                  {/* Elapsed Timer */}
                  <div
                    className={`flex items-center gap-1 font-mono text-xs font-bold px-2 py-0.5 rounded-lg ${
                      isCritical
                        ? "bg-red-600 text-white animate-pulse"
                        : isWarning
                        ? "bg-amber-500 text-slate-950"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>{elapsed}m</span>
                  </div>
                </div>

                {/* Items in ticket */}
                <div className="p-3.5 flex-1 divide-y divide-slate-100 dark:divide-slate-800 space-y-2">
                  {relevantItems.map((item) => {
                    const isItemDone = item.status === "fertig" || item.status === "serviert";
                    const isItemCooking = item.status === "in_arbeit";

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleToggleItemStatus(order.id, item.id, item.status)}
                        className={`pt-2 cursor-pointer select-none transition-opacity ${
                          isItemDone ? "opacity-40" : "opacity-100"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            <div
                              className={`w-5 h-5 rounded flex items-center justify-center text-xs mt-0.5 border ${
                                isItemDone
                                  ? "bg-emerald-600 border-emerald-600 text-white"
                                  : isItemCooking
                                  ? "bg-amber-500 border-amber-500 text-white"
                                  : "border-slate-300 dark:border-slate-600 hover:border-amber-500"
                              }`}
                            >
                              {isItemDone ? <Check className="w-3.5 h-3.5" /> : null}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                                  {item.quantity}x
                                </span>
                                <span
                                  className={`font-semibold text-xs text-slate-800 dark:text-slate-200 ${
                                    isItemDone ? "line-through text-slate-400" : ""
                                  }`}
                                >
                                  {item.name}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block">
                                {item.course} · {item.destination === "bar" ? "Bar" : "Küche"}
                              </span>
                              {item.note && (
                                <p className="text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded mt-1 inline-block">
                                  {item.note}
                                </p>
                              )}
                            </div>
                          </div>

                          <span
                            className={`text-[9px] uppercase font-bold font-mono px-1.5 py-0.5 rounded ${
                              isItemDone
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : isItemCooking
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer Actions */}
                <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setActivePrintOrder(order)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
                    title="Küchenbon erneut drucken"
                  >
                    <Printer className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleMarkAllFinished(order)}
                    disabled={isBusy || isReady}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isReady ? "Bereits fertig" : "Alle fertigstellen"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

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
