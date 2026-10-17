import { useEffect, useState } from "react";
import { Plus, AlertTriangle, Barcode, Pencil, Trash2, ArrowUpDown, Sparkles, Tag, Layers, Printer } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { ProductCategory, ProductUnit, RetailProduct, RetailSupplier } from "../../../shared/retail";
import { calculateMarginPercent, generateInternalEan } from "../../../shared/retail";
import { useRetailI18n } from "./i18n";
import { LabelsPrint } from "./LabelsPrint";
import { Dialog } from "../../pos/ui";
import { currencySymbol, standardVat, vatChoices } from "../../money";

export function ProductsTab({ isManager }: { isManager: boolean }) {
  const { r, euro, unit, lang, retailError } = useRetailI18n();
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
    vatRate: standardVat(),
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
      vatRate: standardVat(),
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
      setErrorMsg(retailError(err, r("products.errors.save")));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/retail/products/${id}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      await loadData();
    } catch (err: any) {
      setErrorMsg(retailError(err, r("products.errors.delete")));
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
      setErrorMsg(retailError(err, r("products.errors.stock")));
    }
  };

  // Berechne Spanne / Marge live im Formular
  const formEkCents = Math.round(parseFloat(form.purchasePriceEuro.replace(",", ".")) * 100) || 0;
  const formVkCents = Math.round(parseFloat(form.sellingPriceEuro.replace(",", ".")) * 100) || 0;
  const liveMargin = calculateMarginPercent(formEkCents, formVkCents, form.vatRate);

  // Berechne Kennzahlen
  const totalStockValueCents = products.reduce((sum, p) => sum + p.stockQty * p.purchasePriceCents, 0);
  const lowStockCount = products.filter((p) => p.stockQty <= p.minStockQty).length;

  const openStock = (p: RetailProduct) => {
    setStockModalProduct(p);
    setStockDelta(0);
    setStockReason("correction");
    setStockNote("");
  };
  const marginClass = (m: number) => (m >= 40 ? "success-text" : m < 20 ? "error-text" : "");

  return (
    <div className="stack">
      {/* Kennzahlen */}
      <div className="retail-stats">
        <div className="tile stat-tile">
          <span className="stat-icon"><Layers size={18} /></span>
          <strong>{products.length}</strong>
          <small>{r("stats.totalProducts")}</small>
          <small>{r("stats.totalProductsHint")}</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Tag size={18} /></span>
          <strong>{euro(totalStockValueCents)}</strong>
          <small>{r("stats.stockValue")}</small>
          <small>{r("stats.stockValueHint")}</small>
        </div>
        <div className="tile stat-tile">
          <span className={lowStockCount > 0 ? "stat-icon warn" : "stat-icon"}><AlertTriangle size={18} /></span>
          <strong>{lowStockCount}</strong>
          <small>{r("stats.lowStock")}</small>
          <small>{r("stats.lowStockHint")}</small>
        </div>
      </div>

      {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

      {/* Suche & Aktionen */}
      <div className="retail-toolbar">
        <label className="search">
          <Barcode size={18} />
          <input type="search" placeholder={r("actions.search")} aria-label={r("actions.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>

        <div className="row wrap gap push-end">
          <button
            className={`button ${lowStockFilter ? "primary" : ""}`}
            onClick={() => setLowStockFilter(!lowStockFilter)}
            title={r("products.lowStockFilterTitle")}
          >
            <AlertTriangle size={17} /> {r("products.lowStockFilter", { n: lowStockCount })}
          </button>

          <button className="button" onClick={() => setPrintOpen(true)} title={r("actions.printLabels")}>
            <Printer size={17} /> {r("products.labels")}
          </button>

          {isManager && (
            <button className="button primary" onClick={openNew}>
              <Plus size={18} /> {r("actions.newProduct")}
            </button>
          )}
        </div>
      </div>

      {/* Kategorien */}
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

      {/* Artikelliste */}
      {loading ? (
        <p className="muted">{r("products.loading")}</p>
      ) : (
        <section className="card list-card">
          {products.length === 0 && (
            <p className="empty muted">
              <strong>{r("products.emptyTitle")}</strong> · {r("products.emptyText")}
            </p>
          )}
          {products.map((p) => {
            const margin = calculateMarginPercent(p.purchasePriceCents, p.sellingPriceCents, p.vatRate);
            const isLow = p.stockQty <= p.minStockQty;

            return (
              <div key={p.id} className="list-row retail-row">
                <span className="retail-number">
                  <code title={r("products.eanTitle")}><Barcode size={13} /> {p.ean}</code>
                  <small className="muted">#{p.number}</small>
                </span>
                <span className="list-main">
                  <strong>{p.name}</strong>
                  <small className="muted">
                    {[p.brand ? r("products.brand", { brand: p.brand }) : "", r(`categories.${p.category}`), r("products.location", { location: p.location || "–" })].filter(Boolean).join(" · ")}
                  </small>
                  <small className="muted">
                    {r("products.purchaseNet", { price: euro(p.purchasePriceCents) })} · {r("products.margin")} <span className={marginClass(margin)}>{margin}%</span> · {r("products.vat", { rate: p.vatRate })}
                  </small>
                </span>
                <span className="retail-row-meta">
                  <strong className="retail-price">{euro(p.sellingPriceCents)}</strong>
                  <span className="retail-row-actions">
                  <button
                    className={`pill retail-stock ${isLow ? "neg" : "pos"}`}
                    onClick={() => openStock(p)}
                    title={r("products.stockPillTitle")}
                  >
                    {isLow && <AlertTriangle size={13} />}
                    {r("products.stockPill", { qty: p.stockQty, unit: unit(p.unit), min: p.minStockQty })}
                  </button>
                    <button className="button small-button" onClick={() => openStock(p)} title={r("actions.adjustStock")} aria-label={r("actions.adjustStock")}>
                      <ArrowUpDown size={14} /> ±
                    </button>
                    {isManager && (
                      <button className="icon-button" onClick={() => openEdit(p)} title={r("actions.edit")} aria-label={r("actions.edit")}>
                        <Pencil size={16} />
                      </button>
                    )}
                    {isManager && (
                      deleteConfirmId === p.id ? (
                        <>
                          <button className="button danger small-button" onClick={() => handleDelete(p.id)} title={r("products.deleteTitle")}>
                            {r("actions.delete")}
                          </button>
                          <button className="button small-button" onClick={() => setDeleteConfirmId(null)}>
                            {r("actions.cancelShort")}
                          </button>
                        </>
                      ) : (
                        <button className="icon-button danger" onClick={() => setDeleteConfirmId(p.id)} title={r("actions.delete")} aria-label={r("actions.delete")}>
                          <Trash2 size={16} />
                        </button>
                      )
                    )}
                  </span>
                </span>
              </div>
            );
          })}
        </section>
      )}

      {/* Dialog: Artikel anlegen / bearbeiten */}
      {modalOpen && (
        <Dialog title={editingProduct ? r("productForm.editTitle") : r("actions.newProduct")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="retail-dialog stack">
            <div className="grid form-grid">
              <Field label={r("productForm.name")} required wide>
                <input type="text" required placeholder={r("productForm.namePlaceholder")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>

              <Field label={r("productForm.brand")}>
                <input type="text" placeholder={r("productForm.brandPlaceholder")} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </Field>
              <Field label={r("productForm.category")} required>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ProductCategory })}>
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

              <Field label={r("productForm.ean")} hint={r("productForm.eanHint")}>
                <div className="retail-ean">
                  <input type="text" placeholder={r("productForm.eanPlaceholder")} value={form.ean} onChange={(e) => setForm({ ...form, ean: e.target.value })} />
                  <button
                    type="button"
                    className="button"
                    onClick={() => setForm({ ...form, ean: generateInternalEan("200", Date.now() % 100000) })}
                    title={r("productForm.eanGenerateTitle")}
                  >
                    <Sparkles size={17} /> {r("productForm.eanGenerate")}
                  </button>
                </div>
              </Field>
              <Field label={r("productForm.unit")}>
                <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as ProductUnit })}>
                  <option value="Stk">{r("units.long.Stk")}</option>
                  <option value="kg">{r("units.long.kg")}</option>
                  <option value="g">{r("units.long.g")}</option>
                  <option value="l">{r("units.long.l")}</option>
                  <option value="ml">{r("units.long.ml")}</option>
                  <option value="Pck">{r("units.long.Pck")}</option>
                  <option value="Set">{r("units.long.Set")}</option>
                </select>
              </Field>
            </div>

            {/* Preiskalkulation & Marge */}
            <div className="retail-calc">
              <strong>{r("productForm.calcTitle")}</strong>
              <div className="grid form-grid">
                <Field label={r("productForm.purchasePrice", { symbol: currencySymbol(lang) })}>
                  <input type="text" value={form.purchasePriceEuro} onChange={(e) => setForm({ ...form, purchasePriceEuro: e.target.value })} />
                </Field>
                <Field label={r("productForm.sellingPrice", { symbol: currencySymbol(lang) })} required>
                  <input type="text" required value={form.sellingPriceEuro} onChange={(e) => setForm({ ...form, sellingPriceEuro: e.target.value })} />
                </Field>
                <Field label={r("productForm.vatRate")}>
                  <select value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: parseFloat(e.target.value) })}>
                    {vatChoices(form.vatRate).map((v) => (
                      <option key={v} value={v}>
                        {r(v === 0 ? "productForm.vatFree" : v === standardVat() ? "productForm.vatStandard" : "productForm.vatReduced", { rate: new Intl.NumberFormat(lang).format(v) })}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="retail-total">
                <span>{r("productForm.marginLabel")}</span>
                <strong className={marginClass(liveMargin)}>{r("productForm.marginValue", { margin: liveMargin })}</strong>
              </div>
            </div>

            {/* Bestandsführung, Lagerplatz & Lieferant */}
            <div className="grid form-grid">
              {/* Später ändert sich der Bestand nur über „±“ (Buchung mit Grund), damit nichts überschrieben wird */}
              {!editingProduct && (
                <Field label={r("productForm.initialStock")}>
                  <input type="number" min="0" value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: parseInt(e.target.value, 10) || 0 })} />
                </Field>
              )}
              <Field label={r("productForm.minStock")}>
                <input type="number" min="0" value={form.minStockQty} onChange={(e) => setForm({ ...form, minStockQty: parseInt(e.target.value, 10) || 0 })} />
              </Field>
              <Field label={r("productForm.location")} wide>
                <input type="text" placeholder={r("productForm.locationPlaceholder")} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </Field>

              <Field label={r("productForm.supplier")}>
                <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">{r("productForm.noSupplier")}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={r("productForm.supplierArticleNo")}>
                <input type="text" placeholder={r("productForm.supplierArticleNoPlaceholder")} value={form.supplierArticleNo} onChange={(e) => setForm({ ...form, supplierArticleNo: e.target.value })} />
              </Field>
            </div>

            <div className="actions">
              <button type="button" className="button" onClick={() => setModalOpen(false)}>
                {r("actions.cancel")}
              </button>
              <button type="submit" className="button primary">
                {r("actions.save")}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Dialog: Schnelle Bestandskorrektur */}
      {stockModalProduct && (
        <Dialog title={r("actions.adjustStock")} onClose={() => setStockModalProduct(null)}>
          <form onSubmit={handleSaveStockAdjustment} className="retail-dialog stack">
            <span className="list-main">
              <strong>{stockModalProduct.name}</strong>
              <small className="muted">
                {r("stockDialog.current")} <strong>{stockModalProduct.stockQty} {unit(stockModalProduct.unit)}</strong>
              </small>
            </span>

            <Field label={r("stockDialog.delta")} required>
              <div className="retail-delta">
                <button type="button" className="button" onClick={() => setStockDelta((d) => d - 1)}>
                  -1
                </button>
                <input type="number" required value={stockDelta} onChange={(e) => setStockDelta(parseInt(e.target.value, 10) || 0)} />
                <button type="button" className="button" onClick={() => setStockDelta((d) => d + 1)}>
                  +1
                </button>
              </div>
            </Field>

            <p className="notice">
              {r("stockDialog.next")} <strong>{Math.max(0, stockModalProduct.stockQty + stockDelta)} {unit(stockModalProduct.unit)}</strong>
            </p>

            <Field label={r("stockDialog.reason")}>
              <select value={stockReason} onChange={(e) => setStockReason(e.target.value)}>
                <option value="correction">{r("stockDialog.reasonCorrection")}</option>
                <option value="loss">{r("stockDialog.reasonLoss")}</option>
                <option value="purchase">{r("stockDialog.reasonPurchase")}</option>
                <option value="return">{r("stockDialog.reasonReturn")}</option>
              </select>
            </Field>

            <Field label={r("stockDialog.note")}>
              <input type="text" placeholder={r("stockDialog.notePlaceholder")} value={stockNote} onChange={(e) => setStockNote(e.target.value)} />
            </Field>

            <div className="actions">
              <button type="button" className="button" onClick={() => setStockModalProduct(null)}>
                {r("actions.cancel")}
              </button>
              <button type="submit" className="button primary">
                {r("stockDialog.submit")}
              </button>
            </div>
          </form>
        </Dialog>
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
