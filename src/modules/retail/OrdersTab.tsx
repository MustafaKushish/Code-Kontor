import { useEffect, useState } from "react";
import { Plus, CheckCircle2, Trash2, X, Check, Truck, Calendar } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { OrderStatus, RetailOrderItem, RetailProduct, RetailPurchaseOrder, RetailSupplier } from "../../../shared/retail";
import { useRetailI18n } from "./i18n";
import { Dialog } from "../../pos/ui";

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

  const statusPill = (status: OrderStatus) =>
    status === "received" ? "pill pos" : status === "ordered" || status === "partially_received" ? "pill warn" : status === "canceled" ? "pill neg" : "pill";

  return (
    <div className="stack">
      {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

      {/* Filter & Aktion */}
      <div className="retail-toolbar">
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

      {/* Bestellungen */}
      {loading ? (
        <p className="muted">Lade Bestellungen...</p>
      ) : (
        <section className="card list-card">
          {orders.length === 0 && (
            <p className="empty muted">
              <strong>Keine Bestellungen vorhanden</strong> · Erstellen Sie eine Einkaufsbestellung für Ihre Lieferanten.
            </p>
          )}
          {orders.map((o) => {
            const totalQty = o.items.reduce((sum, i) => sum + i.qtyOrdered, 0);
            const receivedQty = o.items.reduce((sum, i) => sum + i.qtyReceived, 0);

            return (
              <div key={o.id} className="list-row retail-row">
                <span className="retail-number">
                  <strong>Bestellung #{o.number}</strong>
                  <small className="muted">{formatDay(o.date)}</small>
                </span>
                <span className="list-main">
                  <strong>{o.supplierName}{o.supplierEmail ? ` · ${o.supplierEmail}` : ""}</strong>
                  <small className="muted">
                    {o.items.length} Artikel ({receivedQty} von {totalQty} geliefert) · {o.items.map((i) => i.name).join(", ")}
                  </small>
                  <small className="muted"><Calendar size={13} /> Liefertermin: {o.expectedDeliveryDate ? formatDay(o.expectedDeliveryDate) : "–"}</small>
                </span>
                <span className="retail-row-meta">
                  <span className={statusPill(o.status)}>{r(`orderStatus.${o.status}`)}</span>
                  <strong className="retail-price">{euro(o.totalCents)}</strong>
                  <span className="retail-row-actions">
                    {o.status !== "received" && o.status !== "canceled" && (
                      <button
                        className="button small-button primary"
                        onClick={() => openReceiveModal(o)}
                        title="Lieferschein abgleichen und Wareneingang ins Lager buchen"
                      >
                        <Truck size={14} /> Wareneingang
                      </button>
                    )}

                    {isManager && (
                      deleteConfirmId === o.id ? (
                        <>
                          <button className="button danger small-button" onClick={() => handleDelete(o.id)} title="Unwiderruflich löschen">
                            Löschen
                          </button>
                          <button className="button small-button" onClick={() => setDeleteConfirmId(null)}>
                            Abbr.
                          </button>
                        </>
                      ) : (
                        <button className="icon-button danger" onClick={() => setDeleteConfirmId(o.id)} title={r("actions.delete")} aria-label={r("actions.delete")}>
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

      {/* Dialog: Neue Bestellung erstellen */}
      {modalOpen && (
        <Dialog title={r("actions.newOrder")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSaveOrder} className="retail-dialog stack">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

            <div className="grid form-grid">
              <Field label="Lieferant" required wide>
                <select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)}>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Bestelldatum" required>
                <input type="date" required value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </Field>
              <Field label="Erwarteter Liefertermin">
                <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              </Field>
            </div>

            {/* Artikel zur Bestellung hinzufügen */}
            <div className="retail-calc">
              <div className="section-head">
                <strong>Artikel zur Bestellung hinzufügen</strong>
                <small className="muted">Aus Sortiment wählen</small>
              </div>

              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddItemToOrder(e.target.value);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
                aria-label="Artikel auswählen"
              >
                <option value="" disabled>+ Artikel auswählen...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Bestand: {p.stockQty} {p.unit} / Min: {p.minStockQty}) – EK: {euro(p.purchasePriceCents)}
                  </option>
                ))}
              </select>

              {/* Bestellpositionen */}
              {orderItems.length > 0 ? (
                <div className="retail-lines">
                  {orderItems.map((item, idx) => (
                    <div key={item.productId} className="retail-line">
                      <span className="list-main">
                        <strong>{item.name}</strong>
                        <small className="muted">{item.ean}</small>
                      </span>
                      <input
                        type="number"
                        min="1"
                        aria-label="Menge"
                        title="Menge"
                        value={item.qtyOrdered}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          setOrderItems(orderItems.map((it, i) => (i === idx ? { ...it, qtyOrdered: val } : it)));
                        }}
                      />
                      <input
                        type="number"
                        step="0.01"
                        aria-label="EK Netto"
                        title="EK Netto"
                        value={(item.purchasePriceCents / 100).toFixed(2)}
                        onChange={(e) => {
                          const valCents = Math.round(parseFloat(e.target.value) * 100) || 0;
                          setOrderItems(orderItems.map((it, i) => (i === idx ? { ...it, purchasePriceCents: valCents } : it)));
                        }}
                      />
                      <span className="amount">{euro(item.qtyOrdered * item.purchasePriceCents)}</span>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={r("actions.delete")}
                        onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="small muted">Noch keine Positionen hinzugefügt.</p>
              )}

              {orderItems.length > 0 && (
                <div className="retail-total">
                  <span>Gesamtwert Netto:</span>
                  <strong>{euro(orderItems.reduce((s, i) => s + i.qtyOrdered * i.purchasePriceCents, 0))}</strong>
                </div>
              )}
            </div>

            <Field label="Notizen / Hinweise für Lieferant">
              <textarea
                rows={2}
                placeholder="z.B. Anlieferung bitte bis 12 Uhr, Hubwagen erforderlich"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
              />
            </Field>

            <div className="actions">
              <button type="button" className="button" onClick={() => setModalOpen(false)}>
                {r("actions.cancel")}
              </button>
              <button type="submit" className="button primary">
                Bestellung aufgeben
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Dialog: Wareneingang erfassen */}
      {receivingOrder && (
        <Dialog title={`Wareneingang erfassen (Bestellung #${receivingOrder.number})`} onClose={() => setReceivingOrder(null)} wide>
          <form onSubmit={handleConfirmReceive} className="retail-dialog stack">
            <p className="muted">Lieferant: {receivingOrder.supplierName}</p>
            <div className="section-head">
              <p className="small muted">
                Gleichen Sie die Lieferscheinmengen ab. Bestände werden automatisch im Lager zugebucht.
              </p>
              <button
                type="button"
                className="button small-button"
                onClick={() => {
                  const full: Record<string, number> = {};
                  for (const i of receivingOrder.items) full[i.productId] = i.qtyOrdered;
                  setReceivedQtyMap(full);
                }}
              >
                <CheckCircle2 size={14} /> Alles vollständig
              </button>
            </div>

            <div className="retail-lines">
              {receivingOrder.items.map((item) => (
                <div key={item.productId} className="retail-line receive">
                  <span className="list-main">
                    <strong>{item.name}</strong>
                    <small className="muted">{item.ean}</small>
                  </span>
                  <small className="muted">Bestellt {item.qtyOrdered} · Bereits da {item.qtyReceived}</small>
                  <input
                    type="number"
                    min={item.qtyReceived}
                    max={item.qtyOrdered * 2}
                    aria-label="Neu geliefert (Ist)"
                    title="Neu geliefert (Ist)"
                    value={receivedQtyMap[item.productId] ?? item.qtyReceived}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 0;
                      setReceivedQtyMap({
                        ...receivedQtyMap,
                        [item.productId]: val,
                      });
                    }}
                  />
                </div>
              ))}
            </div>

            <p className="notice success">
              <Check size={16} /> Bestände der erfassten Artikel werden sofort im Lager erhöht und im Journal protokolliert.
            </p>

            <div className="actions">
              <button type="button" className="button" onClick={() => setReceivingOrder(null)}>
                {r("actions.cancel")}
              </button>
              <button type="submit" className="button primary">
                Wareneingang einbuchen
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
