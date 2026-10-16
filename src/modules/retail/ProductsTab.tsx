import { useEffect, useState } from "react";
import { Plus, Search, AlertTriangle, Barcode, Pencil, Trash2, X, Check, ArrowUpDown, Filter, Sparkles, Tag, Layers, Printer } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { ProductCategory, ProductUnit, RetailProduct, RetailSupplier } from "../../../shared/retail";
import { calculateMarginPercent, generateInternalEan } from "../../../shared/retail";
import { useRetailI18n } from "./i18n";
import { LabelsPrint } from "./LabelsPrint";

export function ProductsTab({ isManager }: { isManager: boolean }) {
  const { r, euro } = useRetailI18n();
  const [products, setProducts] = useState<RetailProduct[]>([]);
  const [suppliers, setSuppliers] = useState<RetailSupplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [lowStockFilter, setLowStockFilter] = useState(false);

  // Modale Dialoge
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<RetailProduct | null>(null);

  // Schnellanpassung Bestand
  const [stockModalProduct, setStockModalProduct] = useState<RetailProduct | null>(null);
  const [stockDelta, setStockDelta] = useState<number>(0);
  const [stockReason, setStockReason] = useState<string>("correction");
  const [stockNote, setStockNote] = useState("");

  // Druckansicht
  const [printOpen, setPrintOpen] = useState(false);

  // Formular
  const [form, setForm] = useState({
    name: "",
    ean: "",
    brand: "",
    category: "sonstiges" as ProductCategory,
    supplierId: "",
    supplierArticleNo: "",
    purchasePriceEuro: "0.00",
    sellingPriceEuro: "0.00",
    vatRate: 19.0,
    stockQty: 0,
    minStockQty: 5,
    unit: "Stk" as ProductUnit,
    location: "",
  });

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const loadData = async () => {
    try {
      const [prodRes, supRes] = await Promise.all([
        api<{ products: RetailProduct[] }>(
          `/retail/products?q=${encodeURIComponent(search)}&category=${selectedCategory}&lowStock=${lowStockFilter}`
        ),
        api<{ suppliers: RetailSupplier[] }>("/retail/suppliers"),
      ]);
      setProducts(prodRes.products);
      setSuppliers(supRes.suppliers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(loadData, search ? 200 : 0);
    return () => clearTimeout(t);
  }, [search, selectedCategory, lowStockFilter]);

  const openNew = () => {
    setEditingProduct(null);
    setForm({
      name: "",
      ean: generateInternalEan("200", Date.now() % 100000),
      brand: "",
      category: selectedCategory !== "all" ? (selectedCategory as ProductCategory) : "sonstiges",
      supplierId: suppliers[0]?.id || "",
      supplierArticleNo: "",
      purchasePriceEuro: "5.00",
      sellingPriceEuro: "12.90",
      vatRate: 19.0,
      stockQty: 10,
      minStockQty: 5,
      unit: "Stk",
      location: "",
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const openEdit = (p: RetailProduct) => {
    setEditingProduct(p);
    setForm({
      name: p.name,
      ean: p.ean,
      brand: p.brand || "",
      category: p.category,
      supplierId: p.supplierId || "",
      supplierArticleNo: p.supplierArticleNo || "",
      purchasePriceEuro: (p.purchasePriceCents / 100).toFixed(2),
      sellingPriceEuro: (p.sellingPriceCents / 100).toFixed(2),
      vatRate: p.vatRate,
      stockQty: p.stockQty,
      minStockQty: p.minStockQty,
      unit: p.unit,
      location: p.location || "",
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const purchasePriceCents = Math.round(parseFloat(form.purchasePriceEuro.replace(",", ".")) * 100) || 0;
    const sellingPriceCents = Math.round(parseFloat(form.sellingPriceEuro.replace(",", ".")) * 100) || 0;
    const sup = suppliers.find((s) => s.id === form.supplierId);

    try {
      await api("/retail/products", {
        method: "POST",
        body: {
          ...(editingProduct ? { id: editingProduct.id } : {}),
          ...form,
          purchasePriceCents,
          sellingPriceCents,
          supplierName: sup?.name || "",
        },
      });
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim Speichern des Artikels");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/retail/products/${id}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim Löschen");
    }
  };

  const handleSaveStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockModalProduct || stockDelta === 0) return;

    try {
      await api(`/retail/products/${stockModalProduct.id}/stock`, {
        method: "POST",
        body: {
          deltaQty: stockDelta,
          reason: stockReason,
          note: stockNote,
        },
      });
      setStockModalProduct(null);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim Anpassen des Bestands");
    }
  };

  // Berechne Spanne / Marge live im Formular
  const formEkCents = Math.round(parseFloat(form.purchasePriceEuro.replace(",", ".")) * 100) || 0;
  const formVkCents = Math.round(parseFloat(form.sellingPriceEuro.replace(",", ".")) * 100) || 0;
  const liveMargin = calculateMarginPercent(formEkCents, formVkCents, form.vatRate);

  // Berechne Kennzahlen
  const totalStockValueCents = products.reduce((sum, p) => sum + p.stockQty * p.purchasePriceCents, 0);
  const lowStockCount = products.filter((p) => p.stockQty <= p.minStockQty).length;

  return (
    <div className="stack">
      {/* KPI Stats */}
      <div className="retail-stats">
        <div className="retail-stat-card">
          <span className="label">{r("stats.totalProducts")}</span>
          <span className="value" style={{ color: "var(--accent)" }}>{products.length}</span>
          <span className="small muted">Im aktiven Sortiment</span>
        </div>
        <div className="retail-stat-card">
          <span className="label">{r("stats.stockValue")}</span>
          <span className="value">{euro(totalStockValueCents)}</span>
          <span className="small muted">Gebundenes Einkaufskapital</span>
        </div>
        <div className="retail-stat-card">
          <span className="label">{r("stats.lowStock")}</span>
          <span className="value" style={{ color: lowStockCount > 0 ? "var(--danger)" : "var(--success)" }}>
            {lowStockCount}
          </span>
          <span className="small muted">Bestand ≤ Mindestmenge</span>
        </div>
      </div>

      {errorMsg && <div className="notice warning">{errorMsg}</div>}

      {/* Toolbar & Filter */}
      <div className="toolbar" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div className="row gap" style={{ flex: 1, minWidth: "280px", maxWidth: "520px" }}>
          <div className="retail-scanner-bar" style={{ width: "100%" }}>
            <Barcode size={20} style={{ color: "var(--accent)" }} />
            <input
              type="text"
              placeholder={r("actions.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="icon-button" onClick={() => setSearch("")} style={{ width: "24px", height: "24px" }}>
                ×
              </button>
            )}
          </div>
        </div>

        <div className="row gap push-end" style={{ flexWrap: "wrap" }}>
          <button
            className={`button ${lowStockFilter ? "primary" : ""}`}
            onClick={() => setLowStockFilter(!lowStockFilter)}
            title="Filter: Nur nachzubestellende Artikel"
          >
            <AlertTriangle size={16} /> Nachbestellen ({lowStockCount})
          </button>

          <button className="button" onClick={() => setPrintOpen(true)} title="Etiketten drucken">
            <Printer size={16} /> Etiketten
          </button>

          {isManager && (
            <button className="button primary" onClick={openNew}>
              <Plus size={18} /> {r("actions.newProduct")}
            </button>
          )}
        </div>
      </div>

      {/* Kategorien Chips */}
      <div className="chips" role="tablist">
        {[
          "all",
          "lebensmittel",
          "getraenke",
          "drogerie",
          "mode",
          "schreibwaren",
          "wohnen",
          "elektronik",
          "sonstiges",
        ].map((cat) => (
          <button
            key={cat}
            role="tab"
            aria-selected={selectedCategory === cat}
            className={selectedCategory === cat ? "chip active" : "chip"}
            onClick={() => setSelectedCategory(cat)}
          >
            {r(`categories.${cat}`)}
          </button>
        ))}
      </div>

      {/* Produktliste / Tabelle */}
      {loading ? (
        <p className="muted">Lade Sortiment...</p>
      ) : products.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <Barcode size={36} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
          <h3>Keine Artikel gefunden</h3>
          <p className="muted">Passen Sie Ihre Suche an oder legen Sie den ersten Artikel an.</p>
        </div>
      ) : (
        <div className="office-table-wrap">
          <table className="office-table">
            <thead>
              <tr>
                <th>Art.-Nr. / EAN</th>
                <th>Bezeichnung & Marke</th>
                <th>Kategorie</th>
                <th className="num">EK Netto</th>
                <th className="num">VK Brutto</th>
                <th className="num">Spanne</th>
                <th className="num">Lagerbestand</th>
                <th>Lagerort</th>
                <th className="num">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const margin = calculateMarginPercent(p.purchasePriceCents, p.sellingPriceCents, p.vatRate);
                const isLow = p.stockQty <= p.minStockQty;

                return (
                  <tr key={p.id}>
                    <td>
                      <span className="retail-ean-badge" title="EAN / Barcode">
                        <Barcode size={13} /> {p.ean}
                      </span>
                      <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginTop: "2px" }}>
                        #{p.number}
                      </div>
                    </td>
                    <td>
                      <strong>{p.name}</strong>
                      {p.brand && (
                        <span className="small muted" style={{ display: "block" }}>
                          Marke: {p.brand}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="pill">{r(`categories.${p.category}`)}</span>
                    </td>
                    <td className="num">{euro(p.purchasePriceCents)}</td>
                    <td className="num" style={{ fontWeight: 800, color: "var(--accent)" }}>
                      {euro(p.sellingPriceCents)}
                      <small className="muted" style={{ display: "block", fontSize: "0.72rem", fontWeight: 400 }}>
                        {p.vatRate}% MwSt.
                      </small>
                    </td>
                    <td className="num">
                      <strong style={{ color: margin >= 40 ? "var(--success)" : margin < 20 ? "var(--danger)" : "var(--ink)" }}>
                        {margin}%
                      </strong>
                    </td>
                    <td className="num">
                      <span
                        className={`stock-pill ${isLow ? "low" : "ok"}`}
                        onClick={() => {
                          setStockModalProduct(p);
                          setStockDelta(0);
                          setStockReason("correction");
                          setStockNote("");
                        }}
                        style={{ cursor: "pointer" }}
                        title="Klicken für schnelle Bestandskorrektur"
                      >
                        {isLow && <AlertTriangle size={12} />}
                        {p.stockQty} {p.unit}
                      </span>
                      <small className="muted" style={{ display: "block", fontSize: "0.72rem" }}>
                        Min: {p.minStockQty}
                      </small>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.85rem", color: p.location ? "var(--ink)" : "var(--muted)" }}>
                        {p.location || "–"}
                      </span>
                    </td>
                    <td className="num">
                      <div className="row gap" style={{ justifyContent: "flex-end", flexWrap: "wrap", minWidth: "150px" }}>
                        <button
                          className="button small"
                          onClick={() => {
                            setStockModalProduct(p);
                            setStockDelta(0);
                            setStockReason("correction");
                            setStockNote("");
                          }}
                          title="Bestand anpassen"
                        >
                          <ArrowUpDown size={14} /> ±
                        </button>

                        <button className="button small" onClick={() => openEdit(p)} title={r("actions.edit")}>
                          <Pencil size={14} />
                        </button>

                        {isManager && (
                          deleteConfirmId === p.id ? (
                            <div className="row gap" style={{ alignItems: "center" }}>
                              <button
                                className="button danger small"
                                onClick={() => handleDelete(p.id)}
                                title="Unwiderruflich deaktivieren"
                              >
                                Löschen
                              </button>
                              <button className="button small" onClick={() => setDeleteConfirmId(null)}>
                                Abbr.
                              </button>
                            </div>
                          ) : (
                            <button
                              className="button small danger"
                              onClick={() => setDeleteConfirmId(p.id)}
                              title={r("actions.delete")}
                            >
                              <Trash2 size={14} />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Artikel anlegen / bearbeiten */}
      {modalOpen && (
        <div className="retail-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="retail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="retail-modal-head">
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <Tag size={20} style={{ color: "var(--accent)" }} />
                {editingProduct ? "Artikel bearbeiten" : r("actions.newProduct")}
              </h3>
              <button className="icon-button" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="stack">
              <Field label="Artikelbezeichnung" required>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="z.B. Bio-Olivenöl Extra Vergine 500ml"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>

              <div className="row-grid">
                <Field label="Marke / Hersteller">
                  <input
                    type="text"
                    className="input"
                    placeholder="z.B. Terre Di Olio"
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  />
                </Field>
                <Field label="Kategorie" required>
                  <select
                    className="input"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as ProductCategory })}
                  >
                    <option value="lebensmittel">{r("categories.lebensmittel")}</option>
                    <option value="getraenke">{r("categories.getraenke")}</option>
                    <option value="drogerie">{r("categories.drogerie")}</option>
                    <option value="mode">{r("categories.mode")}</option>
                    <option value="schreibwaren">{r("categories.schreibwaren")}</option>
                    <option value="wohnen">{r("categories.wohnen")}</option>
                    <option value="elektronik">{r("categories.elektronik")}</option>
                    <option value="sonstiges">{r("categories.sonstiges")}</option>
                  </select>
                </Field>
              </div>

              <div className="row-grid">
                <Field label="EAN / Barcode (13-stellig)" hint="Für Barcode-Scanner">
                  <div className="row gap">
                    <input
                      type="text"
                      className="input"
                      placeholder="z.B. 4012345678901"
                      value={form.ean}
                      onChange={(e) => setForm({ ...form, ean: e.target.value })}
                    />
                    <button
                      type="button"
                      className="button"
                      onClick={() => setForm({ ...form, ean: generateInternalEan("200", Date.now() % 100000) })}
                      title="Interne 200-EAN mit Prüfziffer generieren"
                    >
                      <Sparkles size={16} /> Neu
                    </button>
                  </div>
                </Field>
                <Field label="Verkaufseinheit">
                  <select
                    className="input"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value as ProductUnit })}
                  >
                    <option value="Stk">Stück (Stk)</option>
                    <option value="kg">Kilogramm (kg)</option>
                    <option value="g">Gramm (g)</option>
                    <option value="l">Liter (l)</option>
                    <option value="ml">Milliliter (ml)</option>
                    <option value="Pck">Packung (Pck)</option>
                    <option value="Set">Set</option>
                  </select>
                </Field>
              </div>

              {/* Preiskalkulation & Marge */}
              <div className="card" style={{ padding: "14px", background: "var(--panel-2)", border: "1px solid var(--line)", display: "grid", gap: "10px" }}>
                <strong style={{ fontSize: "0.92rem" }}>Preiskalkulation & Margenberechnung</strong>
                <div className="row-grid">
                  <Field label="Einkaufspreis Netto (€)">
                    <input
                      type="text"
                      className="input"
                      value={form.purchasePriceEuro}
                      onChange={(e) => setForm({ ...form, purchasePriceEuro: e.target.value })}
                    />
                  </Field>
                  <Field label="Verkaufspreis Brutto (€)" required>
                    <input
                      type="text"
                      required
                      className="input"
                      value={form.sellingPriceEuro}
                      onChange={(e) => setForm({ ...form, sellingPriceEuro: e.target.value })}
                    />
                  </Field>
                  <Field label="MwSt.-Satz">
                    <select
                      className="input"
                      value={form.vatRate}
                      onChange={(e) => setForm({ ...form, vatRate: parseFloat(e.target.value) })}
                    >
                      <option value="19">19% (Regelsatz)</option>
                      <option value="7">7% (Ermäßigt - Lebensmittel/Bücher)</option>
                      <option value="0">0% (Steuerfrei)</option>
                    </select>
                  </Field>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: "8px", fontSize: "0.88rem" }}>
                  <span>Kalkulierte Handelsspanne:</span>
                  <strong style={{ fontSize: "1.1rem", color: liveMargin >= 40 ? "var(--success)" : liveMargin < 20 ? "var(--danger)" : "var(--accent)" }}>
                    {liveMargin}% Rohertrag
                  </strong>
                </div>
              </div>

              {/* Bestandsführung & Lagerplatz */}
              <div className="row-grid">
                <Field label="Ist-Bestand">
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={form.stockQty}
                    onChange={(e) => setForm({ ...form, stockQty: parseInt(e.target.value, 10) || 0 })}
                  />
                </Field>
                <Field label="Mindestbestand (Meldebestand)">
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={form.minStockQty}
                    onChange={(e) => setForm({ ...form, minStockQty: parseInt(e.target.value, 10) || 0 })}
                  />
                </Field>
                <Field label="Regalplatz / Lagerort">
                  <input
                    type="text"
                    className="input"
                    placeholder="z.B. A-02-3"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </Field>
              </div>

              {/* Lieferantenzuordnung */}
              <div className="row-grid">
                <Field label="Hauptlieferant">
                  <select
                    className="input"
                    value={form.supplierId}
                    onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                  >
                    <option value="">Kein Lieferant zugeordnet</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Lieferanten-Art.-Nr.">
                  <input
                    type="text"
                    className="input"
                    placeholder="z.B. REF-8819"
                    value={form.supplierArticleNo}
                    onChange={(e) => setForm({ ...form, supplierArticleNo: e.target.value })}
                  />
                </Field>
              </div>

              <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "12px" }}>
                <button type="button" className="button" onClick={() => setModalOpen(false)}>
                  {r("actions.cancel")}
                </button>
                <button type="submit" className="button primary">
                  {r("actions.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Schnelle Bestandskorrektur */}
      {stockModalProduct && (
        <div className="retail-modal-overlay" onClick={() => setStockModalProduct(null)}>
          <div className="retail-modal" style={{ maxWidth: "460px" }} onClick={(e) => e.stopPropagation()}>
            <div className="retail-modal-head">
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <ArrowUpDown size={18} style={{ color: "var(--accent)" }} />
                Bestand anpassen
              </h3>
              <button className="icon-button" onClick={() => setStockModalProduct(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveStockAdjustment} className="stack">
              <div>
                <strong>{stockModalProduct.name}</strong>
                <div className="small muted">
                  Aktueller Bestand: <strong>{stockModalProduct.stockQty} {stockModalProduct.unit}</strong>
                </div>
              </div>

              <Field label="Bestandsänderung (+Zugang oder -Abgang)" required>
                <div className="row gap">
                  <button
                    type="button"
                    className="button"
                    onClick={() => setStockDelta((d) => d - 1)}
                  >
                    -1
                  </button>
                  <input
                    type="number"
                    required
                    className="input"
                    style={{ textAlign: "center", fontSize: "1.2rem", fontWeight: 800 }}
                    value={stockDelta}
                    onChange={(e) => setStockDelta(parseInt(e.target.value, 10) || 0)}
                  />
                  <button
                    type="button"
                    className="button"
                    onClick={() => setStockDelta((d) => d + 1)}
                  >
                    +1
                  </button>
                </div>
              </Field>

              <div style={{ textAlign: "center", fontSize: "0.95rem" }}>
                Neuer Bestand: <strong>{Math.max(0, stockModalProduct.stockQty + stockDelta)} {stockModalProduct.unit}</strong>
              </div>

              <Field label="Grund der Buchung">
                <select
                  className="input"
                  value={stockReason}
                  onChange={(e) => setStockReason(e.target.value)}
                >
                  <option value="correction">Manuelle Inventur / Zählung</option>
                  <option value="loss">Bruch / Verderb / Schwund</option>
                  <option value="purchase">Wareneingang ohne Bestellung</option>
                  <option value="return">Kundenrückgabe</option>
                </select>
              </Field>

              <Field label="Bemerkung">
                <input
                  type="text"
                  className="input"
                  placeholder="z.B. Flasche beim Einräumen zerbrochen"
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                />
              </Field>

              <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "8px" }}>
                <button type="button" className="button" onClick={() => setStockModalProduct(null)}>
                  {r("actions.cancel")}
                </button>
                <button type="submit" className="button primary">
                  Buchung durchführen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Druckansicht für Artikeletiketten */}
      {printOpen && (
        <LabelsPrint
          products={products}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  );
}
