import { useEffect, useState } from "react";
import { Plus, Package, CheckCircle2, Clock, AlertCircle, Trash2, X, Check, Truck, ArrowRight, ShoppingCart, Calendar } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { OrderStatus, RetailOrderItem, RetailProduct, RetailPurchaseOrder, RetailSupplier } from "../../../shared/retail";
import { useRetailI18n } from "./i18n";

export function OrdersTab({ isManager }: { isManager: boolean }) {
  const { r, euro, day: formatDay } = useRetailI18n();
  const [orders, setOrders] = useState<RetailPurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<RetailSupplier[]>([]);
  const [products, setProducts] = useState<RetailProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal: Neue Bestellung
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  const [orderItems, setOrderItems] = useState<RetailOrderItem[]>([]);
  const [orderNotes, setOrderNotes] = useState("");

  // Modal: Wareneingang erfassen
  const [receivingOrder, setReceivingOrder] = useState<RetailPurchaseOrder | null>(null);
  const [receivedQtyMap, setReceivedQtyMap] = useState<Record<string, number>>({});

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const loadData = async () => {
    try {
      const [ordRes, supRes, prodRes] = await Promise.all([
        api<{ orders: RetailPurchaseOrder[] }>(`/retail/orders?status=${statusFilter}`),
        api<{ suppliers: RetailSupplier[] }>("/retail/suppliers"),
        api<{ products: RetailProduct[] }>("/retail/products"),
      ]);
      setOrders(ordRes.orders);
      setSuppliers(supRes.suppliers);
      setProducts(prodRes.products);

      if (supRes.suppliers.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(supRes.suppliers[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const openNewOrder = () => {
    setOrderDate(new Date().toISOString().slice(0, 10));
    setExpectedDate(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
    setOrderItems([]);
    setOrderNotes("");
    setErrorMsg("");
    setModalOpen(true);
  };

  const handleAddItemToOrder = (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    const existing = orderItems.find((i) => i.productId === productId);
    if (existing) {
      setOrderItems(orderItems.map((i) => (i.productId === productId ? { ...i, qtyOrdered: i.qtyOrdered + 1 } : i)));
    } else {
      setOrderItems([
        ...orderItems,
        {
          productId: prod.id,
          name: prod.name,
          ean: prod.ean,
          qtyOrdered: Math.max(1, prod.minStockQty * 2 - prod.stockQty),
          qtyReceived: 0,
          purchasePriceCents: prod.purchasePriceCents,
        },
      ]);
    }
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orderItems.length === 0) {
      setErrorMsg("Bitte fügen Sie mindestens einen Artikel zur Bestellung hinzu.");
      return;
    }

    const sup = suppliers.find((s) => s.id === selectedSupplierId);
    if (!sup) {
      setErrorMsg("Bitte wählen Sie einen Lieferanten.");
      return;
    }

    try {
      await api("/retail/orders", {
        method: "POST",
        body: {
          supplierId: sup.id,
          supplierName: sup.name,
          supplierEmail: sup.email,
          date: orderDate,
          expectedDeliveryDate: expectedDate,
          status: "ordered",
          items: orderItems,
          notes: orderNotes,
        },
      });
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim Anlegen der Bestellung");
    }
  };

  const openReceiveModal = (order: RetailPurchaseOrder) => {
    setReceivingOrder(order);
    const initialMap: Record<string, number> = {};
    for (const item of order.items) {
      // Vorauswahl: Restliche offene Menge vorschlagen
      initialMap[item.productId] = item.qtyOrdered;
    }
    setReceivedQtyMap(initialMap);
  };

  const handleConfirmReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingOrder) return;

    try {
      const payload = receivingOrder.items.map((i) => ({
        productId: i.productId,
        qtyReceived: Number(receivedQtyMap[i.productId] ?? i.qtyReceived),
      }));

      await api(`/retail/orders/${receivingOrder.id}/receive`, {
        method: "POST",
        body: { receivedItems: payload },
      });

      setReceivingOrder(null);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim Einbuchen des Wareneingangs");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/retail/orders/${id}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim Löschen der Bestellung");
    }
  };

  return (
    <div className="stack">
      {errorMsg && <div className="notice warning">{errorMsg}</div>}

      {/* Toolbar */}
      <div className="toolbar" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div className="chips" role="tablist">
          {["all", "draft", "ordered", "partially_received", "received", "canceled"].map((st) => (
            <button
              key={st}
              role="tab"
              aria-selected={statusFilter === st}
              className={statusFilter === st ? "chip active" : "chip"}
              onClick={() => setStatusFilter(st)}
            >
              {st === "all" ? "Alle Bestellungen" : r(`orderStatus.${st}`)}
            </button>
          ))}
        </div>

        {isManager && (
          <button className="button primary push-end" onClick={openNewOrder}>
            <Plus size={18} /> {r("actions.newOrder")}
          </button>
        )}
      </div>

      {/* Liste / Tabelle der Bestellungen */}
      {loading ? (
        <p className="muted">Lade Bestellungen...</p>
      ) : orders.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <Package size={36} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
          <h3>Keine Bestellungen vorhanden</h3>
          <p className="muted">Erstellen Sie eine Einkaufsbestellung für Ihre Lieferanten.</p>
        </div>
      ) : (
        <div className="office-table-wrap">
          <table className="office-table">
            <thead>
              <tr>
                <th>Bestell-Nr. & Datum</th>
                <th>Lieferant</th>
                <th>Positionen</th>
                <th>Liefertermin</th>
                <th className="num">Einkaufswert</th>
                <th>Status</th>
                <th className="num">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const totalQty = o.items.reduce((sum, i) => sum + i.qtyOrdered, 0);
                const receivedQty = o.items.reduce((sum, i) => sum + i.qtyReceived, 0);

                return (
                  <tr key={o.id}>
                    <td>
                      <strong>Bestellung #{o.number}</strong>
                      <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                        {formatDay(o.date)}
                      </div>
                    </td>
                    <td>
                      <strong>{o.supplierName}</strong>
                      {o.supplierEmail && (
                        <small className="muted" style={{ display: "block" }}>
                          {o.supplierEmail}
                        </small>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: "0.88rem" }}>
                        <strong>{o.items.length} Artikel</strong> ({receivedQty} von {totalQty} geliefert)
                      </div>
                      <div className="small muted" style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.items.map((i) => i.name).join(", ")}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: "0.85rem", color: o.expectedDeliveryDate ? "var(--ink)" : "var(--muted)" }}>
                        {o.expectedDeliveryDate ? formatDay(o.expectedDeliveryDate) : "–"}
                      </span>
                    </td>
                    <td className="num" style={{ fontWeight: 800 }}>
                      {euro(o.totalCents)}
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          o.status === "ordered"
                            ? "warning"
                            : o.status === "received"
                            ? "success"
                            : o.status === "partially_received"
                            ? "warning"
                            : ""
                        }`}
                      >
                        {r(`orderStatus.${o.status}`)}
                      </span>
                    </td>
                    <td className="num">
                      <div className="row gap" style={{ justifyContent: "flex-end", flexWrap: "wrap", minWidth: "160px" }}>
                        {o.status !== "received" && o.status !== "canceled" && (
                          <button
                            className="button small primary"
                            onClick={() => openReceiveModal(o)}
                            title="Lieferschein abgleichen und Wareneingang ins Lager buchen"
                          >
                            <Truck size={14} /> Wareneingang
                          </button>
                        )}

                        {isManager && (
                          deleteConfirmId === o.id ? (
                            <div className="row gap" style={{ alignItems: "center" }}>
                              <button
                                className="button danger small"
                                onClick={() => handleDelete(o.id)}
                                title="Unwiderruflich löschen"
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
                              onClick={() => setDeleteConfirmId(o.id)}
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

      {/* Modal: Neue Bestellung erstellen */}
      {modalOpen && (
        <div className="retail-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="retail-modal" style={{ maxWidth: "720px" }} onClick={(e) => e.stopPropagation()}>
            <div className="retail-modal-head">
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <Package size={20} style={{ color: "var(--accent)" }} />
                {r("actions.newOrder")}
              </h3>
              <button className="icon-button" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveOrder} className="stack">
              <div className="row-grid">
                <Field label="Lieferant" required>
                  <select
                    className="input"
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Bestelldatum" required>
                  <input
                    type="date"
                    required
                    className="input"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </Field>
                <Field label="Erwarteter Liefertermin">
                  <input
                    type="date"
                    className="input"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                  />
                </Field>
              </div>

              {/* Artikel zur Bestellung hinzufügen */}
              <div className="card" style={{ padding: "14px", background: "var(--panel-2)", border: "1px solid var(--line)", display: "grid", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: "0.92rem" }}>Artikel zur Bestellung hinzufügen</strong>
                  <span className="small muted">Aus Sortiment wählen</span>
                </div>

                <div className="row gap" style={{ flexWrap: "wrap" }}>
                  <select
                    className="input"
                    style={{ flex: 1, minWidth: "240px" }}
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddItemToOrder(e.target.value);
                        e.target.value = "";
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>+ Artikel auswählen...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Bestand: {p.stockQty} {p.unit} / Min: {p.minStockQty}) – EK: {euro(p.purchasePriceCents)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Bestellpositionen-Tabelle */}
                {orderItems.length > 0 ? (
                  <div className="office-table-wrap" style={{ marginTop: "8px" }}>
                    <table className="office-table" style={{ fontSize: "0.85rem" }}>
                      <thead>
                        <tr>
                          <th>Artikel</th>
                          <th className="num">Menge</th>
                          <th className="num">EK Netto</th>
                          <th className="num">Gesamt</th>
                          <th className="num"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderItems.map((item, idx) => (
                          <tr key={item.productId}>
                            <td>
                              <strong>{item.name}</strong>
                              <div className="small muted">{item.ean}</div>
                            </td>
                            <td className="num">
                              <input
                                type="number"
                                min="1"
                                className="input"
                                style={{ width: "70px", textAlign: "center", padding: "4px" }}
                                value={item.qtyOrdered}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10) || 1;
                                  setOrderItems(orderItems.map((it, i) => (i === idx ? { ...it, qtyOrdered: val } : it)));
                                }}
                              />
                            </td>
                            <td className="num">
                              <input
                                type="number"
                                step="0.01"
                                className="input"
                                style={{ width: "85px", textAlign: "right", padding: "4px" }}
                                value={(item.purchasePriceCents / 100).toFixed(2)}
                                onChange={(e) => {
                                  const valCents = Math.round(parseFloat(e.target.value) * 100) || 0;
                                  setOrderItems(orderItems.map((it, i) => (i === idx ? { ...it, purchasePriceCents: valCents } : it)));
                                }}
                              />
                            </td>
                            <td className="num" style={{ fontWeight: 700 }}>
                              {euro(item.qtyOrdered * item.purchasePriceCents)}
                            </td>
                            <td className="num">
                              <button
                                type="button"
                                className="icon-button danger"
                                style={{ width: "26px", height: "26px" }}
                                onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="small muted" style={{ textAlign: "center", margin: "10px 0" }}>
                    Noch keine Positionen hinzugefügt.
                  </p>
                )}

                {orderItems.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: "8px", fontWeight: 800 }}>
                    <span>Gesamtwert Netto:</span>
                    <span style={{ fontSize: "1.15rem", color: "var(--accent)" }}>
                      {euro(orderItems.reduce((s, i) => s + i.qtyOrdered * i.purchasePriceCents, 0))}
                    </span>
                  </div>
                )}
              </div>

              <Field label="Notizen / Hinweise für Lieferant">
                <textarea
                  rows={2}
                  className="input"
                  placeholder="z.B. Anlieferung bitte bis 12 Uhr, Hubwagen erforderlich"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                />
              </Field>

              <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "12px" }}>
                <button type="button" className="button" onClick={() => setModalOpen(false)}>
                  {r("actions.cancel")}
                </button>
                <button type="submit" className="button primary">
                  Bestellung aufgeben
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Wareneingang erfassen */}
      {receivingOrder && (
        <div className="retail-modal-overlay" onClick={() => setReceivingOrder(null)}>
          <div className="retail-modal" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
            <div className="retail-modal-head">
              <div>
                <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                  <Truck size={20} style={{ color: "var(--accent)" }} />
                  Wareneingang erfassen (Bestellung #{receivingOrder.number})
                </h3>
                <small className="muted">Lieferant: {receivingOrder.supplierName}</small>
              </div>
              <button className="icon-button" onClick={() => setReceivingOrder(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmReceive} className="stack">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p className="small muted" style={{ margin: 0 }}>
                  Gleichen Sie die Lieferscheinmengen ab. Bestände werden automatisch im Lager zugebucht.
                </p>
                <button
                  type="button"
                  className="button small"
                  onClick={() => {
                    const full: Record<string, number> = {};
                    for (const i of receivingOrder.items) full[i.productId] = i.qtyOrdered;
                    setReceivedQtyMap(full);
                  }}
                >
                  <CheckCircle2 size={14} /> Alles vollständig
                </button>
              </div>

              <div className="office-table-wrap">
                <table className="office-table" style={{ fontSize: "0.88rem" }}>
                  <thead>
                    <tr>
                      <th>Artikel</th>
                      <th className="num">Bestellt</th>
                      <th className="num">Bereits da</th>
                      <th className="num">Neu geliefert (Ist)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivingOrder.items.map((item) => (
                      <tr key={item.productId}>
                        <td>
                          <strong>{item.name}</strong>
                          <div className="small muted">{item.ean}</div>
                        </td>
                        <td className="num">{item.qtyOrdered}</td>
                        <td className="num">{item.qtyReceived}</td>
                        <td className="num">
                          <input
                            type="number"
                            min={item.qtyReceived}
                            max={item.qtyOrdered * 2}
                            className="input"
                            style={{ width: "80px", textAlign: "center", fontWeight: 700 }}
                            value={receivedQtyMap[item.productId] ?? item.qtyReceived}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              setReceivedQtyMap({
                                ...receivedQtyMap,
                                [item.productId]: val,
                              });
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="notice success" style={{ fontSize: "0.85rem" }}>
                <Check size={16} /> Bestände der erfassten Artikel werden sofort im Lager erhöht und im Journal protokolliert.
              </div>

              <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "8px" }}>
                <button type="button" className="button" onClick={() => setReceivingOrder(null)}>
                  {r("actions.cancel")}
                </button>
                <button type="submit" className="button primary">
                  Wareneingang einbuchen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
