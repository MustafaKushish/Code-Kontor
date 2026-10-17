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
import { AppIcon } from "../../components";
import { useI18n } from "../../i18n";
import { findApp } from "../../../shared/apps";
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
import "./restaurant.css";
import { currency as companyCurrency } from "../../money";

export default function RestaurantApp({ me, path }: { me: Me; path: string }) {
  const isManager = me.user.role !== "staff";
  const { appText } = useI18n();
  const app = findApp("restaurant")!;
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
    new Intl.NumberFormat("de-DE", { style: "currency", currency: companyCurrency() }).format(amount);

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

  const tabs = [
    { id: "tische" as const, label: "Tischplan", icon: LayoutGrid, count: stats.openTablesCount },
    { id: "theke" as const, label: "Kundenschalter (Theke)", icon: ShoppingCart, count: 0 },
    { id: "abholung" as const, label: "Abholschalter", icon: ShoppingBag, count: stats.waitingPickupCount },
    { id: "kueche" as const, label: "Küchenmonitor (KDS)", icon: Flame, count: stats.activeKitchenTicketsCount },
    // Speisekarte und Preise pflegen nur Inhaber und Admins (prüft auch der Server)
    ...(isManager ? [{ id: "speisekarte" as const, label: "Speisekarte & Preise", icon: BookOpen, count: 0 }] : []),
  ];

  if (loading) {
    return (
      <div className="restaurant restaurant-loading">
        <UtensilsCrossed size={36} aria-hidden />
        <p className="muted">Restaurant & Café wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="stack-lg restaurant">
      <header className="page-head with-icon restaurant-head">
        <AppIcon app={app} size="lg" />
        <div>
          <h1 className="display">{appText(app.id).name}</h1>
          <p className="muted">{appText(app.id).tagline}</p>
        </div>
        <div className="row gap push-end">
          <a
            href={`/abholung/${me.user.tenantId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="button"
            title="Öffentlichen Großbildschirm für den Wartebereich öffnen"
          >
            <Tv size={18} /> Abhol-Display <ExternalLink size={14} aria-hidden />
          </a>
          <button
            onClick={() => loadData()}
            disabled={refreshing}
            className={`icon-button ${refreshing ? "spinning" : ""}`}
            title="Daten neu laden"
            aria-label="Daten neu laden"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <div className="page-tabs" role="tablist">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button key={id} role="tab" aria-selected={activeTab === id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}>
            <Icon size={17} aria-hidden /> {label}
            {count > 0 && <span className="restaurant-tab-count">{count}</span>}
          </button>
        ))}
      </div>

      <div className="restaurant-stats">
        <div className="tile stat-tile">
          <span className="stat-icon"><Users size={18} /></span>
          <strong>{stats.openTablesCount} <span className="stat-unit">/ {stats.totalTablesCount} Tische</span></strong>
          <small>Tischbelegung</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon warn"><Flame size={18} /></span>
          <strong>{stats.activeKitchenTicketsCount} <span className="stat-unit">in Arbeit</span></strong>
          <small>Küchenbons (KDS)</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><ShoppingBag size={18} /></span>
          <strong>{stats.waitingPickupCount} <span className="stat-unit">bereit</span></strong>
          <small>Abholschalter</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Clock size={18} /></span>
          <strong>{stats.averagePrepTimeMinutes} <span className="stat-unit">Minuten</span></strong>
          <small>Ø Zubereitung</small>
        </div>
        <div className="tile stat-tile restaurant-stat-wide">
          <span className="stat-icon ok"><TrendingUp size={18} /></span>
          <strong>{fmtEuro(stats.revenueTodayGross)}</strong>
          <small>Umsatz heute</small>
        </div>
      </div>

      <div>
        {activeTab === "tische" && (
          <TablesTab
            tables={tables}
            menu={menu}
            orders={orders}
            isManager={isManager}
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

        {activeTab === "speisekarte" && isManager && (
          <MenuTab
            menu={menu}
            onRefresh={() => loadData(true)}
          />
        )}
      </div>
    </div>
  );
}
