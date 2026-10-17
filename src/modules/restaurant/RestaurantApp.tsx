import { useEffect, useState, useCallback, useRef } from "react";
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
import { useRestaurantI18n } from "./i18n";
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
import { useVisiblePolling } from "./polling";
import "./restaurant.css";

export default function RestaurantApp({ me, path }: { me: Me; path: string }) {
  const isManager = me.user.role !== "staff";
  const { appText, t, euro, restaurantError } = useRestaurantI18n();
  const app = findApp("restaurant")!;
  const [activeTab, setActiveTab] = useState<"tische" | "theke" | "abholung" | "kueche" | "speisekarte">("tische");
  const [stats, setStats] = useState<RestaurantStats | null>(null);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const errorText = useRef(restaurantError);
  errorText.current = restaurantError;

  const fmtEuro = euro;

  /**
   * Daten laden. Bestellungen nur die laufenden und die von heute (`since` = heute 0 Uhr),
   * nicht die ganze Historie. Die Speisekarte ändert sich selten und wird beim Abfragen
   * im Hintergrund (`poll`) nicht mitgeladen.
   */
  const loadData = useCallback(async (silent = false, poll = false) => {
    if (!silent) setRefreshing(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    try {
      const [statsRes, tablesRes, menuRes, ordersRes] = await Promise.all([
        api<RestaurantStats>("/restaurant/stats"),
        api<RestaurantTable[]>("/restaurant/tables"),
        poll ? Promise.resolve(null) : api<MenuItem[]>("/restaurant/menu"),
        api<RestaurantOrder[]>(`/restaurant/orders?since=${encodeURIComponent(today.toISOString())}`),
      ]);
      setStats(statsRes);
      setTables(tablesRes);
      if (menuRes) setMenu(menuRes);
      setOrders(ordersRes);
      setError("");
    } catch (err) {
      setError(errorText.current(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Alle 8 Sekunden für Küche und Tische nachladen, aber nur solange der Tab sichtbar ist
  useVisiblePolling(() => loadData(true, true), 8000);

  const tabs = [
    { id: "tische" as const, label: t("tabs.tables"), icon: LayoutGrid, count: stats?.openTablesCount ?? 0 },
    { id: "theke" as const, label: t("tabs.counter"), icon: ShoppingCart, count: 0 },
    { id: "abholung" as const, label: t("tabs.pickup"), icon: ShoppingBag, count: stats?.waitingPickupCount ?? 0 },
    { id: "kueche" as const, label: t("tabs.kitchen"), icon: Flame, count: stats?.activeKitchenTicketsCount ?? 0 },
    // Speisekarte und Preise pflegen nur Inhaber und Admins (prüft auch der Server)
    ...(isManager ? [{ id: "speisekarte" as const, label: t("tabs.menu"), icon: BookOpen, count: 0 }] : []),
  ];

  if (loading) {
    return (
      <div className="restaurant restaurant-loading">
        <UtensilsCrossed size={36} aria-hidden />
        <p className="muted">{t("app.loading")}</p>
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
            title={t("app.openDisplayTitle")}
          >
            <Tv size={18} /> {t("app.openDisplay")} <ExternalLink size={14} aria-hidden />
          </a>
          <button
            onClick={() => loadData()}
            disabled={refreshing}
            className={`icon-button ${refreshing ? "spinning" : ""}`}
            title={t("app.reload")}
            aria-label={t("app.reload")}
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

      {error && <p className="error" role="alert">{error}</p>}

      <div className="restaurant-stats">
        <div className="tile stat-tile">
          <span className="stat-icon"><Users size={18} /></span>
          <strong>{stats ? stats.openTablesCount : "–"} <span className="stat-unit">{t("stats.tablesUnit", { total: stats ? stats.totalTablesCount : "–" })}</span></strong>
          <small>{t("stats.tablesLabel")}</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon warn"><Flame size={18} /></span>
          <strong>{stats ? stats.activeKitchenTicketsCount : "–"} <span className="stat-unit">{t("stats.inProgress")}</span></strong>
          <small>{t("stats.kitchenLabel")}</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><ShoppingBag size={18} /></span>
          <strong>{stats ? stats.waitingPickupCount : "–"} <span className="stat-unit">{t("stats.ready")}</span></strong>
          <small>{t("stats.pickupLabel")}</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Clock size={18} /></span>
          <strong>
            {stats && stats.averagePrepTimeMinutes != null ? (
              <>
                {stats.averagePrepTimeMinutes} <span className="stat-unit">{t("stats.minutes")}</span>
              </>
            ) : (
              "–"
            )}
          </strong>
          <small>{t("stats.prepLabel")}</small>
        </div>
        <div className="tile stat-tile restaurant-stat-wide">
          <span className="stat-icon ok"><TrendingUp size={18} /></span>
          <strong>{stats ? fmtEuro(stats.revenueTodayGross) : "–"}</strong>
          <small>{t("stats.revenueLabel")}</small>
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
            tables={tables}
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
