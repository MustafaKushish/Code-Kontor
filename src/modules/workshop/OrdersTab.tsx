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

const STAGES: { id: WorkshopOrderStatus; label: string; accent: string }[] = [
  { id: "annahme", label: "01. Annahme", accent: "border-slate-300 dark:border-slate-700" },
  { id: "diagnose", label: "02. Diagnose", accent: "border-amber-400 dark:border-amber-700" },
  { id: "wartet_teile", label: "03. Warten / KVA", accent: "border-orange-400 dark:border-orange-700" },
  { id: "in_arbeit", label: "04. Hebebühne", accent: "border-blue-500 dark:border-blue-700" },
  { id: "endkontrolle", label: "05. Endkontrolle", accent: "border-purple-400 dark:border-purple-700" },
  { id: "abholbereit", label: "06. Abholbereit", accent: "border-emerald-500 dark:border-emerald-700" },
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
    <div className="space-y-4">
      {/* Filterleiste */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Suche */}
          <div className="relative min-w-[220px] max-w-sm flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Kennzeichen, Kunde, Auftrags-Nr..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Hebebühnen-Filter */}
          <select
            value={liftFilter}
            onChange={(e) => setLiftFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300"
          >
            <option value="all">Alle Hebebühnen & Plätze</option>
            <option value="Bühne 1">Bühne 1 (2-Säulen)</option>
            <option value="Bühne 2">Bühne 2 (Scherenbühne)</option>
            <option value="Bühne 3">Bühne 3 (4-Säulen)</option>
            <option value="Bühne 4 (Achsmessung)">Bühne 4 (Achsmessung)</option>
            <option value="Prüfstraße">Prüfstraße</option>
            <option value="Hof / Parkplatz">Hof / Parkplatz</option>
          </select>

          {/* Abgerechnete anzeigen Toggle */}
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              showArchived
                ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white border-slate-300"
                : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
            }`}
          >
            {showArchived ? "Abgerechnete verbergen" : "Inkl. Abgerechnete"}
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Umschalter Kanban / Tabelle */}
          <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode("kanban")}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === "kanban"
                  ? "bg-white dark:bg-slate-900 text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              title="Kanban-Board (Hebebühnen & Phasen)"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === "table"
                  ? "bg-white dark:bg-slate-900 text-blue-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              title="Tabellenansicht"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Neuer Auftrag Button */}
          <button
            onClick={() => setNewOrderModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Auftrag annehmen
          </button>
        </div>
      </div>

      {/* KANBAN ANSICHT */}
      {viewMode === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 items-start">
          {STAGES.map((stage) => {
            const stageOrders = filtered.filter((o) => o.status === stage.id);
            return (
              <div
                key={stage.id}
                className="bg-slate-100/70 dark:bg-slate-900/60 rounded-2xl p-2.5 border border-slate-200/80 dark:border-slate-800 flex flex-col min-h-[350px]"
              >
                {/* Spaltenkopf */}
                <div className="flex items-center justify-between px-2 py-1.5 mb-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{stage.label}</span>
                  <span className="text-xs font-mono font-semibold text-slate-500">{stageOrders.length}</span>
                </div>

                {/* Karten */}
                <div className="space-y-2.5 flex-1">
                  {stageOrders.length === 0 ? (
                    <div className="py-8 text-center text-[11px] text-slate-400">Keine Fahrzeuge</div>
                  ) : (
                    stageOrders.map((ord) => (
                      <div
                        key={ord.id}
                        onClick={() => setSelectedOrder(ord)}
                        className={`bg-white dark:bg-slate-800 p-3 rounded-xl border-l-2 shadow-sm hover:shadow-md transition-shadow cursor-pointer text-xs space-y-2 border-slate-200 dark:border-slate-700 ${stage.accent}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 block">
                              {ord.licensePlate}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium truncate block max-w-[140px]">
                              {ord.vehicleInfo}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">{ord.liftBay.split(" ")[0]}</span>
                        </div>

                        {ord.issueDescription && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {ord.issueDescription}
                          </p>
                        )}

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-[11px] text-slate-500">
                          <span className="truncate max-w-[100px]">{ord.customerName}</span>
                          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {fmtEuro(ord.totalGross)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABELLENANSICHT */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden text-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Kennzeichen & Modell</th>
                  <th className="py-3 px-4 font-semibold">Auftrags-Nr.</th>
                  <th className="py-3 px-4 font-semibold">Kunde</th>
                  <th className="py-3 px-4 font-semibold">Hebebühne</th>
                  <th className="py-3 px-4 font-semibold">Status / Phase</th>
                  <th className="py-3 px-4 font-semibold text-right">Summe Brutto</th>
                  <th className="py-3 px-4 font-semibold text-right">Datum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Keine Werkstattaufträge gefunden.
                    </td>
                  </tr>
                ) : (
                  filtered.map((ord) => (
                    <tr
                      key={ord.id}
                      onClick={() => setSelectedOrder(ord)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 block">
                          {ord.licensePlate}
                        </span>
                        <span className="text-[11px] text-slate-500">{ord.vehicleInfo}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">{ord.orderNumber}</td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        <span>{ord.customerName}</span>
                        <span className="text-[11px] text-slate-400 block">{ord.customerPhone}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{ord.liftBay}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {ord.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {fmtEuro(ord.totalGross)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">
                        {new Date(ord.createdAt).toLocaleDateString("de-DE")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Neuer Auftrag */}
      {newOrderModalOpen && (
        <NewOrderModal
          vehicles={vehicles}
          onClose={() => setNewOrderModalOpen(false)}
          onCreated={handleOrderCreated}
        />
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
