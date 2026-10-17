import { useState } from "react";
import {
  Search,
  Plus,
  LayoutGrid,
  List,
  Wrench,
  Car,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
  ExternalLink,
  Phone,
} from "lucide-react";
import type { SparePart, Vehicle, WorkshopOrder, WorkshopOrderStatus } from "../../../shared/workshop";
import { OrderDetailsModal } from "./OrderDetailsModal";
import { NewOrderModal } from "./NewOrderModal";
import { useWorkshopI18n, LIFT_KEYS } from "./i18n";

interface OrdersTabProps {
  orders: WorkshopOrder[];
  vehicles: Vehicle[];
  parts: SparePart[];
  tenantId: string;
  hasPos: boolean;
  isManager: boolean;
  onRefresh: () => void;
  onOrdersChanged: (orders: WorkshopOrder[]) => void;
}

// Texte kommen zur Anzeige aus orders.stages.<id>
const STAGES: { id: WorkshopOrderStatus; tone: string }[] = [
  { id: "annahme", tone: "neutral" },
  { id: "diagnose", tone: "warn" },
  { id: "wartet_teile", tone: "orange" },
  { id: "in_arbeit", tone: "info" },
  { id: "endkontrolle", tone: "purple" },
  { id: "abholbereit", tone: "ok" },
];

/** Filter der Hebebühnen: Wert wie gespeichert, Text mit oder ohne Zusatz. */
const LIFT_FILTER: { value: keyof typeof LIFT_KEYS; text: "name" | "option" }[] = [
  { value: "Bühne 1", text: "option" },
  { value: "Bühne 2", text: "option" },
  { value: "Bühne 3", text: "option" },
  { value: "Bühne 4 (Achsmessung)", text: "name" },
  { value: "Prüfstraße", text: "name" },
  { value: "Hof / Parkplatz", text: "name" },
];

export function OrdersTab({
  orders,
  vehicles,
  parts,
  tenantId,
  hasPos,
  isManager,
  onRefresh,
  onOrdersChanged,
}: OrdersTabProps) {
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [liftFilter, setLiftFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<WorkshopOrder | null>(null);
  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);

  const { t, euro: fmtEuro, day, lift } = useWorkshopI18n();

  // Filter
  const filtered = orders.filter((o) => {
    if (!showArchived && o.status === "abgerechnet") return false;
    if (liftFilter !== "all" && o.liftBay !== liftFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchPlate = o.licensePlate.toLowerCase().includes(q);
      const matchCust = o.customerName.toLowerCase().includes(q);
      const matchVeh = o.vehicleInfo.toLowerCase().includes(q);
      const matchNum = o.orderNumber.toLowerCase().includes(q);
      if (!matchPlate && !matchCust && !matchVeh && !matchNum) return false;
    }
    return true;
  });

  const handleOrderUpdated = (updated: WorkshopOrder) => {
    const next = orders.map((o) => (o.id === updated.id ? updated : o));
    onOrdersChanged(next);
    setSelectedOrder(updated);
  };

  const handleOrderDeleted = (id: string) => {
    const next = orders.filter((o) => o.id !== id);
    onOrdersChanged(next);
    setSelectedOrder(null);
  };

  const handleOrderCreated = (created: WorkshopOrder) => {
    const next = [created, ...orders];
    onOrdersChanged(next);
    setNewOrderModalOpen(false);
    setSelectedOrder(created);
  };

  return (
    <div className="stack">
      {/* Filterleiste */}
      <div className="workshop-toolbar">
        <label className="search">
          <Search size={18} />
          <input
            type="search"
            placeholder={t("orders.searchPlaceholder")}
            aria-label={t("orders.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        {/* Hebebühnen-Filter */}
        <select value={liftFilter} onChange={(e) => setLiftFilter(e.target.value)} className="workshop-select" aria-label={t("orders.liftFilter")}>
          <option value="all">{t("orders.allLifts")}</option>
          {LIFT_FILTER.map(({ value, text }) => (
            <option key={value} value={value}>
              {t(`lifts.${LIFT_KEYS[value]}.${text}`)}
            </option>
          ))}
        </select>

        <div className="row gap workshop-toolbar-end">
          {/* Abgerechnete anzeigen */}
          <button type="button" onClick={() => setShowArchived(!showArchived)} className={showArchived ? "chip active" : "chip"}>
            {showArchived ? t("orders.hideBilled") : t("orders.showBilled")}
          </button>

          {/* Umschalter Kanban / Tabelle */}
          <div className="segmented workshop-view-toggle">
            <button onClick={() => setViewMode("kanban")} className={viewMode === "kanban" ? "active" : ""} title={t("orders.kanbanView")} aria-label={t("orders.kanbanView")}>
              <LayoutGrid size={17} />
            </button>
            <button onClick={() => setViewMode("table")} className={viewMode === "table" ? "active" : ""} title={t("orders.tableView")} aria-label={t("orders.tableView")}>
              <List size={17} />
            </button>
          </div>

          <button onClick={() => setNewOrderModalOpen(true)} className="button primary">
            <Plus size={18} />
            {t("orders.accept")}
          </button>
        </div>
      </div>

      {/* KANBAN ANSICHT */}
      {viewMode === "kanban" ? (
        <div className="workshop-board">
          {STAGES.map((stage) => {
            const stageOrders = filtered.filter((o) => o.status === stage.id);
            return (
              <section key={stage.id} className={`workshop-column tone-${stage.tone}`}>
                <div className="workshop-column-head">
                  <strong>{t(`orders.stages.${stage.id}`)}</strong>
                  <span className="pill">{stageOrders.length}</span>
                </div>

                {stageOrders.length === 0 ? (
                  <p className="empty muted">{t("orders.noVehicles")}</p>
                ) : (
                  stageOrders.map((ord) => (
                    <button key={ord.id} type="button" onClick={() => setSelectedOrder(ord)} className="workshop-job">
                      <span className="workshop-job-top">
                        <span className="list-main">
                          <strong className="workshop-plate">{ord.licensePlate}</strong>
                          <small className="muted">{ord.vehicleInfo}</small>
                        </span>
                        <small className="muted workshop-mono">{lift(ord.liftBay)}</small>
                      </span>
                      {ord.issueDescription && <span className="workshop-job-issue">{ord.issueDescription}</span>}
                      <span className="workshop-job-foot">
                        <small className="muted">{ord.customerName}</small>
                        <strong className="workshop-num">{fmtEuro(ord.totalGross)}</strong>
                      </span>
                    </button>
                  ))
                )}
              </section>
            );
          })}
        </div>
      ) : (
        /* LISTENANSICHT */
        <section className="card list-card">
          {filtered.length === 0 ? (
            <p className="empty muted">{t("orders.empty")}</p>
          ) : (
            filtered.map((ord) => (
              <button key={ord.id} type="button" onClick={() => setSelectedOrder(ord)} className="list-row workshop-row">
                <span className="workshop-row-number workshop-mono">{ord.orderNumber}</span>
                <span className="list-main">
                  <strong className="workshop-plate">{ord.licensePlate}</strong>
                  <small className="muted">{ord.vehicleInfo}</small>
                </span>
                <span className="list-main workshop-row-customer">
                  <span>{ord.customerName}</span>
                  <small className="muted">{ord.customerPhone} · {lift(ord.liftBay)}</small>
                </span>
                <span className="workshop-row-meta">
                  <span className="pill">{t(`status.${ord.status}.label`)}</span>
                  <strong className="workshop-num">{fmtEuro(ord.totalGross)}</strong>
                  <small className="muted">{day(ord.createdAt)}</small>
                </span>
              </button>
            ))
          )}
        </section>
      )}

      {/* Modal: Neuer Auftrag */}
      {newOrderModalOpen && (
        <NewOrderModal vehicles={vehicles} onClose={() => setNewOrderModalOpen(false)} onCreated={handleOrderCreated} />
      )}

      {/* Modal: Auftragsdetails & Bearbeitung */}
      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          parts={parts}
          tenantId={tenantId}
          hasPos={hasPos}
          isManager={isManager}
          onClose={() => setSelectedOrder(null)}
          onUpdated={handleOrderUpdated}
          onDeleted={handleOrderDeleted}
        />
      )}
    </div>
  );
}
