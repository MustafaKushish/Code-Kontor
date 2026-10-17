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

interface OrdersTabProps {
  orders: WorkshopOrder[];
  vehicles: Vehicle[];
  parts: SparePart[];
  tenantId: string;
  hasPos: boolean;
  onRefresh: () => void;
  onOrdersChanged: (orders: WorkshopOrder[]) => void;
}

const STAGES: { id: WorkshopOrderStatus; label: string; tone: string }[] = [
  { id: "annahme", label: "01. Annahme", tone: "neutral" },
  { id: "diagnose", label: "02. Diagnose", tone: "warn" },
  { id: "wartet_teile", label: "03. Warten / KVA", tone: "orange" },
  { id: "in_arbeit", label: "04. Hebebühne", tone: "info" },
  { id: "endkontrolle", label: "05. Endkontrolle", tone: "purple" },
  { id: "abholbereit", label: "06. Abholbereit", tone: "ok" },
];

export function OrdersTab({
  orders,
  vehicles,
  parts,
  tenantId,
  hasPos,
  onRefresh,
  onOrdersChanged,
}: OrdersTabProps) {
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [liftFilter, setLiftFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<WorkshopOrder | null>(null);
  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false);

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

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
            placeholder="Kennzeichen, Kunde, Auftrags-Nr..."
            aria-label="Kennzeichen, Kunde, Auftrags-Nr..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        {/* Hebebühnen-Filter */}
        <select value={liftFilter} onChange={(e) => setLiftFilter(e.target.value)} className="workshop-select" aria-label="Hebebühne">
          <option value="all">Alle Hebebühnen & Plätze</option>
          <option value="Bühne 1">Bühne 1 (2-Säulen)</option>
          <option value="Bühne 2">Bühne 2 (Scherenbühne)</option>
          <option value="Bühne 3">Bühne 3 (4-Säulen)</option>
          <option value="Bühne 4 (Achsmessung)">Bühne 4 (Achsmessung)</option>
          <option value="Prüfstraße">Prüfstraße</option>
          <option value="Hof / Parkplatz">Hof / Parkplatz</option>
        </select>

        <div className="row gap workshop-toolbar-end">
          {/* Abgerechnete anzeigen */}
          <button type="button" onClick={() => setShowArchived(!showArchived)} className={showArchived ? "chip active" : "chip"}>
            {showArchived ? "Abgerechnete verbergen" : "Inkl. Abgerechnete"}
          </button>

          {/* Umschalter Kanban / Tabelle */}
          <div className="segmented workshop-view-toggle">
            <button onClick={() => setViewMode("kanban")} className={viewMode === "kanban" ? "active" : ""} title="Kanban-Board (Hebebühnen & Phasen)" aria-label="Kanban-Board (Hebebühnen & Phasen)">
              <LayoutGrid size={17} />
            </button>
            <button onClick={() => setViewMode("table")} className={viewMode === "table" ? "active" : ""} title="Tabellenansicht" aria-label="Tabellenansicht">
              <List size={17} />
            </button>
          </div>

          <button onClick={() => setNewOrderModalOpen(true)} className="button primary">
            <Plus size={18} />
            Auftrag annehmen
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
                  <strong>{stage.label}</strong>
                  <span className="pill">{stageOrders.length}</span>
                </div>

                {stageOrders.length === 0 ? (
                  <p className="empty muted">Keine Fahrzeuge</p>
                ) : (
                  stageOrders.map((ord) => (
                    <button key={ord.id} type="button" onClick={() => setSelectedOrder(ord)} className="workshop-job">
                      <span className="workshop-job-top">
                        <span className="list-main">
                          <strong className="workshop-plate">{ord.licensePlate}</strong>
                          <small className="muted">{ord.vehicleInfo}</small>
                        </span>
                        <small className="muted workshop-mono">{ord.liftBay.split(" ")[0]}</small>
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
            <p className="empty muted">Keine Werkstattaufträge gefunden.</p>
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
                  <small className="muted">{ord.customerPhone} · {ord.liftBay}</small>
                </span>
                <span className="workshop-row-meta">
                  <span className="pill">{ord.status.toUpperCase()}</span>
                  <strong className="workshop-num">{fmtEuro(ord.totalGross)}</strong>
                  <small className="muted">{new Date(ord.createdAt).toLocaleDateString("de-DE")}</small>
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
          onClose={() => setSelectedOrder(null)}
          onUpdated={handleOrderUpdated}
          onDeleted={handleOrderDeleted}
        />
      )}
    </div>
  );
}
