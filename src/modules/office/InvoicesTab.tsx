import { useEffect, useState } from "react";
import { Plus, Receipt, Printer, CheckCircle, Download, Trash2, Pencil, AlertTriangle, Check, Repeat, Play, Hourglass } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { InvoiceStatus, LineItem, OfficeClient, OfficeInvoice, OfficeProject, OfficeRecurring } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";
import { PrintDocument } from "./PrintDocument";
import { DunningModal } from "./DunningModal";
import { currencySymbol } from "../../money";

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

  const handleFinalize = async (id: string) => {
    if (!confirm(o("invoices.finalizeConfirm"))) return;
    try {
      await api(`/office/invoices/${id}/finalize`, { method: "POST" });
      await loadData();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm(o("invoices.cancelConfirm"))) return;
    try {
      await api(`/office/invoices/${id}/cancel`, { method: "POST" });
      await loadData();
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
      <div className="office-stats">
        <div className="tile stat-tile">
          <span className="stat-icon"><Hourglass size={18} /></span>
          <strong>{euro(openCents)}</strong><small>Offener Gesamtbetrag · {openInvoices.length} unbezahlte Rechnungen</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><CheckCircle size={18} /></span>
          <strong>{euro(paidCents)}</strong><small>Erhaltene Zahlungen · {paidInvoices.length} Rechnungen beglichen</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Receipt size={18} /></span>
          <strong>{invoices.length}</strong><small>Rechnungen Gesamt</small>
        </div>
      </div>

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

        <div className="row wrap gap office-filters">
          {clients.length > 0 && (
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Kunde">
              <option value="all">Alle Kunden</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <div className="row wrap gap push-end">
            <button className="button" onClick={handleOpenRecurring} title="Wiederkehrende Rechnungen & Daueraufträge verwalten">
              <Repeat size={18} /> Daueraufträge
            </button>
            <button className="button" onClick={handleDatevExport} title="DATEV Buchungsstapel für den Steuerberater">
              <Download size={18} /> {o("invoices.exportDatev")}
            </button>
            {isManager && (
              <button className="button primary" onClick={openNew}>
                <Plus size={18} /> {o("invoices.newInvoice")}
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="muted">Laden...</p>
      ) : (
        <section className="card list-card">
          {filteredInvoices.length === 0 && <p className="empty muted">{o("invoices.noInvoices")}</p>}
          {filteredInvoices.map((inv) => (
            <div key={inv.id} className="office-item">
              <div className="list-row office-row">
                <span className="office-date">{inv.status === "draft" ? o("invoices.draftNumber") : inv.number}</span>
                <span className="list-main">
                  <strong>{inv.clientName}</strong>
                  <small className="muted">{[inv.projectName, `${day(inv.issuedAt)} · fällig ${day(inv.dueDate)}`].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="office-row-meta">
                  <strong>{euro(inv.totalCents)}</strong>
                  <small className="muted">Netto {euro(inv.netCents)}</small>
                  <span className={`pill ${inv.status === "paid" ? "success" : inv.status === "overdue" ? "neg" : inv.status === "sent" ? "warn" : ""}`}>
                    {o(`invoices.status.${inv.status}`)}
                  </span>
                </span>
              </div>
              <div className="row wrap gap office-item-actions">
                <button className="button small-button" onClick={() => setPrintDoc(inv)} title="Drucken / E-Rechnung / GiroCode">
                  <Printer size={15} /> Druck / XML
                </button>
                {(inv.status === "sent" || inv.status === "overdue") && (
                  <>
                    <button className="button small-button success-button" onClick={() => setPayModalInvoice(inv)} title="Als bezahlt markieren">
                      <CheckCircle size={15} /> Bezahlt
                    </button>
                    <button
                      className={`button small-button ${inv.status === "overdue" ? "danger" : ""}`}
                      onClick={() => setDunningInvoice(inv)}
                      title="Zahlungserinnerung oder Mahnung verfassen und drucken"
                    >
                      <AlertTriangle size={15} /> {inv.dunningLevel > 0 ? `Mahnung (${inv.dunningLevel})` : "Mahnung"}
                    </button>
                  </>
                )}
                {isManager && inv.status === "draft" && (
                  <button className="button small-button primary" onClick={() => handleFinalize(inv.id)}>
                    <CheckCircle size={15} /> {o("invoices.finalize")}
                  </button>
                )}
                {isManager && (inv.status === "sent" || inv.status === "overdue") && (
                  <button className="button small-button" onClick={() => handleCancel(inv.id)}>
                    {o("invoices.cancel")}
                  </button>
                )}
                {isManager && inv.status === "draft" && (
                  <>
                    <button className="icon-button" onClick={() => openEdit(inv)} title={o("common.edit")} aria-label={o("common.edit")}>
                      <Pencil size={16} />
                    </button>
                    <button className="icon-button danger" onClick={() => handleDelete(inv.id)} title={o("common.delete")} aria-label={o("common.delete")}>
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Druck & E-Rechnung */}
      {printDoc && (
        <PrintDocument
          doc={printDoc}
          kind="invoice"
          onClose={() => setPrintDoc(null)}
        />
      )}

      {/* Dialog: Als bezahlt markieren */}
      {payModalInvoice && (
        <Dialog title={o("invoices.markPaid")} onClose={() => setPayModalInvoice(null)}>
          <form onSubmit={handleMarkPaid} className="stack office-dialog">
            <p>
              Rechnung <strong>{payModalInvoice.number}</strong> über <strong>{euro(payModalInvoice.totalCents)}</strong> als bezahlt buchen.
            </p>
            <Field label="Zahlungsart">
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option value="Überweisung">Banküberweisung</option>
                <option value="Lastschrift">SEPA-Lastschrift</option>
                <option value="Bar">Barzahlung</option>
                <option value="Karte">Kartenzahlung (EC/Kredit)</option>
                <option value="PayPal">PayPal</option>
              </select>
            </Field>
            <div className="row wrap gap end">
              <button type="button" className="button" onClick={() => setPayModalInvoice(null)}>{o("common.cancel")}</button>
              <button type="submit" className="button primary"><Check size={18} /> Bestätigen</button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Dialog: Rechnung erstellen / bearbeiten */}
      {modalOpen && (
        <Dialog title={editingInvoice ? "Rechnung bearbeiten" : o("invoices.newInvoice")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="stack office-dialog">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}
            <div className="grid form-grid">
              <Field label="Kunde" required>
                <select required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Projekt (optional)">
                <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                  <option value="">Keinem Projekt zugeordnet</option>
                  {projects
                    .filter((p) => !form.clientId || p.clientId === form.clientId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
              </Field>
              <Field label="Betreff / Titel" required wide>
                <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
            </div>

            <div className="grid three">
              <Field label={o("invoices.issuedAt")} required>
                <input type="date" required value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} />
              </Field>
              <Field label={o("invoices.dueDate")} required>
                <input type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </Field>
              <Field label={o("invoices.statusOnSave")}>
                {/* Bezahlt, überfällig und storniert entstehen nur durch Zahlung, Mahnung oder Storno */}
                <select value={form.status === "sent" ? "sent" : "draft"} onChange={(e) => setForm({ ...form, status: e.target.value as InvoiceStatus })}>
                  <option value="draft">{o("invoices.saveDraft")}</option>
                  <option value="sent">{o("invoices.finalize")}</option>
                </select>
              </Field>
            </div>

            <Field label={o("invoices.buyerReference")}>
              <input
                type="text"
                placeholder="z.B. Leitweg-ID für Behörden (04011000-12345-67) oder Kundenbestellnummer"
                value={form.buyerReference}
                onChange={(e) => setForm({ ...form, buyerReference: e.target.value })}
              />
            </Field>

            <div className="grid three">
              <Field label="Rabatt (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
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
                  value={form.skontoPercent || ""}
                  placeholder="z.B. 2"
                  onChange={(e) => setForm({ ...form, skontoPercent: parseFloat(e.target.value) || 0 })}
                />
              </Field>
            </div>

            {/* Positionen */}
            <div className="office-section">
              <div className="section-head">
                <h3 className="card-subtitle">Abrechnungspositionen</h3>
                <button type="button" className="button small-button" onClick={addItem}>
                  <Plus size={15} /> {o("common.addItem")}
                </button>
              </div>

              {form.items.map((it, idx) => (
                <div key={it.id || idx} className="office-line">
                  <Field label="Titel / Leistung" wide>
                    <input type="text" required value={it.title} onChange={(e) => updateItem(idx, { title: e.target.value })} />
                  </Field>
                  <Field label="Menge">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={it.qty}
                      onChange={(e) => updateItem(idx, { qty: parseFloat(e.target.value || "1") })}
                    />
                  </Field>
                  <Field label="Einheit">
                    <select value={it.unit} onChange={(e) => updateItem(idx, { unit: e.target.value })}>
                      <option value="Std">Std</option>
                      <option value="Tag">Tag</option>
                      <option value="Stk">Stk</option>
                      <option value="Pauschal">Pauschal</option>
                    </select>
                  </Field>
                  <Field label={`Einzelpreis (${currencySymbol("de-DE")})`}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={(it.unitCents / 100) || ""}
                      onChange={(e) => updateItem(idx, { unitCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                    />
                  </Field>
                  <Field label="MwSt.">
                    <select value={it.vatRate} onChange={(e) => updateItem(idx, { vatRate: parseInt(e.target.value, 10) || 19 })}>
                      <option value={19}>19%</option>
                      <option value={7}>7%</option>
                      <option value={0}>0%</option>
                    </select>
                  </Field>
                  {form.items.length > 1 ? (
                    <button type="button" className="icon-button danger" onClick={() => removeItem(idx)} aria-label={o("common.delete")}>
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <span className="icon-spacer" />
                  )}
                  <input
                    type="text"
                    className="wide"
                    placeholder="Zusätzliche Leistungsbeschreibung (optional)"
                    aria-label="Zusätzliche Leistungsbeschreibung (optional)"
                    value={it.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                  />
                </div>
              ))}

              <table className="price-table office-totals">
                <tbody>
                  <tr><td>Zwischensumme:</td><td>{euro(totals.itemsNet)}</td></tr>
                  {form.discountPercent > 0 && (
                    <tr><td>Rabatt ({form.discountPercent}%):</td><td>-{euro(totals.itemsNet - totals.net)}</td></tr>
                  )}
                  <tr><td>Nettobetrag:</td><td><strong>{euro(totals.net)}</strong></td></tr>
                  <tr><td>Umsatzsteuer:</td><td>{euro(totals.vat)}</td></tr>
                </tbody>
                <tfoot>
                  <tr><th>Gesamt:</th><th>{euro(totals.gross)}</th></tr>
                </tfoot>
              </table>
            </div>

            <Field label="Hinweise & Zahlungsbedingungen">
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>

            <div className="row wrap gap end">
              <button type="button" className="button" onClick={() => setModalOpen(false)}>
                {o("common.cancel")}
              </button>
              <button type="submit" className="button primary">
                <Check size={17} /> {o("common.save")}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Mahnwesen */}
      {dunningInvoice && (
        <DunningModal
          invoice={dunningInvoice}
          onClose={() => setDunningInvoice(null)}
          // Liste aktualisieren, Dialog bleibt für die Druckansicht offen
          onCreated={() => loadData()}
        />
      )}

      {/* Dialog: Wiederkehrende Rechnungen */}
      {recurringModalOpen && (
        <Dialog title="Wiederkehrende Rechnungen & Daueraufträge" onClose={() => setRecurringModalOpen(false)} wide>
          <div className="stack office-dialog">
            <p className="muted">
              Automatische Vorlagen für wiederkehrende Retainer, monatliche Hosting- & Wartungsverträge oder quartalsweise Servicepauschalen.
            </p>

            <form onSubmit={handleCreateRecurring} className="office-panel">
              <div className="office-add">
                <Field label="Vertragsbezeichnung">
                  <input
                    type="text"
                    required
                    placeholder="z.B. Monatliche Betreuung & Wartung"
                    value={newRecurringTitle}
                    onChange={(e) => setNewRecurringTitle(e.target.value)}
                  />
                </Field>
                <Field label="Intervall">
                  <select value={newRecurringMonths} onChange={(e) => setNewRecurringMonths(parseInt(e.target.value, 10) || 1)}>
                    <option value={1}>Monatlich (1 Monat)</option>
                    <option value={3}>Quartalsweise (3 Monate)</option>
                    <option value={6}>Halbjährlich (6 Monate)</option>
                    <option value={12}>Jährlich (12 Monate)</option>
                  </select>
                </Field>
                <button type="submit" className="button primary">
                  <Plus size={17} /> Vorlage anlegen
                </button>
              </div>
            </form>

            {recurringList.length === 0 ? (
              <p className="empty muted">Noch keine Daueraufträge eingerichtet.</p>
            ) : (
              <div className="office-sublist">
                {recurringList.map((rec) => (
                  <div key={rec.id} className="list-row office-row">
                    <span className="list-main">
                      <strong>{rec.title}</strong>
                      <small className="muted">
                        Kunde: {rec.clientName} · Intervall: {rec.intervalMonths === 1 ? "monatlich" : `${rec.intervalMonths} Monate`} · Nächster Lauf: {day(rec.nextRunDay)}
                      </small>
                    </span>
                    <button className="button small-button primary" onClick={() => handleTriggerRecurring(rec.id)} title="Rechnung jetzt sofort generieren">
                      <Play size={14} /> Rechnung erzeugen
                    </button>
                    <button className="icon-button danger" onClick={() => handleDeleteRecurring(rec.id)} title={o("common.delete")} aria-label={o("common.delete")}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
