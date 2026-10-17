import { useEffect, useState } from "react";
import { Plus, AlertTriangle, Barcode, Pencil, Trash2, ArrowUpDown, Sparkles, Tag, Layers, Printer } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { ProductCategory, ProductUnit, RetailProduct, RetailSupplier } from "../../../shared/retail";
import { calculateMarginPercent, generateInternalEan } from "../../../shared/retail";
import { useRetailI18n } from "./i18n";
import { LabelsPrint } from "./LabelsPrint";
import { Dialog } from "../../pos/ui";
import { currencySymbol } from "../../money";

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
          <small>Im aktiven Sortiment</small>
        </div>
        <div className="tile stat-tile">
          <span className="stat-icon"><Tag size={18} /></span>
          <strong>{euro(totalStockValueCents)}</strong>
          <small>{r("stats.stockValue")}</small>
          <small>Gebundenes Einkaufskapital</small>
        </div>
        <div className="tile stat-tile">
          <span className={lowStockCount > 0 ? "stat-icon warn" : "stat-icon"}><AlertTriangle size={18} /></span>
          <strong>{lowStockCount}</strong>
          <small>{r("stats.lowStock")}</small>
          <small>Bestand ≤ Mindestmenge</small>
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
            title="Filter: Nur nachzubestellende Artikel"
          >
            <AlertTriangle size={17} /> Nachbestellen ({lowStockCount})
          </button>

          <button className="button" onClick={() => setPrintOpen(true)} title="Etiketten drucken">
            <Printer size={17} /> Etiketten
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
        <p className="muted">Lade Sortiment...</p>
      ) : (
        <section className="card list-card">
          {products.length === 0 && (
            <p className="empty muted">
              <strong>Keine Artikel gefunden</strong> · Passen Sie Ihre Suche an oder legen Sie den ersten Artikel an.
            </p>
          )}
          {products.map((p) => {
            const margin = calculateMarginPercent(p.purchasePriceCents, p.sellingPriceCents, p.vatRate);
            const isLow = p.stockQty <= p.minStockQty;

            return (
              <div key={p.id} className="list-row retail-row">
                <span className="retail-number">
                  <code title="EAN / Barcode"><Barcode size={13} /> {p.ean}</code>
                  <small className="muted">#{p.number}</small>
                </span>
                <span className="list-main">
                  <strong>{p.name}</strong>
                  <small className="muted">
                    {[p.brand ? `Marke: ${p.brand}` : "", r(`categories.${p.category}`), `Lagerort: ${p.location || "–"}`].filter(Boolean).join(" · ")}
                  </small>
                  <small className="muted">
                    EK Netto {euro(p.purchasePriceCents)} · Spanne <span className={marginClass(margin)}>{margin}%</span> · {p.vatRate}% MwSt.
                  </small>
                </span>
                <span className="retail-row-meta">
                  <strong className="retail-price">{euro(p.sellingPriceCents)}</strong>
                  <span className="retail-row-actions">
                  <button
                    className={`pill retail-stock ${isLow ? "neg" : "pos"}`}
                    onClick={() => openStock(p)}
                    title="Klicken für schnelle Bestandskorrektur"
                  >
                    {isLow && <AlertTriangle size={13} />}
                    {p.stockQty} {p.unit} · Min: {p.minStockQty}
                  </button>
                    <button className="button small-button" onClick={() => openStock(p)} title="Bestand anpassen">
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
                          <button className="button danger small-button" onClick={() => handleDelete(p.id)} title="Unwiderruflich deaktivieren">
                            Löschen
                          </button>
                          <button className="button small-button" onClick={() => setDeleteConfirmId(null)}>
                            Abbr.
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
        <Dialog title={editingProduct ? "Artikel bearbeiten" : r("actions.newProduct")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="retail-dialog stack">
            <div className="grid form-grid">
              <Field label="Artikelbezeichnung" required wide>
                <input type="text" required placeholder="z.B. Bio-Olivenöl Extra Vergine 500ml" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>

              <Field label="Marke / Hersteller">
                <input type="text" placeholder="z.B. Terre Di Olio" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </Field>
              <Field label="Kategorie" required>
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

              <Field label="EAN / Barcode (13-stellig)" hint="Für Barcode-Scanner">
                <div className="retail-ean">
                  <input type="text" placeholder="z.B. 4012345678901" value={form.ean} onChange={(e) => setForm({ ...form, ean: e.target.value })} />
                  <button
                    type="button"
                    className="button"
                    onClick={() => setForm({ ...form, ean: generateInternalEan("200", Date.now() % 100000) })}
                    title="Interne 200-EAN mit Prüfziffer generieren"
                  >
                    <Sparkles size={17} /> Neu
                  </button>
                </div>
              </Field>
              <Field label="Verkaufseinheit">
                <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as ProductUnit })}>
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
            <div className="retail-calc">
              <strong>Preiskalkulation & Margenberechnung</strong>
              <div className="grid form-grid">
                <Field label={`Einkaufspreis Netto (${currencySymbol("de-DE")})`}>
                  <input type="text" value={form.purchasePriceEuro} onChange={(e) => setForm({ ...form, purchasePriceEuro: e.target.value })} />
                </Field>
                <Field label={`Verkaufspreis Brutto (${currencySymbol("de-DE")})`} required>
                  <input type="text" required value={form.sellingPriceEuro} onChange={(e) => setForm({ ...form, sellingPriceEuro: e.target.value })} />
                </Field>
                <Field label="MwSt.-Satz">
                  <select value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: parseFloat(e.target.value) })}>
                    <option value="19">19% (Regelsatz)</option>
                    <option value="7">7% (Ermäßigt - Lebensmittel/Bücher)</option>
                    <option value="0">0% (Steuerfrei)</option>
                  </select>
                </Field>
              </div>
              <div className="retail-total">
                <span>Kalkulierte Handelsspanne:</span>
                <strong className={marginClass(liveMargin)}>{liveMargin}% Rohertrag</strong>
              </div>
            </div>

            {/* Bestandsführung, Lagerplatz & Lieferant */}
            <div className="grid form-grid">
              {/* Später ändert sich der Bestand nur über „±“ (Buchung mit Grund), damit nichts überschrieben wird */}
              {!editingProduct && (
                <Field label="Anfangsbestand">
                  <input type="number" min="0" value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: parseInt(e.target.value, 10) || 0 })} />
                </Field>
              )}
              <Field label="Mindestbestand (Meldebestand)">
                <input type="number" min="0" value={form.minStockQty} onChange={(e) => setForm({ ...form, minStockQty: parseInt(e.target.value, 10) || 0 })} />
              </Field>
              <Field label="Regalplatz / Lagerort" wide>
                <input type="text" placeholder="z.B. A-02-3" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </Field>

              <Field label="Hauptlieferant">
                <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">Kein Lieferant zugeordnet</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Lieferanten-Art.-Nr.">
                <input type="text" placeholder="z.B. REF-8819" value={form.supplierArticleNo} onChange={(e) => setForm({ ...form, supplierArticleNo: e.target.value })} />
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
        <Dialog title="Bestand anpassen" onClose={() => setStockModalProduct(null)}>
          <form onSubmit={handleSaveStockAdjustment} className="retail-dialog stack">
            <span className="list-main">
              <strong>{stockModalProduct.name}</strong>
              <small className="muted">
                Aktueller Bestand: <strong>{stockModalProduct.stockQty} {stockModalProduct.unit}</strong>
              </small>
            </span>

            <Field label="Bestandsänderung (+Zugang oder -Abgang)" required>
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
              Neuer Bestand: <strong>{Math.max(0, stockModalProduct.stockQty + stockDelta)} {stockModalProduct.unit}</strong>
            </p>

            <Field label="Grund der Buchung">
              <select value={stockReason} onChange={(e) => setStockReason(e.target.value)}>
                <option value="correction">Manuelle Inventur / Zählung</option>
                <option value="loss">Bruch / Verderb / Schwund</option>
                <option value="purchase">Wareneingang ohne Bestellung</option>
                <option value="return">Kundenrückgabe</option>
              </select>
            </Field>

            <Field label="Bemerkung">
              <input type="text" placeholder="z.B. Flasche beim Einräumen zerbrochen" value={stockNote} onChange={(e) => setStockNote(e.target.value)} />
            </Field>

            <div className="actions">
              <button type="button" className="button" onClick={() => setStockModalProduct(null)}>
                {r("actions.cancel")}
              </button>
              <button type="submit" className="button primary">
                Buchung durchführen
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
