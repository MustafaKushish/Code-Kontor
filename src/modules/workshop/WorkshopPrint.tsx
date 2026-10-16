import { Printer, X, Wrench, CheckCircle2, Car, Shield } from "lucide-react";
import type { WorkshopOrder } from "../../../shared/workshop";
import type { CompanyProfile } from "../../../shared/company";

interface WorkshopPrintProps {
  order: WorkshopOrder;
  company?: CompanyProfile | null;
  type: "intake" | "invoice";
  onClose: () => void;
}

export function WorkshopPrint({ order, company, type, onClose }: WorkshopPrintProps) {
  const isInvoice = type === "invoice";

  const handlePrint = () => {
    window.print();
  };

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full p-8 max-h-[90vh] overflow-y-auto relative print:m-0 print:p-0 print:shadow-none print:max-w-none">
        {/* Controls - versteckt im Druck */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">
              {isInvoice ? "Werkstattrechnung drucken" : "Werkstattauftrag & Annahmeschein"}
            </span>
            <span className="text-xs text-slate-500 font-mono">({order.orderNumber})</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
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

        {/* Druckdokument im DIN-A4-Format */}
        <div className="space-y-6 text-sm text-slate-800">
          {/* Briefkopf */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {company?.name || "Kfz-Meisterbetrieb & Service"}
              </h2>
              <p className="text-xs text-slate-500">
                {company?.legalForm ? `${company.name} ${company.legalForm}` : "Kfz-Reparaturen & Fahrzeughandel"}
              </p>
              <div className="mt-2 text-xs text-slate-600 space-y-0.5">
                {company?.street && <p>{company.street}</p>}
                {company?.postalCode && company?.city && (
                  <p>
                    {company.postalCode} {company.city}
                  </p>
                )}
                {company?.phone && <p>Tel: {company.phone}</p>}
                {company?.email && <p>E-Mail: {company.email}</p>}
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-slate-100 rounded text-xs font-bold uppercase tracking-wider text-slate-700">
                {isInvoice ? "Rechnung" : "Werkstattauftrag"}
              </span>
              <div className="mt-3 text-xs text-slate-600 space-y-1">
                <p>
                  <span className="text-slate-500">Auftrags-Nr.:</span>{" "}
                  <span className="font-mono font-bold text-slate-900">{order.orderNumber}</span>
                </p>
                <p>
                  <span className="text-slate-500">Datum:</span>{" "}
                  {new Date(order.createdAt).toLocaleDateString("de-DE")}
                </p>
                <p>
                  <span className="text-slate-500">Hebebühne:</span> {order.liftBay}
                </p>
                {order.mechanicName && (
                  <p>
                    <span className="text-slate-500">Mechaniker:</span> {order.mechanicName}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Empfänger / Kunde & Fahrzeugdaten */}
          <div className="grid grid-cols-2 gap-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Kunde / Halter</p>
              <p className="font-semibold text-slate-900">{order.customerName}</p>
              <p className="text-xs text-slate-600">{order.customerPhone}</p>
              {order.customerEmail && <p className="text-xs text-slate-600">{order.customerEmail}</p>}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Fahrzeugdaten</p>
              <p className="font-bold text-blue-600 font-mono text-base">{order.licensePlate}</p>
              <p className="font-medium text-slate-800">{order.vehicleInfo}</p>
              <p className="text-xs text-slate-600">
                Kilometerstand: <span className="font-mono">{order.mileage.toLocaleString("de-DE")} km</span>
              </p>
            </div>
          </div>

          {/* Beanstandung / Auftrag */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Kundenauftrag / Beanstandung
            </p>
            <div className="p-3 bg-white rounded-lg border border-slate-200 text-slate-700">
              {order.issueDescription || "Regulärer Inspektions- und Wartungsauftrag."}
            </div>
          </div>

          {/* Diagnose / Befund falls vorhanden */}
          {order.diagnosticNotes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Werkstatt-Diagnose & Befund
              </p>
              <div className="p-3 bg-white rounded-lg border border-slate-200 text-slate-700 text-xs">
                {order.diagnosticNotes}
              </div>
            </div>
          )}

          {/* Checkliste / Dialogannahme (nur auf Werkstattauftrag) */}
          {!isInvoice && order.checklist && order.checklist.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Dialogannahme & Inspektionsbefund
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {order.checklist.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
                    <span className="font-medium">{item.name}</span>
                    <span
                      className={`font-semibold ${
                        item.status === "ok"
                          ? "text-emerald-600"
                          : item.status === "warning"
                          ? "text-amber-600"
                          : "text-red-600"
                      }`}
                    >
                      {item.status === "ok" ? "OK" : item.status === "warning" ? "Hinweis" : "Mangel"}
                      {item.value ? ` (${item.value})` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Positionstabelle */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Leistungspositionen & Ersatzteile
            </p>
            <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="py-2 px-3 font-semibold">Art / Code</th>
                  <th className="py-2 px-3 font-semibold">Bezeichnung</th>
                  <th className="py-2 px-3 font-semibold text-right">Menge</th>
                  <th className="py-2 px-3 font-semibold text-right">Einzelpreis</th>
                  <th className="py-2 px-3 font-semibold text-right">MwSt</th>
                  <th className="py-2 px-3 font-semibold text-right">Gesamt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {order.positions.map((pos) => {
                  const lineNet = pos.quantity * pos.unitPriceNet;
                  return (
                    <tr key={pos.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-slate-500">
                        {pos.type === "labor" ? "AW" : "ET"} {pos.code || ""}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-900">{pos.name}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {pos.quantity} {pos.unit}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{fmtEuro(pos.unitPriceNet)}</td>
                      <td className="py-2 px-3 text-right font-mono">{pos.taxRate}%</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold">{fmtEuro(lineNet)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summenblock */}
          <div className="flex justify-end pt-4">
            <div className="w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Summe Netto:</span>
                <span className="font-mono">{fmtEuro(order.totalNet)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>MwSt. (19%):</span>
                <span className="font-mono">{fmtEuro(order.totalTax)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-300">
                <span>Gesamtbetrag:</span>
                <span className="font-mono text-blue-600">{fmtEuro(order.totalGross)}</span>
              </div>
              {order.paymentStatus === "bezahlt" && (
                <div className="text-right text-emerald-600 font-semibold text-xs pt-1">
                  ✓ Betrag vollständig bezahlt ({order.paymentMethod?.toUpperCase()})
                </div>
              )}
            </div>
          </div>

          {/* Unterschriftenblock (für Werkstattauftrag) */}
          {!isInvoice && (
            <div className="pt-8 border-t border-slate-200 grid grid-cols-2 gap-8 text-xs text-slate-500">
              <div>
                <p className="mb-8">Auftrag erteilt und Probefahrt gestattet:</p>
                <div className="border-b border-slate-400"></div>
                <p className="mt-1">Datum, Unterschrift Auftraggeber</p>
              </div>
              <div>
                <p className="mb-8">Fahrzeug angenommen durch Werkstatt:</p>
                <div className="border-b border-slate-400"></div>
                <p className="mt-1">Datum, Unterschrift Serviceberater</p>
              </div>
            </div>
          )}

          {/* Fußzeile */}
          {company && (
            <div className="pt-6 border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
              <div>
                {company.taxNumber && <span>St.-Nr.: {company.taxNumber} </span>}
                {company.vatId && <span>· USt-IdNr.: {company.vatId} </span>}
              </div>
              <div>
                {company.iban && <span>IBAN: {company.iban} </span>}
                {company.bic && <span>· BIC: {company.bic}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
