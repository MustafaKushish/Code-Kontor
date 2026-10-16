import { useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Flame,
  Coffee,
  Star,
  Tag,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type {
  MenuItem,
  PrintDestination,
} from "../../../shared/restaurant";

interface MenuTabProps {
  menu: MenuItem[];
  onRefresh: () => void;
}

export function MenuTab({ menu, onRefresh }: MenuTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem>>({
    category: "Hauptspeisen",
    taxRate: 19,
    destination: "kueche",
    active: true,
    isFavorite: false,
    allergens: [],
  });
  const [isBusy, setIsBusy] = useState(false);

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  const categories = [
    "alle",
    "Vorspeisen",
    "Hauptspeisen",
    "Pizza & Pasta",
    "Desserts",
    "Heißgetränke",
    "Alkoholfrei",
    "Bier & Wein",
    "Cocktails",
  ];

  const filteredMenu = menu.filter((item) => {
    const matchesCat = selectedCategory === "alle" || item.category === selectedCategory;
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.itemNumber.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleOpenAdd = () => {
    setEditingItem({
      itemNumber: `ART-${Math.floor(100 + Math.random() * 900)}`,
      name: "",
      category: selectedCategory === "alle" ? "Hauptspeisen" : (selectedCategory as any),
      priceGross: 9.5,
      taxRate: 19,
      destination: "kueche",
      active: true,
      isFavorite: false,
      allergens: [],
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: MenuItem) => {
    setEditingItem({ ...item });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem.name || !editingItem.itemNumber || typeof editingItem.priceGross !== "number") {
      return;
    }
    setIsBusy(true);
    try {
      await api("/restaurant/menu", {
        method: "POST",
        body: JSON.stringify(editingItem),
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
    if (!confirm("Möchtest du diesen Artikel wirklich aus der Speisekarte löschen?")) return;
    setIsBusy(true);
    try {
      await api(`/restaurant/menu/${id}`, { method: "DELETE" });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleFavorite = async (item: MenuItem) => {
    setIsBusy(true);
    try {
      await api("/restaurant/menu", {
        method: "POST",
        body: JSON.stringify({ ...item, isFavorite: !item.isFavorite }),
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {cat === "alle" ? "Alle Kategorien" : cat}
            </button>
          ))}
        </div>

        {/* Search & Add button */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Artikel suchen..."
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
            Artikel anlegen
          </button>
        </div>
      </div>

      {/* Menu Items Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 border-b border-slate-200 dark:border-slate-800 uppercase font-mono tracking-wider">
              <tr>
                <th className="py-3 px-4">Art.-Nr.</th>
                <th className="py-3 px-4">Bezeichnung & Kategorie</th>
                <th className="py-3 px-4">Druckziel</th>
                <th className="py-3 px-4">MwSt.-Satz</th>
                <th className="py-3 px-4 text-right">Bruttopreis</th>
                <th className="py-3 px-4 text-center">Schnellwahl</th>
                <th className="py-3 px-4 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMenu.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-4 font-mono text-slate-500 font-bold">
                    {item.itemNumber}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900 dark:text-white text-sm">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>{item.category}</span>
                      {item.allergens && item.allergens.length > 0 && (
                        <span>· Allergene: {item.allergens.join(", ")}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        item.destination === "bar"
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                      }`}
                    >
                      {item.destination === "bar" ? (
                        <>
                          <Coffee className="w-3 h-3" />
                          Bar / Theke
                        </>
                      ) : (
                        <>
                          <Flame className="w-3 h-3" />
                          Küche
                        </>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono">
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300">
                      {item.taxRate}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white text-sm">
                    {fmtEuro(item.priceGross)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleToggleFavorite(item)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        item.isFavorite
                          ? "text-amber-500 hover:text-amber-600"
                          : "text-slate-300 hover:text-slate-500"
                      }`}
                      title={item.isFavorite ? "Aus Schnellwahl entfernen" : "Zur Schnellwahl hinzufügen"}
                    >
                      <Star className={`w-4 h-4 ${item.isFavorite ? "fill-amber-500" : ""}`} />
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right space-x-1">
                    <button
                      onClick={() => handleOpenEdit(item)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add / Edit Dish */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {editingItem.id ? "Artikel bearbeiten" : "Neues Gericht / Getränk anlegen"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Artikel-Nummer" required>
                  <input
                    type="text"
                    required
                    value={editingItem.itemNumber || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, itemNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                  />
                </Field>
                <Field label="Kategorie" required>
                  <select
                    value={editingItem.category || "Hauptspeisen"}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    {categories.filter((c) => c !== "alle").map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Bezeichnung" required>
                <input
                  type="text"
                  required
                  placeholder="z.B. Wiener Schnitzel vom Kalb"
                  value={editingItem.name || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </Field>

              <Field label="Beschreibung / Beilage">
                <input
                  type="text"
                  placeholder="z.B. mit lauwarmem Kartoffel-Gurken-Salat & Preiselbeeren"
                  value={editingItem.description || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Bruttopreis (€)" required>
                  <input
                    type="number"
                    step="0.10"
                    min="0"
                    required
                    value={editingItem.priceGross || ""}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, priceGross: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold"
                  />
                </Field>

                <Field label="MwSt.-Satz">
                  <select
                    value={editingItem.taxRate || 19}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, taxRate: parseInt(e.target.value) || 19 })
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                  >
                    <option value="19">19% (Standard / In-Haus)</option>
                    <option value="7">7% (Ermäßigt / To-Go)</option>
                  </select>
                </Field>

                <Field label="Druckziel">
                  <select
                    value={editingItem.destination || "kueche"}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, destination: e.target.value as PrintDestination })
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="kueche">Küche</option>
                    <option value="bar">Bar / Theke</option>
                  </select>
                </Field>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingItem.isFavorite || false}
                    onChange={(e) => setEditingItem({ ...editingItem, isFavorite: e.target.checked })}
                    className="rounded text-amber-600 focus:ring-0"
                  />
                  <span>Schnellwahl / Bestseller</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingItem.active !== false}
                    onChange={(e) => setEditingItem({ ...editingItem, active: e.target.checked })}
                    className="rounded text-amber-600 focus:ring-0"
                  />
                  <span>Aktiv auf Karte</span>
                </label>
              </div>

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
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
