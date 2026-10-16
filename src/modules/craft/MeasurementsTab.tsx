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
import type {
  CraftMeasurement,
  CraftProject,
} from "../../../shared/craft";

interface MeasurementsTabProps {
  measurements: CraftMeasurement[];
  projects: CraftProject[];
  onRefresh: () => void;
}

export function MeasurementsTab({ measurements, projects, onRefresh }: MeasurementsTabProps) {
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
    let result = 0;
    try {
      const sanitized = val.replace(/[^\d.+*\- /()]/g, "");
      if (sanitized.trim()) {
        result = Math.round(Function(`'use strict'; return (${sanitized})`)() * 100) / 100;
      }
    } catch {
      result = 0;
    }
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
        body: JSON.stringify(editingMeasurement),
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
    <div className="space-y-6">
      {/* Top Filter and Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Project Selector */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-xs text-slate-500 font-semibold whitespace-nowrap">
            Bauvorhaben:
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full md:w-72 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
          >
            <option value="alle">Alle Baustellen ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectNumber} · {p.title}
              </option>
            ))}
          </select>
        </div>

        {/* Search & Add button */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Raum oder Notiz..."
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
            Aufmaß erfassen
          </button>
        </div>
      </div>

      {/* Measurement List grouped by Room */}
      {Object.keys(groupedByRoom).length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
          <Ruler className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-semibold">Keine Aufmaße vorhanden</p>
          <p className="text-xs text-slate-500 mt-1">
            Erfasse Längen, Wandflächen, Raummaße oder Stückzahlen vor Ort auf der Baustelle.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByRoom).map(([roomName, items]) => {
            const totalArea = items
              .filter((i) => i.unit === "m²")
              .reduce((sum, i) => sum + i.result, 0);
            const totalLength = items
              .filter((i) => i.unit === "m")
              .reduce((sum, i) => sum + i.result, 0);

            return (
              <div
                key={roomName}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden"
              >
                {/* Room Header */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                      <Ruler className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      {roomName}
                    </h3>
                  </div>

                  {/* Room summary badges */}
                  <div className="flex items-center gap-3 text-xs font-mono">
                    {totalArea > 0 && (
                      <span className="text-amber-700 dark:text-amber-400 font-bold">
                        Gesamtfläche: {Math.round(totalArea * 100) / 100} m²
                      </span>
                    )}
                    {totalLength > 0 && (
                      <span className="text-blue-700 dark:text-blue-400 font-bold">
                        Gesamtlänge: {Math.round(totalLength * 100) / 100} m
                      </span>
                    )}
                  </div>
                </div>

                {/* Table of items */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((m) => {
                    const proj = projects.find((p) => p.id === m.projectId);
                    return (
                      <div
                        key={m.id}
                        className="p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {m.category}
                            </span>
                            <span className="font-mono text-slate-500 text-[11px]">
                              {proj?.projectNumber}
                            </span>
                            {m.notes && (
                              <span className="text-slate-800 dark:text-slate-200 font-medium">
                                · {m.notes}
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex items-center gap-2">
                            <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                              Formel: {m.formula || "-"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                          <span className="font-mono font-bold text-sm text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                            {m.result} {m.unit}
                          </span>

                          <button
                            onClick={() => handleDelete(m.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                            title="Löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Add Measurement */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">Aufmaßzeile hinzufügen</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <Field label="Bauvorhaben / Baustelle" required>
                <select
                  required
                  value={editingMeasurement.projectId || ""}
                  onChange={(e) => setEditingMeasurement({ ...editingMeasurement, projectId: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-medium"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectNumber} · {p.title}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Raum / Bauteil" required hint="z.B. Wohnzimmer, Flur EG">
                  <input
                    type="text"
                    required
                    placeholder="Wohnzimmer EG"
                    value={editingMeasurement.roomName || ""}
                    onChange={(e) => setEditingMeasurement({ ...editingMeasurement, roomName: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </Field>

                <Field label="Kategorie">
                  <select
                    value={editingMeasurement.category || "Fläche"}
                    onChange={(e) => handleCategoryChange(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="Fläche">Fläche (m²)</option>
                    <option value="Länge / Umfang">Länge / Umfang (m)</option>
                    <option value="Volumen">Volumen (m³)</option>
                    <option value="Stückzahl">Stückzahl (stk)</option>
                  </select>
                </Field>
              </div>

              {/* Formel-Rechner mit Live-Ergebnis */}
              <Field
                label="Abmessungen / Rechenformel"
                hint="z.B. 5.40 * 3.80 oder 2 * (4.20 + 3.10)"
              >
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="5.40 * 3.80"
                    value={editingMeasurement.formula || ""}
                    onChange={(e) => handleFormulaChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold"
                  />

                  {/* Ergebnis Preview */}
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 flex items-center justify-between font-mono">
                    <span className="text-xs text-amber-800 dark:text-amber-300 font-sans font-medium">
                      Berechnetes Aufmaß:
                    </span>
                    <span className="text-base font-bold text-amber-900 dark:text-amber-200">
                      {editingMeasurement.result || 0} {editingMeasurement.unit}
                    </span>
                  </div>
                </div>
              </Field>

              <Field label="Beschreibung / Bauteil-Hinweis">
                <input
                  type="text"
                  placeholder="z.B. Fliesenwand Duschbereich, Trassenlänge"
                  value={editingMeasurement.notes || ""}
                  onChange={(e) => setEditingMeasurement({ ...editingMeasurement, notes: e.target.value })}
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
                  disabled={isBusy || !editingMeasurement.roomName}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  Aufmaß speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
