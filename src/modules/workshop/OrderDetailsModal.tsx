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
import { Dialog } from "../../pos/ui";
import type { InspectionItem, OrderPosition, SparePart, WorkshopOrder, WorkshopOrderStatus } from "../../../shared/workshop";
import { WorkshopPrint } from "./WorkshopPrint";
import { currency as companyCurrency, currencySymbol } from "../../money";

interface OrderDetailsModalProps {
  order: WorkshopOrder;
  parts: SparePart[];
  tenantId: string;
  isManager: boolean;
  hasPos: boolean;
  onClose: () => void;
  onUpdated: (updated: WorkshopOrder) => void;
  onDeleted: (id: string) => void;
}

const STATUS_CONFIG: Record<WorkshopOrderStatus, { label: string; tone: "neutral" | "warn" | "info" | "ok" | "done"; desc: string }> = {
  annahme: { label: "01. Annahme", tone: "neutral", desc: "Fahrzeug angenommen, Hebebühne zugewiesen" },
  diagnose: { label: "02. Diagnose", tone: "warn", desc: "Fehleranalyse & Kostenschätzung läuft" },
  wartet_teile: { label: "03. Wartet auf Teile", tone: "warn", desc: "Ersatzteile bestellt oder KVA beim Kunden" },
  in_arbeit: { label: "04. Auf Hebebühne", tone: "info", desc: "Reparatur & Wartung aktiv in Arbeit" },
  endkontrolle: { label: "05. Endkontrolle", tone: "info", desc: "Meisterabnahme & Probefahrt" },
  abholbereit: { label: "06. Abholbereit", tone: "ok", desc: "Fahrzeug fertig, Kunde benachrichtigt" },
  abgerechnet: { label: "07. Abgerechnet", tone: "done", desc: "Rechnung erstellt und bezahlt" },
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
  isManager,
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
    new Intl.NumberFormat("de-DE", { style: "currency", currency: companyCurrency() }).format(amount);

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


  const checklistItems = order.checklist && order.checklist.length > 0 ? order.checklist : DEFAULT_INSPECTION_ITEMS;
  const subTabs: { id: typeof activeSubTab; label: string }[] = [
    { id: "positions", label: `Leistungen & Teile (${order.positions.length})` },
    { id: "checklist", label: "Dialogannahme / Checkliste" },
    { id: "diagnostic", label: "Kundenauftrag & Diagnose" },
    { id: "checkout", label: "Kasse & Abrechnung" },
  ];

  return (
    <>
      <Dialog title={order.licensePlate} onClose={onClose} wide>
        <div className="stack workshop-dialog">
          {/* Kopf */}
          <div className="workshop-order-head">
            <div className="stack-sm">
              <div className="row wrap gap">
                <span className="workshop-mono muted">({order.orderNumber})</span>
                <span className={`pill workshop-status tone-${STATUS_CONFIG[order.status]?.tone}`}>{STATUS_CONFIG[order.status]?.label}</span>
              </div>
              <p className="muted">
                {order.vehicleInfo} · {order.mileage.toLocaleString("de-DE")} km · {order.liftBay}
              </p>
            </div>
            <div className="row wrap gap">
              <button onClick={() => setPrintDoc("intake")} className="button small-button" title="Werkstattauftrag & Annahmeschein drucken">
                <Printer size={16} />
                Auftrag drucken
              </button>
              <button onClick={() => setPrintDoc("invoice")} className="button small-button" title="Rechnung drucken">
                <FileText size={16} />
                Rechnung
              </button>
            </div>
          </div>

          {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

          {/* Auftragsphase */}
          <div className="workshop-panel stack-sm">
            <div className="workshop-panel-head">
              <strong>Auftragsphase ändern</strong>
              <small className="muted">{STATUS_CONFIG[order.status]?.desc}</small>
            </div>
            <div className="chips wrap">
              {(Object.keys(STATUS_CONFIG) as WorkshopOrderStatus[]).map((st) => (
                <button key={st} onClick={() => handleStatusChange(st)} className={order.status === st ? "chip active" : "chip"}>
                  {STATUS_CONFIG[st].label}
                </button>
              ))}
            </div>
          </div>

          {/* Kunden-Portal */}
          <div className="workshop-portal">
            <span className="list-main">
              <strong>Kunden-Portal:</strong>
              <small className="muted workshop-mono">{statusUrl}</small>
            </span>
            <div className="row gap">
              <button onClick={copyStatusLink} className="button small-button">
                {copyFeedback ? <Check size={15} /> : <Copy size={15} />}
                {copyFeedback ? "Kopiert!" : "Link kopieren"}
              </button>
              <a href={`/status/kfz/${tenantId}/${order.statusToken}`} target="_blank" rel="noreferrer" className="button primary small-button">
                <ExternalLink size={15} />
                Öffnen
              </a>
            </div>
          </div>

          {/* Unter-Navigation */}
          <div className="chips sub-nav" role="tablist">
            {subTabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={activeSubTab === t.id} onClick={() => setActiveSubTab(t.id)} className={activeSubTab === t.id ? "chip active" : "chip"}>
                {t.label}
              </button>
            ))}
          </div>

          {/* SUBTAB 1: POSITIONEN */}
          {activeSubTab === "positions" && (
            <div className="stack">
              <div className="workshop-panel stack">
                <div className="workshop-panel-head">
                  <strong>Position hinzufügen (Arbeitswert oder Ersatzteil)</strong>
                </div>
                <div className="segmented">
                  <button
                    type="button"
                    onClick={() => {
                      setNewPosType("labor");
                      setNewPosUnit("AW");
                      setNewPosPrice(9.5);
                    }}
                    className={newPosType === "labor" ? "active" : ""}
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
                    className={newPosType === "part" ? "active" : ""}
                  >
                    Ersatzteil aus Lager
                  </button>
                </div>

                {newPosType === "part" && parts.length > 0 && (
                  <Field label="Aus Ersatzteillager wählen">
                    <select value={selectedPartId} onChange={(e) => handlePartSelect(e.target.value)}>
                      <option value="">-- Teil aus Lager auswählen --</option>
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.partNumber} - {p.name} (Bestand: {p.stock} | {fmtEuro(p.salePriceNet)})
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                <div className="workshop-pos-form">
                  <Field label="Bezeichnung *">
                    <input
                      type="text"
                      placeholder={newPosType === "labor" ? "z. B. Bremsbeläge VA erneuern" : "z. B. Ölfilter"}
                      value={newPosName}
                      onChange={(e) => setNewPosName(e.target.value)}
                    />
                  </Field>
                  <Field label="Menge & Einheit">
                    <div className="workshop-qty">
                      <input type="number" step="0.1" value={newPosQty} onChange={(e) => setNewPosQty(Number(e.target.value))} className="workshop-mono" />
                      <select value={newPosUnit} onChange={(e) => setNewPosUnit(e.target.value as any)}>
                        <option value="AW">AW</option>
                        <option value="Std">Std</option>
                        <option value="Stück">Stück</option>
                        <option value="Liter">Liter</option>
                        <option value="Satz">Satz</option>
                        <option value="Pauschal">Pauschal</option>
                      </select>
                    </div>
                  </Field>
                  <Field label={`Einzelpreis Netto (${currencySymbol("de-DE")})`}>
                    <input type="number" step="0.01" value={newPosPrice} onChange={(e) => setNewPosPrice(Number(e.target.value))} className="workshop-mono" />
                  </Field>
                  <button type="button" onClick={handleAddPosition} disabled={!newPosName.trim() || saving} className="button primary workshop-pos-add" aria-label="Position hinzufügen">
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              {/* Vorhandene Positionen */}
              <section className="card list-card workshop-flat">
                {order.positions.length === 0 ? (
                  <p className="empty muted">Noch keine Positionen erfasst. Füge oben Arbeitswerte oder Ersatzteile hinzu.</p>
                ) : (
                  order.positions.map((pos) => {
                    const net = pos.quantity * pos.unitPriceNet;
                    return (
                      <div key={pos.id} className="list-row workshop-pos-row">
                        <span className="workshop-pos-type">{pos.type === "labor" ? "AW" : "ET"}</span>
                        <span className="list-main">
                          <strong>
                            {pos.name}
                            {pos.code && <span className="muted workshop-mono"> ({pos.code})</span>}
                          </strong>
                          <small className="muted workshop-mono">
                            {pos.quantity} {pos.unit} × {fmtEuro(pos.unitPriceNet)}
                          </small>
                        </span>
                        <span className="workshop-row-meta">
                          <strong className="workshop-num">{fmtEuro(net)}</strong>
                          <span className={pos.approvedByCustomer ? "pill pos" : "pill warn"}>{pos.approvedByCustomer ? "Freigegeben" : "Offen"}</span>
                        </span>
                        <button onClick={() => handleRemovePosition(pos.id)} className="icon-button danger" title="Position löschen" aria-label="Position löschen">
                          <Trash2 size={17} />
                        </button>
                      </div>
                    );
                  })
                )}
              </section>

              {/* Summen */}
              <div className="workshop-totals">
                <div><span className="muted">Nettosumme:</span><span className="workshop-num">{fmtEuro(order.totalNet)}</span></div>
                <div><span className="muted">MwSt. (19%):</span><span className="workshop-num">{fmtEuro(order.totalTax)}</span></div>
                <div className="workshop-totals-sum"><span>Gesamtbetrag:</span><span className="workshop-num">{fmtEuro(order.totalGross)}</span></div>
              </div>
            </div>
          )}

          {/* SUBTAB 2: CHECKLISTE / DIALOGANNAHME */}
          {activeSubTab === "checklist" && (
            <div className="stack">
              <p className="muted">
                Prüfpunkte der Dialogannahme & Sichtprüfung. Änderungen werden sofort gespeichert und im Kundenportal
                sowie auf dem Werkstattauftrag angezeigt.
              </p>
              <div className="workshop-checklist">
                {checklistItems.map((item) => (
                  <div key={item.id} className="workshop-panel stack-sm">
                    <div className="workshop-panel-head">
                      <strong>{item.name}</strong>
                      <small className="muted workshop-mono workshop-upper">{item.category}</small>
                    </div>
                    <div className="segmented three workshop-traffic">
                      <button type="button" onClick={() => handleChecklistChange(item.id, "ok")} className={item.status === "ok" ? "active ok" : ""}>
                        ✓ OK
                      </button>
                      <button type="button" onClick={() => handleChecklistChange(item.id, "warning")} className={item.status === "warning" ? "active warn" : ""}>
                        ⚠ Hinweis
                      </button>
                      <button type="button" onClick={() => handleChecklistChange(item.id, "defect")} className={item.status === "defect" ? "active bad" : ""}>
                        ✕ Mangel
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Zusätzliche Notiz (z. B. Belagstärke, Messwert)..."
                      value={item.note || ""}
                      onChange={(e) => handleChecklistChange(item.id, item.status, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUBTAB 3: KUNDENAUFTRAG & DIAGNOSE */}
          {activeSubTab === "diagnostic" && (
            <div className="stack">
              <div className="grid">
                <div className="workshop-panel stack-sm">
                  <h3 className="card-subtitle"><Phone size={16} aria-hidden /> Kunde & Ansprechpartner</h3>
                  <strong>{order.customerName}</strong>
                  <span className="muted">Telefon: {order.customerPhone}</span>
                  {order.customerEmail && <span className="muted">E-Mail: {order.customerEmail}</span>}
                </div>
                <div className="workshop-panel stack-sm">
                  <h3 className="card-subtitle"><Car size={16} aria-hidden /> Fahrzeugdaten</h3>
                  <strong className="workshop-plate">{order.licensePlate}</strong>
                  <span>{order.vehicleInfo}</span>
                  <span className="muted workshop-mono">KM-Stand: {order.mileage.toLocaleString("de-DE")} km</span>
                </div>
              </div>

              <Field label="Kundenbeanstandung / Fehlerbeschreibung">
                <textarea rows={3} value={order.issueDescription} onChange={(e) => setOrder({ ...order, issueDescription: e.target.value })} />
              </Field>
              <Field label="Werkstatt-Diagnose & Befund (auch für Kundenportal sichtbar)">
                <textarea
                  rows={3}
                  placeholder="Diagnoseergebnis der Werkstatt, Ursache der Beanstandung..."
                  value={order.diagnosticNotes}
                  onChange={(e) => setOrder({ ...order, diagnosticNotes: e.target.value })}
                />
              </Field>

              <div className="row gap workshop-dialog-actions">
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
                  className="button primary"
                >
                  Befund & Notizen speichern
                </button>
              </div>
            </div>
          )}

          {/* SUBTAB 4: KASSE & ABRECHNUNG */}
          {activeSubTab === "checkout" && (
            <div className="stack">
              <div className="workshop-pay-total">
                <span className="stack-sm">
                  <small className="muted">Abrechnungsstatus</small>
                  <strong>{order.paymentStatus === "bezahlt" ? `Bezahlt via ${order.paymentMethod?.toUpperCase()}` : "Offener Rechnungsbetrag"}</strong>
                </span>
                <span className="stack-sm workshop-pay-sum">
                  <small className="muted">Gesamt brutto</small>
                  <strong className="workshop-num">{fmtEuro(order.totalGross)}</strong>
                </span>
              </div>

              {order.paymentStatus !== "bezahlt" ? (
                <div className="stack">
                  <p className="muted">Direkte Zahlung erfassen und Werkstattauftrag abschließen:</p>
                  <div className="workshop-pay-grid">
                    <button type="button" onClick={() => handleCheckout("bar")} className="button primary">
                      <Banknote size={18} />
                      Barzahlung ({currencySymbol("de-DE")})
                    </button>
                    <button type="button" onClick={() => handleCheckout("karte")} className="button primary">
                      <CreditCard size={18} />
                      EC- / Kreditkarte
                    </button>
                    <button type="button" onClick={() => handleCheckout("rechnung")} className="button">
                      <FileText size={18} />
                      Auf Rechnung (Überweisung)
                    </button>
                  </div>

                  {hasPos && (
                    <div className="workshop-panel workshop-panel-head">
                      <span className="muted">Möchtest du den Betrag an die Hauptkasse übergeben?</span>
                      <a href="/kasse" className="button small-button">
                        <ShoppingCart size={15} />
                        Zur Kasse wechseln
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="notice success workshop-paid">
                  <CheckCircle2 size={20} />
                  <span className="list-main">
                    <strong>Auftrag ist vollständig abgerechnet.</strong>
                    <small>Bezahlt am {new Date(order.completedAt || order.updatedAt).toLocaleDateString("de-DE")}</small>
                  </span>
                  <button onClick={() => setPrintDoc("invoice")} className="button small-button">
                    <Printer size={15} />
                    Rechnung drucken
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Fuß mit Löschen-Sicherheit */}
          <div className="workshop-dialog-foot">
            {!isManager ? (
              <span />
            ) : deleteConfirm ? (
              <div className="row wrap gap">
                <strong className="error">Unwiderruflich löschen?</strong>
                <button onClick={handleDelete} className="button danger small-button">
                  Ja, löschen
                </button>
                <button onClick={() => setDeleteConfirm(false)} className="text-button">
                  Abbrechen
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setDeleteConfirm(true)} className="text-button workshop-delete">
                <Trash2 size={15} />
                Auftrag löschen
              </button>
            )}
            <button type="button" onClick={onClose} className="button">
              Schließen
            </button>
          </div>
        </div>
      </Dialog>

      {/* Druck-Overlay */}
      {printDoc && <WorkshopPrint order={order} type={printDoc} onClose={() => setPrintDoc(null)} />}
    </>
  );
}
