import { useState } from "react";
import {
  FileText,
  Plus,
  PenTool,
  Printer,
  CheckCircle2,
  Clock,
  Banknote,
  CreditCard,
  Trash2,
  X,
  Search,
  ShieldCheck,
  User,
  Car,
  Wrench,
  Receipt,
} from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type {
  CraftProject,
  CraftReport,
  CraftReportItem,
  CraftReportStatus,
  ReportItemType,
} from "../../../shared/craft";
import { SignaturePad } from "./SignaturePad";
import { CraftPrint } from "./CraftPrint";

interface ReportsTabProps {
  reports: CraftReport[];
  projects: CraftProject[];
  onRefresh: () => void;
}

export function ReportsTab({ reports, projects, onRefresh }: ReportsTabProps) {
  const [filterStatus, setFilterStatus] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [signingReport, setSigningReport] = useState<CraftReport | null>(null);
  const [printingReport, setPrintingReport] = useState<CraftReport | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // New Report Form State
  const [newProjectId, setNewProjectId] = useState(projects[0]?.id || "");
  const [newWorkerName, setNewWorkerName] = useState("Markus Krause (Meister)");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newHours, setNewHours] = useState(8);
  const [newTravelKm, setNewTravelKm] = useState(15);
  const [newWorkDescription, setNewWorkDescription] = useState("");
  const [newItems, setNewItems] = useState<CraftReportItem[]>([
    {
      id: "item-1",
      type: "lohn",
      name: "Monteurstunden Elektro- / Sanitärinstallation",
      quantity: 8,
      unit: "Std.",
      unitPriceNet: 68.0,
      totalNet: 544.0,
      taxRate: 19,
    },
    {
      id: "item-2",
      type: "fahrt",
      name: "An- und Abfahrt Baustelle",
      quantity: 15,
      unit: "km",
      unitPriceNet: 1.6,
      totalNet: 24.0,
      taxRate: 19,
    },
  ]);

  const fmtEuro = (amount?: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount || 0);

  const filteredReports = reports.filter((r) => {
    const matchesStatus = filterStatus === "alle" || r.status === filterStatus;
    const matchesSearch =
      !search ||
      r.reportNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.projectTitle.toLowerCase().includes(search.toLowerCase()) ||
      r.customerName.toLowerCase().includes(search.toLowerCase()) ||
      r.workerName.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleSaveSignature = async (signatureDataUrl: string) => {
    if (!signingReport) return;
    setIsBusy(true);
    try {
      await api(`/craft/reports/${signingReport.id}/sign`, {
        method: "POST",
        body: JSON.stringify({
          signatureDataUrl,
          signedByName: signingReport.customerName,
        }),
      });
      setSigningReport(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCheckout = async (reportId: string, paymentMethod: "bar" | "karte" | "rechnung") => {
    setIsBusy(true);
    try {
      await api(`/craft/reports/${reportId}/checkout`, {
        method: "POST",
        body: JSON.stringify({ paymentMethod }),
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Arbeitsbericht wirklich löschen?")) return;
    setIsBusy(true);
    try {
      await api(`/craft/reports/${id}`, { method: "DELETE" });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  // Position Builder Helpers
  const addItemRow = (type: ReportItemType) => {
    const newItem: CraftReportItem = {
      id: "item-" + Math.random().toString(36).slice(2, 9),
      type,
      name: type === "material" ? "Materialposition" : type === "lohn" ? "Zusatzstunden" : "Fahrstrecke",
      quantity: 1,
      unit: type === "lohn" ? "Std." : type === "fahrt" ? "km" : "Stk.",
      unitPriceNet: type === "lohn" ? 68.0 : type === "fahrt" ? 1.6 : 25.0,
      totalNet: type === "lohn" ? 68.0 : type === "fahrt" ? 1.6 : 25.0,
      taxRate: 19,
    };
    setNewItems([...newItems, newItem]);
  };

  const updateItemRow = (index: number, field: keyof CraftReportItem, value: any) => {
    const updated = [...newItems];
    (updated[index] as any)[field] = value;
    if (field === "quantity" || field === "unitPriceNet") {
      const q = field === "quantity" ? parseFloat(value) || 0 : updated[index].quantity;
      const p = field === "unitPriceNet" ? parseFloat(value) || 0 : updated[index].unitPriceNet;
      updated[index].totalNet = Math.round(q * p * 100) / 100;
    }
    setNewItems(updated);
  };

  const removeItemRow = (index: number) => {
    setNewItems(newItems.filter((_, i) => i !== index));
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectId || !newWorkerName || !newWorkDescription) return;
    setIsBusy(true);
    try {
      await api("/craft/reports", {
        method: "POST",
        body: JSON.stringify({
          projectId: newProjectId,
          date: newDate,
          workerName: newWorkerName,
          hoursWorked: newHours,
          travelKm: newTravelKm,
          workDescription: newWorkDescription,
          items: newItems,
        }),
      });
      setIsNewModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: "alle", label: `Alle (${reports.length})` },
            { id: "entwurf", label: "Ausstehende Unterschrift" },
            { id: "unterschrieben", label: "Unterschrieben" },
            { id: "abgerechnet", label: "Abgerechnet" },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setFilterStatus(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filterStatus === s.id
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search & New Report */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Bericht, Bauherr, Monteur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
          </div>

          <button
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Neuer Rapportzettel
          </button>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredReports.length === 0 ? (
          <div className="col-span-full text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">Keine Arbeitsberichte gefunden</p>
            <p className="text-xs text-slate-500 mt-1">
              Erstelle einen neuen Rapportzettel mit Stunden und Material für die Vor-Ort-Abnahme.
            </p>
          </div>
        ) : (
          filteredReports.map((report) => {
            const isDraft = report.status === "entwurf";
            const isSigned = report.status === "unterschrieben";
            const isCompleted = report.status === "abgerechnet";

            return (
              <div
                key={report.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${
                  isDraft
                    ? "border-amber-300 dark:border-amber-700/80 ring-1 ring-amber-300/30"
                    : isSigned
                    ? "border-blue-300 dark:border-blue-700/80"
                    : "border-slate-200 dark:border-slate-800 opacity-80"
                }`}
              >
                <div>
                  {/* Top Bar: Number & Status */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                      {report.reportNumber}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isDraft
                          ? "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200"
                          : isSigned
                          ? "bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200"
                          : "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200"
                      }`}
                    >
                      {isDraft ? "Unterschrift ausstehend" : isSigned ? "Unterzeichnet" : "Abgerechnet"}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-white text-sm line-clamp-1 mb-1">
                    {report.projectTitle}
                  </h3>

                  <div className="text-xs text-slate-500 flex items-center justify-between mb-3">
                    <span>Bauherr: {report.customerName}</span>
                    <span className="font-mono">{new Date(report.date).toLocaleDateString("de-DE")}</span>
                  </div>

                  {/* Work Description preview */}
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 mb-3">
                    {report.workDescription}
                  </p>

                  {/* § 35a Split info */}
                  <div className="space-y-1 text-[11px] font-mono text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                    <div className="flex justify-between">
                      <span>Lohnanteil (§ 35a):</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {fmtEuro(report.totalWageNet * 1.19)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Materialanteil:</span>
                      <span>{fmtEuro(report.totalMaterialNet * 1.19)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-xs text-slate-900 dark:text-white pt-1">
                      <span>Gesamtbetrag:</span>
                      <span className="text-amber-600 dark:text-amber-400">
                        {fmtEuro(report.totalGross)}
                      </span>
                    </div>
                  </div>

                  {/* Signature preview / button */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    {report.signatureDataUrl ? (
                      <div className="flex items-center gap-3 bg-emerald-50/70 dark:bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800/40">
                        <img
                          src={report.signatureDataUrl}
                          alt="Signatur"
                          className="h-9 w-24 object-contain bg-white dark:bg-slate-900 rounded p-1"
                        />
                        <div className="text-[11px] text-emerald-800 dark:text-emerald-300">
                          <span className="font-bold block">Digital unterzeichnet</span>
                          <span className="opacity-75">
                            {report.signedAt ? new Date(report.signedAt).toLocaleDateString("de-DE") : ""}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSigningReport(report)}
                        className="w-full py-2.5 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98"
                      >
                        <PenTool className="w-4 h-4" />
                        Jetzt digital unterschreiben lassen
                      </button>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPrintingReport(report)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Rapportzettel drucken"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(report.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                      title="Löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Checkout buttons for signed reports */}
                  {isSigned && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCheckout(report.id, "bar")}
                        disabled={isBusy}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition-colors"
                      >
                        Bar
                      </button>
                      <button
                        onClick={() => handleCheckout(report.id, "karte")}
                        disabled={isBusy}
                        className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition-colors"
                      >
                        Karte
                      </button>
                      <button
                        onClick={() => handleCheckout(report.id, "rechnung")}
                        disabled={isBusy}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition-colors"
                      >
                        Rechnung
                      </button>
                    </div>
                  )}

                  {isCompleted && (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Bezahlt ({report.paymentMethod || "Kasse"})
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Signature Modal */}
      {signingReport && (
        <SignaturePad
          customerName={signingReport.customerName}
          onSave={handleSaveSignature}
          onCancel={() => setSigningReport(null)}
        />
      )}

      {/* Print Overlay */}
      {printingReport && (
        <CraftPrint
          report={printingReport}
          onClose={() => setPrintingReport(null)}
        />
      )}

      {/* Modal: New Report */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Neuen Arbeitsbericht / Rapportzettel anlegen
              </h3>
              <button onClick={() => setIsNewModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateReport} className="space-y-4">
              <Field label="Bauvorhaben / Baustelle" required>
                <select
                  required
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectNumber} · {p.title} ({p.customerName})
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Monteur vor Ort" required>
                  <input
                    type="text"
                    required
                    value={newWorkerName}
                    onChange={(e) => setNewWorkerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </Field>

                <Field label="Datum" required>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </Field>

                <Field label="Arbeitsstunden">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={newHours}
                    onChange={(e) => setNewHours(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold"
                  />
                </Field>
              </div>

              <Field label="Ausgeführte Arbeiten & Leistungen" required>
                <textarea
                  rows={3}
                  required
                  placeholder="z.B. Kabelzug im EG abgeschlossen, Verteilerkasten neu verdrahtet, Isolationsmessung durchgeführt..."
                  value={newWorkDescription}
                  onChange={(e) => setNewWorkDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </Field>

              {/* Items position builder */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Positionen (Lohn, Fahrt & Material):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => addItemRow("lohn")}
                      className="px-2 py-1 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded font-semibold text-slate-700 dark:text-slate-300"
                    >
                      + Lohn
                    </button>
                    <button
                      type="button"
                      onClick={() => addItemRow("material")}
                      className="px-2 py-1 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded font-semibold text-slate-700 dark:text-slate-300"
                    >
                      + Material
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl p-2">
                  {newItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-2 text-xs">
                      <span
                        className={`text-[9px] uppercase px-1 py-0.5 rounded font-bold ${
                          item.type === "lohn" || item.type === "fahrt"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {item.type}
                      </span>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItemRow(idx, "name", e.target.value)}
                        className="flex-1 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs"
                      />
                      <input
                        type="number"
                        step="0.5"
                        value={item.quantity}
                        onChange={(e) => updateItemRow(idx, "quantity", e.target.value)}
                        className="w-16 px-1.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono"
                      />
                      <span className="text-[10px] text-slate-400 w-8">{item.unit}</span>
                      <input
                        type="number"
                        step="0.5"
                        value={item.unitPriceNet}
                        onChange={(e) => updateItemRow(idx, "unitPriceNet", e.target.value)}
                        className="w-20 px-1.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        className="text-slate-300 hover:text-red-500 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  Bericht erstellen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
