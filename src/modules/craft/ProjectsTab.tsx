import { useState } from "react";
import {
  HardHat,
  Search,
  Plus,
  MapPin,
  Phone,
  Mail,
  Calendar,
  ExternalLink,
  Pencil,
  Trash2,
  X,
  Check,
  ChevronRight,
  Clock,
  Layers,
} from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type {
  CraftProject,
  CraftProjectStatus,
  CraftTrade,
} from "../../../shared/craft";
import { useCraftI18n } from "./i18n";

interface ProjectsTabProps {
  isManager: boolean;
  projects: CraftProject[];
  onRefresh: () => void;
  onSelectProjectForMeasurement?: (projectId: string) => void;
  onSelectProjectForReport?: (projectId: string) => void;
}

export function ProjectsTab({
  projects,
  onRefresh,
  onSelectProjectForMeasurement,
  onSelectProjectForReport,
  isManager,
}: ProjectsTabProps) {
  const { t, money, symbol, day, tradeLabel, projectStatusLabel, craftError } = useCraftI18n();
  const [selectedStatus, setSelectedStatus] = useState<string>("alle");
  const [selectedTrade, setSelectedTrade] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Partial<CraftProject>>({
    trade: "Elektro",
    status: "in_arbeit",
    startDate: new Date().toISOString().slice(0, 10),
  });
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const fmtEuro = money;

  const trades: CraftTrade[] = [
    "Elektro",
    "Sanitär & Heizung",
    "Maler & Lackierer",
    "Tischler & Holzbau",
    "Trockenbau",
    "Dachdecker",
    "Fliesenleger",
    "Allgemein",
  ];

  const filteredProjects = projects.filter((p) => {
    const matchesStatus = selectedStatus === "alle" || p.status === selectedStatus;
    const matchesTrade = selectedTrade === "alle" || p.trade === selectedTrade;
    const matchesSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.projectNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.customerName.toLowerCase().includes(search.toLowerCase()) ||
      p.siteAddress.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesTrade && matchesSearch;
  });

  const handleOpenAdd = () => {
    setEditingProject({
      trade: "Elektro",
      status: "in_arbeit",
      startDate: new Date().toISOString().slice(0, 10),
      title: "",
      customerName: "",
      siteAddress: "",
      siteCity: "Hamburg",
      budgetGross: 5000,
      notes: "",
    });
    setError("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: CraftProject) => {
    setEditingProject({ ...p });
    setError("");
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject.title || !editingProject.customerName || !editingProject.siteAddress) {
      return;
    }
    setError("");
    setIsBusy(true);
    try {
      await api("/craft/projects", {
        method: "POST",
        body: editingProject,
      });
      setIsModalOpen(false);
      onRefresh();
    } catch (err) {
      setError(craftError(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("projects.confirmDelete"))) {
      return;
    }
    setError("");
    setIsBusy(true);
    try {
      await api(`/craft/projects/${id}`, { method: "DELETE" });
      onRefresh();
    } catch (err) {
      setError(craftError(err));
    } finally {
      setIsBusy(false);
    }
  };

  const statusLabel = (status: CraftProjectStatus) =>
    projectStatusLabel(status === "abnahmebereit" || status === "in_arbeit" || status === "abgeschlossen" ? status : "geplant");

  return (
    <div className="stack">
      {error && !isModalOpen && <p className="error" role="alert">{error}</p>}
      <div className="toolbar craft-toolbar">
        <div className="craft-toolbar-row">
          <label className="search">
            <Search size={18} />
            <input
              type="search"
              placeholder={t("common.search")}
              aria-label={t("common.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            value={selectedTrade}
            onChange={(e) => setSelectedTrade(e.target.value)}
            aria-label={t("projects.tradeFilter")}
          >
            <option value="alle">{t("projects.allTrades")}</option>
            {trades.map((trade) => (
              <option key={trade} value={trade}>
                {tradeLabel(trade)}
              </option>
            ))}
          </select>
          <button onClick={handleOpenAdd} className="button primary">
            <Plus size={18} /> {t("projects.add")}
          </button>
        </div>
        <div className="chips" role="tablist">
          {[
            { id: "alle", label: t("projects.allProjects") },
            { id: "in_arbeit", label: t("projectStatus.in_arbeit") },
            { id: "abnahmebereit", label: t("projectStatus.abnahmebereit") },
            { id: "geplant", label: t("projectStatus.geplant") },
            { id: "abgeschlossen", label: t("projectStatus.abgeschlossen") },
          ].map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={selectedStatus === s.id}
              onClick={() => setSelectedStatus(s.id)}
              className={selectedStatus === s.id ? "chip active" : "chip"}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <section className="card craft-empty">
          <HardHat size={40} aria-hidden />
          <strong>{t("projects.emptyTitle")}</strong>
          <p className="muted small">
            {t("projects.emptyText")}
          </p>
        </section>
      ) : (
        <div className="craft-grid">
          {filteredProjects.map((project) => {
            const isInProgress = project.status === "in_arbeit";
            const isReadyForAcceptance = project.status === "abnahmebereit";
            const isCompleted = project.status === "abgeschlossen";

            return (
              <article key={project.id} className="card craft-card">
                <div className="craft-card-top">
                  <span className="craft-number">{project.projectNumber}</span>
                  <span
                    className={`pill craft-status ${
                      isReadyForAcceptance ? "tone-info" : isInProgress ? "warn" : isCompleted ? "pos" : ""
                    }`}
                  >
                    {statusLabel(project.status)}
                  </span>
                </div>

                <div className="craft-card-title">
                  <h3>{project.title}</h3>
                  <small className="muted">
                    <strong>{tradeLabel(project.trade)}</strong> · {t("common.client", { name: project.customerName })}
                  </small>
                </div>

                <div className="craft-facts">
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      `${project.siteAddress}, ${project.siteCity}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t("projects.openMaps")}
                  >
                    <MapPin size={14} />
                    <span>
                      {project.siteAddress}{project.siteCity ? `, ${project.siteCity}` : ""}
                    </span>
                  </a>

                  {project.customerPhone && (
                    <a href={`tel:${project.customerPhone}`}>
                      <Phone size={14} />
                      <span>{project.customerPhone}</span>
                    </a>
                  )}

                  <span className="muted">
                    <Calendar size={14} />
                    <span>
                      {t("projects.start", { date: day(project.startDate) })}
                      {project.targetDate && (
                        <> · {t("projects.until", { date: day(project.targetDate) })}</>
                      )}
                    </span>
                  </span>
                </div>

                <div className="craft-card-foot">
                  <strong className="craft-amount">{t("projects.budget", { amount: fmtEuro(project.budgetGross) })}</strong>
                  <div className="row">
                    <button
                      onClick={() => handleOpenEdit(project)}
                      className="icon-button"
                      title={t("common.edit")}
                      aria-label={t("common.edit")}
                    >
                      <Pencil size={17} />
                    </button>
                    {isManager && (
                      <button
                        onClick={() => handleDelete(project.id)}
                        className="icon-button danger"
                        title={t("common.delete")}
                        aria-label={t("common.delete")}
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <Dialog
          title={editingProject.id ? t("projects.editTitle") : t("projects.newTitle")}
          onClose={() => { setError(""); setIsModalOpen(false); }}
          wide
        >
          <form onSubmit={handleSave} className="stack">
            <div className="grid form-grid">
              <Field label={t("projects.fieldTitle")} required hint={t("projects.titleHint")} wide>
                <input
                  type="text"
                  required
                  placeholder={t("projects.titlePlaceholder")}
                  value={editingProject.title || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, title: e.target.value })}
                />
              </Field>

              <Field label={t("projects.fieldTrade")} required>
                <select
                  value={editingProject.trade || "Elektro"}
                  onChange={(e) => setEditingProject({ ...editingProject, trade: e.target.value as any })}
                >
                  {trades.map((trade) => (
                    <option key={trade} value={trade}>
                      {tradeLabel(trade)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t("projects.fieldStatus")}>
                <select
                  value={editingProject.status || "in_arbeit"}
                  onChange={(e) => setEditingProject({ ...editingProject, status: e.target.value as any })}
                >
                  <option value="geplant">{t("projectStatus.geplant")}</option>
                  <option value="in_arbeit">{t("projectStatus.in_arbeit")}</option>
                  <option value="abnahmebereit">{t("projectStatus.abnahmebereit")}</option>
                  <option value="abgeschlossen">{t("projectStatus.abgeschlossen")}</option>
                </select>
              </Field>

              <Field label={t("projects.fieldCustomer")} required>
                <input
                  type="text"
                  required
                  placeholder="Dr. Thomas Bergmann"
                  value={editingProject.customerName || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, customerName: e.target.value })}
                />
              </Field>

              <Field label={t("projects.fieldPhone")}>
                <input
                  type="tel"
                  placeholder="+49 40 123456"
                  value={editingProject.customerPhone || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, customerPhone: e.target.value })}
                />
              </Field>

              <Field label={t("projects.fieldAddress")} required>
                <input
                  type="text"
                  required
                  placeholder="Millerntorplatz 14"
                  value={editingProject.siteAddress || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, siteAddress: e.target.value })}
                />
              </Field>

              <Field label={t("projects.fieldCity")}>
                <input
                  type="text"
                  placeholder="20359 Hamburg"
                  value={editingProject.siteCity || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, siteCity: e.target.value })}
                />
              </Field>

              <Field label={t("projects.fieldStart")} required>
                <input
                  type="date"
                  required
                  value={editingProject.startDate || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, startDate: e.target.value })}
                />
              </Field>

              <Field label={t("projects.fieldTarget")}>
                <input
                  type="date"
                  value={editingProject.targetDate || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, targetDate: e.target.value })}
                />
              </Field>

              <Field label={t("projects.fieldBudget", { currency: symbol() })}>
                <input
                  type="number"
                  step="100"
                  value={editingProject.budgetGross || ""}
                  onChange={(e) =>
                    setEditingProject({ ...editingProject, budgetGross: parseFloat(e.target.value) || 0 })
                  }
                />
              </Field>

              <Field label={t("projects.fieldNotes")} wide>
                <textarea
                  rows={3}
                  placeholder={t("projects.notesPlaceholder")}
                  value={editingProject.notes || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, notes: e.target.value })}
                />
              </Field>
            </div>

            {error && <p className="error" role="alert">{error}</p>}

            <div className="row gap craft-dialog-actions">
              <button type="button" onClick={() => { setError(""); setIsModalOpen(false); }} className="button">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={isBusy} className="button primary">
                <Check size={18} /> {t("projects.save")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
