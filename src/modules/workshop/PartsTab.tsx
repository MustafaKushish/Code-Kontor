import { useState } from "react";
import { Search, Plus, AlertTriangle, Layers, Wrench, Pencil, Trash2, X, Check, ArrowUpDown } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { SparePart } from "../../../shared/workshop";

interface PartsTabProps {
  parts: SparePart[];
  onPartsChanged: (parts: SparePart[]) => void;
}

const CATEGORIES: SparePart["category"][] = [
  "Filter",
  "Bremsen",
  "Zündung",
  "Fahrwerk",
  "Elektrik",
  "Öle & Chemie",
  "Karosserie",
  "Sonstiges",
];

export function PartsTab({ parts, onPartsChanged }: PartsTabProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<SparePart | null>(null);

  const [form, setForm] = useState({
    partNumber: "",
    oemNumber: "",
    name: "",
    manufacturer: "",
    category: "Sonstiges" as SparePart["category"],
    stock: 5,
    minStock: 2,
    purchasePriceNet: 10.0,
    salePriceNet: 25.0,
    taxRate: 19.0,
    storageBin: "",
  });

  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  const filtered = parts.filter((p) => {
    if (lowStockOnly && p.stock > p.minStock) return false;
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.partNumber.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.manufacturer.toLowerCase().includes(q) ||
        (p.oemNumber && p.oemNumber.toLowerCase().includes(q)) ||
        p.storageBin.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openNewModal = () => {
    setEditingPart(null);
    setForm({
      partNumber: "",
      oemNumber: "",
      name: "",
      manufacturer: "",
      category: "Filter",
      stock: 4,
      minStock: 2,
      purchasePriceNet: 12.0,
      salePriceNet: 28.0,
      taxRate: 19.0,
      storageBin: "Regal A-01",
    });
    setModalOpen(true);
  };

  const openEditModal = (p: SparePart) => {
    setEditingPart(p);
    setForm({
      partNumber: p.partNumber,
      oemNumber: p.oemNumber || "",
      name: p.name,
      manufacturer: p.manufacturer,
      category: p.category,
      stock: p.stock,
      minStock: p.minStock,
      purchasePriceNet: p.purchasePriceNet,
      salePriceNet: p.salePriceNet,
      taxRate: p.taxRate,
      storageBin: p.storageBin,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.partNumber.trim() || !form.name.trim()) {
      setErrorMsg("Bitte mindestens Teilenummer und Bezeichnung ausfüllen.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const saved = await api<SparePart>("/workshop/parts", {
        method: "POST",
        body: {
          id: editingPart?.id,
          partNumber: form.partNumber.trim(),
          oemNumber: form.oemNumber.trim() || undefined,
          name: form.name.trim(),
          manufacturer: form.manufacturer.trim(),
          category: form.category,
          stock: Number(form.stock) || 0,
          minStock: Number(form.minStock) || 0,
          purchasePriceNet: Number(form.purchasePriceNet) || 0,
          salePriceNet: Number(form.salePriceNet) || 0,
          taxRate: 19.0,
          storageBin: form.storageBin.trim(),
        },
      });

      if (editingPart) {
        onPartsChanged(parts.map((p) => (p.id === saved.id ? saved : p)));
      } else {
        onPartsChanged([...parts, saved]);
      }
      setModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Speichern des Teils.");
    } finally {
      setSaving(false);
    }
  };

  const handleStockAdjust = async (id: string, diff: number) => {
    try {
      const updated = await api<SparePart>(`/workshop/parts/${id}/stock`, {
        method: "POST",
        body: { diff },
      });
      onPartsChanged(parts.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Anpassen des Bestands.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/workshop/parts/${id}`, { method: "DELETE" });
      onPartsChanged(parts.filter((p) => p.id !== id));
      setDeleteConfirmId(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Löschen des Teils.");
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
              placeholder="Teilenummer, OEM, Name, Hersteller..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300"
          >
            <option value="all">Alle Warengruppen</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              lowStockOnly
                ? "bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700"
                : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Nur Mindestbestand
          </button>
        </div>

        <button
          onClick={openNewModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs shadow-sm transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Teil anlegen
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Teile-Tabelle */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Teilenummer & Hersteller</th>
                <th className="py-3 px-4 font-semibold">Bezeichnung</th>
                <th className="py-3 px-4 font-semibold">Warengruppe</th>
                <th className="py-3 px-4 font-semibold">Lagerfach</th>
                <th className="py-3 px-4 font-semibold text-center">Bestand</th>
                <th className="py-3 px-4 font-semibold text-right">EK Netto</th>
                <th className="py-3 px-4 font-semibold text-right">VK Netto</th>
                <th className="py-3 px-4 font-semibold text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Keine Ersatzteile gefunden.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const isLow = p.stock <= p.minStock;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 block">
                          {p.partNumber}
                        </span>
                        <span className="text-[11px] text-slate-500">{p.manufacturer || "OEM"}</span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100 max-w-xs truncate">
                        {p.name}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{p.category}</td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {p.storageBin || "–"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleStockAdjust(p.id, -1)}
                            disabled={p.stock <= 0}
                            className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center disabled:opacity-30"
                          >
                            -
                          </button>
                          <span
                            className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                              isLow
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "text-slate-900 dark:text-slate-100"
                            }`}
                          >
                            {p.stock}
                          </span>
                          <button
                            onClick={() => handleStockAdjust(p.id, 1)}
                            className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                        {isLow && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                            Meldebestand: {p.minStock}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">{fmtEuro(p.purchasePriceNet)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {fmtEuro(p.salePriceNet)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded"
                            title="Bearbeiten"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {deleteConfirmId === p.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(p.id)}
                                className="px-1.5 py-0.5 bg-red-600 text-white rounded text-[10px] font-semibold"
                              >
                                Ja
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="text-slate-400 text-[10px]"
                              >
                                Nein
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(p.id)}
                              className="p-1 text-slate-300 hover:text-red-500 rounded"
                              title="Löschen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Teil anlegen / bearbeiten */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl shadow-xl max-w-xl w-full p-6 relative border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold">
                  {editingPart ? "Ersatzteil bearbeiten" : "Neues Ersatzteil anlegen"}
                </h2>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Field label="Teilenummer *">
                    <input
                      type="text"
                      required
                      placeholder="z. B. 04L 115 562"
                      value={form.partNumber}
                      onChange={(e) => setForm({ ...form, partNumber: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="OEM / Vergleichsnummer">
                    <input
                      type="text"
                      placeholder="Herstellernummer (optional)"
                      value={form.oemNumber}
                      onChange={(e) => setForm({ ...form, oemNumber: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-sm"
                    />
                  </Field>
                </div>

                <div className="sm:col-span-2">
                  <Field label="Artikelbezeichnung *">
                    <input
                      type="text"
                      required
                      placeholder="z. B. Ölfiltereinsatz VAG 2.0 TDI"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Hersteller / Marke">
                    <input
                      type="text"
                      placeholder="z. B. Mann-Filter, ATE, Bosch"
                      value={form.manufacturer}
                      onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Warengruppe">
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value as any })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div>
                  <Field label="Lagerplatz / Fach">
                    <input
                      type="text"
                      placeholder="z. B. Regal A-02"
                      value={form.storageBin}
                      onChange={(e) => setForm({ ...form, storageBin: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Aktueller Lagerbestand">
                    <input
                      type="number"
                      value={form.stock}
                      onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Einkaufspreis Netto (€)">
                    <input
                      type="number"
                      step="0.01"
                      value={form.purchasePriceNet}
                      onChange={(e) => setForm({ ...form, purchasePriceNet: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Verkaufspreis Netto (€)">
                    <input
                      type="number"
                      step="0.01"
                      value={form.salePriceNet}
                      onChange={(e) => setForm({ ...form, salePriceNet: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-sm"
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
                  {saving ? "Wird gespeichert..." : "Teil speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
