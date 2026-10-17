import { useState } from "react";
import { Search, Plus, AlertTriangle, Layers, Wrench, Pencil, Trash2, X, Check, ArrowUpDown } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { SparePart } from "../../../shared/workshop";
import { currency as companyCurrency, currencySymbol, standardVat } from "../../money";

interface PartsTabProps {
  isManager: boolean;
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

export function PartsTab({ parts, onPartsChanged, isManager }: PartsTabProps) {
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
    taxRate: standardVat(),
    storageBin: "",
  });

  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: companyCurrency() }).format(amount);

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
      taxRate: standardVat(),
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
          taxRate: standardVat(),
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
    <div className="stack">
      {/* Filter- & Aktionsleiste */}
      <div className="workshop-toolbar">
        <label className="search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Teilenummer, OEM, Name, Hersteller..."
            aria-label="Teilenummer, OEM, Name, Hersteller..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="workshop-select" aria-label="Warengruppe">
          <option value="all">Alle Warengruppen</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="row gap workshop-toolbar-end">
          <button type="button" onClick={() => setLowStockOnly(!lowStockOnly)} className={lowStockOnly ? "chip active" : "chip"}>
            <AlertTriangle size={15} />
            Nur Mindestbestand
          </button>
          {isManager && (
            <button onClick={openNewModal} className="button primary">
              <Plus size={18} />
              Teil anlegen
            </button>
          )}
        </div>
      </div>

      {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

      {/* Teileliste */}
      <section className="card list-card">
        {filtered.length === 0 ? (
          <p className="empty muted">Keine Ersatzteile gefunden.</p>
        ) : (
          filtered.map((p) => {
            const isLow = p.stock <= p.minStock;
            return (
              <div key={p.id} className="list-row workshop-part-row">
                <span className="list-main">
                  <strong>{p.name}</strong>
                  <small className="muted">
                    <span className="workshop-mono">{p.partNumber}</span> · {p.manufacturer || "OEM"} · {p.category} · <span className="workshop-mono">{p.storageBin || "–"}</span>
                  </small>
                </span>

                <span className="workshop-stock">
                  <span className="workshop-stepper">
                    <button onClick={() => handleStockAdjust(p.id, -1)} disabled={p.stock <= 0} aria-label="Bestand verringern">
                      -
                    </button>
                    <strong className={isLow ? "pill warn workshop-num" : "workshop-num"}>{p.stock}</strong>
                    <button onClick={() => handleStockAdjust(p.id, 1)} aria-label="Bestand erhöhen">
                      +
                    </button>
                  </span>
                  {isLow && <small className="muted">Meldebestand: {p.minStock}</small>}
                </span>

                <span className="workshop-row-meta">
                  <strong className="workshop-num">{fmtEuro(p.salePriceNet)}</strong>
                  <small className="muted workshop-num">EK {fmtEuro(p.purchasePriceNet)}</small>
                </span>

                <span className="row workshop-row-actions">
                  {isManager && (
                    <button onClick={() => openEditModal(p)} className="icon-button" title="Bearbeiten" aria-label="Bearbeiten">
                      <Pencil size={17} />
                    </button>
                  )}
                  {!isManager ? null : deleteConfirmId === p.id ? (
                    <>
                      <button onClick={() => handleDelete(p.id)} className="button danger small-button">
                        Ja
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)} className="text-button">
                        Nein
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(p.id)} className="icon-button danger" title="Löschen" aria-label="Löschen">
                      <Trash2 size={17} />
                    </button>
                  )}
                </span>
              </div>
            );
          })
        )}
      </section>

      {/* Dialog: Teil anlegen / bearbeiten */}
      {modalOpen && (
        <Dialog title={editingPart ? "Ersatzteil bearbeiten" : "Neues Ersatzteil anlegen"} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="stack workshop-dialog">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}
            <div className="grid form-grid">
              <Field label="Teilenummer *">
                <input
                  type="text"
                  required
                  placeholder="z. B. 04L 115 562"
                  value={form.partNumber}
                  onChange={(e) => setForm({ ...form, partNumber: e.target.value })}
                  className="workshop-mono"
                />
              </Field>
              <Field label="OEM / Vergleichsnummer">
                <input
                  type="text"
                  placeholder="Herstellernummer (optional)"
                  value={form.oemNumber}
                  onChange={(e) => setForm({ ...form, oemNumber: e.target.value })}
                  className="workshop-mono"
                />
              </Field>
              <Field label="Artikelbezeichnung *" wide>
                <input type="text" required placeholder="z. B. Ölfiltereinsatz VAG 2.0 TDI" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Hersteller / Marke">
                <input type="text" placeholder="z. B. Mann-Filter, ATE, Bosch" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
              </Field>
              <Field label="Warengruppe">
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as any })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Lagerplatz / Fach">
                <input type="text" placeholder="z. B. Regal A-02" value={form.storageBin} onChange={(e) => setForm({ ...form, storageBin: e.target.value })} />
              </Field>
              <Field label="Aktueller Lagerbestand">
                <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} className="workshop-mono" />
              </Field>
              <Field label={`Einkaufspreis Netto (${currencySymbol("de-DE")})`}>
                <input
                  type="number"
                  step="0.01"
                  value={form.purchasePriceNet}
                  onChange={(e) => setForm({ ...form, purchasePriceNet: Number(e.target.value) })}
                  className="workshop-mono"
                />
              </Field>
              <Field label={`Verkaufspreis Netto (${currencySymbol("de-DE")})`}>
                <input
                  type="number"
                  step="0.01"
                  value={form.salePriceNet}
                  onChange={(e) => setForm({ ...form, salePriceNet: Number(e.target.value) })}
                  className="workshop-mono"
                />
              </Field>
            </div>

            <div className="row gap workshop-dialog-actions">
              <button type="button" onClick={() => setModalOpen(false)} className="button">
                Abbrechen
              </button>
              <button type="submit" disabled={saving} className="button primary">
                <Check size={18} />
                {saving ? "Wird gespeichert..." : "Teil speichern"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
