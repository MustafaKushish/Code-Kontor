import { useEffect, useState, useCallback } from "react";
import {
  UtensilsCrossed,
  LayoutGrid,
  ShoppingCart,
  ShoppingBag,
  Flame,
  BookOpen,
  Tv,
  Clock,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  Users,
} from "lucide-react";
import { api, type Me } from "../../api";
import type {
  MenuItem,
  RestaurantOrder,
  RestaurantStats,
  RestaurantTable,
} from "../../../shared/restaurant";
import { TablesTab } from "./TablesTab";
import { CounterTab } from "./CounterTab";
import { PickupTab } from "./PickupTab";
import { KitchenTab } from "./KitchenTab";
import { MenuTab } from "./MenuTab";

export default function RestaurantApp({ me, path }: { me: Me; path: string }) {
  const [activeTab, setActiveTab] = useState<"tische" | "theke" | "abholung" | "kueche" | "speisekarte">("tische");
  const [stats, setStats] = useState<RestaurantStats>({
    openTablesCount: 0,
    totalTablesCount: 0,
    activeKitchenTicketsCount: 0,
    waitingPickupCount: 0,
    ordersTodayCount: 0,
    revenueTodayGross: 0,
    averagePrepTimeMinutes: 12,
  });
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [statsRes, tablesRes, menuRes, ordersRes] = await Promise.all([
        api<RestaurantStats>("/restaurant/stats"),
        api<RestaurantTable[]>("/restaurant/tables"),
        api<MenuItem[]>("/restaurant/menu"),
        api<RestaurantOrder[]>("/restaurant/orders"),
      ]);
      setStats(statsRes);
      setTables(tablesRes);
      setMenu(menuRes);
      setOrders(ordersRes);
    } catch (err) {
      console.error("Failed to load restaurant data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Auto-refresh every 8 seconds for real-time kitchen and table updates
    const interval = setInterval(() => loadData(true), 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-slate-400 space-y-3">
        <UtensilsCrossed className="w-10 h-10 animate-bounce text-amber-500" />
        <p className="text-sm">Restaurant & Café wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 font-sans">
      {/* Top Banner: Module Title & Real-time KPIs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/10">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Restaurant & Café
              </h1>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300">
                Gastro-System
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tischbedienung, Kundenschalter, Abholschalter & KDS Küchenmonitor
            </p>
          </div>
        </div>

        {/* Live Display & Refresh controls */}
        <div className="flex items-center gap-3">
          <a
            href={`/abholung/${me.user.tenantId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors"
            title="Öffentlichen Großbildschirm für den Wartebereich öffnen"
          >
            <Tv className="w-4 h-4 text-amber-500" />
            <span>Abhol-Display</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </a>

          <button
            onClick={() => loadData()}
            disabled={refreshing}
            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Daten neu laden"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-amber-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Offene Tische */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>Tischbelegung</span>
            <Users className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
              {stats.openTablesCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ {stats.totalTablesCount} Tische</span>
          </div>
        </div>

        {/* Aktive Küchenbons */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>Küchenbons (KDS)</span>
            <Flame className="w-4 h-4 text-red-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
              {stats.activeKitchenTicketsCount}
            </span>
            <span className="text-xs text-red-500 font-medium">in Arbeit</span>
          </div>
        </div>

        {/* Wartende Abholungen */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>Abholschalter</span>
            <ShoppingBag className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
              {stats.waitingPickupCount}
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">bereit</span>
          </div>
        </div>

        {/* Durchschnittl. Zubereitung */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>Ø Zubereitung</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white">
              {stats.averagePrepTimeMinutes}
            </span>
            <span className="text-xs text-slate-400 font-mono">Minuten</span>
          </div>
        </div>

        {/* Tagesumsatz brutto */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-500 text-xs">
            <span>Umsatz heute</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl font-mono font-bold text-slate-900 dark:text-white">
              {fmtEuro(stats.revenueTodayGross)}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab("tische")}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "tische"
              ? "border-amber-500 text-amber-600 dark:text-amber-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          <span>Tischplan</span>
          {stats.openTablesCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono">
              {stats.openTablesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("theke")}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "theke"
              ? "border-amber-500 text-amber-600 dark:text-amber-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Kundenschalter (Theke)</span>
        </button>

        <button
          onClick={() => setActiveTab("abholung")}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "abholung"
              ? "border-amber-500 text-amber-600 dark:text-amber-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Abholschalter</span>
          {stats.waitingPickupCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono">
              {stats.waitingPickupCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("kueche")}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "kueche"
              ? "border-amber-500 text-amber-600 dark:text-amber-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Küchenmonitor (KDS)</span>
          {stats.activeKitchenTicketsCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-mono">
              {stats.activeKitchenTicketsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("speisekarte")}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "speisekarte"
              ? "border-amber-500 text-amber-600 dark:text-amber-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Speisekarte & Preise</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === "tische" && (
          <TablesTab
            tables={tables}
            menu={menu}
            orders={orders}
            onRefresh={() => loadData(true)}
          />
        )}

        {activeTab === "theke" && (
          <CounterTab
            menu={menu}
            onRefresh={() => loadData(true)}
          />
        )}

        {activeTab === "abholung" && (
          <PickupTab
            orders={orders}
            menu={menu}
            tenantId={me.user.tenantId}
            onRefresh={() => loadData(true)}
          />
        )}

        {activeTab === "kueche" && (
          <KitchenTab
            orders={orders}
            onRefresh={() => loadData(true)}
          />
        )}

        {activeTab === "speisekarte" && (
          <MenuTab
            menu={menu}
            onRefresh={() => loadData(true)}
          />
        )}
      </div>
    </div>
  );
}
