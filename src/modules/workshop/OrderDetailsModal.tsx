import { useState } from "react";
import {
  X,
  Printer,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Trash2,
  Wrench,
  Car,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CreditCard,
  Banknote,
  FileText,
  ShoppingCart,
  Send,
  Shield,
  Phone,
  Mail,
} from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { InspectionItem, OrderPosition, SparePart, WorkshopOrder, WorkshopOrderStatus } from "../../../shared/workshop";
import { WorkshopPrint } from "./WorkshopPrint";

interface OrderDetailsModalProps {
  order: WorkshopOrder;
  parts: SparePart[];
  tenantId: string;
  hasPos: boolean;
  onClose: () => void;
  onUpdated: (updated: WorkshopOrder) => void;
  onDeleted: (id: string) => void;
}

const STATUS_CONFIG: Record<
  WorkshopOrderStatus,
  { label: string; bg: string; text: string; border: string; desc: string }
> = {
  annahme: {
    label: "01. Annahme",
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-800 dark:text-slate-200",
    border: "border-slate-300 dark:border-slate-700",
    desc: "Fahrzeug angenommen, Hebebühne zugewiesen",
  },
  diagnose: {
    label: "02. Diagnose",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-800",
    desc: "Fehleranalyse & Kostenschätzung läuft",
  },
  wartet_teile: {
    label: "03. Wartet auf Teile",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    text: "text-orange-800 dark:text-orange-300",
    border: "border-orange-300 dark:border-orange-800",
    desc: "Ersatzteile bestellt oder KVA beim Kunden",
  },
  in_arbeit: {
    label: "04. Auf Hebebühne",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-800 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-800",
    desc: "Reparatur & Wartung aktiv in Arbeit",
  },
  endkontrolle: {
    label: "05. Endkontrolle",
    bg: "bg-purple-50 dark:bg-purple-950/40",
    text: "text-purple-800 dark:text-purple-300",
    border: "border-purple-300 dark:border-purple-800",
    desc: "Meisterabnahme & Probefahrt",
  },
  abholbereit: {
    label: "06. Abholbereit",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-800",
    desc: "Fahrzeug fertig, Kunde benachrichtigt",
  },
  abgerechnet: {
    label: "07. Abgerechnet",
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-slate-300 dark:border-slate-700",
    desc: "Rechnung erstellt und bezahlt",
  },
};

const DEFAULT_INSPECTION_ITEMS: InspectionItem[] = [
  { id: "1", category: "motor_abgas", name: "Motoröl & Filter", status: "ok" },
  { id: "2", category: "bremsen", name: "Bremsbeläge & Scheiben Vorderachse", status: "not_checked" },
  { id: "3", category: "bremsen", name: "Bremsbeläge & Scheiben Hinterachse", status: "not_checked" },
  { id: "4", category: "fluessigkeiten", name: "Bremsflüssigkeit (Siedepunkt)", status: "ok" },
  { id: "5", category: "fluessigkeiten", name: "Kühlmittel & Frostschutz", status: "ok" },
  { id: "6", category: "reifen", name: "Reifenprofil & Luftdruck", status: "ok" },
  { id: "7", category: "fahrwerk", name: "Stoßdämpfer & Koppelstangen", status: "not_checked" },
  { id: "8", category: "beleuchtung", name: "Lichtanlage & Scheinwerfereinstellung", status: "ok" },
  { id: "9", category: "karosserie", name: "Scheibenwischer & Scheibenwaschanlage", status: "ok" },
];

export function OrderDetailsModal({
  order: initialOrder,
  parts,
  tenantId,
  hasPos,
  onClose,
  onUpdated,
  onDeleted,
}: OrderDetailsModalProps) {
  const [order, setOrder] = useState<WorkshopOrder>(initialOrder);
  const [activeSubTab, setActiveSubTab] = useState<"positions" | "checklist" | "diagnostic" | "checkout">("positions");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Druckdialog
  const [printDoc, setPrintDoc] = useState<"intake" | "invoice" | null>(null);

  // Position hinzufügen
  const [newPosType, setNewPosType] = useState<"labor" | "part">("labor");
  const [newPosName, setNewPosName] = useState("");
  const [newPosCode, setNewPosCode] = useState("");
  const [newPosQty, setNewPosQty] = useState<number>(1);
  const [newPosUnit, setNewPosUnit] = useState<OrderPosition["unit"]>("AW");
  const [newPosPrice, setNewPosPrice] = useState<number>(9.5);
  const [selectedPartId, setSelectedPartId] = useState("");

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  // Status-URL für den Kunden
  const statusUrl = `${window.location.origin}/status/kfz/${tenantId}/${order.statusToken}`;

  const copyStatusLink = () => {
    navigator.clipboard.writeText(statusUrl);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleStatusChange = async (newStatus: WorkshopOrderStatus) => {
    try {
      const updated = await api<WorkshopOrder>(`/workshop/orders/${order.id}/status`, {
        method: "POST",
        body: { status: newStatus },
      });
      setOrder(updated);
      onUpdated(updated);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Aktualisieren des Status.");
    }
  };

  const handlePartSelect = (partId: string) => {
    setSelectedPartId(partId);
    const p = parts.find((item) => item.id === partId);
    if (p) {
      setNewPosType("part");
      setNewPosName(p.name);
      setNewPosCode(p.partNumber);
      setNewPosUnit("Stück");
      setNewPosPrice(p.salePriceNet);
    }
  };

  const handleAddPosition = async () => {
    if (!newPosName.trim()) return;

    const newPos: OrderPosition = {
      id: crypto.randomUUID(),
      type: newPosType,
      code: newPosCode.trim() || undefined,
      name: newPosName.trim(),
      quantity: Number(newPosQty) || 1,
      unit: newPosUnit,
      unitPriceNet: Number(newPosPrice) || 0,
      taxRate: 19,
      approvedByCustomer: true,
    };

    const newPositions = [...order.positions, newPos];
    await savePositions(newPositions);

    // Reset Formular
    setNewPosName("");
    setNewPosCode("");
    setSelectedPartId("");
    if (newPosType === "labor") {
      setNewPosQty(6);
      setNewPosUnit("AW");
      setNewPosPrice(9.5);
    } else {
      setNewPosQty(1);
      setNewPosUnit("Stück");
      setNewPosPrice(25.0);
    }
  };

  const handleRemovePosition = async (posId: string) => {
    const newPositions = order.positions.filter((p) => p.id !== posId);
    await savePositions(newPositions);
  };

  const savePositions = async (positions: OrderPosition[]) => {
    setSaving(true);
    try {
      const updated = await api<WorkshopOrder>(`/workshop/orders/${order.id}`, {
        method: "PUT",
        body: { positions },
      });
      setOrder(updated);
      onUpdated(updated);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Speichern der Positionen.");
    } finally {
      setSaving(false);
    }
  };

  const handleChecklistChange = async (itemId: string, status: InspectionItem["status"], note?: string) => {
    const list = order.checklist && order.checklist.length > 0 ? [...order.checklist] : [...DEFAULT_INSPECTION_ITEMS];
    const idx = list.findIndex((i) => i.id === itemId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], status, note: note ?? list[idx].note };
    } else {
      list.push({ id: itemId, category: "sonstiges" as any, name: "Prüfpunkt", status, note });
    }

    try {
      const updated = await api<WorkshopOrder>(`/workshop/orders/${order.id}`, {
        method: "PUT",
        body: { checklist: list },
      });
      setOrder(updated);
      onUpdated(updated);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Aktualisieren der Checkliste.");
    }
  };

  const handleCheckout = async (paymentMethod: "bar" | "karte" | "rechnung" | "pos") => {
    setSaving(true);
    try {
      const updated = await api<WorkshopOrder>(`/workshop/orders/${order.id}/checkout`, {
        method: "POST",
        body: { paymentMethod },
      });
      setOrder(updated);
      onUpdated(updated);
      setPrintDoc("invoice");
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Abrechnen.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api(`/workshop/orders/${order.id}`, { method: "DELETE" });
      onDeleted(order.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Löschen des Auftrags.");
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl shadow-2xl max-w-4xl w-full p-6 relative border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg font-mono shadow-sm">
                {order.licensePlate.split("-")[0] || "KFZ"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
                    {order.licensePlate}
                  </h2>
                  <span className="text-xs text-slate-500 font-mono">({order.orderNumber})</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                      STATUS_CONFIG[order.status]?.bg
                    } ${STATUS_CONFIG[order.status]?.text} ${STATUS_CONFIG[order.status]?.border}`}
                  >
                    {STATUS_CONFIG[order.status]?.label}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {order.vehicleInfo} · {order.mileage.toLocaleString("de-DE")} km · {order.liftBay}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setPrintDoc("intake")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
                title="Werkstattauftrag & Annahmeschein drucken"
              >
                <Printer className="w-3.5 h-3.5" />
                Auftrag drucken
              </button>

              <button
                onClick={() => setPrintDoc("invoice")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors"
                title="Rechnung drucken"
              >
                <FileText className="w-3.5 h-3.5" />
                Rechnung
              </button>

              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="mt-3 p-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 shrink-0">
              {errorMsg}
            </div>
          )}

          {/* Quick-Status Lifecycle Bar */}
          <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Auftragsphase ändern</span>
              <span className="text-slate-400">{STATUS_CONFIG[order.status]?.desc}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STATUS_CONFIG) as WorkshopOrderStatus[]).map((st) => (
                <button
                  key={st}
                  onClick={() => handleStatusChange(st)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors border ${
                    order.status === st
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                  }`}
                >
                  {STATUS_CONFIG[st].label}
                </button>
              ))}
            </div>
          </div>

          {/* Customer Portal Link Banner */}
          <div className="mt-3 px-3 py-2 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl flex items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 truncate">
              <span className="font-semibold text-blue-700 dark:text-blue-400">Kunden-Portal:</span>
              <span className="font-mono text-slate-500 truncate">{statusUrl}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={copyStatusLink}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md font-medium text-[11px] transition-colors"
              >
                {copyFeedback ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copyFeedback ? "Kopiert!" : "Link kopieren"}
              </button>
              <a
                href={`/status/kfz/${tenantId}/${order.statusToken}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium text-[11px] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Öffnen
              </a>
            </div>
          </div>

          {/* Subtabs Bar */}
          <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 mt-4 shrink-0">
            <button
              onClick={() => setActiveSubTab("positions")}
              className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeSubTab === "positions"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Leistungen & Teile ({order.positions.length})
            </button>
            <button
              onClick={() => setActiveSubTab("checklist")}
              className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeSubTab === "checklist"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Dialogannahme / Checkliste
            </button>
            <button
              onClick={() => setActiveSubTab("diagnostic")}
              className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeSubTab === "diagnostic"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Kundenauftrag & Diagnose
            </button>
            <button
              onClick={() => setActiveSubTab("checkout")}
              className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeSubTab === "checkout"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Kasse & Abrechnung
            </button>
          </div>

          {/* Tab Content - Scrollable */}
          <div className="mt-4 overflow-y-auto flex-1 pr-1 space-y-4">
            {/* SUBTAB 1: POSITIONEN */}
            {activeSubTab === "positions" && (
              <div className="space-y-4 text-xs">
                {/* Formular: Neue Position hinzufügen */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Position hinzufügen (Arbeitswert oder Ersatzteil)
                    </span>
                    <div className="flex gap-1 p-0.5 bg-slate-200 dark:bg-slate-700 rounded-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setNewPosType("labor");
                          setNewPosUnit("AW");
                          setNewPosPrice(9.5);
                        }}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                          newPosType === "labor"
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                            : "text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        Arbeitswert (AW)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewPosType("part");
                          setNewPosUnit("Stück");
                          setNewPosPrice(25.0);
                        }}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                          newPosType === "part"
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                            : "text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        Ersatzteil aus Lager
                      </button>
                    </div>
                  </div>

                  {newPosType === "part" && parts.length > 0 && (
                    <div>
                      <Field label="Aus Ersatzteillager wählen">
                        <select
                          value={selectedPartId}
                          onChange={(e) => handlePartSelect(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                        >
                          <option value="">-- Teil aus Lager auswählen --</option>
                          {parts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.partNumber} - {p.name} (Bestand: {p.stock} | {fmtEuro(p.salePriceNet)})
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2">
                      <Field label="Bezeichnung *">
                        <input
                          type="text"
                          placeholder={newPosType === "labor" ? "z. B. Bremsbeläge VA erneuern" : "z. B. Ölfilter"}
                          value={newPosName}
                          onChange={(e) => setNewPosName(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                        />
                      </Field>
                    </div>

                    <div>
                      <Field label="Menge & Einheit">
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="0.1"
                            value={newPosQty}
                            onChange={(e) => setNewPosQty(Number(e.target.value))}
                            className="w-16 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
                          />
                          <select
                            value={newPosUnit}
                            onChange={(e) => setNewPosUnit(e.target.value as any)}
                            className="flex-1 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                          >
                            <option value="AW">AW</option>
                            <option value="Std">Std</option>
                            <option value="Stück">Stück</option>
                            <option value="Liter">Liter</option>
                            <option value="Satz">Satz</option>
                            <option value="Pauschal">Pauschal</option>
                          </select>
                        </div>
                      </Field>
                    </div>

                    <div>
                      <Field label="Einzelpreis Netto (€)">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={newPosPrice}
                            onChange={(e) => setNewPosPrice(Number(e.target.value))}
                            className="flex-1 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleAddPosition}
                            disabled={!newPosName.trim() || saving}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-xs disabled:opacity-50 transition-colors shrink-0"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </Field>
                    </div>
                  </div>
                </div>

                {/* Tabelle der vorhandenen Positionen */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Typ</th>
                        <th className="py-2.5 px-3 font-semibold">Bezeichnung</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Menge</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Einzel (€)</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Netto</th>
                        <th className="py-2.5 px-3 text-center font-semibold">Freigabe</th>
                        <th className="py-2.5 px-3 text-right">Aktion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {order.positions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400">
                            Noch keine Positionen erfasst. Füge oben Arbeitswerte oder Ersatzteile hinzu.
                          </td>
                        </tr>
                      ) : (
                        order.positions.map((pos) => {
                          const net = pos.quantity * pos.unitPriceNet;
                          return (
                            <tr key={pos.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                                {pos.type === "labor" ? "AW" : "ET"}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                                {pos.name}
                                {pos.code && <span className="ml-2 font-mono text-[11px] text-slate-400">({pos.code})</span>}
                              </td>
                              <td className="py-2 px-3 text-right font-mono">
                                {pos.quantity} {pos.unit}
                              </td>
                              <td className="py-2 px-3 text-right font-mono">{fmtEuro(pos.unitPriceNet)}</td>
                              <td className="py-2 px-3 text-right font-mono font-semibold">{fmtEuro(net)}</td>
                              <td className="py-2 px-3 text-center">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    pos.approvedByCustomer
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                  }`}
                                >
                                  {pos.approvedByCustomer ? "Freigegeben" : "Offen"}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  onClick={() => handleRemovePosition(pos.id)}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                                  title="Position löschen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Summenblock */}
                <div className="flex justify-end pt-2">
                  <div className="w-64 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Nettosumme:</span>
                      <span className="font-mono">{fmtEuro(order.totalNet)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>MwSt. (19%):</span>
                      <span className="font-mono">{fmtEuro(order.totalTax)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-slate-100 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                      <span>Gesamtbetrag:</span>
                      <span className="font-mono text-blue-600 dark:text-blue-400">{fmtEuro(order.totalGross)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 2: CHECKLISTE / DIALOGANNAHME */}
            {activeSubTab === "checklist" && (
              <div className="space-y-3 text-xs">
                <p className="text-slate-600 dark:text-slate-400">
                  Prüfpunkte der Dialogannahme & Sichtprüfung. Änderungen werden sofort gespeichert und im Kundenportal
                  sowie auf dem Werkstattauftrag angezeigt.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(order.checklist && order.checklist.length > 0 ? order.checklist : DEFAULT_INSPECTION_ITEMS).map(
                    (item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</span>
                          <span className="text-[10px] uppercase font-mono text-slate-400">{item.category}</span>
                        </div>

                        {/* Ampelauswahl */}
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleChecklistChange(item.id, "ok")}
                            className={`flex-1 py-1 text-center rounded text-[11px] font-semibold transition-colors border ${
                              item.status === "ok"
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            ✓ OK
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChecklistChange(item.id, "warning")}
                            className={`flex-1 py-1 text-center rounded text-[11px] font-semibold transition-colors border ${
                              item.status === "warning"
                                ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            ⚠ Hinweis
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChecklistChange(item.id, "defect")}
                            className={`flex-1 py-1 text-center rounded text-[11px] font-semibold transition-colors border ${
                              item.status === "defect"
                                ? "bg-red-600 text-white border-red-600 shadow-sm"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            ✕ Mangel
                          </button>
                        </div>

                        <input
                          type="text"
                          placeholder="Zusätzliche Notiz (z. B. Belagstärke, Messwert)..."
                          value={item.note || ""}
                          onChange={(e) => handleChecklistChange(item.id, item.status, e.target.value)}
                          className="w-full px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs"
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* SUBTAB 3: KUNDENAUFTRAG & DIAGNOSE */}
            {activeSubTab === "diagnostic" && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      Kunde & Ansprechpartner
                    </div>
                    <p className="font-bold text-sm text-slate-900 dark:text-slate-100">{order.customerName}</p>
                    <p className="text-slate-600 dark:text-slate-400 mt-1">Telefon: {order.customerPhone}</p>
                    {order.customerEmail && (
                      <p className="text-slate-600 dark:text-slate-400">E-Mail: {order.customerEmail}</p>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5" />
                      Fahrzeugdaten
                    </div>
                    <p className="font-bold text-sm font-mono text-blue-600 dark:text-blue-400">{order.licensePlate}</p>
                    <p className="text-slate-700 dark:text-slate-300 font-medium">{order.vehicleInfo}</p>
                    <p className="text-slate-500 font-mono mt-1">KM-Stand: {order.mileage.toLocaleString("de-DE")} km</p>
                  </div>
                </div>

                <div>
                  <Field label="Kundenbeanstandung / Fehlerbeschreibung">
                    <textarea
                      rows={3}
                      value={order.issueDescription}
                      onChange={(e) => setOrder({ ...order, issueDescription: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Werkstatt-Diagnose & Befund (auch für Kundenportal sichtbar)">
                    <textarea
                      rows={3}
                      placeholder="Diagnoseergebnis der Werkstatt, Ursache der Beanstandung..."
                      value={order.diagnosticNotes}
                      onChange={(e) => setOrder({ ...order, diagnosticNotes: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                    />
                  </Field>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const updated = await api<WorkshopOrder>(`/workshop/orders/${order.id}`, {
                          method: "PUT",
                          body: {
                            issueDescription: order.issueDescription,
                            diagnosticNotes: order.diagnosticNotes,
                          },
                        });
                        setOrder(updated);
                        onUpdated(updated);
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs transition-colors"
                  >
                    Befund & Notizen speichern
                  </button>
                </div>
              </div>
            )}

            {/* SUBTAB 4: KASSE & ABRECHNUNG */}
            {activeSubTab === "checkout" && (
              <div className="space-y-4 text-xs">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Abrechnungsstatus</span>
                      <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {order.paymentStatus === "bezahlt"
                          ? `Bezahlt via ${order.paymentMethod?.toUpperCase()}`
                          : "Offener Rechnungsbetrag"}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500">Gesamt brutto</span>
                      <p className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
                        {fmtEuro(order.totalGross)}
                      </p>
                    </div>
                  </div>

                  {order.paymentStatus !== "bezahlt" ? (
                    <div className="mt-4 space-y-3">
                      <p className="text-slate-600 dark:text-slate-400 font-medium">
                        Direkte Zahlung erfassen und Werkstattauftrag abschließen:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleCheckout("bar")}
                          className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl shadow-sm transition-colors"
                        >
                          <Banknote className="w-4 h-4" />
                          Barzahlung (€)
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCheckout("karte")}
                          className="flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm transition-colors"
                        >
                          <CreditCard className="w-4 h-4" />
                          EC- / Kreditkarte
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCheckout("rechnung")}
                          className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-medium rounded-xl shadow-sm transition-colors"
                        >
                          <FileText className="w-4 h-4" />
                          Auf Rechnung (Überweisung)
                        </button>
                      </div>

                      {hasPos && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                          <span className="text-slate-500">Möchtest du den Betrag an die Hauptkasse übergeben?</span>
                          <a
                            href="/kasse"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 hover:bg-emerald-200 transition-colors"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            Zur Kasse wechseln
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <div>
                          <p className="font-semibold">Auftrag ist vollständig abgerechnet.</p>
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                            Bezahlt am {new Date(order.completedAt || order.updatedAt).toLocaleDateString("de-DE")}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setPrintDoc("invoice")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg font-medium text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-50 transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Rechnung drucken
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer mit Löschen-Sicherheit */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 mt-4 shrink-0">
            <div>
              {deleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-semibold">Unwiderruflich löschen?</span>
                  <button
                    onClick={handleDelete}
                    className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold transition-colors"
                  >
                    Ja, löschen
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="px-2 py-1 text-slate-500 hover:text-slate-700 text-xs"
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Auftrag löschen
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-lg transition-colors"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>

      {/* Druck-Overlay */}
      {printDoc && (
        <WorkshopPrint
          order={order}
          type={printDoc}
          onClose={() => setPrintDoc(null)}
        />
      )}
    </>
  );
}
