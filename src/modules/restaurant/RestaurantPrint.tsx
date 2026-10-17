import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import type { RestaurantOrder } from "../../../shared/restaurant";
import type { CompanyProfile } from "../../../shared/company";
import { api } from "../../api";
import { useRestaurantI18n } from "./i18n";
import { vatSummary } from "./vat";

interface RestaurantPrintProps {
  order: RestaurantOrder;
  company?: CompanyProfile | null;
  type: "kitchen" | "bar" | "guest";
  onClose: () => void;
}

export function RestaurantPrint({ order, company: given, type, onClose }: RestaurantPrintProps) {
  // Firmendaten für den Kopf des Gastbelegs, wie bei den anderen Druckansichten
  const [loaded, setLoaded] = useState<CompanyProfile | null>(null);
  const company = given ?? loaded;
  const isGuest = type === "guest";
  const isBar = type === "bar";
  const { t, euro, time, day, course, payment } = useRestaurantI18n();

  const handlePrint = () => {
    window.print();
  };

  const fmtEuro = euro;

  const filteredItems = isGuest
    ? order.items
    : isBar
    ? order.items.filter((i) => i.destination === "bar")
    : order.items.filter((i) => i.destination === "kueche");

  useEffect(() => {
    document.body.classList.add("ck-printing");
    if (!given) {
      api<{ company: CompanyProfile | null }>("/company")
        .then((d) => setLoaded(d.company))
        .catch(() => {});
    }
    return () => document.body.classList.remove("ck-printing");
  }, []);

  return createPortal(
    <div className="print-layer">
      <div className="print-toolbar">
        <button onClick={handlePrint} className="button primary">
          <Printer size={18} />
          {t("print.printNow")}
        </button>
        <button onClick={onClose} className="button">
          <X size={18} />
          {t("print.close")}
        </button>
      </div>

      <article className="print-sheet restaurant-bon">
        <p className="restaurant-bon-caption">
          {isGuest ? t("print.guestCaption") : isBar ? t("print.barCaption") : t("print.kitchenCaption")} ({order.orderNumber})
        </p>

        <header className="restaurant-bon-head">
          <h1>
            {isGuest ? company?.name || t("app.defaultName") : isBar ? t("print.barHeading") : t("print.kitchenHeading")}
          </h1>
          {isGuest && company?.street && (
            <p className="restaurant-bon-soft">
              {company.street}, {company.postalCode} {company.city}
            </p>
          )}
          <p className="restaurant-bon-split restaurant-bon-rule">
            <strong>
              {order.type === "tisch"
                ? order.tableName || t("print.table")
                : t("print.pickup", { n: order.pickupNumber || order.orderNumber })}
            </strong>
            <span>{time(order.createdAt)}</span>
          </p>
          <p className="restaurant-bon-split restaurant-bon-soft">
            <span>{t("print.ticketNo", { n: order.orderNumber })}</span>
            <span>{order.type === "abholung" ? t("print.takeaway") : t("print.dineIn")}</span>
          </p>
        </header>

        <div className="restaurant-bon-lines">
          {filteredItems.map((item) => (
            <div key={item.id} className="restaurant-bon-split">
              <div>
                <p>
                  <strong className="restaurant-bon-qty">{item.quantity}x</strong> <strong>{item.name}</strong>
                </p>
                {item.note && <p className="restaurant-bon-wish">{t("print.wish", { note: item.note })}</p>}
                {item.course && item.course !== "Sofort" && (
                  <p className="restaurant-bon-indent restaurant-bon-soft">[{course(item.course)}]</p>
                )}
              </div>
              {isGuest && <strong>{fmtEuro(item.quantity * item.unitPriceGross)}</strong>}
            </div>
          ))}
        </div>

        {isGuest && (
          <div className="restaurant-bon-totals">
            <p className="restaurant-bon-split restaurant-bon-soft">
              <span>{t("print.net")}</span>
              <span>{fmtEuro(order.totalNet)}</span>
            </p>
            {vatSummary(order.items).vat.map((v) => (
              <p key={v.rate} className="restaurant-bon-split restaurant-bon-soft">
                <span>{t("common.vat", { rate: v.rate })}</span>
                <span>{fmtEuro(v.amount)}</span>
              </p>
            ))}
            <p className="restaurant-bon-split restaurant-bon-grand">
              <span>{t("print.total")}</span>
              <span>{fmtEuro(order.totalGross)}</span>
            </p>

            {order.paymentStatus === "bezahlt" && (
              <p className="restaurant-bon-paid">
                {t("print.paid", { method: payment(order.paymentMethod).toLocaleUpperCase() })}
              </p>
            )}

            <div className="restaurant-bon-hospitality">
              <p><strong>{t("print.hospitalityTitle")}</strong></p>
              <p className="restaurant-bon-field">{t("print.hospitalityDate", { date: day(new Date()) })}</p>
              <p className="restaurant-bon-field">{t("print.hospitalityGuests")} ________________________________________</p>
              <p className="restaurant-bon-field">{t("print.hospitalityOccasion")} _____________________________________________</p>
              <p className="restaurant-bon-sign">____________________________________<br />{t("print.hostSignature")}</p>
            </div>
          </div>
        )}
      </article>
    </div>,
    document.body,
  );
}
