import { useEffect, useState } from "react";
import { Plus, FolderKanban, CheckCircle2, Clock, AlertCircle, X, Search, Pencil, Trash2, ArrowUpRight, FileText, UserCheck } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { OfficeClient, OfficeProject, ProjectStatus } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";

export function ProjectsTab({
  isManager,
  initialClientId,
  onNavigateToTime,
}: {
  isManager: boolean;
  initialClientId?: string;
  onNavigateToTime?: (projectId: string) => void;
}) {
  const { o, euro, day, officeError } = useOfficeI18n();
  const [projects, setProjects] = useState<OfficeProject[]>([]);
  const [clients, setClients] = useState<OfficeClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>(initialClientId || "all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<OfficeProject | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState({
    name: "",
    clientId: "",
    status: "active" as ProjectStatus,
    budgetCents: 0,
    hourlyRateCents: 9500,
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    description: "",
  });

  const loadData = async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        api<{ projects: OfficeProject[] }>(`/office/projects${clientFilter !== "all" ? `?clientId=${clientFilter}` : ""}`),
        api<{ clients: OfficeClient[] }>("/office/clients"),
      ]);
      setProjects(pRes.projects);
      setClients(cRes.clients);
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
    setEditingProject(null);
    setForm({
      name: "",
      clientId: clientFilter !== "all" ? clientFilter : (clients[0]?.id || ""),
      status: "active",
      budgetCents: 0,
      hourlyRateCents: 9500,
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      description: "",
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const openEdit = (p: OfficeProject) => {
    setEditingProject(p);
    setForm({
      name: p.name,
      clientId: p.clientId,
      status: p.status,
      budgetCents: p.budgetCents,
      hourlyRateCents: p.hourlyRateCents,
      startDate: p.startDate,
      dueDate: p.dueDate,
      description: p.description,
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    try {
      const payload = {
        ...(editingProject ? { id: editingProject.id } : {}),
        ...form,
        budgetCents: Number(form.budgetCents) || 0,
        hourlyRateCents: Number(form.hourlyRateCents) || 0,
      };
      await api("/office/projects", { method: "POST", body: payload });
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setErrorMsg(officeError(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/office/projects/${id}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      await loadData();
    } catch (err) {
      alert(officeError(err));
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesStatus = filter === "all" || p.status === filter;
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.clientName.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const activeCount = projects.filter((p) => p.status === "active").length;
  const completedCount = projects.filter((p) => p.status === "completed").length;
  const totalLoggedMinutes = projects.reduce((sum, p) => sum + p.totalMinutesLogged, 0);
  const totalLoggedCents = projects.reduce((sum, p) => sum + p.totalLoggedCents, 0);

  return (
    <div className="stack">
      <div className="office-stats">
        <div className="office-stat-card">
          <span className="label">Aktive Projekte</span>
          <span className="value" style={{ color: "var(--brand)" }}>{activeCount}</span>
        </div>
        <div className="office-stat-card">
          <span className="label">Abgeschlossen</span>
          <span className="value" style={{ color: "var(--success)" }}>{completedCount}</span>
        </div>
        <div className="office-stat-card">
          <span className="label">Geleistete Stunden</span>
          <span className="value">{(totalLoggedMinutes / 60).toFixed(1)} Std</span>
        </div>
        <div className="office-stat-card">
          <span className="label">Erfasster Honorarwert</span>
          <span className="value" style={{ color: "var(--accent)" }}>{euro(totalLoggedCents)}</span>
        </div>
      </div>

      <div className="toolbar">
        <div className="chips" role="tablist">
          {["all", "active", "planned", "completed", "paused"].map((st) => (
            <button
              key={st}
              role="tab"
              aria-selected={filter === st}
              className={filter === st ? "chip active" : "chip"}
              onClick={() => setFilter(st)}
            >
              {st === "all" ? o("common.all") : o(`projects.status.${st}`)}
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
            <option value="all">Alle Kunden ({clients.length})</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        <div className="search-wrap" style={{ maxWidth: "240px" }}>
          <Search size={17} className="search-icon" />
          <input
            type="search"
            className="input"
            placeholder={o("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isManager && (
          <button className="button primary push-end" onClick={openNew}>
            <Plus size={18} /> {o("projects.newProject")}
          </button>
        )}
      </div>

      {loading ? (
        <p className="muted">Laden...</p>
      ) : filteredProjects.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <FolderKanban size={36} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
          <h3>{o("projects.noProjects")}</h3>
          {clients.length === 0 && (
            <p className="muted small">Tipp: Legen Sie zuerst einen Kunden im Reiter „Kunden“ an.</p>
          )}
        </div>
      ) : (
        <div className="office-grid">
          {filteredProjects.map((p) => {
            const budgetPercent = p.budgetCents > 0 ? Math.min(100, Math.round((p.totalLoggedCents / p.budgetCents) * 100)) : 0;
            const isOver = p.budgetCents > 0 && p.totalLoggedCents > p.budgetCents;

            return (
              <div key={p.id} className="office-card">
                <div className="office-card-header">
                  <div>
                    <h3 style={{ margin: "0 0 4px" }}>{p.name}</h3>
                    <small className="muted" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <UserCheck size={14} /> {p.clientName}
                    </small>
                  </div>
                  <span className={`pill ${p.status === "active" ? "role-owner" : p.status === "completed" ? "success" : ""}`}>
                    {o(`projects.status.${p.status}`)}
                  </span>
                </div>

                {p.description && <p className="small muted" style={{ margin: 0 }}>{p.description}</p>}

                <div className="stack-sm">
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span>Budget: <strong>{p.budgetCents > 0 ? euro(p.budgetCents) : "Kein Limit"}</strong></span>
                    <span>Erfasst: <strong>{euro(p.totalLoggedCents)}</strong> ({(p.totalMinutesLogged / 60).toFixed(1)}h)</span>
                  </div>
                  {p.budgetCents > 0 && (
                    <div className="office-progress-bar">
                      <div
                        className={`office-progress-fill ${isOver ? "overbudget" : ""}`}
                        style={{ width: `${budgetPercent}%` }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--muted)", borderTop: "1px solid var(--line)", paddingTop: "10px" }}>
                  <span>Satz: <strong>{euro(p.hourlyRateCents)}/h</strong></span>
                  {p.dueDate ? <span>Fällig: <strong>{day(p.dueDate)}</strong></span> : <span>Start: {day(p.startDate)}</span>}
                </div>

                <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "4px" }}>
                  {onNavigateToTime && (
                    <button
                      className="button small"
                      onClick={() => onNavigateToTime(p.id)}
                      title="Zeiten für dieses Projekt erfassen"
                    >
                      <Clock size={15} /> Zeit erfassen
                    </button>
                  )}
                  {isManager && (
                    <>
                      <button className="button small" onClick={() => openEdit(p)} title={o("common.edit")}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="button small danger"
                        onClick={() => setDeleteConfirmId(p.id)}
                        title={o("common.delete")}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lösch-Bestätigung */}
      {deleteConfirmId && (
        <div className="office-modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="office-modal" style={{ maxWidth: "440px" }} onClick={(e) => e.stopPropagation()}>
            <div className="office-modal-head">
              <h3>{o("common.confirmDelete")}</h3>
              <button className="icon-button" onClick={() => setDeleteConfirmId(null)}>
                <X size={20} />
              </button>
            </div>
            <p className="small muted">
              Möchten Sie dieses Projekt wirklich löschen? Alle zugehörigen Zeiteinträge dieses Projekts werden dabei ebenfalls entfernt.
            </p>
            <div className="row gap" style={{ justifyContent: "flex-end" }}>
              <button className="button" onClick={() => setDeleteConfirmId(null)}>{o("common.cancel")}</button>
              <button className="button primary danger" onClick={() => handleDelete(deleteConfirmId)}>{o("common.delete")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Projekt anlegen / bearbeiten */}
      {modalOpen && (
        <div className="office-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="office-modal" onClick={(e) => e.stopPropagation()}>
            <div className="office-modal-head">
              <h3>{editingProject ? "Projekt bearbeiten" : o("projects.newProject")}</h3>
              <button className="icon-button" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && <div className="notice warning">{errorMsg}</div>}

            <form onSubmit={handleSave} className="stack">
              <Field label={o("projects.fields.name")} required>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="z.B. Website Relaunch & SEO Betreuung"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>

              <div className="row-grid">
                <Field label={o("projects.fields.client")} required>
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
                <Field label={o("projects.fields.status")} required>
                  <select
                    className="input"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
                  >
                    <option value="active">{o("projects.status.active")}</option>
                    <option value="planned">{o("projects.status.planned")}</option>
                    <option value="completed">{o("projects.status.completed")}</option>
                    <option value="paused">{o("projects.status.paused")}</option>
                    <option value="canceled">{o("projects.status.canceled")}</option>
                  </select>
                </Field>
              </div>

              <div className="row-grid">
                <Field label={o("projects.fields.budget")}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    placeholder="0.00 = kein Limit"
                    value={(form.budgetCents / 100) || ""}
                    onChange={(e) => setForm({ ...form, budgetCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                  />
                </Field>
                <Field label={o("projects.fields.hourlyRate")}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    placeholder="z.B. 95.00"
                    value={(form.hourlyRateCents / 100) || ""}
                    onChange={(e) => setForm({ ...form, hourlyRateCents: Math.round(parseFloat(e.target.value || "0") * 100) })}
                  />
                </Field>
              </div>

              <div className="row-grid">
                <Field label={o("projects.fields.startDate")}>
                  <input
                    type="date"
                    className="input"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  />
                </Field>
                <Field label={o("projects.fields.dueDate")}>
                  <input
                    type="date"
                    className="input"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  />
                </Field>
              </div>

              <Field label={o("projects.fields.description")}>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Projektumfang, Meilensteine, Ansprechpartner..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
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
