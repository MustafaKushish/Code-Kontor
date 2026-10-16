import { Printer, X, HardHat, CheckCircle2, ShieldCheck } from "lucide-react";
import type { CraftReport } from "../../../shared/craft";
import type { CompanyProfile } from "../../../shared/company";

interface CraftPrintProps {
  report: CraftReport;
  company?: CompanyProfile | null;
  onClose: () => void;
}

export function CraftPrint({ report, company, onClose }: CraftPrintProps) {
  const handlePrint = () => {
    window.print();
  };

  const fmtEuro = (amount?: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full p-8 max-h-[92vh] overflow-y-auto relative print:m-0 print:p-0 print:shadow-none print:max-w-none">
        {/* Controls - im Druck ausgeblendet */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 text-sm">
              Arbeitsbericht & Rapportzettel ({report.reportNumber})
            </span>
            <span className="text-xs text-slate-500 font-mono">
              · {report.status === "unterschrieben" ? "Kunde hat unterschrieben" : report.status}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <Printer className="w-4 h-4" />
              Drucken / PDF speichern
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* DIN-A4 DOKUMENT */}
        <div className="space-y-6 text-xs text-slate-800 font-sans">
          {/* Briefkopf */}
          <div className="flex justify-between items-start pb-6 border-b-2 border-amber-500">
            <div>
              <div className="flex items-center gap-2 text-amber-600 font-bold text-lg">
                <HardHat className="w-6 h-6" />
                <span>{company?.name || "Meisterbetrieb Handwerk & Montage"}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {company?.legalForm || "GmbH & Co. KG"} · Meisterbetrieb des Handwerks
              </p>
              {company?.street && (
                <p className="text-[11px] text-slate-500">
                  {company.street}, {company.postalCode} {company.city}
                </p>
              )}
            </div>

            <div className="text-right space-y-1 text-[11px]">
              <span className="font-mono font-bold text-base text-slate-900 block">
                {report.reportNumber}
              </span>
              <p className="text-slate-500">Datum: {new Date(report.date).toLocaleDateString("de-DE")}</p>
              <p className="text-slate-500">Monteur: {report.workerName}</p>
            </div>
          </div>

          {/* Bauvorhaben & Bauherr */}
          <div className="grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-1">
                Auftraggeber / Bauherr
              </span>
              <h4 className="font-bold text-sm text-slate-900">{report.customerName}</h4>
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-1">
                Bauvorhaben & Einsatzort
              </span>
              <h4 className="font-bold text-sm text-slate-900">{report.projectTitle}</h4>
              <p className="text-slate-600 mt-0.5">{report.siteAddress}</p>
            </div>
          </div>

          {/* Tätigkeitsbeschreibung */}
          <div>
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-1.5">
              Ausgeführte Arbeiten & Leistungen
            </span>
            <div className="p-3.5 bg-white border border-slate-200 rounded-xl text-xs leading-relaxed text-slate-800">
              {report.workDescription || "Montage- und Installationsarbeiten nach Aufmaß und Abstimmung vor Ort."}
            </div>
          </div>

          {/* Positionen-Tabelle */}
          <div>
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-2">
              Leistungs- & Materialnachweis
            </span>
            <table className="w-full text-left border-collapse border border-slate-200 rounded-lg overflow-hidden text-xs">
              <thead className="bg-slate-100 text-slate-600 font-mono text-[11px] uppercase">
                <tr>
                  <th className="p-2.5 border-b border-slate-200">Art</th>
                  <th className="p-2.5 border-b border-slate-200">Bezeichnung</th>
                  <th className="p-2.5 border-b border-slate-200 text-right">Menge</th>
                  <th className="p-2.5 border-b border-slate-200 text-right">Einzel (€)</th>
                  <th className="p-2.5 border-b border-slate-200 text-right">Gesamt Netto (€)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {report.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="p-2.5">
                      <span
                        className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-sans font-bold ${
                          item.type === "lohn" || item.type === "fahrt"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {item.type === "lohn" ? "Lohn" : item.type === "fahrt" ? "Fahrt" : "Material"}
                      </span>
                    </td>
                    <td className="p-2.5 font-sans font-medium text-slate-900">{item.name}</td>
                    <td className="p-2.5 text-right font-semibold">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="p-2.5 text-right text-slate-500">{fmtEuro(item.unitPriceNet)}</td>
                    <td className="p-2.5 text-right font-bold text-slate-900">{fmtEuro(item.totalNet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summen & § 35a Steuer-Hinweis */}
          <div className="grid grid-cols-2 gap-6 pt-2 items-start">
            {/* § 35a EStG Handwerkerleistungen Hinweis */}
            <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <span>Steuerlicher Nachweis nach § 35a EStG</span>
              </div>
              <p className="text-[11px] text-amber-900/80 leading-normal">
                In den Gesamtkosten sind <strong>{fmtEuro(report.totalWageNet * 1.19)} brutto</strong> an begünstigten
                Handwerker-Arbeits- und Fahrtkosten enthalten (20% direkter Abzug von der tariflichen Einkommensteuer).
              </p>
            </div>

            {/* Summen-Block */}
            <div className="space-y-1.5 font-mono text-xs text-right">
              <div className="flex justify-between text-slate-600">
                <span>Reine Lohnkosten (§ 35a):</span>
                <span>{fmtEuro(report.totalWageNet)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Material- & Gerätekosten:</span>
                <span>{fmtEuro(report.totalMaterialNet)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Gesamt Netto:</span>
                <span>{fmtEuro(report.totalWageNet + report.totalMaterialNet)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>MwSt. (19 %):</span>
                <span>{fmtEuro(report.totalTax)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-slate-900 pt-2 border-t-2 border-slate-900">
                <span>Gesamtbetrag Brutto:</span>
                <span className="text-amber-700">{fmtEuro(report.totalGross)}</span>
              </div>
            </div>
          </div>

          {/* Unterschriften-Feld */}
          <div className="pt-6 border-t border-slate-200 grid grid-cols-2 gap-8">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-2">
                Ausgeführt durch (Monteur / Betrieb)
              </span>
              <div className="h-20 border-b border-slate-300 flex items-end pb-1 font-mono text-xs">
                {report.workerName}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Datum, Unterschrift Auftragnehmer</span>
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 block mb-2">
                Abnahme durch Auftraggeber / Bauherr
              </span>
              <div className="h-20 border-b border-slate-300 flex items-center justify-center relative overflow-hidden bg-slate-50/50">
                {report.signatureDataUrl ? (
                  <img
                    src={report.signatureDataUrl}
                    alt="Kundenunterschrift"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-[11px] text-slate-400 italic">Noch nicht unterzeichnet</span>
                )}
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>{report.signedByName || report.customerName}</span>
                {report.signedAt && (
                  <span>Signiert am: {new Date(report.signedAt).toLocaleDateString("de-DE")}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
