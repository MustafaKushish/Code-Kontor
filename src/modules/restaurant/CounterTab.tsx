import { useState } from "react";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Banknote,
  CreditCard,
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
import { RestaurantPrint } from "./RestaurantPrint";

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
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

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
    // Wenn Takeaway gewählt ist, gilt für Speisen ermäßigter Satz 7%
    const effectiveTaxRate =
      orderType === "abholung" && item.category !== "Heißgetränke" && item.category !== "Alkoholfrei" && item.category !== "Bier & Wein" && item.category !== "Cocktails"
        ? 7
        : item.taxRate;

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

  const handleCheckout = async (paymentMethod: "bar" | "karte" | "offen") => {
    if (cart.length === 0) return;
    setIsBusy(true);
    try {
      // 1. Create order
      const orderData = {
        type: orderType,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        guestCount: 1,
        notes: orderNotes.trim() || undefined,
        items: cart,
      };

      const createRes = await api<RestaurantOrder>("/restaurant/orders", {
        method: "POST",
        body: JSON.stringify(orderData),
      });

      // 2. If immediate payment, execute checkout
      let finalOrder = createRes;
      if (paymentMethod !== "offen") {
        finalOrder = await api<RestaurantOrder>(`/restaurant/orders/${createRes.id}/checkout`, {
          method: "POST",
          body: JSON.stringify({ paymentMethod }),
        });
      }

      setCompletedOrder(finalOrder);
      clearCart();
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[750px]">
      {/* Left Column: Touch Item Catalog (7 cols on lg) */}
      <div className="lg:col-span-7 xl:col-span-8 flex flex-col space-y-4">
        {/* Type & Search bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Order Type Toggle */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setOrderType("theke")}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                orderType === "theke"
                  ? "bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              <Coffee className="w-4 h-4" />
              Theke (Im Haus)
            </button>
            <button
              onClick={() => setOrderType("abholung")}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                orderType === "abholung"
                  ? "bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              Abholung / To-Go (7% MwSt)
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Artikel suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Schnellwahl / Favorites */}
        {favorites.length > 0 && !search && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Schnellwahl & Bestseller</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {favorites.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="p-3 rounded-xl bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-left transition-all flex flex-col justify-between min-h-[74px] shadow-xs active:scale-98"
                >
                  <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs line-clamp-1">
                    {item.name}
                  </span>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-mono">
                      {item.itemNumber}
                    </span>
                    <span className="font-mono font-bold text-xs text-amber-800 dark:text-amber-300">
                      {fmtEuro(item.priceGross)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {cat === "alle" ? "Alle Kategorien" : cat}
            </button>
          ))}
        </div>

        {/* Menu Items Grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => addToCart(item)}
              className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-600 hover:shadow-md text-left transition-all flex flex-col justify-between min-h-[96px] group active:scale-98"
            >
              <div>
                <div className="flex items-start justify-between gap-1 mb-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">
                    {item.itemNumber}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                      item.destination === "bar"
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    }`}
                  >
                    {item.destination === "bar" ? "Bar" : "Küche"}
                  </span>
                </div>
                <h4 className="font-semibold text-slate-900 dark:text-white text-xs group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors line-clamp-2">
                  {item.name}
                </h4>
              </div>

              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] text-slate-400">{item.category}</span>
                <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                  {fmtEuro(item.priceGross)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right Column: Active Counter Cart / Checkout (5 cols on lg) */}
      <div className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden">
        {/* Cart Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Kundenschalter-Bon</h3>
              <p className="text-[11px] text-slate-500">
                {orderType === "theke" ? "Thekenverkauf" : "Abholung / Takeaway"}
              </p>
            </div>
          </div>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Leeren
            </button>
          )}
        </div>

        {/* Customer Info for Pickup / Order */}
        {orderType === "abholung" && (
          <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-200/60 dark:border-amber-800/40 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Kundenname (optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
              <input
                type="text"
                placeholder="Telefon (optional)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>
        )}

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <UtensilsCrossed className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-medium">Noch keine Artikel im Schalter-Bon</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Klicke auf Gerichte oder Getränke links, um sie hinzuzufügen.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {cart.map((item, idx) => (
                <div key={item.id} className="py-2.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <div className="flex-1">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {fmtEuro(item.unitPriceGross)} / Stk.
                        </span>
                        <span className="text-[9px] px-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-500">
                          {item.taxRate}% MwSt
                        </span>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {fmtEuro(item.unitPriceGross * item.quantity)}
                    </span>
                  </div>

                  {/* Quantity and Note controls */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Sonderwunsch (z.B. ohne Eis)..."
                      value={item.note || ""}
                      onChange={(e) => updateItemNote(idx, e.target.value)}
                      className="flex-1 px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded italic"
                    />

                    <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-800">
                      <button
                        onClick={() => updateQuantity(idx, -1)}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2 font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(idx, 1)}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Summary & Checkout Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
          {/* Totals */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Nettobetrag</span>
              <span className="font-mono">{fmtEuro(totalNet)}</span>
            </div>
            {tax7 > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>MwSt. 7% (Speisen außer Haus)</span>
                <span className="font-mono">{fmtEuro(tax7)}</span>
              </div>
            )}
            {tax19 > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>MwSt. 19% (In-Haus / Getränke)</span>
                <span className="font-mono">{fmtEuro(tax19)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
              <span>Zu zahlen</span>
              <span className="font-mono text-lg text-amber-600 dark:text-amber-400">
                {fmtEuro(totalGross)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => handleCheckout("bar")}
              disabled={isBusy || cart.length === 0}
              className="flex items-center justify-center gap-2 py-3 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-98"
            >
              <Banknote className="w-4 h-4" />
              Bar kassieren
            </button>
            <button
              onClick={() => handleCheckout("karte")}
              disabled={isBusy || cart.length === 0}
              className="flex items-center justify-center gap-2 py-3 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-98"
            >
              <CreditCard className="w-4 h-4" />
              Kartenzahlung
            </button>
          </div>

          {orderType === "abholung" && (
            <button
              onClick={() => handleCheckout("offen")}
              disabled={isBusy || cart.length === 0}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              An Küche senden (Zahlung bei Abholung)
            </button>
          )}
        </div>
      </div>

      {/* Modal: Order Receipt / Success Popup */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                Bestellung erfolgreich!
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Bon-Nr. <span className="font-mono font-bold">{completedOrder.orderNumber}</span>
              </p>
            </div>

            {completedOrder.pickupNumber && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800">
                <span className="text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-400 tracking-wider block">
                  Abholnummer für Gast
                </span>
                <span className="text-4xl font-extrabold font-mono text-slate-900 dark:text-white block mt-1">
                  #{completedOrder.pickupNumber}
                </span>
              </div>
            )}

            <div className="text-xs text-slate-600 dark:text-slate-300 font-mono">
              Betrag: {fmtEuro(completedOrder.totalGross)} · {completedOrder.paymentStatus === "bezahlt" ? "Bezahlt" : "Offen"}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setPrintType("guest")}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium"
              >
                <Printer className="w-3.5 h-3.5" />
                Gastbeleg
              </button>
              <button
                onClick={() => setPrintType("kitchen")}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium"
              >
                <Printer className="w-3.5 h-3.5" />
                Küchenbon
              </button>
            </div>

            <button
              onClick={() => setCompletedOrder(null)}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              Nächster Kunde
            </button>
          </div>
        </div>
      )}

      {/* Print Overlay */}
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
