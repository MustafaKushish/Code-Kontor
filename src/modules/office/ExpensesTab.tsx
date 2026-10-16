import { useEffect, useState } from "react";
import { Plus, Receipt, Search, Trash2, ArrowRight, X, AlertTriangle, Briefcase, Car, Code, Package, FileText } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { ExpenseCategory, LineItem, OfficeClient, OfficeExpense, OfficeProject } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";

export function ExpensesTab({
  isManager,
  initialProjectId,
  onNavigateToInvoiceWithItems,
}: {
  isManager: boolean;
  initialProjectId?: string;
  onNavigateToInvoiceWithItems?: (clientId: string, projectId: string | null, items: LineItem[]) => void;
}) {
  const { o, euro, day, officeError } = useOfficeI18n();
  const [expenses, setExpenses] = useState<OfficeExpense[]>([]);
  const [projects, setProjects] = useState<OfficeProject[]>([]);
  const [clients, setClients] = useState<OfficeClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || "all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState({
    projectId: "",
    title: "",
    category: "travel" as ExpenseCategory,
    day: new Date().toISOString().slice(0, 10),
    netCents: 0,
    vatRate: 19,
    billable: true,
    markupPercent: 0,
    notes: "",
  });

  const loadData = async () => {
    try {
      const [eRes, pRes, cRes] = await Promise.all([
        api<{ expenses: OfficeExpense[] }>(
          `/office/expenses${selectedProjectId !== "all" ? `?projectId=${selectedProjectId}` : ""}`,
        ),
        api<{ projects: OfficeProject[] }>("/office/projects"),
        api<{ clients: OfficeClient[] }>("/office/clients"),
      ]);
      setExpenses(eRes.expenses);
      setProjects(pRes.projects);
      setClients(cRes.clients);

      if (pRes.projects.length > 0 && !form.projectId) {
        setForm((f) => ({ ...f, projectId: initialProjectId || pRes.projects[0].id }));
      }
    } catch (err) {
      setErrorMsg(officeError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedProjectId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    try {
      await api("/office/expenses", {
        method: "POST",
        body: form,
      });
      setModalOpen(false);
      setForm((f) => ({
        ...f,
        title: "",
        netCents: 0,
        notes: "",
      }));
      await loadData();
    } catch (err) {
      setErrorMsg(officeError(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(o("common.confirmDelete"))) return;
    try {
      await api(`/office/expenses/${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const filteredExpenses = expenses.filter(
    (e) => categoryFilter === "all" || e.category === categoryFilter,
  );

  const unbilledExpenses = expenses.filter((e) => e.billable && !e.billedInvoiceId);
  const unbilledCents = unbilledExpenses.reduce((s, e) => s + e.totalCents, 0);
  const totalCents = expenses.reduce((s, e) => s + e.totalCents, 0);

  const handleInvoiceUnbilled = () => {
    if (unbilledExpenses.length === 0 || !onNavigateToInvoiceWithItems) return;
    const firstClient = unbilledExpenses[0].clientId;
    const items: LineItem[] = unbilledExpenses.map((exp) => {
      const markupFactor = 1 + (exp.markupPercent / 100);
      const unitCents = Math.round(exp.netCents * markupFactor);
      return {
        id: crypto.randomUUID(),
        title: `Auslage: ${exp.title}`,
        description: `Kategorie: ${o(`expenses.categories.${exp.category}`)} (Belegdatum: ${day(exp.day)})`,
        qty: 1,
        unit: "Stk",
        unitCents,
        vatRate: exp.vatRate,
        totalCents: unitCents,
      };
    });

    onNavigateToInvoiceWithItems(firstClient, unbilledExpenses[0].projectId, items);
  };

  const getCategoryIcon = (cat: ExpenseCategory) => {
    switch (cat) {
      case "travel": return <Car size={16} />;
      case "software": return <Code size={16} />;
      case "subcontractor": return <Briefcase size={16} />;
      case "material": return <Package size={16} />;
      default: return <FileText size={16} />;
    }
  };

  return (
    <div className="stack">
      {/* Stats */}
      <div className="office-stats">
        <div className="office-stat-card">
          <span className="label">Unabgerechnete Auslagen</span>
          <span className="value" style={{ color: "var(--accent)" }}>{euro(unbilledCents)}</span>
          <span className="small muted">{unbilledExpenses.length} Belege offen für Kundenrechnung</span>
        </div>
        <div className="office-stat-card">
          <span className="label">Gesamtauslagen (Projektfilter)</span>
          <span className="value">{euro(totalCents)}</span>
          <span className="small muted">{expenses.length} erfasste Belege</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="chips" role="tablist">
          {["all", "travel", "subcontractor", "software", "material", "other"].map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={categoryFilter === cat}
              className={categoryFilter === cat ? "chip active" : "chip"}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === "all" ? o("common.all") : o(`expenses.categories.${cat}`)}
            </button>
          ))}
        </div>

        {projects.length > 0 && (
          <select
            className="input"
            style={{ maxWidth: "220px" }}
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            <option value="all">Alle Projekte</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <div className="row gap push-end">
          {unbilledExpenses.length > 0 && onNavigateToInvoiceWithItems && (
            <button className="button" onClick={handleInvoiceUnbilled} title="Offene Auslagen als Positionen in Rechnung überführen">
              <Receipt size={17} /> Weiterberechnen
            </button>
          )}
          {isManager && (
            <button className="button primary" onClick={() => setModalOpen(true)}>
              <Plus size={18} /> {o("expenses.newExpense")}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="muted">Laden...</p>
      ) : filteredExpenses.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <Receipt size={36} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
          <h3>{o("expenses.noExpenses")}</h3>
        </div>
      ) : (
        <div className="office-table-wrap">
          <table className="office-table">
            <thead>
              <tr>
                <th>Belegdatum</th>
                <th>Projekt & Kunde</th>
                <th>Bezeichnung / Kategorie</th>
                <th className="num">Netto</th>
                <th className="num">MwSt.</th>
                <th className="num">Gesamt</th>
                <th>Weiterberechnung</th>
                <th className="num">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((exp) => (
                <tr key={exp.id}>
                  <td><strong>{day(exp.day)}</strong></td>
                  <td>
                    <div><strong>{exp.projectName}</strong></div>
                    <small className="muted">{exp.clientName}</small>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {getCategoryIcon(exp.category)}
                      <strong>{exp.title}</strong>
                    </div>
                    {exp.notes && <small className="muted">{exp.notes}</small>}
                  </td>
                  <td className="num">{euro(exp.netCents)}</td>
                  <td className="num">{exp.vatRate}% ({euro(exp.vatCents)})</td>
                  <td className="num" style={{ fontWeight: 700 }}>{euro(exp.totalCents)}</td>
                  <td>
                    {exp.billedInvoiceId ? (
                      <span className="pill success">In Rechnung gestellt</span>
                    ) : exp.billable ? (
                      <span className="pill warning">
                        Abrechenbar {exp.markupPercent > 0 ? `(+${exp.markupPercent}%)` : ""}
                      </span>
                    ) : (
                      <span className="pill">Eigenkosten</span>
                    )}
                  </td>
                  <td className="num">
                    {!exp.billedInvoiceId && isManager && (
                      <button
                        className="icon-button danger"
                        onClick={() => handleDelete(exp.id)}
                        title={o("common.delete")}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Auslage erfassen */}
      {modalOpen && (
        <div className="office-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="office-modal" onClick={(e) => e.stopPropagation()}>
            <div className="office-modal-head">
              <h3>{o("expenses.newExpense")}</h3>
              <button className="icon-button" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && <div className="notice warning">{errorMsg}</div>}

            <form onSubmit={handleSave} className="stack">
              <Field label="Projekt" required>
                <select
                  required
                  className="input"
                  value={form.projectId}
                  onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.clientName})</option>
                  ))}
                </select>
              </Field>

              <div className="row-grid">
                <Field label="Bezeichnung / Beleg" required>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="z.B. Bahnticket Berlin-München, Server-Lizenz..."
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </Field>
                <Field label="Kategorie" required>
                  <select
                    className="input"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
                  >
                    <option value="travel">Reisekosten & Fahrt</option>
                    <option value="subcontractor">Fremdleistung / Subunternehmer</option>
                    <option value="software">Software & Lizenzen</option>
                    <option value="material">Material & Muster</option>
                    <option value="other">Sonstige Auslagen</option>
                  </select>
                </Field>
              </div>

              <div className="row-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <Field label="Belegdatum" required>
                  <input
                    type="date"
                    required
                    className="input"
                    value={form.day}
                    onChange={(e) => setForm({ ...form, day: e.target.value })}
                  />
                </Field>
                <Field label="Nettobetrag (€)" required>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    className="input"
                    placeholder="0.00"
                    value={(form.netCents / 100) || ""}
                    onChange={(e) => setForm({ ...form, netCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                  />
                </Field>
                <Field label="MwSt.-Satz">
                  <select
                    className="input"
                    value={form.vatRate}
                    onChange={(e) => setForm({ ...form, vatRate: parseInt(e.target.value, 10) || 19 })}
                  >
                    <option value={19}>19%</option>
                    <option value={7}>7%</option>
                    <option value={0}>0%</option>
                  </select>
                </Field>
              </div>

              <div className="stack-sm" style={{ borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.billable}
                    onChange={(e) => setForm({ ...form, billable: e.target.checked })}
                  />
                  <span>{o("expenses.billableNotice")}</span>
                </label>

                {form.billable && (
                  <Field label="Service-Aufschlag für den Kunden (%)">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className="input"
                      placeholder="z.B. 10% Handlingsgebühr"
                      value={form.markupPercent || ""}
                      onChange={(e) => setForm({ ...form, markupPercent: parseInt(e.target.value, 10) || 0 })}
                    />
                  </Field>
                )}
              </div>

              <Field label="Notizen / Rechnungsnummer des Lieferanten">
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Belegnummer, Zweck der Reise..."
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
