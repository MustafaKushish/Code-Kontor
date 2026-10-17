import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import type { RestaurantOrder } from "../../../shared/restaurant";
import type { CompanyProfile } from "../../../shared/company";

interface RestaurantPrintProps {
  order: RestaurantOrder;
  company?: CompanyProfile | null;
  type: "kitchen" | "bar" | "guest";
  onClose: () => void;
}

export function RestaurantPrint({ order, company, type, onClose }: RestaurantPrintProps) {
  const isGuest = type === "guest";
  const isBar = type === "bar";

  const handlePrint = () => {
    window.print();
  };

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  const filteredItems = isGuest
    ? order.items
    : isBar
    ? order.items.filter((i) => i.destination === "bar")
    : order.items.filter((i) => i.destination === "kueche");

  useEffect(() => {
    document.body.classList.add("ck-printing");
    return () => document.body.classList.remove("ck-printing");
  }, []);

  return createPortal(
    <div className="print-layer">
      <div className="print-toolbar">
        <button onClick={handlePrint} className="button primary">
          <Printer size={18} />
          Jetzt drucken
        </button>
        <button onClick={onClose} className="button">
          <X size={18} />
          Schließen
        </button>
      </div>

      <article className="print-sheet restaurant-bon">
        <p className="restaurant-bon-caption">
          {isGuest ? "Bewirtungsbeleg / Gastrechnung" : isBar ? "Schank- / Barbon" : "Küchenbon"} ({order.orderNumber})
        </p>

        <header className="restaurant-bon-head">
          <h1>
            {isGuest ? company?.name || "Restaurant & Café" : isBar ? "*** SCHANKBON ***" : "*** KÜCHENBON ***"}
          </h1>
          {isGuest && company?.street && (
            <p className="restaurant-bon-soft">
              {company.street}, {company.postalCode} {company.city}
            </p>
          )}
          <p className="restaurant-bon-split restaurant-bon-rule">
            <strong>
              {order.type === "tisch"
                ? order.tableName || "Tisch"
                : `Abholung #${order.pickupNumber || order.orderNumber}`}
            </strong>
            <span>{new Date(order.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
          </p>
          <p className="restaurant-bon-split restaurant-bon-soft">
            <span>Bon-Nr.: {order.orderNumber}</span>
            <span>{order.type === "abholung" ? "Außer Haus (Takeaway)" : "Im Haus verzehrt"}</span>
          </p>
        </header>

        <div className="restaurant-bon-lines">
          {filteredItems.map((item) => (
            <div key={item.id} className="restaurant-bon-split">
              <div>
                <p>
                  <strong className="restaurant-bon-qty">{item.quantity}x</strong> <strong>{item.name}</strong>
                </p>
                {item.note && <p className="restaurant-bon-wish">» WUNSCH: {item.note}</p>}
                {item.course && item.course !== "Sofort" && (
                  <p className="restaurant-bon-indent restaurant-bon-soft">[{item.course}]</p>
                )}
              </div>
              {isGuest && <strong>{fmtEuro(item.quantity * item.unitPriceGross)}</strong>}
            </div>
          ))}
        </div>

        {isGuest && (
          <div className="restaurant-bon-totals">
            <p className="restaurant-bon-split restaurant-bon-soft">
              <span>Nettosumme:</span>
              <span>{fmtEuro(order.totalNet)}</span>
            </p>
            {order.totalTax7 > 0 && (
              <p className="restaurant-bon-split restaurant-bon-soft">
                <span>MwSt. 7% (Speisen):</span>
                <span>{fmtEuro(order.totalTax7)}</span>
              </p>
            )}
            {order.totalTax19 > 0 && (
              <p className="restaurant-bon-split restaurant-bon-soft">
                <span>MwSt. 19% (Getränke / In-Haus):</span>
                <span>{fmtEuro(order.totalTax19)}</span>
              </p>
            )}
            <p className="restaurant-bon-split restaurant-bon-grand">
              <span>GESAMTBETRAG:</span>
              <span>{fmtEuro(order.totalGross)}</span>
            </p>

            {order.paymentStatus === "bezahlt" && (
              <p className="restaurant-bon-paid">
                *** DANKESCHÖN - VOLLSTÄNDIG BEZAHLT ({order.paymentMethod?.toUpperCase()}) ***
              </p>
            )}

            <div className="restaurant-bon-hospitality">
              <p><strong>Angaben zu Bewirtungskosten (§ 4 Abs. 5 Ziff. 2 EStG)</strong></p>
              <p className="restaurant-bon-field">Tag der Bewirtung: {new Date().toLocaleDateString("de-DE")}</p>
              <p className="restaurant-bon-field">Bewirtete Personen (Name): ________________________________________</p>
              <p className="restaurant-bon-field">Anlass der Bewirtung: _____________________________________________</p>
              <p className="restaurant-bon-sign">____________________________________<br />Unterschrift des Gastgebers</p>
            </div>
          </div>
        )}
      </article>
    </div>,
    document.body,
  );
}
