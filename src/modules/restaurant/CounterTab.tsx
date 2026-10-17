import { useState } from "react";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Banknote,
  Printer,
  Sparkles,
  ShoppingBag,
  Coffee,
  CheckCircle2,
  UtensilsCrossed,
  Layers,
  ArrowRight,
  Hash,
  X,
} from "lucide-react";
import { api } from "../../api";
import type {
  MenuItem,
  OrderItem,
  OrderType,
  RestaurantOrder,
} from "../../../shared/restaurant";
import { Dialog } from "../../pos/ui";
import { ModuleCheckout } from "../../pos/ModuleCheckout";
import { RestaurantPrint } from "./RestaurantPrint";
import { currency as companyCurrency } from "../../money";

interface CounterTabProps {
  menu: MenuItem[];
  onRefresh: () => void;
}

export function CounterTab({ menu, onRefresh }: CounterTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("alle");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState<"theke" | "abholung">("theke");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<RestaurantOrder | null>(null);
  const [printType, setPrintType] = useState<"kitchen" | "bar" | "guest" | null>(null);

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: companyCurrency() }).format(amount);

  const categories = [
    "alle",
    "Heißgetränke",
    "Alkoholfrei",
    "Bier & Wein",
    "Cocktails",
    "Vorspeisen",
    "Hauptspeisen",
    "Pizza & Pasta",
    "Desserts",
  ];

  const filteredItems = menu.filter((item) => {
    if (!item.active) return false;
    const matchesCat = selectedCategory === "alle" || item.category === selectedCategory;
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.itemNumber.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const favorites = menu.filter((item) => item.active && item.isFavorite);

  const addToCart = (item: MenuItem) => {
    // Steuersatz wie in der Speisekarte; der Server rechnet ohnehin mit den Werten der Karte
    const effectiveTaxRate = item.taxRate;

    const existingIndex = cart.findIndex((i) => i.menuItemId === item.id && !i.note);
    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      setCart(updated);
    } else {
      const newItem: OrderItem = {
        id: "cart-" + Math.random().toString(36).slice(2, 9),
        menuItemId: item.id,
        name: item.name,
        quantity: 1,
        unitPriceGross: item.priceGross,
        taxRate: effectiveTaxRate,
        course: "Sofort",
        status: "bestellt",
        destination: item.destination,
      };
      setCart([...cart, newItem]);
    }
  };

  const updateQuantity = (index: number, delta: number) => {
    const updated = [...cart];
    const newQty = updated[index].quantity + delta;
    if (newQty <= 0) {
      updated.splice(index, 1);
    } else {
      updated[index].quantity = newQty;
    }
    setCart(updated);
  };

  const updateItemNote = (index: number, note: string) => {
    const updated = [...cart];
    updated[index].note = note;
    setCart(updated);
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setOrderNotes("");
  };

  // Calculations
  const totalGross = cart.reduce((sum, item) => sum + item.unitPriceGross * item.quantity, 0);
  const totalNet = cart.reduce((sum, item) => {
    const taxMultiplier = 1 + item.taxRate / 100;
    return sum + (item.unitPriceGross * item.quantity) / taxMultiplier;
  }, 0);
  const tax7 = cart
    .filter((i) => i.taxRate === 7)
    .reduce((sum, item) => sum + (item.unitPriceGross * item.quantity * 7) / 107, 0);
  const tax19 = cart
    .filter((i) => i.taxRate === 19)
    .reduce((sum, item) => sum + (item.unitPriceGross * item.quantity * 19) / 119, 0);

  // Die Bestellung geht sofort an die Küche; bezahlt wird über die Kasse (Beleg mit Nummer).
  const [paying, setPaying] = useState<RestaurantOrder | null>(null);
  const handleCheckout = async (pay: boolean) => {
    if (cart.length === 0) return;
    setIsBusy(true);
    try {
      const created = await api<RestaurantOrder>("/restaurant/orders", {
        method: "POST",
        body: {
          type: orderType,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          guestCount: 1,
          notes: orderNotes.trim() || undefined,
          items: cart,
        },
      });
      clearCart();
      onRefresh();
      if (pay) setPaying(created);
      else setCompletedOrder(created);
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const afterPayment = async (order: RestaurantOrder) => {
    setPaying(null);
    setCompletedOrder(await api<RestaurantOrder>(`/restaurant/orders/${order.id}`).catch(() => order));
    onRefresh();
  };

  return (
    <div className="restaurant-counter">
      <div className="stack restaurant-catalog">
        <div className="restaurant-bar">
          <div className="segmented restaurant-type">
            <button onClick={() => setOrderType("theke")} className={orderType === "theke" ? "active" : ""}>
              <Coffee size={17} aria-hidden />
              Theke (Im Haus)
            </button>
            <button onClick={() => setOrderType("abholung")} className={orderType === "abholung" ? "active" : ""}>
              <ShoppingBag size={17} aria-hidden />
              Abholung / To-Go (7% MwSt)
            </button>
          </div>

          <label className="search restaurant-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Artikel suchen..."
              aria-label="Artikel suchen"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="icon-button restaurant-search-clear" aria-label="Suche leeren">
                <X size={16} />
              </button>
            )}
          </label>
        </div>

        {favorites.length > 0 && !search && (
          <div className="stack-sm">
            <h3 className="restaurant-label">
              <Sparkles size={15} aria-hidden />
              Schnellwahl & Bestseller
            </h3>
            <div className="restaurant-items favorites">
              {favorites.map((item) => (
                <button key={item.id} onClick={() => addToCart(item)} className="tile restaurant-item favorite">
                  <strong>{item.name}</strong>
                  <span className="restaurant-split">
                    <small className="muted restaurant-code">{item.itemNumber}</small>
                    <strong className="restaurant-amount">{fmtEuro(item.priceGross)}</strong>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

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

        <div className="restaurant-items">
          {filteredItems.map((item) => (
            <button key={item.id} onClick={() => addToCart(item)} className="tile restaurant-item">
              <span className="restaurant-split">
                <small className="muted restaurant-code">{item.itemNumber}</small>
                <span className={`pill ${item.destination === "bar" ? "restaurant-pill-info" : "warn"}`}>
                  {item.destination === "bar" ? "Bar" : "Küche"}
                </span>
              </span>
              <strong>{item.name}</strong>
              <span className="restaurant-split restaurant-item-foot">
                <small className="muted">{item.category}</small>
                <strong className="restaurant-amount">{fmtEuro(item.priceGross)}</strong>
              </span>
            </button>
          ))}
        </div>
      </div>

      <section className="card restaurant-cart">
        <div className="section-head">
          <div className="restaurant-cart-title">
            <span className="stat-icon"><ShoppingCart size={18} /></span>
            <span className="list-main">
              <h2>Kundenschalter-Bon</h2>
              <small className="muted">
                {orderType === "theke" ? "Thekenverkauf" : "Abholung / Takeaway"}
              </small>
            </span>
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-button restaurant-danger">
              <Trash2 size={15} />
              Leeren
            </button>
          )}
        </div>

        {orderType === "abholung" && (
          <div className="grid form-grid restaurant-customer">
            <input
              type="text"
              placeholder="Kundenname (optional)"
              aria-label="Kundenname"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Telefon (optional)"
              aria-label="Telefon"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>
        )}

        {cart.length === 0 ? (
          <div className="restaurant-empty">
            <UtensilsCrossed size={28} aria-hidden />
            <strong>Noch keine Artikel im Schalter-Bon</strong>
            <p className="muted small">
              Klicke auf Gerichte oder Getränke links, um sie hinzuzufügen.
            </p>
          </div>
        ) : (
          <div className="restaurant-lines">
            {cart.map((item, idx) => (
              <div key={item.id} className="restaurant-cart-line">
                <div className="restaurant-split">
                  <span className="list-main">
                    <strong>{item.name}</strong>
                    <small className="muted">
                      {fmtEuro(item.unitPriceGross)} / Stk. · {item.taxRate}% MwSt
                    </small>
                  </span>
                  <strong className="restaurant-amount">{fmtEuro(item.unitPriceGross * item.quantity)}</strong>
                </div>

                <div className="restaurant-split">
                  <input
                    type="text"
                    placeholder="Sonderwunsch (z.B. ohne Eis)..."
                    aria-label="Sonderwunsch"
                    value={item.note || ""}
                    onChange={(e) => updateItemNote(idx, e.target.value)}
                    className="restaurant-note-input"
                  />
                  <div className="restaurant-qty">
                    <button onClick={() => updateQuantity(idx, -1)} aria-label="Weniger">
                      <Minus size={15} />
                    </button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQuantity(idx, 1)} aria-label="Mehr">
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="repair-totals">
          <p className="muted">
            <span>Nettobetrag</span>
            <span>{fmtEuro(totalNet)}</span>
          </p>
          {tax7 > 0 && (
            <p className="muted">
              <span>MwSt. 7% (Speisen außer Haus)</span>
              <span>{fmtEuro(tax7)}</span>
            </p>
          )}
          {tax19 > 0 && (
            <p className="muted">
              <span>MwSt. 19% (In-Haus / Getränke)</span>
              <span>{fmtEuro(tax19)}</span>
            </p>
          )}
          <p className="grand">
            <span>Zu zahlen</span>
            <strong>{fmtEuro(totalGross)}</strong>
          </p>
        </div>

        <div className="restaurant-actions">
          <button onClick={() => handleCheckout(true)} disabled={isBusy || cart.length === 0} className="button primary">
            <Banknote size={18} />
            Bezahlen
          </button>
        </div>

        {orderType === "abholung" && (
          <button
            onClick={() => handleCheckout(false)}
            disabled={isBusy || cart.length === 0}
            className="button block restaurant-wrap"
          >
            <ShoppingBag size={18} />
            An Küche senden (Zahlung bei Abholung)
          </button>
        )}
      </section>

      {completedOrder && (
        <Dialog title="Bestellung erfolgreich!" onClose={() => setCompletedOrder(null)}>
          <div className="restaurant-dialog restaurant-success stack">
            <span className="restaurant-success-icon"><CheckCircle2 size={30} /></span>
            <p className="muted">
              Bon-Nr. <strong className="restaurant-code">{completedOrder.orderNumber}</strong>
            </p>

            {completedOrder.pickupNumber && (
              <div className="restaurant-pickup-number">
                <small>Abholnummer für Gast</small>
                <strong>#{completedOrder.pickupNumber}</strong>
              </div>
            )}

            <p className="muted small">
              Betrag: {fmtEuro(completedOrder.totalGross)} · {completedOrder.paymentStatus === "bezahlt" ? "Bezahlt" : "Offen"}
            </p>

            <div className="restaurant-actions">
              <button onClick={() => setPrintType("guest")} className="button">
                <Printer size={17} />
                Gastbeleg
              </button>
              <button onClick={() => setPrintType("kitchen")} className="button">
                <Printer size={17} />
                Küchenbon
              </button>
            </div>

            <button onClick={() => setCompletedOrder(null)} className="button primary block">
              Nächster Kunde
            </button>
          </div>
        </Dialog>
      )}

      {paying && (
        <ModuleCheckout
          source="restaurant"
          kind="order"
          refId={paying.id}
          title={paying.pickupNumber ? `${paying.orderNumber} · #${paying.pickupNumber}` : paying.orderNumber}
          onClose={() => afterPayment(paying)}
          onPaid={() => afterPayment(paying)}
        />
      )}

      {printType && completedOrder && (
        <RestaurantPrint
          order={completedOrder}
          type={printType}
          onClose={() => setPrintType(null)}
        />
      )}
    </div>
  );
}
