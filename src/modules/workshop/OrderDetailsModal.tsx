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
  Banknote,
  FileText,
  Send,
  Shield,
  Phone,
  Mail,
} from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import { ModuleCheckout } from "../../pos/ModuleCheckout";
import type { InspectionItem, OrderPosition, SparePart, WorkshopOrder, WorkshopOrderStatus } from "../../../shared/workshop";
import { WorkshopPrint } from "./WorkshopPrint";
import { standardVat } from "../../money";
import { useWorkshopI18n } from "./i18n";
import { de } from "./lang/de";

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

// Texte der Phasen kommen aus status.<id>.label / .desc
const STATUS_CONFIG: Record<WorkshopOrderStatus, { tone: "neutral" | "warn" | "info" | "ok" | "done" }> = {
  annahme: { tone: "neutral" },
  diagnose: { tone: "warn" },
  wartet_teile: { tone: "warn" },
  in_arbeit: { tone: "info" },
  endkontrolle: { tone: "info" },
  abholbereit: { tone: "ok" },
  abgerechnet: { tone: "done" },
};

// Standard-Prüfpunkte; gespeichert wird der deutsche Name, angezeigt wird er übersetzt (inspection.defaults.i<id>)
const INSPECTION_DEFAULTS: Omit<InspectionItem, "name">[] = [
  { id: "1", category: "motor_abgas", status: "ok" },
  { id: "2", category: "bremsen", status: "not_checked" },
  { id: "3", category: "bremsen", status: "not_checked" },
  { id: "4", category: "fluessigkeiten", status: "ok" },
  { id: "5", category: "fluessigkeiten", status: "ok" },
  { id: "6", category: "reifen", status: "ok" },
  { id: "7", category: "fahrwerk", status: "not_checked" },
  { id: "8", category: "beleuchtung", status: "ok" },
  { id: "9", category: "karosserie", status: "ok" },
];

const DEFAULT_INSPECTION_ITEMS: InspectionItem[] = INSPECTION_DEFAULTS.map((item) => ({ ...item, name: de.inspection.defaults[`i${item.id}` as keyof typeof de.inspection.defaults] }));

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

  const { t, workshopError, euro: fmtEuro, symbol, num, day, lift, unit, payment, inspectionName, inspectionCategory } = useWorkshopI18n();

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
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, t("details.statusError")));
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
      // Steuersatz des Lagerteils, sonst der Regelsatz der Firma
      taxRate: parts.find((p) => p.partNumber === newPosCode.trim())?.taxRate ?? standardVat(),
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
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, t("details.positionsError")));
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
      list.push({ id: itemId, category: "sonstiges" as any, name: de.inspection.checkpoint, status, note });
    }

    try {
      const updated = await api<WorkshopOrder>(`/workshop/orders/${order.id}`, {
        method: "PUT",
        body: { checklist: list },
      });
      setOrder(updated);
      onUpdated(updated);
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, t("details.checklistError")));
    }
  };

  const [paying, setPaying] = useState(false);
  const afterPaid = async () => {
    setPaying(false);
    const updated = await api<WorkshopOrder>(`/workshop/orders/${order.id}`).catch(() => null);
    if (updated) {
      setOrder(updated);
      onUpdated(updated);
    }
  };

  const handleDelete = async () => {
    try {
      await api(`/workshop/orders/${order.id}`, { method: "DELETE" });
      onDeleted(order.id);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, t("details.deleteError")));
    }
  };


  const checklistItems = order.checklist && order.checklist.length > 0 ? order.checklist : DEFAULT_INSPECTION_ITEMS;
  const subTabs: { id: typeof activeSubTab; label: string }[] = [
    { id: "positions", label: t("details.tabs.positions", { n: order.positions.length }) },
    { id: "checklist", label: t("details.tabs.checklist") },
    { id: "diagnostic", label: t("details.tabs.diagnostic") },
    { id: "checkout", label: t("details.tabs.checkout") },
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
                <span className={`pill workshop-status tone-${STATUS_CONFIG[order.status]?.tone}`}>{t(`status.${order.status}.label`)}</span>
              </div>
              <p className="muted">
                {order.vehicleInfo} · {t("common.km", { n: num(order.mileage) })} · {lift(order.liftBay)}
              </p>
            </div>
            <div className="row wrap gap">
              <button onClick={() => setPrintDoc("intake")} className="button small-button" title={t("details.printOrderTitle")}>
                <Printer size={16} />
                {t("details.printOrder")}
              </button>
              <button onClick={() => setPrintDoc("invoice")} className="button small-button" title={t("details.printInvoiceTitle")}>
                <FileText size={16} />
                {t("details.invoice")}
              </button>
            </div>
          </div>

          {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

          {/* Auftragsphase */}
          <div className="workshop-panel stack-sm">
            <div className="workshop-panel-head">
              <strong>{t("details.changePhase")}</strong>
              <small className="muted">{t(`status.${order.status}.desc`)}</small>
            </div>
            <div className="chips wrap">
              {(Object.keys(STATUS_CONFIG) as WorkshopOrderStatus[]).map((st) => (
                <button key={st} onClick={() => handleStatusChange(st)} className={order.status === st ? "chip active" : "chip"}>
                  {t(`status.${st}.label`)}
                </button>
              ))}
            </div>
          </div>

          {/* Kunden-Portal */}
          <div className="workshop-portal">
            <span className="list-main">
              <strong>{t("details.portal")}</strong>
              <small className="muted workshop-mono">{statusUrl}</small>
            </span>
            <div className="row gap">
              <button onClick={copyStatusLink} className="button small-button">
                {copyFeedback ? <Check size={15} /> : <Copy size={15} />}
                {copyFeedback ? t("details.copied") : t("details.copyLink")}
              </button>
              <a href={`/status/kfz/${tenantId}/${order.statusToken}`} target="_blank" rel="noreferrer" className="button primary small-button">
                <ExternalLink size={15} />
                {t("details.openLink")}
              </a>
            </div>
          </div>

          {/* Unter-Navigation */}
          <div className="chips sub-nav" role="tablist">
            {subTabs.map((tab) => (
              <button key={tab.id} role="tab" aria-selected={activeSubTab === tab.id} onClick={() => setActiveSubTab(tab.id)} className={activeSubTab === tab.id ? "chip active" : "chip"}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* SUBTAB 1: POSITIONEN */}
          {activeSubTab === "positions" && (
            <div className="stack">
              <div className="workshop-panel stack">
                <div className="workshop-panel-head">
                  <strong>{t("details.addPosition")}</strong>
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
                    {t("details.laborToggle")}
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
                    {t("details.partToggle")}
                  </button>
                </div>

                {newPosType === "part" && parts.length > 0 && (
                  <Field label={t("details.pickPart")}>
                    <select value={selectedPartId} onChange={(e) => handlePartSelect(e.target.value)}>
                      <option value="">{t("details.pickPartPlaceholder")}</option>
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {t("details.partOption", { number: p.partNumber, name: p.name, stock: p.stock, price: fmtEuro(p.salePriceNet) })}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                <div className="workshop-pos-form">
                  <Field label={t("details.name")}>
                    <input
                      type="text"
                      placeholder={newPosType === "labor" ? t("details.laborPlaceholder") : t("details.partPlaceholder")}
                      value={newPosName}
                      onChange={(e) => setNewPosName(e.target.value)}
                    />
                  </Field>
                  <Field label={t("details.quantity")}>
                    <div className="workshop-qty">
                      <input type="number" step="0.1" value={newPosQty} onChange={(e) => setNewPosQty(Number(e.target.value))} className="workshop-mono" />
                      <select value={newPosUnit} onChange={(e) => setNewPosUnit(e.target.value as any)}>
                        {(["AW", "Std", "Stück", "Liter", "Satz", "Pauschal"] as const).map((u) => (
                          <option key={u} value={u}>
                            {unit(u)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Field>
                  <Field label={t("details.unitPrice", { symbol: symbol() })}>
                    <input type="number" step="0.01" value={newPosPrice} onChange={(e) => setNewPosPrice(Number(e.target.value))} className="workshop-mono" />
                  </Field>
                  <button type="button" onClick={handleAddPosition} disabled={!newPosName.trim() || saving} className="button primary workshop-pos-add" aria-label={t("details.addPositionAria")}>
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              {/* Vorhandene Positionen */}
              <section className="card list-card workshop-flat">
                {order.positions.length === 0 ? (
                  <p className="empty muted">{t("details.noPositions")}</p>
                ) : (
                  order.positions.map((pos) => {
                    const net = pos.quantity * pos.unitPriceNet;
                    return (
                      <div key={pos.id} className="list-row workshop-pos-row">
                        <span className="workshop-pos-type">{pos.type === "labor" ? t("posType.labor") : t("posType.part")}</span>
                        <span className="list-main">
                          <strong>
                            {pos.name}
                            {pos.code && <span className="muted workshop-mono"> ({pos.code})</span>}
                          </strong>
                          <small className="muted workshop-mono">
                            {num(pos.quantity)} {unit(pos.unit)} × {fmtEuro(pos.unitPriceNet)}
                          </small>
                        </span>
                        <span className="workshop-row-meta">
                          <strong className="workshop-num">{fmtEuro(net)}</strong>
                          <span className={pos.approvedByCustomer ? "pill pos" : "pill warn"}>{pos.approvedByCustomer ? t("details.approved") : t("details.pending")}</span>
                        </span>
                        <button onClick={() => handleRemovePosition(pos.id)} className="icon-button danger" title={t("details.removePosition")} aria-label={t("details.removePosition")}>
                          <Trash2 size={17} />
                        </button>
                      </div>
                    );
                  })
                )}
              </section>

              {/* Summen */}
              <div className="workshop-totals">
                <div><span className="muted">{t("details.totalNet")}</span><span className="workshop-num">{fmtEuro(order.totalNet)}</span></div>
                <div><span className="muted">{t("details.vat", { rate: 19 })}</span><span className="workshop-num">{fmtEuro(order.totalTax)}</span></div>
                <div className="workshop-totals-sum"><span>{t("details.total")}</span><span className="workshop-num">{fmtEuro(order.totalGross)}</span></div>
              </div>
            </div>
          )}

          {/* SUBTAB 2: CHECKLISTE / DIALOGANNAHME */}
          {activeSubTab === "checklist" && (
            <div className="stack">
              <p className="muted">
                {t("details.checklistIntro")}
              </p>
              <div className="workshop-checklist">
                {checklistItems.map((item) => (
                  <div key={item.id} className="workshop-panel stack-sm">
                    <div className="workshop-panel-head">
                      <strong>{inspectionName(item)}</strong>
                      <small className="muted workshop-mono workshop-upper">{inspectionCategory(item.category)}</small>
                    </div>
                    <div className="segmented three workshop-traffic">
                      <button type="button" onClick={() => handleChecklistChange(item.id, "ok")} className={item.status === "ok" ? "active ok" : ""}>
                        ✓ {t("inspection.status.ok")}
                      </button>
                      <button type="button" onClick={() => handleChecklistChange(item.id, "warning")} className={item.status === "warning" ? "active warn" : ""}>
                        ⚠ {t("inspection.status.warning")}
                      </button>
                      <button type="button" onClick={() => handleChecklistChange(item.id, "defect")} className={item.status === "defect" ? "active bad" : ""}>
                        ✕ {t("inspection.status.defect")}
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder={t("details.notePlaceholder")}
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
                  <h3 className="card-subtitle"><Phone size={16} aria-hidden /> {t("details.customerSection")}</h3>
                  <strong>{order.customerName}</strong>
                  <span className="muted">{t("details.phoneLine", { phone: order.customerPhone })}</span>
                  {order.customerEmail && <span className="muted">{t("details.emailLine", { email: order.customerEmail })}</span>}
                </div>
                <div className="workshop-panel stack-sm">
                  <h3 className="card-subtitle"><Car size={16} aria-hidden /> {t("details.vehicleSection")}</h3>
                  <strong className="workshop-plate">{order.licensePlate}</strong>
                  <span>{order.vehicleInfo}</span>
                  <span className="muted workshop-mono">{t("details.mileageLine", { km: num(order.mileage) })}</span>
                </div>
              </div>

              <Field label={t("details.issue")}>
                <textarea rows={3} value={order.issueDescription} onChange={(e) => setOrder({ ...order, issueDescription: e.target.value })} />
              </Field>
              <Field label={t("details.diagnosis")}>
                <textarea
                  rows={3}
                  placeholder={t("details.diagnosisPlaceholder")}
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
                  {t("details.saveNotes")}
                </button>
              </div>
            </div>
          )}

          {/* SUBTAB 4: KASSE & ABRECHNUNG */}
          {activeSubTab === "checkout" && (
            <div className="stack">
              <div className="workshop-pay-total">
                <span className="stack-sm">
                  <small className="muted">{t("details.billingStatus")}</small>
                  <strong>{order.paymentStatus === "bezahlt" ? t("details.paidVia", { method: payment(order.paymentMethod) }) : t("details.openAmount")}</strong>
                </span>
                <span className="stack-sm workshop-pay-sum">
                  <small className="muted">{t("details.grossTotal")}</small>
                  <strong className="workshop-num">{fmtEuro(order.totalGross)}</strong>
                </span>
              </div>

              {order.paymentStatus !== "bezahlt" ? (
                <div className="stack">
                  <p className="muted">{t("details.payHint")}</p>
                  <button type="button" onClick={() => setPaying(true)} className="button primary">
                    <Banknote size={18} />
                    {t("details.pay")}
                  </button>
                </div>
              ) : (
                <div className="notice success workshop-paid">
                  <CheckCircle2 size={20} />
                  <span className="list-main">
                    <strong>{t("details.fullyBilled")}</strong>
                    <small>{t("details.paidOn", { date: day(order.completedAt || order.updatedAt) })}</small>
                  </span>
                  <button onClick={() => setPrintDoc("invoice")} className="button small-button">
                    <Printer size={15} />
                    {t("details.printInvoice")}
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
                <strong className="error">{t("details.confirmDelete")}</strong>
                <button onClick={handleDelete} className="button danger small-button">
                  {t("details.confirmDeleteYes")}
                </button>
                <button onClick={() => setDeleteConfirm(false)} className="text-button">
                  {t("common.cancel")}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setDeleteConfirm(true)} className="text-button workshop-delete">
                <Trash2 size={15} />
                {t("details.deleteOrder")}
              </button>
            )}
            <button type="button" onClick={onClose} className="button">
              {t("common.close")}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Druck-Overlay */}
      {paying && (
        <ModuleCheckout source="workshop" kind="order" refId={order.id} title={`${order.orderNumber} · ${order.licensePlate}`} onClose={() => setPaying(false)} onPaid={afterPaid} />
      )}
      {printDoc && <WorkshopPrint order={order} type={printDoc} onClose={() => setPrintDoc(null)} />}
    </>
  );
}
