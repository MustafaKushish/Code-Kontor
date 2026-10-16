import { useEffect, useState } from "react";
import {
  Wrench,
  Car,
  Package,
  Disc,
  ShoppingCart,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { api, type Me } from "../../api";
import type { SparePart, TireStorage, Vehicle, WorkshopOrder, WorkshopStats } from "../../../shared/workshop";
import { POS_APP_ID } from "../../../shared/pos";
import { OrdersTab } from "./OrdersTab";
import { VehiclesTab } from "./VehiclesTab";
import { PartsTab } from "./PartsTab";
import { TiresTab } from "./TiresTab";
import { NewOrderModal } from "./NewOrderModal";

interface WorkshopAppProps {
  me: Me;
  path: string;
}

export default function WorkshopApp({ me, path }: WorkshopAppProps) {
  const isManager = me.user.role === "owner" || me.user.role === "admin";
  const hasPos = me.installedApps.includes(POS_APP_ID);

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

  return (
    <div className="min-h-full pb-16 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Kfz-Werkstatt & Service
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Hebebühnen-Steuerung, Dialogannahme, Fahrzeugakte, Teilelager & Räderhotel
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasPos && (
                <a
                  href="/kasse"
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition-colors"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Zur Kasse wechseln
                </a>
              )}
              <button
                onClick={() => setNewOrderModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                Neuer Werkstattauftrag
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 border-t border-slate-200 dark:border-slate-800 pt-2 pb-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab("orders")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === "orders"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Wrench className="w-4 h-4" />
              Aufträge & Hebebühnen ({orders.filter((o) => o.status !== "abgerechnet").length})
            </button>

            <button
              onClick={() => setActiveTab("vehicles")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === "vehicles"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Car className="w-4 h-4" />
              Fahrzeugakte ({vehicles.length})
            </button>

            <button
              onClick={() => setActiveTab("parts")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === "parts"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Package className="w-4 h-4" />
              Ersatzteillager & AWs ({parts.length})
            </button>

            <button
              onClick={() => setActiveTab("tires")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === "tires"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Disc className="w-4 h-4" />
              Räderhotel & Reifen ({tires.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] text-slate-500 font-medium block">Aktive Aufträge</span>
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
              {orders.filter((o) => o.status !== "abgerechnet").length}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              davon {orders.filter((o) => o.status === "in_arbeit").length} auf Bühne
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium block">Warten auf Teile</span>
            <span className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
              {orders.filter((o) => o.status === "wartet_teile").length}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Teilebestellung / KVA</span>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium block">Abholbereit</span>
            <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {orders.filter((o) => o.status === "abholbereit").length}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Kunden informiert</span>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] text-slate-500 font-medium block">Fahrzeugstamm</span>
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
              {vehicles.length}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Registrierte Kunden</span>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] text-slate-500 font-medium block">Räderhotel</span>
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
              {tires.length}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Eingelagerte Sätze</span>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-[11px] text-slate-500 font-medium block">Meldebestand Teile</span>
            <span className="text-xl font-bold font-mono text-red-600 dark:text-red-400">
              {parts.filter((p) => p.stock <= p.minStock).length}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Nachbestellung fällig</span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        {/* Tab Views */}
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

        {activeTab === "vehicles" && (
          <VehiclesTab
            vehicles={vehicles}
            orders={orders}
            onVehiclesChanged={setVehicles}
          />
        )}

        {activeTab === "parts" && (
          <PartsTab
            parts={parts}
            onPartsChanged={setParts}
          />
        )}

        {activeTab === "tires" && (
          <TiresTab
            tires={tires}
            vehicles={vehicles}
            onTiresChanged={setTires}
          />
        )}
      </main>

      {/* Modal: Neuer Werkstattauftrag */}
      {newOrderModalOpen && (
        <NewOrderModal
          vehicles={vehicles}
          onClose={() => setNewOrderModalOpen(false)}
          onCreated={handleOrderCreated}
        />
      )}
    </div>
  );
}
