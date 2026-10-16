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
        body: JSON.stringify(editingProject),
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

  return (
    <div className="space-y-6">
      {/* Top Filter and Actions Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: "alle", label: "Alle Baustellen" },
            { id: "in_arbeit", label: "In Arbeit" },
            { id: "abnahmebereit", label: "Abnahmebereit" },
            { id: "geplant", label: "Geplant" },
            { id: "abgeschlossen", label: "Abgeschlossen" },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedStatus(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedStatus === s.id
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Trade & Search & Add */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          <select
            value={selectedTrade}
            onChange={(e) => setSelectedTrade(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
          >
            <option value="alle">Alle Gewerke</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
          </div>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Neue Baustelle
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProjects.length === 0 ? (
          <div className="col-span-full text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
            <HardHat className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">Keine Baustellenakten gefunden</p>
            <p className="text-xs text-slate-500 mt-1">
              Erstelle eine neue Baustelle, um Aufmaße, Arbeitsberichte und Bautagebücher zuzuordnen.
            </p>
          </div>
        ) : (
          filteredProjects.map((project) => {
            const isInProgress = project.status === "in_arbeit";
            const isReadyForAcceptance = project.status === "abnahmebereit";
            const isCompleted = project.status === "abgeschlossen";

            return (
              <div
                key={project.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top line: Number & Trade */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-tight">
                      {project.projectNumber}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isReadyForAcceptance
                          ? "bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300"
                          : isInProgress
                          ? "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300"
                          : isCompleted
                          ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {isReadyForAcceptance
                        ? "Abnahmebereit"
                        : isInProgress
                        ? "In Arbeit"
                        : isCompleted
                        ? "Abgeschlossen"
                        : "Geplant"}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-white text-base line-clamp-1 mb-1">
                    {project.title}
                  </h3>

                  <div className="text-xs text-slate-500 flex items-center gap-2 mb-3">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {project.trade}
                    </span>
                    <span>·</span>
                    <span>Bauherr: {project.customerName}</span>
                  </div>

                  {/* Address & Contacts */}
                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(
                        `${project.siteAddress}, ${project.siteCity}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-1.5 hover:text-amber-600 dark:hover:text-amber-400 transition-colors group"
                      title="In Google Maps öffnen"
                    >
                      <MapPin className="w-3.5 h-3.5 mt-0.5 text-slate-400 group-hover:text-amber-500" />
                      <span className="line-clamp-1">
                        {project.siteAddress}{project.siteCity ? `, ${project.siteCity}` : ""}
                      </span>
                    </a>

                    {project.customerPhone && (
                      <a
                        href={`tel:${project.customerPhone}`}
                        className="flex items-center gap-1.5 hover:text-amber-600 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{project.customerPhone}</span>
                      </a>
                    )}

                    <div className="flex items-center gap-1.5 text-slate-500 text-[11px] pt-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Start: {new Date(project.startDate).toLocaleDateString("de-DE")}</span>
                      {project.targetDate && (
                        <span>· Bis: {new Date(project.targetDate).toLocaleDateString("de-DE")}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                    Budget: {fmtEuro(project.budgetGross)}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(project)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Bearbeiten"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: New / Edit Project */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {editingProject.id ? "Baustellenakte bearbeiten" : "Neue Baustelle / Bauvorhaben anlegen"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <Field label="Bauvorhaben / Projekt-Titel" required hint="z.B. Sanierung Altbau 1. OG">
                <input
                  type="text"
                  required
                  placeholder="Sanierung Altbau 1. OG"
                  value={editingProject.title || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, title: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Gewerk" required>
                  <select
                    value={editingProject.trade || "Elektro"}
                    onChange={(e) => setEditingProject({ ...editingProject, trade: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
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
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="geplant">Geplant</option>
                    <option value="in_arbeit">In Arbeit</option>
                    <option value="abnahmebereit">Abnahmebereit</option>
                    <option value="abgeschlossen">Abgeschlossen</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Auftraggeber / Bauherr" required>
                  <input
                    type="text"
                    required
                    placeholder="Dr. Thomas Bergmann"
                    value={editingProject.customerName || ""}
                    onChange={(e) => setEditingProject({ ...editingProject, customerName: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </Field>

                <Field label="Telefon Bauherr">
                  <input
                    type="tel"
                    placeholder="+49 40 123456"
                    value={editingProject.customerPhone || ""}
                    onChange={(e) => setEditingProject({ ...editingProject, customerPhone: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Baustellenadresse / Einsatzort" required>
                    <input
                      type="text"
                      required
                      placeholder="Millerntorplatz 14"
                      value={editingProject.siteAddress || ""}
                      onChange={(e) => setEditingProject({ ...editingProject, siteAddress: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </Field>
                </div>
                <Field label="PLZ / Ort">
                  <input
                    type="text"
                    placeholder="20359 Hamburg"
                    value={editingProject.siteCity || ""}
                    onChange={(e) => setEditingProject({ ...editingProject, siteCity: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Montage-Start" required>
                  <input
                    type="date"
                    required
                    value={editingProject.startDate || ""}
                    onChange={(e) => setEditingProject({ ...editingProject, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </Field>

                <Field label="Zieltermin">
                  <input
                    type="date"
                    value={editingProject.targetDate || ""}
                    onChange={(e) => setEditingProject({ ...editingProject, targetDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
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
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold"
                  />
                </Field>
              </div>

              <Field label="Baustellennotizen & Ausführungsdetails">
                <textarea
                  rows={3}
                  placeholder="Besonderheiten, Schlüsselübergabe, Zufahrtsregelung..."
                  value={editingProject.notes || ""}
                  onChange={(e) => setEditingProject({ ...editingProject, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </Field>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  Baustelle speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
