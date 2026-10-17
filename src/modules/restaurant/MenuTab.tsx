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
import { Dialog } from "../../pos/ui";
import type {
  MenuItem,
  PrintDestination,
} from "../../../shared/restaurant";
import { currency as companyCurrency, currencySymbol } from "../../money";

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
    new Intl.NumberFormat("de-DE", { style: "currency", currency: companyCurrency() }).format(amount);

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
        body: editingItem,
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
        body: { ...item, isFavorite: !item.isFavorite },
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="restaurant-bar">
        <label className="search restaurant-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Artikel suchen..."
            aria-label="Artikel suchen"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button onClick={handleOpenAdd} className="button primary">
          <Plus size={18} />
          Artikel anlegen
        </button>
      </div>

      <div className="chips wrap" role="tablist">
        {categories.map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
            className={selectedCategory === cat ? "chip active" : "chip"}
          >
            {cat === "alle" ? "Alle Kategorien" : cat}
          </button>
        ))}
      </div>

      <section className="card list-card">
        {filteredMenu.map((item) => (
          <div key={item.id} className="list-row restaurant-menu-row">
            <span className="restaurant-code restaurant-menu-number">{item.itemNumber}</span>
            <span className="list-main">
              <strong>{item.name}</strong>
              <small className="muted">
                {item.category}
                {item.allergens && item.allergens.length > 0 && <> · Allergene: {item.allergens.join(", ")}</>}
              </small>
            </span>
            <span className="restaurant-menu-meta">
              <span className={`pill ${item.destination === "bar" ? "restaurant-pill-info" : "warn"}`}>
                {item.destination === "bar" ? (
                  <>
                    <Coffee size={13} aria-hidden />
                    Bar / Theke
                  </>
                ) : (
                  <>
                    <Flame size={13} aria-hidden />
                    Küche
                  </>
                )}
              </span>
              <span className="pill">{item.taxRate}%</span>
              <strong className="restaurant-amount">{fmtEuro(item.priceGross)}</strong>
            </span>
            <span className="restaurant-menu-actions">
              <button
                onClick={() => handleToggleFavorite(item)}
                className={`icon-button restaurant-star ${item.isFavorite ? "on" : ""}`}
                title={item.isFavorite ? "Aus Schnellwahl entfernen" : "Zur Schnellwahl hinzufügen"}
                aria-label={item.isFavorite ? "Aus Schnellwahl entfernen" : "Zur Schnellwahl hinzufügen"}
                aria-pressed={!!item.isFavorite}
              >
                <Star size={18} />
              </button>
              <button onClick={() => handleOpenEdit(item)} className="icon-button" aria-label="Bearbeiten" title="Bearbeiten">
                <Pencil size={18} />
              </button>
              <button onClick={() => handleDelete(item.id)} className="icon-button danger" aria-label="Löschen" title="Löschen">
                <Trash2 size={18} />
              </button>
            </span>
          </div>
        ))}
      </section>

      {isModalOpen && (
        <Dialog title={editingItem.id ? "Artikel bearbeiten" : "Neues Gericht / Getränk anlegen"} onClose={() => setIsModalOpen(false)} wide>
          <form onSubmit={handleSave} className="restaurant-dialog stack">
            <div className="grid form-grid">
              <Field label="Artikel-Nummer" required>
                <input
                  type="text"
                  required
                  value={editingItem.itemNumber || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, itemNumber: e.target.value })}
                />
              </Field>
              <Field label="Kategorie" required>
                <select
                  value={editingItem.category || "Hauptspeisen"}
                  onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value as any })}
                >
                  {categories.filter((c) => c !== "alle").map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Bezeichnung" required wide>
                <input
                  type="text"
                  required
                  placeholder="z.B. Wiener Schnitzel vom Kalb"
                  value={editingItem.name || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                />
              </Field>

              <Field label="Beschreibung / Beilage" wide>
                <input
                  type="text"
                  placeholder="z.B. mit lauwarmem Kartoffel-Gurken-Salat & Preiselbeeren"
                  value={editingItem.description || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid restaurant-three">
              <Field label={`Bruttopreis (${currencySymbol("de-DE")})`} required>
                <input
                  type="number"
                  step="0.10"
                  min="0"
                  required
                  value={editingItem.priceGross || ""}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, priceGross: parseFloat(e.target.value) || 0 })
                  }
                />
              </Field>

              <Field label="MwSt.-Satz">
                <select
                  value={editingItem.taxRate || 19}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, taxRate: parseInt(e.target.value) || 19 })
                  }
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
                >
                  <option value="kueche">Küche</option>
                  <option value="bar">Bar / Theke</option>
                </select>
              </Field>
            </div>

            <div className="row wrap gap">
              <label className="check">
                <input
                  type="checkbox"
                  checked={editingItem.isFavorite || false}
                  onChange={(e) => setEditingItem({ ...editingItem, isFavorite: e.target.checked })}
                />
                <span>Schnellwahl / Bestseller</span>
              </label>

              <label className="check">
                <input
                  type="checkbox"
                  checked={editingItem.active !== false}
                  onChange={(e) => setEditingItem({ ...editingItem, active: e.target.checked })}
                />
                <span>Aktiv auf Karte</span>
              </label>
            </div>

            <div className="row gap restaurant-form-actions">
              <button type="button" onClick={() => setIsModalOpen(false)} className="button">
                Abbrechen
              </button>
              <button type="submit" disabled={isBusy} className="button primary">
                Speichern
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
