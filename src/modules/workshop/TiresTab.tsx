import { useState } from "react";
import { Search, Plus, Disc, Shield, Pencil, Trash2, X, Check, Car, User, Phone } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { TireStorage, Vehicle } from "../../../shared/workshop";

interface TiresTabProps {
  tires: TireStorage[];
  vehicles: Vehicle[];
  onTiresChanged: (tires: TireStorage[]) => void;
}

export function TiresTab({ tires, vehicles, onTiresChanged }: TiresTabProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTire, setEditingTire] = useState<TireStorage | null>(null);

  const [form, setForm] = useState({
    licensePlate: "",
    customerName: "",
    customerPhone: "",
    type: "Sommer" as TireStorage["type"],
    brand: "",
    dimension: "",
    dot: "",
    rimType: "Alufelge" as TireStorage["rimType"],
    treadDepthFL: 6.0,
    treadDepthFR: 6.0,
    treadDepthRL: 5.5,
    treadDepthRR: 5.5,
    condition: "gut" as TireStorage["condition"],
    storageLocation: "Reifenregal 1 - Fach A1",
  });

  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const filtered = tires.filter((t) => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.licensePlate.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.brand.toLowerCase().includes(q) ||
        t.dimension.toLowerCase().includes(q) ||
        t.storageLocation.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openNewModal = () => {
    setEditingTire(null);
    setForm({
      licensePlate: "",
      customerName: "",
      customerPhone: "",
      type: "Winter",
      brand: "Continental WinterContact TS 870",
      dimension: "205/55 R16 91H",
      dot: "2422",
      rimType: "Alufelge",
      treadDepthFL: 6.5,
      treadDepthFR: 6.5,
      treadDepthRL: 6.0,
      treadDepthRR: 6.0,
      condition: "gut",
      storageLocation: "Reifenregal 2 - Fach B1",
    });
    setModalOpen(true);
  };

  const openEditModal = (t: TireStorage) => {
    setEditingTire(t);
    setForm({
      licensePlate: t.licensePlate,
      customerName: t.customerName,
      customerPhone: t.customerPhone,
      type: t.type,
      brand: t.brand,
      dimension: t.dimension,
      dot: t.dot,
      rimType: t.rimType,
      treadDepthFL: t.treadDepthFL,
      treadDepthFR: t.treadDepthFR,
      treadDepthRL: t.treadDepthRL,
      treadDepthRR: t.treadDepthRR,
      condition: t.condition,
      storageLocation: t.storageLocation,
    });
    setModalOpen(true);
  };

  const handlePlateChange = (val: string) => {
    const clean = val.toUpperCase();
    setForm((prev) => {
      const updated = { ...prev, licensePlate: clean };
      const match = vehicles.find((v) => v.licensePlate.replace(/\s+/g, "") === clean.replace(/\s+/g, ""));
      if (match) {
        updated.customerName = match.customerName;
        updated.customerPhone = match.customerPhone;
      }
      return updated;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.licensePlate.trim() || !form.brand.trim() || !form.dimension.trim()) {
      setErrorMsg("Bitte mindestens Kennzeichen, Reifenmarke und Dimension ausfüllen.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const saved = await api<TireStorage>("/workshop/tires", {
        method: "POST",
        body: {
          id: editingTire?.id,
          licensePlate: form.licensePlate.trim().toUpperCase(),
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          type: form.type,
          brand: form.brand.trim(),
          dimension: form.dimension.trim(),
          dot: form.dot.trim(),
          rimType: form.rimType,
          treadDepthFL: Number(form.treadDepthFL) || 0,
          treadDepthFR: Number(form.treadDepthFR) || 0,
          treadDepthRL: Number(form.treadDepthRL) || 0,
          treadDepthRR: Number(form.treadDepthRR) || 0,
          condition: form.condition,
          storageLocation: form.storageLocation.trim(),
        },
      });

      if (editingTire) {
        onTiresChanged(tires.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        onTiresChanged([saved, ...tires]);
      }
      setModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Speichern der Reifeneinlagerung.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/workshop/tires/${id}`, { method: "DELETE" });
      onTiresChanged(tires.filter((t) => t.id !== id));
      setDeleteConfirmId(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Löschen.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter- & Aktionsleiste */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[220px] max-w-sm flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Kennzeichen, Halter, Dimension, Lagerplatz..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300"
          >
            <option value="all">Alle Reifensaisons</option>
            <option value="Sommer">Sommerreifen</option>
            <option value="Winter">Winterreifen</option>
            <option value="Ganzjahr">Ganzjahresreifen</option>
          </select>
        </div>

        <button
          onClick={openNewModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs shadow-sm transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Radsatz einlagern
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Reifenkarten */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 text-xs">
            Keine Reifensätze im Räderhotel eingelagert.
          </div>
        ) : (
          filtered.map((t) => (
            <div
              key={t.id}
              className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-base text-blue-600 dark:text-blue-400 block">
                      {t.licensePlate}
                    </span>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                      {t.brand}
                    </h3>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded">
                    {t.type} · {t.rimType}
                  </span>
                </div>

                <p className="text-xs font-mono font-medium text-slate-700 dark:text-slate-300 mt-1">
                  {t.dimension} {t.dot && <span className="text-slate-400">(DOT {t.dot})</span>}
                </p>

                {/* Profiltiefen-Gitter */}
                <div className="mt-3 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Gemessene Profiltiefe (mm)
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-400 text-[10px] block">Vorne Links</span>
                      <span className="font-bold">{t.treadDepthFL.toFixed(1)} mm</span>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-400 text-[10px] block">Vorne Rechts</span>
                      <span className="font-bold">{t.treadDepthFR.toFixed(1)} mm</span>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-400 text-[10px] block">Hinten Links</span>
                      <span className="font-bold">{t.treadDepthRL.toFixed(1)} mm</span>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-400 text-[10px] block">Hinten Rechts</span>
                      <span className="font-bold">{t.treadDepthRR.toFixed(1)} mm</span>
                    </div>
                  </div>
                </div>

                {/* Lagerplatz & Halter */}
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 space-y-0.5">
                  <p>
                    Lagerort: <span className="font-medium text-slate-800 dark:text-slate-200">{t.storageLocation}</span>
                  </p>
                  <p>
                    Kunde: <span className="font-medium text-slate-800 dark:text-slate-200">{t.customerName}</span>{" "}
                    {t.customerPhone && <span className="text-[11px] text-slate-400">({t.customerPhone})</span>}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <button
                  onClick={() => openEditModal(t)}
                  className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-blue-600 font-medium"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Bearbeiten
                </button>

                {deleteConfirmId === t.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="px-2 py-0.5 bg-red-600 text-white rounded text-[10px] font-semibold"
                    >
                      Löschen
                    </button>
                    <button onClick={() => setDeleteConfirmId(null)} className="text-slate-400 text-[10px]">
                      Nein
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirmId(t.id)} className="p-1 text-slate-300 hover:text-red-500 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: Radsatz erfassen / bearbeiten */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl shadow-xl max-w-xl w-full p-6 relative border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Disc className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold">
                  {editingTire ? "Radsatz bearbeiten" : "Radsatz im Räderhotel einlagern"}
                </h2>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Field label="Amtliches Kennzeichen *">
                    <input
                      type="text"
                      required
                      placeholder="z. B. HH-WM 2024"
                      value={form.licensePlate}
                      onChange={(e) => handlePlateChange(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold uppercase text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Saison / Reifentyp">
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    >
                      <option value="Sommer">Sommerreifen</option>
                      <option value="Winter">Winterreifen</option>
                      <option value="Ganzjahr">Ganzjahresreifen</option>
                    </select>
                  </Field>
                </div>

                <div>
                  <Field label="Reifenmarke & Profil *">
                    <input
                      type="text"
                      required
                      placeholder="z. B. Continental WinterContact"
                      value={form.brand}
                      onChange={(e) => setForm({ ...form, brand: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Reifendimension *">
                    <input
                      type="text"
                      required
                      placeholder="z. B. 205/55 R16 91H"
                      value={form.dimension}
                      onChange={(e) => setForm({ ...form, dimension: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="DOT (Herstellungswoche/Jahr)">
                    <input
                      type="text"
                      placeholder="z. B. 3822"
                      value={form.dot}
                      onChange={(e) => setForm({ ...form, dot: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Felgentyp">
                    <select
                      value={form.rimType}
                      onChange={(e) => setForm({ ...form, rimType: e.target.value as any })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    >
                      <option value="Alufelge">Alufelge</option>
                      <option value="Stahlfelge">Stahlfelge</option>
                    </select>
                  </Field>
                </div>

                <div className="sm:col-span-2">
                  <Field label="Lagerplatz im Räderhotel *">
                    <input
                      type="text"
                      required
                      placeholder="z. B. Reifenregal 2 - Fach B1"
                      value={form.storageLocation}
                      onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    />
                  </Field>
                </div>
              </div>

              {/* Profiltiefen */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                  Profiltiefenmessung (mm)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <Field label="Vorne Links (VL)">
                      <input
                        type="number"
                        step="0.1"
                        value={form.treadDepthFL}
                        onChange={(e) => setForm({ ...form, treadDepthFL: Number(e.target.value) })}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono text-xs"
                      />
                    </Field>
                  </div>
                  <div>
                    <Field label="Vorne Rechts (VR)">
                      <input
                        type="number"
                        step="0.1"
                        value={form.treadDepthFR}
                        onChange={(e) => setForm({ ...form, treadDepthFR: Number(e.target.value) })}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono text-xs"
                      />
                    </Field>
                  </div>
                  <div>
                    <Field label="Hinten Links (HL)">
                      <input
                        type="number"
                        step="0.1"
                        value={form.treadDepthRL}
                        onChange={(e) => setForm({ ...form, treadDepthRL: Number(e.target.value) })}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono text-xs"
                      />
                    </Field>
                  </div>
                  <div>
                    <Field label="Hinten Rechts (HR)">
                      <input
                        type="number"
                        step="0.1"
                        value={form.treadDepthRR}
                        onChange={(e) => setForm({ ...form, treadDepthRR: Number(e.target.value) })}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono text-xs"
                      />
                    </Field>
                  </div>
                </div>
              </div>

              {/* Halterdaten */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <Field label="Kundenname">
                    <input
                      type="text"
                      value={form.customerName}
                      onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    />
                  </Field>
                </div>
                <div>
                  <Field label="Telefon">
                    <input
                      type="tel"
                      value={form.customerPhone}
                      onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    />
                  </Field>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 rounded-lg text-xs"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm transition-colors"
                >
                  {saving ? "Wird gespeichert..." : "Radsatz einlagern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
