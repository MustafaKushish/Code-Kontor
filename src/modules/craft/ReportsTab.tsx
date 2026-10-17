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
import { Dialog } from "../../pos/ui";
import type {
  CraftProject,
  CraftReport,
  CraftReportItem,
  CraftReportStatus,
  ReportItemType,
} from "../../../shared/craft";
import { SignaturePad } from "./SignaturePad";
import { CraftPrint } from "./CraftPrint";
import { currency as companyCurrency, currencySymbol } from "../../money";

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
    new Intl.NumberFormat("de-DE", { style: "currency", currency: companyCurrency() }).format(amount || 0);

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
        body: {
          signatureDataUrl,
          signedByName: signingReport.customerName,
        },
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
        body: { paymentMethod },
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
        body: {
          projectId: newProjectId,
          date: newDate,
          workerName: newWorkerName,
          hoursWorked: newHours,
          travelKm: newTravelKm,
          workDescription: newWorkDescription,
          items: newItems,
        },
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
    <div className="stack">
      <div className="toolbar craft-toolbar">
        <div className="craft-toolbar-row">
          <label className="search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Bericht, Bauherr, Monteur..."
              aria-label="Bericht, Bauherr, Monteur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button onClick={() => setIsNewModalOpen(true)} className="button primary">
            <Plus size={18} /> Neuer Rapportzettel
          </button>
        </div>
        <div className="chips" role="tablist">
          {[
            { id: "alle", label: `Alle (${reports.length})` },
            { id: "entwurf", label: "Ausstehende Unterschrift" },
            { id: "unterschrieben", label: "Unterschrieben" },
            { id: "abgerechnet", label: "Abgerechnet" },
          ].map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={filterStatus === s.id}
              onClick={() => setFilterStatus(s.id)}
              className={filterStatus === s.id ? "chip active" : "chip"}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {filteredReports.length === 0 ? (
        <section className="card craft-empty">
          <FileText size={40} aria-hidden />
          <strong>Keine Arbeitsberichte gefunden</strong>
          <p className="muted small">
            Erstelle einen neuen Rapportzettel mit Stunden und Material für die Vor-Ort-Abnahme.
          </p>
        </section>
      ) : (
        <div className="craft-grid">
          {filteredReports.map((report) => {
            const isDraft = report.status === "entwurf";
            const isSigned = report.status === "unterschrieben";
            const isCompleted = report.status === "abgerechnet";

            return (
              <article
                key={report.id}
                className={`card craft-card ${isDraft ? "is-draft" : isCompleted ? "is-done" : ""}`}
              >
                <div className="craft-card-top">
                  <span className="craft-number">{report.reportNumber}</span>
                  <span className={`pill craft-status ${isDraft ? "warn" : isSigned ? "tone-info" : "pos"}`}>
                    {isDraft ? "Unterschrift ausstehend" : isSigned ? "Unterzeichnet" : "Abgerechnet"}
                  </span>
                </div>

                <div className="craft-card-title">
                  <h3>{report.projectTitle}</h3>
                  <small className="muted craft-split">
                    <span>Bauherr: {report.customerName}</span>
                    <span>{new Date(report.date).toLocaleDateString("de-DE")}</span>
                  </small>
                </div>

                <p className="craft-quote">{report.workDescription}</p>

                <div className="craft-sums">
                  <p>
                    <span>Lohnanteil (§ 35a):</span>
                    <span>{fmtEuro(report.totalWageNet * 1.19)}</span>
                  </p>
                  <p>
                    <span>Materialanteil:</span>
                    <span>{fmtEuro(report.totalMaterialNet * 1.19)}</span>
                  </p>
                  <p className="grand">
                    <strong>Gesamtbetrag:</strong>
                    <strong>{fmtEuro(report.totalGross)}</strong>
                  </p>
                </div>

                {report.signatureDataUrl ? (
                  <div className="craft-signed">
                    <img src={report.signatureDataUrl} alt="Signatur" />
                    <span>
                      <strong>Digital unterzeichnet</strong>
                      <small className="muted">
                        {report.signedAt ? new Date(report.signedAt).toLocaleDateString("de-DE") : ""}
                      </small>
                    </span>
                  </div>
                ) : (
                  <button onClick={() => setSigningReport(report)} className="button primary block">
                    <PenTool size={18} /> Jetzt digital unterschreiben lassen
                  </button>
                )}

                <div className="craft-card-foot">
                  <div className="row">
                    <button
                      onClick={() => setPrintingReport(report)}
                      className="icon-button"
                      title="Rapportzettel drucken"
                      aria-label="Rapportzettel drucken"
                    >
                      <Printer size={17} />
                    </button>
                    <button
                      onClick={() => handleDelete(report.id)}
                      className="icon-button danger"
                      title="Löschen"
                      aria-label="Löschen"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>

                  {isSigned && (
                    <div className="row gap craft-pay">
                      <button onClick={() => handleCheckout(report.id, "bar")} disabled={isBusy} className="button small-button">
                        <Banknote size={15} /> Bar
                      </button>
                      <button onClick={() => handleCheckout(report.id, "karte")} disabled={isBusy} className="button small-button">
                        <CreditCard size={15} /> Karte
                      </button>
                      <button onClick={() => handleCheckout(report.id, "rechnung")} disabled={isBusy} className="button small-button">
                        <Receipt size={15} /> Rechnung
                      </button>
                    </div>
                  )}

                  {isCompleted && (
                    <span className="pill pos craft-pill-icon">
                      <CheckCircle2 size={14} />
                      Bezahlt ({report.paymentMethod || "Kasse"})
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {signingReport && (
        <SignaturePad
          customerName={signingReport.customerName}
          onSave={handleSaveSignature}
          onCancel={() => setSigningReport(null)}
        />
      )}

      {printingReport && (
        <CraftPrint
          report={printingReport}
          onClose={() => setPrintingReport(null)}
        />
      )}

      {isNewModalOpen && (
        <Dialog title="Neuen Arbeitsbericht / Rapportzettel anlegen" onClose={() => setIsNewModalOpen(false)} wide>
          <form onSubmit={handleCreateReport} className="stack">
            <div className="grid form-grid craft-form-three">
              <Field label="Bauvorhaben / Baustelle" required wide>
                <select
                  required
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectNumber} · {p.title} ({p.customerName})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Monteur vor Ort" required>
                <input
                  type="text"
                  required
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                />
              </Field>

              <Field label="Datum" required>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </Field>

              <Field label="Arbeitsstunden">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={newHours}
                  onChange={(e) => setNewHours(parseFloat(e.target.value) || 0)}
                />
              </Field>

              <Field label="Ausgeführte Arbeiten & Leistungen" required wide>
                <textarea
                  rows={3}
                  required
                  placeholder="z.B. Kabelzug im EG abgeschlossen, Verteilerkasten neu verdrahtet, Isolationsmessung durchgeführt..."
                  value={newWorkDescription}
                  onChange={(e) => setNewWorkDescription(e.target.value)}
                />
              </Field>
            </div>

            <div className="stack-sm">
              <div className="section-head">
                <span className="field-label">Positionen (Lohn, Fahrt & Material):</span>
                <div className="row gap">
                  <button type="button" onClick={() => addItemRow("lohn")} className="button small-button">
                    + Lohn
                  </button>
                  <button type="button" onClick={() => addItemRow("material")} className="button small-button">
                    + Material
                  </button>
                </div>
              </div>

              <div className="craft-items">
                {newItems.map((item, idx) => (
                  <div key={item.id} className="craft-item-row">
                    <span className={`pill craft-tag ${item.type === "lohn" || item.type === "fahrt" ? "warn" : ""}`}>
                      {item.type}
                    </span>
                    <input
                      type="text"
                      value={item.name}
                      aria-label="Bezeichnung"
                      onChange={(e) => updateItemRow(idx, "name", e.target.value)}
                      className="craft-item-name"
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={item.quantity}
                      aria-label="Menge"
                      onChange={(e) => updateItemRow(idx, "quantity", e.target.value)}
                    />
                    <small className="muted">{item.unit}</small>
                    <input
                      type="number"
                      step="0.5"
                      value={item.unitPriceNet}
                      aria-label={`Einzel (${currencySymbol("de-DE")})`}
                      onChange={(e) => updateItemRow(idx, "unitPriceNet", e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      className="icon-button danger"
                      aria-label="Entfernen"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="row gap craft-dialog-actions">
              <button type="button" onClick={() => setIsNewModalOpen(false)} className="button">
                Abbrechen
              </button>
              <button type="submit" disabled={isBusy} className="button primary">
                Bericht erstellen
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
