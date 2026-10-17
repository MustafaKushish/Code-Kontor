import { useState } from "react";
import {
  Ruler,
  Plus,
  Trash2,
  X,
  Check,
  Calculator,
  Search,
  Layers,
  ArrowRight,
  FolderKanban,
} from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import { evaluateFormula } from "../../../shared/formula";
import type {
  CraftMeasurement,
  CraftProject,
} from "../../../shared/craft";
import { useCraftI18n } from "./i18n";

interface MeasurementsTabProps {
  isManager: boolean;
  measurements: CraftMeasurement[];
  projects: CraftProject[];
  onRefresh: () => void;
}

export function MeasurementsTab({ measurements, projects, onRefresh, isManager }: MeasurementsTabProps) {
  const { t, num, categoryLabel, unitLabel } = useCraftI18n();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<Partial<CraftMeasurement>>({
    category: "Fläche",
    unit: "m²",
    formula: "",
  });
  const [isBusy, setIsBusy] = useState(false);

  const filtered = measurements.filter((m) => {
    const matchesProj = selectedProjectId === "alle" || m.projectId === selectedProjectId;
    const matchesSearch =
      !search ||
      m.roomName.toLowerCase().includes(search.toLowerCase()) ||
      m.formula.toLowerCase().includes(search.toLowerCase()) ||
      (m.notes && m.notes.toLowerCase().includes(search.toLowerCase()));
    return matchesProj && matchesSearch;
  });

  const handleOpenAdd = () => {
    setEditingMeasurement({
      projectId: selectedProjectId === "alle" ? projects[0]?.id || "" : selectedProjectId,
      roomName: "",
      category: "Fläche",
      formula: "",
      unit: "m²",
      notes: "",
    });
    setIsModalOpen(true);
  };

  const handleFormulaChange = (val: string) => {
    const result = evaluateFormula(val) ?? 0;
    setEditingMeasurement({ ...editingMeasurement, formula: val, result });
  };

  const handleCategoryChange = (category: CraftMeasurement["category"]) => {
    const unit =
      category === "Fläche"
        ? "m²"
        : category === "Länge / Umfang"
        ? "m"
        : category === "Volumen"
        ? "m³"
        : "stk";
    setEditingMeasurement({ ...editingMeasurement, category, unit });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMeasurement.projectId || !editingMeasurement.roomName) return;
    setIsBusy(true);
    try {
      await api("/craft/measurements", {
        method: "POST",
        body: editingMeasurement,
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
    setIsBusy(true);
    try {
      await api(`/craft/measurements/${id}`, { method: "DELETE" });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  // Group by Room
  const groupedByRoom = filtered.reduce<Record<string, CraftMeasurement[]>>((acc, item) => {
    if (!acc[item.roomName]) acc[item.roomName] = [];
    acc[item.roomName].push(item);
    return acc;
  }, {});

  return (
    <div className="stack">
      <div className="toolbar craft-toolbar">
        <div className="craft-toolbar-row">
          <label className="search">
            <Search size={18} />
            <input
              type="search"
              placeholder={t("measurements.searchPlaceholder")}
              aria-label={t("measurements.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            aria-label={t("common.projectFilter")}
            title={t("common.projectFilter")}
          >
            <option value="alle">{t("common.allSites", { n: projects.length })}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectNumber} · {p.title}
              </option>
            ))}
          </select>
          <button onClick={handleOpenAdd} className="button primary">
            <Plus size={18} /> {t("measurements.add")}
          </button>
        </div>
      </div>

      {Object.keys(groupedByRoom).length === 0 ? (
        <section className="card craft-empty">
          <Ruler size={40} aria-hidden />
          <strong>{t("measurements.emptyTitle")}</strong>
          <p className="muted small">
            {t("measurements.emptyText")}
          </p>
        </section>
      ) : (
        <div className="stack">
          {Object.entries(groupedByRoom).map(([roomName, items]) => {
            const totalArea = items
              .filter((i) => i.unit === "m²")
              .reduce((sum, i) => sum + i.result, 0);
            const totalLength = items
              .filter((i) => i.unit === "m")
              .reduce((sum, i) => sum + i.result, 0);

            return (
              <section key={roomName} className="card list-card craft-room">
                <div className="section-head craft-room-head">
                  <h3>
                    <span className="craft-icon"><Ruler size={16} /></span>
                    {roomName}
                  </h3>
                  <div className="row wrap gap">
                    {totalArea > 0 && (
                      <span className="pill warn">
                        {t("measurements.totalArea", { value: num(Math.round(totalArea * 100) / 100) })}
                      </span>
                    )}
                    {totalLength > 0 && (
                      <span className="pill tone-info">
                        {t("measurements.totalLength", { value: num(Math.round(totalLength * 100) / 100) })}
                      </span>
                    )}
                  </div>
                </div>

                {items.map((m) => {
                  const proj = projects.find((p) => p.id === m.projectId);
                  return (
                    <div key={m.id} className="list-row craft-measure-row">
                      <span className="list-main">
                        <strong>
                          <span className="pill craft-tag">{categoryLabel(m.category)}</span>{" "}
                          <span className="craft-number">{proj?.projectNumber}</span>
                          {m.notes && <> · {m.notes}</>}
                        </strong>
                        <small className="muted craft-mono">{t("measurements.formula", { formula: m.formula || "-" })}</small>
                      </span>
                      <span className="craft-result">
                        {num(m.result)} {unitLabel(m.unit)}
                      </span>
                      {isManager && (
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="icon-button danger"
                          title={t("common.delete")}
                          aria-label={t("common.delete")}
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <Dialog title={t("measurements.dialogTitle")} onClose={() => setIsModalOpen(false)}>
          <form onSubmit={handleSave} className="stack">
            <div className="grid form-grid">
              <Field label={t("common.projectOrSite")} required wide>
                <select
                  required
                  value={editingMeasurement.projectId || ""}
                  onChange={(e) => setEditingMeasurement({ ...editingMeasurement, projectId: e.target.value })}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectNumber} · {p.title}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t("measurements.fieldRoom")} required hint={t("measurements.roomHint")}>
                <input
                  type="text"
                  required
                  placeholder={t("measurements.roomPlaceholder")}
                  value={editingMeasurement.roomName || ""}
                  onChange={(e) => setEditingMeasurement({ ...editingMeasurement, roomName: e.target.value })}
                />
              </Field>

              <Field label={t("measurements.fieldCategory")}>
                <select
                  value={editingMeasurement.category || "Fläche"}
                  onChange={(e) => handleCategoryChange(e.target.value as any)}
                >
                  <option value="Fläche">{t("measurements.categoryOption", { label: t("categories.area"), unit: "m²" })}</option>
                  <option value="Länge / Umfang">{t("measurements.categoryOption", { label: t("categories.length"), unit: "m" })}</option>
                  <option value="Volumen">{t("measurements.categoryOption", { label: t("categories.volume"), unit: "m³" })}</option>
                  <option value="Stückzahl">{t("measurements.categoryOption", { label: t("categories.count"), unit: t("units.pieces") })}</option>
                </select>
              </Field>

              <Field
                label={t("measurements.fieldFormula")}
                hint={t("measurements.formulaHint")}
                wide
              >
                <input
                  type="text"
                  placeholder="5.40 * 3.80"
                  value={editingMeasurement.formula || ""}
                  onChange={(e) => handleFormulaChange(e.target.value)}
                  className="craft-mono"
                />
              </Field>

              <div className="craft-total wide">
                <span>
                  <Calculator size={17} aria-hidden /> {t("measurements.calculated")}
                </span>
                <strong>
                  {num(editingMeasurement.result || 0)} {unitLabel(editingMeasurement.unit)}
                </strong>
              </div>

              <Field label={t("measurements.fieldNotes")} wide>
                <input
                  type="text"
                  placeholder={t("measurements.notesPlaceholder")}
                  value={editingMeasurement.notes || ""}
                  onChange={(e) => setEditingMeasurement({ ...editingMeasurement, notes: e.target.value })}
                />
              </Field>
            </div>

            <div className="row gap craft-dialog-actions">
              <button type="button" onClick={() => setIsModalOpen(false)} className="button">
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={isBusy || !editingMeasurement.roomName}
                className="button primary"
              >
                <Check size={18} /> {t("measurements.save")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
