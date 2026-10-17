import { useState } from "react";
import { Search, Plus, AlertTriangle, Layers, Wrench, Pencil, Trash2, X, Check, ArrowUpDown } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { SparePart } from "../../../shared/workshop";
import { formatRate, standardVat, vatChoices } from "../../money";
import { useWorkshopI18n } from "./i18n";

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
  const { t, lang, workshopError, euro: fmtEuro, symbol, category } = useWorkshopI18n();
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
      storageBin: t("parts.defaultBin"),
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
      setErrorMsg(t("parts.required"));
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
          taxRate: Number(form.taxRate),
          storageBin: form.storageBin.trim(),
        },
      });

      if (editingPart) {
        onPartsChanged(parts.map((p) => (p.id === saved.id ? saved : p)));
      } else {
        onPartsChanged([...parts, saved]);
      }
      setModalOpen(false);
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, t("parts.saveError")));
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
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, t("parts.stockError")));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/workshop/parts/${id}`, { method: "DELETE" });
      onPartsChanged(parts.filter((p) => p.id !== id));
      setDeleteConfirmId(null);
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, t("parts.deleteError")));
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
            placeholder={t("parts.searchPlaceholder")}
            aria-label={t("parts.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="workshop-select" aria-label={t("parts.categoryFilter")}>
          <option value="all">{t("parts.allCategories")}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {category(c)}
            </option>
          ))}
        </select>

        <div className="row gap workshop-toolbar-end">
          <button type="button" onClick={() => setLowStockOnly(!lowStockOnly)} className={lowStockOnly ? "chip active" : "chip"}>
            <AlertTriangle size={15} />
            {t("parts.lowStockOnly")}
          </button>
          {isManager && (
            <button onClick={openNewModal} className="button primary">
              <Plus size={18} />
              {t("parts.add")}
            </button>
          )}
        </div>
      </div>

      {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

      {/* Teileliste */}
      <section className="card list-card">
        {filtered.length === 0 ? (
          <p className="empty muted">{t("parts.empty")}</p>
        ) : (
          filtered.map((p) => {
            const isLow = p.stock <= p.minStock;
            return (
              <div key={p.id} className="list-row workshop-part-row">
                <span className="list-main">
                  <strong>{p.name}</strong>
                  <small className="muted">
                    <span className="workshop-mono">{p.partNumber}</span> · {p.manufacturer || "OEM"} · {category(p.category)} · <span className="workshop-mono">{p.storageBin || "–"}</span>
                  </small>
                </span>

                <span className="workshop-stock">
                  <span className="workshop-stepper">
                    <button onClick={() => handleStockAdjust(p.id, -1)} disabled={p.stock <= 0} aria-label={t("parts.decrease")}>
                      -
                    </button>
                    <strong className={isLow ? "pill warn workshop-num" : "workshop-num"}>{p.stock}</strong>
                    <button onClick={() => handleStockAdjust(p.id, 1)} aria-label={t("parts.increase")}>
                      +
                    </button>
                  </span>
                  {isLow && <small className="muted">{t("parts.minStock", { n: p.minStock })}</small>}
                </span>

                <span className="workshop-row-meta">
                  <strong className="workshop-num">{fmtEuro(p.salePriceNet)}</strong>
                  <small className="muted workshop-num">{t("parts.purchase", { price: fmtEuro(p.purchasePriceNet) })}</small>
                </span>

                <span className="row workshop-row-actions">
                  {isManager && (
                    <button onClick={() => openEditModal(p)} className="icon-button" title={t("common.edit")} aria-label={t("common.edit")}>
                      <Pencil size={17} />
                    </button>
                  )}
                  {!isManager ? null : deleteConfirmId === p.id ? (
                    <>
                      <button onClick={() => handleDelete(p.id)} className="button danger small-button">
                        {t("common.yes")}
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)} className="text-button">
                        {t("common.no")}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(p.id)} className="icon-button danger" title={t("common.delete")} aria-label={t("common.delete")}>
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
        <Dialog title={editingPart ? t("parts.editTitle") : t("parts.newTitle")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="stack workshop-dialog">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}
            <div className="grid form-grid">
              <Field label={t("parts.partNumber")}>
                <input
                  type="text"
                  required
                  placeholder={t("parts.partNumberPlaceholder")}
                  value={form.partNumber}
                  onChange={(e) => setForm({ ...form, partNumber: e.target.value })}
                  className="workshop-mono"
                />
              </Field>
              <Field label={t("parts.oem")}>
                <input
                  type="text"
                  placeholder={t("parts.oemPlaceholder")}
                  value={form.oemNumber}
                  onChange={(e) => setForm({ ...form, oemNumber: e.target.value })}
                  className="workshop-mono"
                />
              </Field>
              <Field label={t("parts.name")} wide>
                <input type="text" required placeholder={t("parts.namePlaceholder")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label={t("common.brand")}>
                <input type="text" placeholder={t("parts.manufacturerPlaceholder")} value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
              </Field>
              <Field label={t("parts.category")}>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as any })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {category(c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("parts.bin")}>
                <input type="text" placeholder={t("parts.binPlaceholder")} value={form.storageBin} onChange={(e) => setForm({ ...form, storageBin: e.target.value })} />
              </Field>
              <Field label={t("parts.stock")}>
                <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} className="workshop-mono" />
              </Field>
              <Field label={t("parts.purchasePrice", { symbol: symbol() })}>
                <input
                  type="number"
                  step="0.01"
                  value={form.purchasePriceNet}
                  onChange={(e) => setForm({ ...form, purchasePriceNet: Number(e.target.value) })}
                  className="workshop-mono"
                />
              </Field>
              <Field label={t("parts.salePrice", { symbol: symbol() })}>
                <input
                  type="number"
                  step="0.01"
                  value={form.salePriceNet}
                  onChange={(e) => setForm({ ...form, salePriceNet: Number(e.target.value) })}
                  className="workshop-mono"
                />
              </Field>
              <Field label={t("parts.vatRate")}>
                <select value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}>
                  {vatChoices(form.taxRate).map((v) => <option key={v} value={v}>{formatRate(v, lang)}</option>)}
                </select>
              </Field>
            </div>

            <div className="row gap workshop-dialog-actions">
              <button type="button" onClick={() => setModalOpen(false)} className="button">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={saving} className="button primary">
                <Check size={18} />
                {saving ? t("common.saving") : t("parts.save")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
