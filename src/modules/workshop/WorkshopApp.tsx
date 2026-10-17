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

interface WorkshopAppProps {
  me: Me;
  path: string;
}

export default function WorkshopApp({ me, path }: WorkshopAppProps) {
  const isManager = me.user.role === "owner" || me.user.role === "admin";
  const hasPos = me.installedApps.includes(POS_APP_ID);
  const app = findApp("werkstatt")!;

  const [activeTab, setActiveTab] = useState<"orders" | "vehicles" | "parts" | "tires">("orders");

  const [stats, setStats] = useState<WorkshopStats | null>(null);
  const [orders, setOrders] = useState<WorkshopOrder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parts, setParts] = useState<SparePart[]>([]);
  const [tires, setTires] = useState<TireStorage[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

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
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Laden der Werkstattdaten.");
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
    { id: "orders" as const, label: `Aufträge & Hebebühnen (${openCount})`, icon: Wrench },
    { id: "vehicles" as const, label: `Fahrzeugakte (${vehicles.length})`, icon: Car },
    { id: "parts" as const, label: `Ersatzteillager & AWs (${parts.length})`, icon: Package },
    { id: "tires" as const, label: `Räderhotel & Reifen (${tires.length})`, icon: Disc },
  ];
  const kpis = [
    { label: "Aktive Aufträge", value: openCount, hint: `davon ${orders.filter((o) => o.status === "in_arbeit").length} auf Bühne`, icon: Wrench, tone: "" },
    { label: "Warten auf Teile", value: orders.filter((o) => o.status === "wartet_teile").length, hint: "Teilebestellung / KVA", icon: Clock, tone: "warn" },
    { label: "Abholbereit", value: orders.filter((o) => o.status === "abholbereit").length, hint: "Kunden informiert", icon: CheckCircle2, tone: "ok" },
    { label: "Fahrzeugstamm", value: vehicles.length, hint: "Registrierte Kunden", icon: Car, tone: "" },
    { label: "Räderhotel", value: tires.length, hint: "Eingelagerte Sätze", icon: Layers, tone: "" },
    { label: "Meldebestand Teile", value: parts.filter((p) => p.stock <= p.minStock).length, hint: "Nachbestellung fällig", icon: AlertTriangle, tone: "bad" },
  ];

  return (
    <div className="stack-lg workshop">
      <header className="page-head with-icon workshop-head">
        <AppIcon app={app} size="lg" />
        <div>
          <h1 className="display">Kfz-Werkstatt & Service</h1>
          <p className="muted">Hebebühnen-Steuerung, Dialogannahme, Fahrzeugakte, Teilelager & Räderhotel</p>
        </div>
        <div className="row gap push-end workshop-head-actions">
          {hasPos && (
            <Link to="/kasse" className="button">
              <ShoppingCart size={18} /> Zur Kasse wechseln
            </Link>
          )}
          <button onClick={() => setNewOrderModalOpen(true)} className="button primary">
            <Plus size={18} /> Neuer Werkstattauftrag
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
        {kpis.map(({ label, value, hint, icon: Icon, tone }) => (
          <div key={label} className={`tile stat-tile ${tone ? `tone-${tone}` : ""}`}>
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
          onRefresh={loadData}
          onOrdersChanged={setOrders}
        />
      )}

      {activeTab === "vehicles" && <VehiclesTab vehicles={vehicles} orders={orders} onVehiclesChanged={setVehicles} />}

      {activeTab === "parts" && <PartsTab parts={parts} onPartsChanged={setParts} />}

      {activeTab === "tires" && <TiresTab tires={tires} vehicles={vehicles} onTiresChanged={setTires} />}

      {/* Dialog: Neuer Werkstattauftrag */}
      {newOrderModalOpen && (
        <NewOrderModal vehicles={vehicles} onClose={() => setNewOrderModalOpen(false)} onCreated={handleOrderCreated} />
      )}
    </div>
  );
}
