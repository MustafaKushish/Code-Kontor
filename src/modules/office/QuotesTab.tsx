import { useEffect, useState } from "react";
import { Plus, FileText, Printer, CheckCircle, ArrowRight, Trash2, Pencil, X, AlertCircle } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { LineItem, OfficeClient, OfficeProject, OfficeQuote, QuoteStatus } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";
import { PrintDocument } from "./PrintDocument";

export function QuotesTab({ isManager }: { isManager: boolean }) {
  const { o, euro, day, officeError } = useOfficeI18n();
  const [quotes, setQuotes] = useState<OfficeQuote[]>([]);
  const [clients, setClients] = useState<OfficeClient[]>([]);
  const [projects, setProjects] = useState<OfficeProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<OfficeQuote | null>(null);
  const [printDoc, setPrintDoc] = useState<OfficeQuote | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState<{
    clientId: string;
    projectId: string;
    status: QuoteStatus;
    title: string;
    validUntil: string;
    notes: string;
    items: LineItem[];
  }>({
    clientId: "",
    projectId: "",
    status: "draft",
    title: "Angebot für Dienstleistungen",
    validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    notes: "Zahlbar innerhalb von 14 Tagen nach Rechnungsstellung.",
    items: [
      {
        id: crypto.randomUUID(),
        title: "Beratung & Konzeption",
        description: "Anforderungsanalyse und Fachkonzept",
        qty: 8,
        unit: "Std",
        unitCents: 9500,
        vatRate: 19,
        totalCents: 76000,
      },
    ],
  });

  const loadData = async () => {
    try {
      const [qRes, cRes, pRes] = await Promise.all([
        api<{ quotes: OfficeQuote[] }>(`/office/quotes${clientFilter !== "all" ? `?clientId=${clientFilter}` : ""}`),
        api<{ clients: OfficeClient[] }>("/office/clients"),
        api<{ projects: OfficeProject[] }>("/office/projects"),
      ]);
      setQuotes(qRes.quotes);
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

  const openNew = () => {
    setEditingQuote(null);
    setForm({
      clientId: clientFilter !== "all" ? clientFilter : (clients[0]?.id || ""),
      projectId: "",
      status: "draft",
      title: "Angebot für Dienstleistungen",
      validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      notes: "Dieses Angebot ist freibleibend und 30 Tage gültig.",
      items: [
        {
          id: crypto.randomUUID(),
          title: "Dienstleistung",
          description: "Leistungserbringung nach Vereinbarung",
          qty: 1,
          unit: "Pauschal",
          unitCents: 150000,
          vatRate: 19,
          totalCents: 150000,
        },
      ],
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const openEdit = (quote: OfficeQuote) => {
    setEditingQuote(quote);
    setForm({
      clientId: quote.clientId,
      projectId: quote.projectId || "",
      status: quote.status,
      title: quote.title,
      validUntil: quote.validUntil,
      notes: quote.notes,
      items: quote.items.length > 0 ? quote.items : [
        {
          id: crypto.randomUUID(),
          title: "Dienstleistung",
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

  // Line Items Manipulation
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
          title: "Neue Position",
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
        ...(editingQuote ? { id: editingQuote.id } : {}),
        ...form,
        projectId: form.projectId || null,
      };
      await api("/office/quotes", { method: "POST", body: payload });
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setErrorMsg(officeError(err));
    }
  };

  const handleConvert = async (quote: OfficeQuote) => {
    if (!confirm(`Angebot ${quote.number} wirklich in eine Rechnung umwandeln?`)) return;
    try {
      await api(`/office/quotes/${quote.id}/convert`, { method: "POST" });
      await loadData();
      alert("Rechnung erfolgreich erstellt! Sie finden sie im Reiter „Rechnungen“.");
    } catch (err) {
      alert(officeError(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(o("common.confirmDelete"))) return;
    try {
      await api(`/office/quotes/${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const filteredQuotes = quotes.filter((q) => filter === "all" || q.status === filter);

  const openQuotes = quotes.filter((q) => q.status === "draft" || q.status === "sent");
  const openCents = openQuotes.reduce((sum, q) => sum + q.totalCents, 0);
  const acceptedQuotes = quotes.filter((q) => q.status === "accepted");
  const acceptedCents = acceptedQuotes.reduce((sum, q) => sum + q.totalCents, 0);

  return (
    <div className="stack">
      {/* Stats */}
      <div className="office-stats">
        <div className="office-stat-card">
          <span className="label">Offene Angebote</span>
          <span className="value" style={{ color: "var(--brand)" }}>{euro(openCents)}</span>
          <span className="small muted">{openQuotes.length} Angebote in Prüfung</span>
        </div>
        <div className="office-stat-card">
          <span className="label">Angenommene Angebote</span>
          <span className="value" style={{ color: "var(--success)" }}>{euro(acceptedCents)}</span>
          <span className="small muted">{acceptedQuotes.length} erfolgreich beauftragt</span>
        </div>
        <div className="office-stat-card">
          <span className="label">Gesamtanzahl Angebote</span>
          <span className="value">{quotes.length}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="chips" role="tablist">
          {["all", "draft", "sent", "accepted", "rejected", "expired"].map((st) => (
            <button
              key={st}
              role="tab"
              aria-selected={filter === st}
              className={filter === st ? "chip active" : "chip"}
              onClick={() => setFilter(st)}
            >
              {st === "all" ? o("common.all") : o(`quotes.status.${st}`)}
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

        {isManager && (
          <button className="button primary push-end" onClick={openNew}>
            <Plus size={18} /> {o("quotes.newQuote")}
          </button>
        )}
      </div>

      {/* Quotes Table */}
      {loading ? (
        <p className="muted">Laden...</p>
      ) : filteredQuotes.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <FileText size={36} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
          <h3>{o("quotes.noQuotes")}</h3>
        </div>
      ) : (
        <div className="office-table-wrap">
          <table className="office-table">
            <thead>
              <tr>
                <th>Nummer</th>
                <th>Kunde & Projekt</th>
                <th>Betreff</th>
                <th>Gültig bis</th>
                <th className="num">Netto</th>
                <th className="num">Gesamtbetrag</th>
                <th>Status</th>
                <th className="num">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.map((q) => (
                <tr key={q.id}>
                  <td><strong>{q.number}</strong></td>
                  <td>
                    <div><strong>{q.clientName}</strong></div>
                    {q.projectName && <small className="muted">{q.projectName}</small>}
                  </td>
                  <td>{q.title}</td>
                  <td>{day(q.validUntil)}</td>
                  <td className="num">{euro(q.netCents)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{euro(q.totalCents)}</td>
                  <td>
                    <span className={`pill ${q.status === "accepted" ? "success" : q.status === "rejected" ? "danger" : q.status === "sent" ? "warning" : ""}`}>
                      {o(`quotes.status.${q.status}`)}
                    </span>
                  </td>
                  <td className="num">
                    <div className="row gap" style={{ justifyContent: "flex-end" }}>
                      <button
                        className="button small"
                        onClick={() => setPrintDoc(q)}
                        title={o("common.print")}
                      >
                        <Printer size={15} />
                      </button>
                      {q.status !== "accepted" && (
                        <button
                          className="button small primary"
                          onClick={() => handleConvert(q)}
                          title={o("quotes.convertToInvoice")}
                        >
                          <ArrowRight size={15} /> Rechnung
                        </button>
                      )}
                      {isManager && (
                        <>
                          <button className="icon-button" onClick={() => openEdit(q)} title={o("common.edit")}>
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-button danger"
                            onClick={() => handleDelete(q.id)}
                            title={o("common.delete")}
                          >
                            <Trash2 size={15} />
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

      {/* Print Preview Overlay */}
      {printDoc && (
        <PrintDocument
          doc={printDoc}
          kind="quote"
          onClose={() => setPrintDoc(null)}
        />
      )}

      {/* Modal: Angebot erstellen / bearbeiten */}
      {modalOpen && (
        <div className="office-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="office-modal" style={{ maxWidth: "840px" }} onClick={(e) => e.stopPropagation()}>
            <div className="office-modal-head">
              <h3>{editingQuote ? "Angebot bearbeiten" : o("quotes.newQuote")}</h3>
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

              <div className="row-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
                <Field label="Betreff / Titel" required>
                  <input
                    type="text"
                    required
                    className="input"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </Field>
                <Field label={o("quotes.validUntil")}>
                  <input
                    type="date"
                    className="input"
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className="input"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as QuoteStatus })}
                  >
                    <option value="draft">{o("quotes.status.draft")}</option>
                    <option value="sent">{o("quotes.status.sent")}</option>
                    <option value="accepted">{o("quotes.status.accepted")}</option>
                    <option value="rejected">{o("quotes.status.rejected")}</option>
                    <option value="expired">{o("quotes.status.expired")}</option>
                  </select>
                </Field>
              </div>

              {/* Line Items */}
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <strong>Positionen & Leistungen</strong>
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
