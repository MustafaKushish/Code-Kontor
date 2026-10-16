import { Printer, X, Utensils, Coffee, CheckCircle2 } from "lucide-react";
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-2xl shadow-2xl max-w-xl w-full p-8 max-h-[90vh] overflow-y-auto relative print:m-0 print:p-0 print:shadow-none print:max-w-none">
        {/* Controls - im Druck ausgeblendet */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">
              {isGuest ? "Bewirtungsbeleg / Gastrechnung" : isBar ? "Schank- / Barbon" : "Küchenbon"}
            </span>
            <span className="text-xs text-slate-500 font-mono">({order.orderNumber})</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Printer className="w-4 h-4" />
              Jetzt drucken
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BON / BELEG DOKUMENT */}
        <div className="space-y-4 text-xs font-mono text-slate-800">
          {/* Kopfzeile */}
          <div className="text-center border-b border-dashed border-slate-300 pb-3">
            <h2 className="text-base font-bold text-slate-900 uppercase tracking-wider">
              {isGuest ? company?.name || "Restaurant & Café" : isBar ? "*** SCHANKBON ***" : "*** KÜCHENBON ***"}
            </h2>
            {isGuest && company?.street && (
              <p className="text-[11px] text-slate-500">
                {company.street}, {company.postalCode} {company.city}
              </p>
            )}
            <div className="flex justify-between items-center text-xs mt-2 pt-2 border-t border-slate-200">
              <span className="font-bold">
                {order.type === "tisch"
                  ? order.tableName || "Tisch"
                  : `Abholung #${order.pickupNumber || order.orderNumber}`}
              </span>
              <span>{new Date(order.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Bon-Nr.: {order.orderNumber}</span>
              <span>{order.type === "abholung" ? "Außer Haus (Takeaway)" : "Im Haus verzehrt"}</span>
            </div>
          </div>

          {/* Positionen */}
          <div className="space-y-2 py-2">
            {filteredItems.map((item) => (
              <div key={item.id} className="flex justify-between items-start text-xs">
                <div className="flex-1 pr-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-sm">{item.quantity}x</span>
                    <span className="font-bold text-slate-900">{item.name}</span>
                  </div>
                  {item.note && (
                    <p className="text-[11px] text-red-600 font-semibold pl-6 mt-0.5">
                      » WUNSCH: {item.note}
                    </p>
                  )}
                  {item.course && item.course !== "Sofort" && (
                    <span className="text-[10px] text-slate-400 pl-6 block">[{item.course}]</span>
                  )}
                </div>
                {isGuest && (
                  <span className="font-bold font-mono">
                    {fmtEuro(item.quantity * item.unitPriceGross)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Gastrechnung: Summen & MwSt-Aufschlüsselung */}
          {isGuest && (
            <div className="border-t border-dashed border-slate-300 pt-3 space-y-1.5">
              <div className="flex justify-between text-slate-600">
                <span>Nettosumme:</span>
                <span>{fmtEuro(order.totalNet)}</span>
              </div>
              {order.totalTax7 > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>MwSt. 7% (Speisen):</span>
                  <span>{fmtEuro(order.totalTax7)}</span>
                </div>
              )}
              {order.totalTax19 > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>MwSt. 19% (Getränke / In-Haus):</span>
                  <span>{fmtEuro(order.totalTax19)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-300">
                <span>GESAMTBETRAG:</span>
                <span>{fmtEuro(order.totalGross)}</span>
              </div>

              {order.paymentStatus === "bezahlt" && (
                <div className="text-center font-bold text-emerald-600 pt-2">
                  *** DANKESCHÖN - VOLLSTÄNDIG BEZAHLT ({order.paymentMethod?.toUpperCase()}) ***
                </div>
              )}

              {/* Bewirtungsangaben für Steuer/Finanzamt */}
              <div className="mt-6 pt-4 border-t border-slate-200 text-[10px] text-slate-600 space-y-2 font-sans">
                <p className="font-bold uppercase tracking-wider text-slate-700">Angaben zu Bewirtungskosten (§ 4 Abs. 5 Ziff. 2 EStG)</p>
                <div className="border-b border-slate-300 pb-2">Tag der Bewirtung: {new Date().toLocaleDateString("de-DE")}</div>
                <div className="border-b border-slate-300 pb-2">Bewirtete Personen (Name): ________________________________________</div>
                <div className="border-b border-slate-300 pb-2">Anlass der Bewirtung: _____________________________________________</div>
                <div className="pt-2 text-right">____________________________________<br />Unterschrift des Gastgebers</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
