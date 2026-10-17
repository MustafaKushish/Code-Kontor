import { useEffect, useState } from "react";
import { Plus, FileText, Printer, CheckCircle, ArrowRight, Trash2, Pencil, Check, Files } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
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
      <div className="office-stats">
        <div className="tile stat-tile">
          <span className="stat-icon"><FileText size={18} /></span>
          <strong>{euro(openCents)}</strong><small>Offene Angebote · {openQuotes.length} Angebote in Prüfung</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><CheckCircle size={18} /></span>
          <strong>{euro(acceptedCents)}</strong><small>Angenommene Angebote · {acceptedQuotes.length} erfolgreich beauftragt</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Files size={18} /></span>
          <strong>{quotes.length}</strong><small>Gesamtanzahl Angebote</small>
        </div>
      </div>

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

        <div className="row wrap gap office-filters">
          {clients.length > 0 && (
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Kunde">
              <option value="all">Alle Kunden</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {isManager && (
            <div className="row gap push-end">
              <button className="button primary" onClick={openNew}>
                <Plus size={18} /> {o("quotes.newQuote")}
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <p className="muted">Laden...</p>
      ) : (
        <section className="card list-card">
          {filteredQuotes.length === 0 && <p className="empty muted">{o("quotes.noQuotes")}</p>}
          {filteredQuotes.map((q) => (
            <div key={q.id} className="office-item">
              <div className="list-row office-row">
                <span className="office-date">{q.number}</span>
                <span className="list-main">
                  <strong>{q.clientName}</strong>
                  <small className="muted">{[q.title, q.projectName].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="office-row-meta">
                  <strong>{euro(q.totalCents)}</strong>
                  <small className="muted">Netto {euro(q.netCents)} · Gültig bis {day(q.validUntil)}</small>
                  <span className={`pill ${q.status === "accepted" ? "success" : q.status === "rejected" ? "neg" : q.status === "sent" ? "warn" : ""}`}>
                    {o(`quotes.status.${q.status}`)}
                  </span>
                </span>
              </div>
              <div className="row wrap gap office-item-actions">
                <button className="button small-button" onClick={() => setPrintDoc(q)} title={o("common.print")}>
                  <Printer size={15} /> {o("common.print")}
                </button>
                {q.status !== "accepted" && (
                  <button className="button small-button primary" onClick={() => handleConvert(q)} title={o("quotes.convertToInvoice")}>
                    <ArrowRight size={15} /> Rechnung
                  </button>
                )}
                {isManager && (
                  <>
                    <button className="icon-button" onClick={() => openEdit(q)} title={o("common.edit")} aria-label={o("common.edit")}>
                      <Pencil size={16} />
                    </button>
                    <button className="icon-button danger" onClick={() => handleDelete(q.id)} title={o("common.delete")} aria-label={o("common.delete")}>
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Druckansicht */}
      {printDoc && (
        <PrintDocument
          doc={printDoc}
          kind="quote"
          onClose={() => setPrintDoc(null)}
        />
      )}

      {/* Dialog: Angebot erstellen / bearbeiten */}
      {modalOpen && (
        <Dialog title={editingQuote ? "Angebot bearbeiten" : o("quotes.newQuote")} onClose={() => setModalOpen(false)} wide>
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
              <Field label={o("quotes.validUntil")}>
                <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as QuoteStatus })}>
                  <option value="draft">{o("quotes.status.draft")}</option>
                  <option value="sent">{o("quotes.status.sent")}</option>
                  <option value="accepted">{o("quotes.status.accepted")}</option>
                  <option value="rejected">{o("quotes.status.rejected")}</option>
                  <option value="expired">{o("quotes.status.expired")}</option>
                </select>
              </Field>
            </div>

            {/* Positionen */}
            <div className="office-section">
              <div className="section-head">
                <h3 className="card-subtitle">Positionen & Leistungen</h3>
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
                  <Field label="Einzelpreis (€)">
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
                  <tr><td>Netto:</td><td><strong>{euro(totals.net)}</strong></td></tr>
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
    </div>
  );
}
