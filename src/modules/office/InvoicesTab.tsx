import { useEffect, useState } from "react";
import { Plus, Receipt, Printer, CheckCircle, Download, Trash2, Pencil, X, AlertTriangle, FileCode, Check } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { InvoiceStatus, LineItem, OfficeClient, OfficeInvoice, OfficeProject } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";
import { PrintDocument } from "./PrintDocument";

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
        notes: "Vielen Dank für Ihren Auftrag. Bitte überweisen Sie den Betrag fristgerecht.",
        items: initialData.items,
      });
      setModalOpen(true);
    }
  }, [initialData]);

  const openNew = () => {
    setEditingInvoice(null);
    setForm({
      clientId: clientFilter !== "all" ? clientFilter : (clients[0]?.id || ""),
      projectId: "",
      status: "draft",
      title: "Rechnung für Dienstleistungen",
      issuedAt: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      buyerReference: "",
      notes: "Zahlbar innerhalb von 14 Tagen ohne Abzug auf das angegebene Geschäftskonto.",
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

  const totals = form.items.reduce(
    (acc, it) => {
      const net = Math.round(it.qty * it.unitCents);
      const vat = Math.round(net * (it.vatRate / 100));
      return { net: acc.net + net, vat: acc.vat + vat, gross: acc.gross + net + vat };
    },
    { net: 0, vat: 0, gross: 0 },
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    try {
      const payload = {
        ...(editingInvoice ? { id: editingInvoice.id } : {}),
        ...form,
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
                    <div className="row gap" style={{ justifyContent: "flex-end" }}>
                      <button
                        className="button small"
                        onClick={() => setPrintDoc(inv)}
                        title="Drucken / E-Rechnung / GiroCode"
                      >
                        <Printer size={15} /> Druck / XML
                      </button>
                      {inv.status !== "paid" && inv.status !== "canceled" && (
                        <button
                          className="button small success"
                          onClick={() => setPayModalInvoice(inv)}
                          title="Als bezahlt markieren"
                        >
                          <CheckCircle size={15} /> Bezahlt
                        </button>
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
                  <div style={{ width: "240px", display: "grid", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Netto:</span>
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
    </div>
  );
}
