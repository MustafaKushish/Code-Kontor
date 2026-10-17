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

interface ProjectsTabProps {
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
}: ProjectsTabProps) {
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

  const fmtEuro = (amount?: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount || 0);

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
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: CraftProject) => {
    setEditingProject({ ...p });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject.title || !editingProject.customerName || !editingProject.siteAddress) {
      return;
    }
    setIsBusy(true);
    try {
      await api("/craft/projects", {
        method: "POST",
        body: editingProject,
      });
      setIsModalOpen(false);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Möchtest du diese Baustellenakte wirklich löschen? Zugehörige Aufmaße und Berichte werden ebenfalls gelöscht.")) {
      return;
    }
    setIsBusy(true);
    try {
      await api(`/craft/projects/${id}`, { method: "DELETE" });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const statusLabel = (status: CraftProjectStatus) =>
    status === "abnahmebereit"
      ? "Abnahmebereit"
      : status === "in_arbeit"
      ? "In Arbeit"
      : status === "abgeschlossen"
      ? "Abgeschlossen"
      : "Geplant";

  return (
    <div className="stack">
      <div className="toolbar craft-toolbar">
        <div className="craft-toolbar-row">
          <label className="search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Suchen..."
              aria-label="Suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            value={selectedTrade}
            onChange={(e) => setSelectedTrade(e.target.value)}
            aria-label="Gewerk"
          >
            <option value="alle">Alle Gewerke</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button onClick={handleOpenAdd} className="button primary">
            <Plus size={18} /> Neue Baustelle
          </button>
        </div>
        <div className="chips" role="tablist">
          {[
            { id: "alle", label: "Alle Baustellen" },
            { id: "in_arbeit", label: "In Arbeit" },
            { id: "abnahmebereit", label: "Abnahmebereit" },
            { id: "geplant", label: "Geplant" },
            { id: "abgeschlossen", label: "Abgeschlossen" },
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
          <strong>Keine Baustellenakten gefunden</strong>
          <p className="muted small">
            Erstelle eine neue Baustelle, um Aufmaße, Arbeitsberichte und Bautagebücher zuzuordnen.
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
                    <strong>{project.trade}</strong> · Bauherr: {project.customerName}
                  </small>
                </div>

                <div className="craft-facts">
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      `${project.siteAddress}, ${project.siteCity}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="In Google Maps öffnen"
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
                      Start: {new Date(project.startDate).toLocaleDateString("de-DE")}
                      {project.targetDate && (
                        <> · Bis: {new Date(project.targetDate).toLocaleDateString("de-DE")}</>
                      )}
                    </span>
                  </span>
                </div>

                <div className="craft-card-foot">
                  <strong className="craft-amount">Budget: {fmtEuro(project.budgetGross)}</strong>
                  <div className="row">
                    <button
                      onClick={() => handleOpenEdit(project)}
                      className="icon-button"
                      title="Bearbeiten"
                      aria-label="Bearbeiten"
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="icon-button danger"
                      title="Löschen"
                      aria-label="Löschen"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <Dialog
          title={editingProject.id ? "Baustellenakte bearbeiten" : "Neue Baustelle / Bauvorhaben anlegen"}
          onClose={() => setIsModalOpen(false)}
          wide
        >
          <form onSubmit={handleSave} className="stack">
            <div className="grid form-grid">
              <Field label="Bauvorhaben / Projekt-Titel" required hint="z.B. Sanierung Altbau 1. OG" wide>
                <input
                  type="text"
                  required
                  placeholder="Sanierung Altbau 1. OG"
                  value={editingProject.title || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, title: e.target.value })}
                />
              </Field>

              <Field label="Gewerk" required>
                <select
                  value={editingProject.trade || "Elektro"}
                  onChange={(e) => setEditingProject({ ...editingProject, trade: e.target.value as any })}
                >
                  {trades.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Status">
                <select
                  value={editingProject.status || "in_arbeit"}
                  onChange={(e) => setEditingProject({ ...editingProject, status: e.target.value as any })}
                >
                  <option value="geplant">Geplant</option>
                  <option value="in_arbeit">In Arbeit</option>
                  <option value="abnahmebereit">Abnahmebereit</option>
                  <option value="abgeschlossen">Abgeschlossen</option>
                </select>
              </Field>

              <Field label="Auftraggeber / Bauherr" required>
                <input
                  type="text"
                  required
                  placeholder="Dr. Thomas Bergmann"
                  value={editingProject.customerName || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, customerName: e.target.value })}
                />
              </Field>

              <Field label="Telefon Bauherr">
                <input
                  type="tel"
                  placeholder="+49 40 123456"
                  value={editingProject.customerPhone || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, customerPhone: e.target.value })}
                />
              </Field>

              <Field label="Baustellenadresse / Einsatzort" required>
                <input
                  type="text"
                  required
                  placeholder="Millerntorplatz 14"
                  value={editingProject.siteAddress || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, siteAddress: e.target.value })}
                />
              </Field>

              <Field label="PLZ / Ort">
                <input
                  type="text"
                  placeholder="20359 Hamburg"
                  value={editingProject.siteCity || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, siteCity: e.target.value })}
                />
              </Field>

              <Field label="Montage-Start" required>
                <input
                  type="date"
                  required
                  value={editingProject.startDate || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, startDate: e.target.value })}
                />
              </Field>

              <Field label="Zieltermin">
                <input
                  type="date"
                  value={editingProject.targetDate || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, targetDate: e.target.value })}
                />
              </Field>

              <Field label="Budget (€ brutto)">
                <input
                  type="number"
                  step="100"
                  value={editingProject.budgetGross || ""}
                  onChange={(e) =>
                    setEditingProject({ ...editingProject, budgetGross: parseFloat(e.target.value) || 0 })
                  }
                />
              </Field>

              <Field label="Baustellennotizen & Ausführungsdetails" wide>
                <textarea
                  rows={3}
                  placeholder="Besonderheiten, Schlüsselübergabe, Zufahrtsregelung..."
                  value={editingProject.notes || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, notes: e.target.value })}
                />
              </Field>
            </div>

            <div className="row gap craft-dialog-actions">
              <button type="button" onClick={() => setIsModalOpen(false)} className="button">
                Abbrechen
              </button>
              <button type="submit" disabled={isBusy} className="button primary">
                <Check size={18} /> Baustelle speichern
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
