import { useEffect, useState } from "react";
import { Plus, Receipt, Printer, CheckCircle, Download, Trash2, Pencil, X, AlertTriangle, FileCode, Check, Repeat, Play } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { InvoiceStatus, LineItem, OfficeClient, OfficeInvoice, OfficeProject, OfficeRecurring } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";
import { PrintDocument } from "./PrintDocument";
import { DunningModal } from "./DunningModal";

export function InvoicesTab({
  isManager,
  initialData,
}: {
  isManager: boolean;
  initialData?: { clientId: string; projectId: string | null; items: LineItem[] } | null;
}) {
  const { o, euro, day, officeError } = useOfficeI18n();
  const [invoices, setInvoices] = useState<OfficeInvoice[]>([]);
  const [clients, setClients] = useState<OfficeClient[]>([]);
  const [projects, setProjects] = useState<OfficeProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [payModalInvoice, setPayModalInvoice] = useState<OfficeInvoice | null>(null);
  const [dunningInvoice, setDunningInvoice] = useState<OfficeInvoice | null>(null);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [recurringList, setRecurringList] = useState<OfficeRecurring[]>([]);
  const [newRecurringTitle, setNewRecurringTitle] = useState("");
  const [newRecurringMonths, setNewRecurringMonths] = useState(1);
  const [payMethod, setPayMethod] = useState("Überweisung");
  const [editingInvoice, setEditingInvoice] = useState<OfficeInvoice | null>(null);
  const [printDoc, setPrintDoc] = useState<OfficeInvoice | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState<{
    clientId: string;
    projectId: string;
    status: InvoiceStatus;
    title: string;
    issuedAt: string;
    dueDate: string;
    buyerReference: string;
    discountPercent: number;
    skontoDays: number;
    skontoPercent: number;
    notes: string;
    items: LineItem[];
  }>({
    clientId: "",
    projectId: "",
    status: "draft",
    title: "Rechnung für Dienstleistungen",
    issuedAt: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
    buyerReference: "",
    discountPercent: 0,
    skontoDays: 0,
    skontoPercent: 0,
    notes: "Zahlbar innerhalb von 14 Tagen ohne Abzug.",
    items: [
      {
        id: crypto.randomUUID(),
        title: "Dienstleistungen",
        description: "Projektumsetzung und Beratung",
        qty: 1,
        unit: "Pauschal",
        unitCents: 120000,
        vatRate: 19,
        totalCents: 120000,
      },
    ],
  });

  const loadData = async () => {
    try {
      const [iRes, cRes, pRes] = await Promise.all([
        api<{ invoices: OfficeInvoice[] }>(`/office/invoices${clientFilter !== "all" ? `?clientId=${clientFilter}` : ""}`),
        api<{ clients: OfficeClient[] }>("/office/clients"),
        api<{ projects: OfficeProject[] }>("/office/projects"),
      ]);
      setInvoices(iRes.invoices);
      setClients(cRes.clients);
      setProjects(pRes.projects);

      if (cRes.clients.length > 0 && !form.clientId) {
        setForm((f) => ({ ...f, clientId: cRes.clients[0].id }));
      }
    } catch (err) {
      setErrorMsg(officeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [clientFilter]);

  // Handle incoming time entries from TimeTab
  useEffect(() => {
    if (initialData && initialData.items.length > 0) {
      setEditingInvoice(null);
      setForm({
        clientId: initialData.clientId || (clients[0]?.id || ""),
        projectId: initialData.projectId || "",
        status: "draft",
        title: "Abrechnung Zeiterfassung",
        issuedAt: new Date().toISOString().slice(0, 10),
        dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
        buyerReference: "",
        discountPercent: 0,
        skontoDays: 0,
        skontoPercent: 0,
        notes: "Vielen Dank für Ihren Auftrag. Bitte überweisen Sie den Betrag fristgerecht.",
        items: initialData.items,
      });
      setModalOpen(true);
    }
  }, [initialData]);

  const openNew = () => {
    setEditingInvoice(null);
    const selectedClient = clients.find((c) => c.id === (clientFilter !== "all" ? clientFilter : clients[0]?.id));
    setForm({
      clientId: selectedClient?.id || (clients[0]?.id || ""),
      projectId: "",
      status: "draft",
      title: "Rechnung für Dienstleistungen",
      issuedAt: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + (selectedClient?.paymentTermsDays || 14) * 86_400_000).toISOString().slice(0, 10),
      buyerReference: "",
      discountPercent: selectedClient?.discountPercent || 0,
      skontoDays: selectedClient?.skontoDays || 0,
      skontoPercent: selectedClient?.skontoPercent || 0,
      notes: selectedClient?.skontoDays
        ? `Zahlbar innerhalb von ${selectedClient.paymentTermsDays || 14} Tagen. Bei Zahlung innerhalb von ${selectedClient.skontoDays} Tagen gewähren wir ${selectedClient.skontoPercent}% Skonto.`
        : "Zahlbar innerhalb von 14 Tagen ohne Abzug auf das angegebene Geschäftskonto.",
      items: [
        {
          id: crypto.randomUUID(),
          title: "Dienstleistungen",
          description: "Leistungserbringung gemäß Vereinbarung",
          qty: 1,
          unit: "Pauschal",
          unitCents: 120000,
          vatRate: 19,
          totalCents: 120000,
        },
      ],
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const openEdit = (invoice: OfficeInvoice) => {
    setEditingInvoice(invoice);
    setForm({
      clientId: invoice.clientId,
      projectId: invoice.projectId || "",
      status: invoice.status,
      title: invoice.title,
      issuedAt: invoice.issuedAt.slice(0, 10),
      dueDate: invoice.dueDate,
      buyerReference: invoice.buyerReference,
      discountPercent: invoice.discountPercent || 0,
      skontoDays: invoice.skontoDays || 0,
      skontoPercent: invoice.skontoPercent || 0,
      notes: invoice.notes,
      items: invoice.items.length > 0 ? invoice.items : [
        {
          id: crypto.randomUUID(),
          title: "Position",
          description: "",
          qty: 1,
          unit: "Std",
          unitCents: 9500,
          vatRate: 19,
          totalCents: 9500,
        },
      ],
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const updateItem = (index: number, updates: Partial<LineItem>) => {
    const updated = [...form.items];
    const item = { ...updated[index], ...updates };
    item.totalCents = Math.round(item.qty * item.unitCents);
    updated[index] = item;
    setForm({ ...form, items: updated });
  };

  const addItem = () => {
    setForm({
      ...form,
      items: [
        ...form.items,
        {
          id: crypto.randomUUID(),
          title: "Neue Leistung",
          description: "",
          qty: 1,
          unit: "Std",
          unitCents: 9500,
          vatRate: 19,
          totalCents: 9500,
        },
      ],
    });
  };

  const removeItem = (index: number) => {
    if (form.items.length === 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  const itemsNet = form.items.reduce((s, it) => s + Math.round(it.qty * it.unitCents), 0);
  const itemsVat = form.items.reduce((s, it) => s + Math.round(Math.round(it.qty * it.unitCents) * (it.vatRate / 100)), 0);
  const discountFactor = (form.discountPercent > 0 && form.discountPercent <= 100) ? (100 - form.discountPercent) / 100 : 1;
  const net = Math.round(itemsNet * discountFactor);
  const vat = Math.round(itemsVat * discountFactor);
  const gross = net + vat;
  const totals = { net, vat, gross, itemsNet };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    try {
      const payload = {
        ...(editingInvoice ? { id: editingInvoice.id } : {}),
        ...form,
        discountPercent: Number(form.discountPercent) || 0,
        skontoDays: Number(form.skontoDays) || 0,
        skontoPercent: Number(form.skontoPercent) || 0,
        projectId: form.projectId || null,
      };
      await api("/office/invoices", { method: "POST", body: payload });
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setErrorMsg(officeError(err));
    }
  };

  const handleMarkPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalInvoice) return;
    try {
      await api(`/office/invoices/${payModalInvoice.id}/pay`, {
        method: "POST",
        body: { method: payMethod },
      });
      setPayModalInvoice(null);
      await loadData();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const loadRecurring = async () => {
    try {
      const res = await api<{ recurring: OfficeRecurring[] }>("/office/recurring");
      setRecurringList(res.recurring);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenRecurring = () => {
    loadRecurring();
    setRecurringModalOpen(true);
  };

  const handleTriggerRecurring = async (id: string) => {
    try {
      await api(`/office/recurring/${id}/trigger`, { method: "POST" });
      await loadData();
      await loadRecurring();
      alert("Rechnung erfolgreich aus Dauerauftrag erzeugt!");
    } catch (err) {
      alert(officeError(err));
    }
  };

  const handleDeleteRecurring = async (id: string) => {
    if (!confirm(o("common.confirmDelete"))) return;
    try {
      await api(`/office/recurring/${id}`, { method: "DELETE" });
      await loadRecurring();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const handleCreateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecurringTitle.trim() || clients.length === 0) return;
    try {
      await api("/office/recurring", {
        method: "POST",
        body: {
          clientId: clientFilter !== "all" ? clientFilter : clients[0].id,
          title: newRecurringTitle.trim(),
          intervalMonths: newRecurringMonths,
          nextRunDay: new Date().toISOString().slice(0, 10),
          items: [
            {
              id: crypto.randomUUID(),
              title: newRecurringTitle.trim(),
              description: "Monatlicher Retainer / Betreuungspauschale",
              qty: 1,
              unit: "Monat",
              unitCents: 50000,
              vatRate: 19,
              totalCents: 50000,
            },
          ],
        },
      });
      setNewRecurringTitle("");
      await loadRecurring();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(o("common.confirmDelete"))) return;
    try {
      await api(`/office/invoices/${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const handleDatevExport = () => {
    window.location.href = "/api/office/export/datev";
  };

  const filteredInvoices = invoices.filter((inv) => filter === "all" || inv.status === filter);

  // Stats
  const openInvoices = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const openCents = openInvoices.reduce((sum, i) => sum + i.totalCents, 0);
  const paidInvoices = invoices.filter((i) => i.status === "paid");
  const paidCents = paidInvoices.reduce((sum, i) => sum + i.totalCents, 0);

  return (
    <div className="stack">
      {/* Stats */}
      <div className="office-stats">
        <div className="office-stat-card">
          <span className="label">Offener Gesamtbetrag</span>
          <span className="value" style={{ color: "var(--brand)" }}>{euro(openCents)}</span>
          <span className="small muted">{openInvoices.length} unbezahlte Rechnungen</span>
        </div>
        <div className="office-stat-card">
          <span className="label">Erhaltene Zahlungen</span>
          <span className="value" style={{ color: "var(--success)" }}>{euro(paidCents)}</span>
          <span className="small muted">{paidInvoices.length} Rechnungen beglichen</span>
        </div>
        <div className="office-stat-card">
          <span className="label">Rechnungen Gesamt</span>
          <span className="value">{invoices.length}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="chips" role="tablist">
          {["all", "draft", "sent", "paid", "overdue", "canceled"].map((st) => (
            <button
              key={st}
              role="tab"
              aria-selected={filter === st}
              className={filter === st ? "chip active" : "chip"}
              onClick={() => setFilter(st)}
            >
              {st === "all" ? o("common.all") : o(`invoices.status.${st}`)}
            </button>
          ))}
        </div>

        {clients.length > 0 && (
          <select
            className="input"
            style={{ maxWidth: "220px" }}
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="all">Alle Kunden</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        <div className="row gap push-end">
          <button className="button" onClick={handleOpenRecurring} title="Wiederkehrende Rechnungen & Daueraufträge verwalten">
            <Repeat size={17} /> Daueraufträge
          </button>
          <button className="button" onClick={handleDatevExport} title="DATEV Buchungsstapel für den Steuerberater">
            <Download size={17} /> {o("invoices.exportDatev")}
          </button>
          {isManager && (
            <button className="button primary" onClick={openNew}>
              <Plus size={18} /> {o("invoices.newInvoice")}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="muted">Laden...</p>
      ) : filteredInvoices.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <Receipt size={36} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
          <h3>{o("invoices.noInvoices")}</h3>
        </div>
      ) : (
        <div className="office-table-wrap">
          <table className="office-table">
            <thead>
              <tr>
                <th>Rechnungs-Nr.</th>
                <th>Kunde & Projekt</th>
                <th>Rechnungsdatum</th>
                <th>Fälligkeit</th>
                <th className="num">Netto</th>
                <th className="num">Gesamtbetrag</th>
                <th>Status</th>
                <th className="num">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td><strong>{inv.number}</strong></td>
                  <td>
                    <div><strong>{inv.clientName}</strong></div>
                    {inv.projectName && <small className="muted">{inv.projectName}</small>}
                  </td>
                  <td>{day(inv.issuedAt)}</td>
                  <td>{day(inv.dueDate)}</td>
                  <td className="num">{euro(inv.netCents)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{euro(inv.totalCents)}</td>
                  <td>
                    <span className={`pill ${inv.status === "paid" ? "success" : inv.status === "overdue" ? "danger" : inv.status === "sent" ? "warning" : ""}`}>
                      {o(`invoices.status.${inv.status}`)}
                    </span>
                  </td>
                  <td className="num">
                    <div className="row gap" style={{ justifyContent: "flex-end", flexWrap: "wrap", minWidth: "200px" }}>
                      <button
                        className="button small"
                        onClick={() => setPrintDoc(inv)}
                        title="Drucken / E-Rechnung / GiroCode"
                      >
                        <Printer size={15} /> Druck / XML
                      </button>
                      {inv.status !== "paid" && inv.status !== "canceled" && (
                        <>
                          <button
                            className="button small success"
                            onClick={() => setPayModalInvoice(inv)}
                            title="Als bezahlt markieren"
                          >
                            <CheckCircle size={15} /> Bezahlt
                          </button>
                          <button
                            className={`button small ${inv.status === "overdue" ? "danger" : "warning"}`}
                            onClick={() => setDunningInvoice(inv)}
                            title="Zahlungserinnerung oder Mahnung verfassen und drucken"
                          >
                            <AlertTriangle size={15} /> {inv.dunningLevel > 0 ? `Mahnung (${inv.dunningLevel})` : "Mahnung"}
                          </button>
                        </>
                      )}
                      {isManager && (
                        <>
                          <button className="icon-button" onClick={() => openEdit(inv)} title={o("common.edit")}>
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-button danger"
                            onClick={() => handleDelete(inv.id)}
                            title={o("common.delete")}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Print & E-Invoice Modal */}
      {printDoc && (
        <PrintDocument
          doc={printDoc}
          kind="invoice"
          onClose={() => setPrintDoc(null)}
        />
      )}

      {/* Mark Paid Modal */}
      {payModalInvoice && (
        <div className="office-modal-overlay" onClick={() => setPayModalInvoice(null)}>
          <div className="office-modal" style={{ maxWidth: "440px" }} onClick={(e) => e.stopPropagation()}>
            <div className="office-modal-head">
              <h3>{o("invoices.markPaid")}</h3>
              <button className="icon-button" onClick={() => setPayModalInvoice(null)}>
                <X size={20} />
              </button>
            </div>
            <p>
              Rechnung <strong>{payModalInvoice.number}</strong> über <strong>{euro(payModalInvoice.totalCents)}</strong> als bezahlt buchen.
            </p>
            <form onSubmit={handleMarkPaid} className="stack">
              <Field label="Zahlungsart">
                <select
                  className="input"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option value="Überweisung">Banküberweisung</option>
                  <option value="Lastschrift">SEPA-Lastschrift</option>
                  <option value="Bar">Barzahlung</option>
                  <option value="Karte">Kartenzahlung (EC/Kredit)</option>
                  <option value="PayPal">PayPal</option>
                </select>
              </Field>
              <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "12px" }}>
                <button type="button" className="button" onClick={() => setPayModalInvoice(null)}>{o("common.cancel")}</button>
                <button type="submit" className="button primary success"><Check size={18} /> Bestätigen</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Invoice Modal */}
      {modalOpen && (
        <div className="office-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="office-modal" style={{ maxWidth: "860px" }} onClick={(e) => e.stopPropagation()}>
            <div className="office-modal-head">
              <h3>{editingInvoice ? "Rechnung bearbeiten" : o("invoices.newInvoice")}</h3>
              <button className="icon-button" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && <div className="notice warning">{errorMsg}</div>}

            <form onSubmit={handleSave} className="stack">
              <div className="row-grid">
                <Field label="Kunde" required>
                  <select
                    required
                    className="input"
                    value={form.clientId}
                    onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Projekt (optional)">
                  <select
                    className="input"
                    value={form.projectId}
                    onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                  >
                    <option value="">Keinem Projekt zugeordnet</option>
                    {projects
                      .filter((p) => !form.clientId || p.clientId === form.clientId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
                </Field>
              </div>

              <div className="row-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
                <Field label="Betreff / Titel" required>
                  <input
                    type="text"
                    required
                    className="input"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </Field>
                <Field label={o("invoices.issuedAt")} required>
                  <input
                    type="date"
                    required
                    className="input"
                    value={form.issuedAt}
                    onChange={(e) => setForm({ ...form, issuedAt: e.target.value })}
                  />
                </Field>
                <Field label={o("invoices.dueDate")} required>
                  <input
                    type="date"
                    required
                    className="input"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className="input"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as InvoiceStatus })}
                  >
                    <option value="draft">{o("invoices.status.draft")}</option>
                    <option value="sent">{o("invoices.status.sent")}</option>
                    <option value="paid">{o("invoices.status.paid")}</option>
                    <option value="overdue">{o("invoices.status.overdue")}</option>
                    <option value="canceled">{o("invoices.status.canceled")}</option>
                  </select>
                </Field>
              </div>

              <Field label={o("invoices.buyerReference")}>
                <input
                  type="text"
                  className="input"
                  placeholder="z.B. Leitweg-ID für Behörden (04011000-12345-67) oder Kundenbestellnummer"
                  value={form.buyerReference}
                  onChange={(e) => setForm({ ...form, buyerReference: e.target.value })}
                />
              </Field>

              <div className="row-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <Field label="Rabatt (%)">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    className="input"
                    value={form.discountPercent || ""}
                    placeholder="z.B. 5"
                    onChange={(e) => setForm({ ...form, discountPercent: parseFloat(e.target.value) || 0 })}
                  />
                </Field>
                <Field label="Skonto-Frist (Tage)">
                  <input
                    type="number"
                    min="0"
                    max="60"
                    className="input"
                    value={form.skontoDays || ""}
                    placeholder="z.B. 7"
                    onChange={(e) => setForm({ ...form, skontoDays: parseInt(e.target.value, 10) || 0 })}
                  />
                </Field>
                <Field label="Skonto (%)">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    className="input"
                    value={form.skontoPercent || ""}
                    placeholder="z.B. 2"
                    onChange={(e) => setForm({ ...form, skontoPercent: parseFloat(e.target.value) || 0 })}
                  />
                </Field>
              </div>

              {/* Line Items */}
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <strong>Abrechnungspositionen</strong>
                  <button type="button" className="button small" onClick={addItem}>
                    <Plus size={15} /> {o("common.addItem")}
                  </button>
                </div>

                <div className="stack-sm">
                  {form.items.map((it, idx) => (
                    <div key={it.id || idx} className="card" style={{ padding: "12px", background: "var(--panel-2)" }}>
                      <div className="row-grid" style={{ gridTemplateColumns: "3fr 1fr 1fr 1.2fr 1fr auto", gap: "8px", alignItems: "flex-end" }}>
                        <Field label="Titel / Leistung">
                          <input
                            type="text"
                            required
                            className="input"
                            value={it.title}
                            onChange={(e) => updateItem(idx, { title: e.target.value })}
                          />
                        </Field>
                        <Field label="Menge">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            className="input"
                            value={it.qty}
                            onChange={(e) => updateItem(idx, { qty: parseFloat(e.target.value || "1") })}
                          />
                        </Field>
                        <Field label="Einheit">
                          <select
                            className="input"
                            value={it.unit}
                            onChange={(e) => updateItem(idx, { unit: e.target.value })}
                          >
                            <option value="Std">Std</option>
                            <option value="Tag">Tag</option>
                            <option value="Stk">Stk</option>
                            <option value="Pauschal">Pauschal</option>
                          </select>
                        </Field>
                        <Field label="Einzelpreis (€)">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="input"
                            value={(it.unitCents / 100) || ""}
                            onChange={(e) => updateItem(idx, { unitCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                          />
                        </Field>
                        <Field label="MwSt.">
                          <select
                            className="input"
                            value={it.vatRate}
                            onChange={(e) => updateItem(idx, { vatRate: parseInt(e.target.value, 10) || 19 })}
                          >
                            <option value={19}>19%</option>
                            <option value={7}>7%</option>
                            <option value={0}>0%</option>
                          </select>
                        </Field>
                        {form.items.length > 1 && (
                          <button
                            type="button"
                            className="icon-button danger"
                            style={{ marginBottom: "6px" }}
                            onClick={() => removeItem(idx)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div style={{ marginTop: "6px" }}>
                        <input
                          type="text"
                          className="input"
                          placeholder="Zusätzliche Leistungsbeschreibung (optional)"
                          value={it.description}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals Summary */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px", fontSize: "0.95rem" }}>
                  <div style={{ width: "260px", display: "grid", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Zwischensumme:</span>
                      <span>{euro(totals.itemsNet)}</span>
                    </div>
                    {form.discountPercent > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--accent)" }}>
                        <span>Rabatt ({form.discountPercent}%):</span>
                        <span>-{euro(totals.itemsNet - totals.net)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Nettobetrag:</span>
                      <strong>{euro(totals.net)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Umsatzsteuer:</span>
                      <span>{euro(totals.vat)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid var(--text)", paddingTop: "4px", fontSize: "1.1rem" }}>
                      <span><strong>Gesamt:</strong></span>
                      <strong>{euro(totals.gross)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <Field label="Hinweise & Zahlungsbedingungen">
                <textarea
                  className="input"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>

              <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "12px" }}>
                <button type="button" className="button" onClick={() => setModalOpen(false)}>
                  {o("common.cancel")}
                </button>
                <button type="submit" className="button primary">
                  {o("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dunning / Mahnwesen Modal */}
      {dunningInvoice && (
        <DunningModal
          invoice={dunningInvoice}
          onClose={() => setDunningInvoice(null)}
          onCreated={() => {
            setDunningInvoice(null);
            loadData();
          }}
        />
      )}

      {/* Recurring Invoices Modal */}
      {recurringModalOpen && (
        <div className="office-modal-overlay" onClick={() => setRecurringModalOpen(false)}>
          <div className="office-modal" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
            <div className="office-modal-head">
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Repeat size={20} style={{ color: "var(--accent)" }} /> Wiederkehrende Rechnungen & Daueraufträge
              </h3>
              <button className="icon-button" onClick={() => setRecurringModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <p className="small muted">
              Automatische Vorlagen für wiederkehrende Retainer, monatliche Hosting- & Wartungsverträge oder quartalsweise Servicepauschalen.
            </p>

            <form onSubmit={handleCreateRecurring} className="card stack" style={{ background: "var(--panel-2)", padding: "14px", margin: "14px 0" }}>
              <div className="row-grid" style={{ gridTemplateColumns: "2fr 1fr auto", alignItems: "flex-end" }}>
                <Field label="Vertragsbezeichnung">
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="z.B. Monatliche Betreuung & Wartung"
                    value={newRecurringTitle}
                    onChange={(e) => setNewRecurringTitle(e.target.value)}
                  />
                </Field>
                <Field label="Intervall">
                  <select
                    className="input"
                    value={newRecurringMonths}
                    onChange={(e) => setNewRecurringMonths(parseInt(e.target.value, 10) || 1)}
                  >
                    <option value={1}>Monatlich (1 Monat)</option>
                    <option value={3}>Quartalsweise (3 Monate)</option>
                    <option value={6}>Halbjährlich (6 Monate)</option>
                    <option value={12}>Jährlich (12 Monate)</option>
                  </select>
                </Field>
                <button type="submit" className="button primary">
                  <Plus size={16} /> Vorlage anlegen
                </button>
              </div>
            </form>

            <div className="stack-sm">
              {recurringList.length === 0 ? (
                <p className="muted" style={{ textAlign: "center", padding: "20px" }}>Noch keine Daueraufträge eingerichtet.</p>
              ) : (
                recurringList.map((rec) => (
                  <div key={rec.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
                    <div>
                      <strong>{rec.title}</strong>
                      <div className="small muted">
                        Kunde: {rec.clientName} · Intervall: {rec.intervalMonths === 1 ? "monatlich" : `${rec.intervalMonths} Monate`} · Nächster Lauf: {day(rec.nextRunDay)}
                      </div>
                    </div>
                    <div className="row gap">
                      <button
                        className="button small primary"
                        onClick={() => handleTriggerRecurring(rec.id)}
                        title="Rechnung jetzt sofort generieren"
                      >
                        <Play size={14} /> Rechnung erzeugen
                      </button>
                      <button
                        className="icon-button danger"
                        onClick={() => handleDeleteRecurring(rec.id)}
                        title={o("common.delete")}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
