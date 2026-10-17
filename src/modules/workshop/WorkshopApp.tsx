import { useEffect, useState } from "react";
import { Wrench, Car, Package, Disc, ShoppingCart, Plus, Clock, CheckCircle2, AlertTriangle, Layers } from "lucide-react";
import { api, type Me } from "../../api";
import { AppIcon, Link } from "../../components";
import { findApp } from "../../../shared/apps";
import type { SparePart, TireStorage, Vehicle, WorkshopOrder, WorkshopStats } from "../../../shared/workshop";
import { POS_APP_ID } from "../../../shared/pos";
import { OrdersTab } from "./OrdersTab";
import { VehiclesTab } from "./VehiclesTab";
import { PartsTab } from "./PartsTab";
import { TiresTab } from "./TiresTab";
import { NewOrderModal } from "./NewOrderModal";
import "./workshop.css";
import { useWorkshopI18n } from "./i18n";

interface WorkshopAppProps {
  me: Me;
  path: string;
}

export default function WorkshopApp({ me, path }: WorkshopAppProps) {
  const isManager = me.user.role === "owner" || me.user.role === "admin";
  const hasPos = me.installedApps.includes(POS_APP_ID);
  const app = findApp("werkstatt")!;

  const { t, workshopError } = useWorkshopI18n();
  const [activeTab, setActiveTab] = useState<"orders" | "vehicles" | "parts" | "tires">("orders");

  const [stats, setStats] = useState<WorkshopStats | null>(null);
  const [orders, setOrders] = useState<WorkshopOrder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parts, setParts] = useState<SparePart[]>([]);
  const [tires, setTires] = useState<TireStorage[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);

  const loadData = async () => {
    try {
      const [s, ord, veh, prt, trs] = await Promise.all([
        api<WorkshopStats>("/workshop/stats").catch(() => null),
        api<WorkshopOrder[]>("/workshop/orders"),
        api<Vehicle[]>("/workshop/vehicles"),
        api<SparePart[]>("/workshop/parts"),
        api<TireStorage[]>("/workshop/tires"),
      ]);

      setStats(s);
      setOrders(ord);
      setVehicles(veh);
      setParts(prt);
      setTires(trs);
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, t("app.loadError")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOrderCreated = (created: WorkshopOrder) => {
    setOrders([created, ...orders]);
    setNewOrderModalOpen(false);
    loadData();
  };

  const openCount = orders.filter((o) => o.status !== "abgerechnet").length;
  const tabs = [
    { id: "orders" as const, label: t("app.tabs.orders", { n: openCount }), icon: Wrench },
    { id: "vehicles" as const, label: t("app.tabs.vehicles", { n: vehicles.length }), icon: Car },
    { id: "parts" as const, label: t("app.tabs.parts", { n: parts.length }), icon: Package },
    { id: "tires" as const, label: t("app.tabs.tires", { n: tires.length }), icon: Disc },
  ];
  const kpis = [
    { id: "active", label: t("app.kpi.active"), value: openCount, hint: t("app.kpi.activeHint", { n: orders.filter((o) => o.status === "in_arbeit").length }), icon: Wrench, tone: "" },
    { id: "waiting", label: t("app.kpi.waiting"), value: orders.filter((o) => o.status === "wartet_teile").length, hint: t("app.kpi.waitingHint"), icon: Clock, tone: "warn" },
    { id: "ready", label: t("app.kpi.ready"), value: orders.filter((o) => o.status === "abholbereit").length, hint: t("app.kpi.readyHint"), icon: CheckCircle2, tone: "ok" },
    { id: "vehicles", label: t("app.kpi.vehicles"), value: vehicles.length, hint: t("app.kpi.vehiclesHint"), icon: Car, tone: "" },
    { id: "tires", label: t("app.kpi.tires"), value: tires.length, hint: t("app.kpi.tiresHint"), icon: Layers, tone: "" },
    { id: "lowStock", label: t("app.kpi.lowStock"), value: parts.filter((p) => p.stock <= p.minStock).length, hint: t("app.kpi.lowStockHint"), icon: AlertTriangle, tone: "bad" },
  ];

  return (
    <div className="stack-lg workshop">
      <header className="page-head with-icon workshop-head">
        <AppIcon app={app} size="lg" />
        <div>
          <h1 className="display">{t("app.title")}</h1>
          <p className="muted">{t("app.subtitle")}</p>
        </div>
        <div className="row gap push-end workshop-head-actions">
          {hasPos && (
            <Link to="/kasse" className="button">
              <ShoppingCart size={18} /> {t("app.toPos")}
            </Link>
          )}
          <button onClick={() => setNewOrderModalOpen(true)} className="button primary">
            <Plus size={18} /> {t("app.newOrder")}
          </button>
        </div>
      </header>

      <div className="page-tabs workshop-tabs" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={activeTab === id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}>
            <Icon size={17} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {/* Kennzahlen */}
      <div className="workshop-stats">
        {kpis.map(({ id, label, value, hint, icon: Icon, tone }) => (
          <div key={id} className={`tile stat-tile ${tone ? `tone-${tone}` : ""}`}>
            <span className="stat-icon"><Icon size={18} /></span>
            <strong>{value}</strong>
            <small>{label}</small>
            <small className="faint">{hint}</small>
          </div>
        ))}
      </div>

      {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

      {/* Tab-Ansichten */}
      {activeTab === "orders" && (
        <OrdersTab
          orders={orders}
          vehicles={vehicles}
          parts={parts}
          tenantId={me.user.tenantId}
          hasPos={hasPos}
          isManager={isManager}
          onRefresh={loadData}
          onOrdersChanged={setOrders}
        />
      )}

      {activeTab === "vehicles" && <VehiclesTab vehicles={vehicles} orders={orders} onVehiclesChanged={setVehicles} isManager={isManager} />}

      {activeTab === "parts" && <PartsTab parts={parts} onPartsChanged={setParts} isManager={isManager} />}

      {activeTab === "tires" && <TiresTab tires={tires} vehicles={vehicles} onTiresChanged={setTires} isManager={isManager} />}

      {/* Dialog: Neuer Werkstattauftrag */}
      {newOrderModalOpen && (
        <NewOrderModal vehicles={vehicles} onClose={() => setNewOrderModalOpen(false)} onCreated={handleOrderCreated} />
      )}
    </div>
  );
}
