import { useEffect, useState } from "react";
import {
  Wrench,
  Car,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
  Check,
  Shield,
  FileText,
} from "lucide-react";
import type { WorkshopOrder, WorkshopOrderStatus } from "../../../shared/workshop";

interface StatusPageProps {
  tenantId: string;
  token: string;
}

const PHASES: { id: WorkshopOrderStatus; label: string; desc: string }[] = [
  { id: "annahme", label: "Angenommen", desc: "Fahrzeug in der Werkstatt eingetroffen" },
  { id: "diagnose", label: "Diagnose", desc: "Sichtprüfung & Mängelerfassung" },
  { id: "wartet_teile", label: "Warten auf Teile", desc: "Ersatzteile bestellt / Kostenvoranschlag" },
  { id: "in_arbeit", label: "In Reparatur", desc: "Arbeiten auf der Hebebühne laufen" },
  { id: "endkontrolle", label: "Endkontrolle", desc: "Probefahrt & Meisterprüfung" },
  { id: "abholbereit", label: "Abholbereit", desc: "Fahrzeug fertiggestellt zur Abholung" },
];

export default function WorkshopStatusPage({ tenantId, token }: StatusPageProps) {
  const [order, setOrder] = useState<WorkshopOrder | null>(null);
  const [company, setCompany] = useState<{
    name: string;
    phone?: string;
    email?: string;
    street?: string;
    zip?: string;
    city?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [approving, setApproving] = useState(false);
  const [approvedSuccess, setApprovedSuccess] = useState(false);

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/workshop/public/${tenantId}/status/${token}`);
        if (!res.ok) throw new Error("Status nicht gefunden");
        const data = (await res.json()) as any;
        setOrder(data.order);
        setCompany(data.company);
      } catch (err: any) {
        setErrorMsg(err.message || "Auftragsdaten konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantId, token]);

  const handleApproveEstimate = async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/workshop/public/${tenantId}/approve-estimate/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Freigabe fehlgeschlagen");
      const data = (await res.json()) as any;
      setOrder(data.order);
      setApprovedSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler bei der KVA-Freigabe.");
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center text-slate-500 text-sm">Status wird geladen...</div>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 max-w-md w-full p-8 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Auftrag nicht gefunden</h1>
          <p className="text-xs text-slate-500">
            Der Link ist ungültig oder der Reparaturauftrag wurde bereits archiviert. Bitte wende dich direkt an die Werkstatt.
          </p>
        </div>
      </div>
    );
  }

  const currentIdx = PHASES.findIndex((p) => p.id === order.status);
  const activeIdx = currentIdx >= 0 ? currentIdx : order.status === "abgerechnet" ? PHASES.length : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-16">
      {/* Kopfbereich */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                {company?.name || "Kfz-Meisterbetrieb"}
              </h1>
              <p className="text-xs text-slate-500">Live-Reparaturstatus deines Fahrzeugs</p>
            </div>
          </div>

          {company?.phone && (
            <a
              href={`tel:${company.phone}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-semibold transition-colors border border-blue-200 dark:border-blue-800"
            >
              <Phone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Werkstatt anrufen</span>
            </a>
          )}
        </div>
      </header>

      {/* Hauptbereich */}
      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6 text-xs">
        {/* Fahrzeug-Banner */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="inline-block px-3 py-1 bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-mono font-bold text-lg rounded-lg border border-blue-200 dark:border-blue-800">
              {order.licensePlate}
            </span>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-2">{order.vehicleInfo}</h2>
            <p className="text-slate-500 mt-0.5">
              Auftrags-Nr. <span className="font-mono">{order.orderNumber}</span> · KM-Stand:{" "}
              <span className="font-mono">{order.mileage.toLocaleString("de-DE")} km</span>
            </p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[11px] text-slate-400 block">Kunde:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{order.customerName}</span>
          </div>
        </div>

        {/* Status-Phasenleiste */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Reparaturfortschritt</h3>
            <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
              {order.status === "abholbereit"
                ? "✓ Bereit zur Abholung"
                : order.status === "in_arbeit"
                ? "Auf Hebebühne in Arbeit"
                : order.status === "wartet_teile"
                ? "Warten auf Teile"
                : "In Bearbeitung"}
            </span>
          </div>

          {/* Phasenleiste */}
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
            {PHASES.map((p, idx) => {
              const isPast = idx < activeIdx;
              const isCurrent = idx === activeIdx;
              return (
                <div key={p.id} className="relative flex items-start gap-3">
                  <div
                    className={`absolute -left-6 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                      isPast
                        ? "bg-blue-600 border-blue-600 text-white"
                        : isCurrent
                        ? "bg-white dark:bg-slate-900 border-blue-600 text-blue-600 ring-4 ring-blue-100 dark:ring-blue-950"
                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-400"
                    }`}
                  >
                    {isPast ? "✓" : idx + 1}
                  </div>
                  <div>
                    <p
                      className={`font-semibold ${
                        isCurrent
                          ? "text-blue-600 dark:text-blue-400 text-sm"
                          : isPast
                          ? "text-slate-900 dark:text-slate-100"
                          : "text-slate-400"
                      }`}
                    >
                      {p.label}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{p.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Diagnose & Mängelbeschreibung */}
        {(order.issueDescription || order.diagnosticNotes) && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Auftrags- & Diagnoseprotokoll</h3>
            {order.issueDescription && (
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Kundenauftrag
                </span>
                <p className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-slate-700 dark:text-slate-300">
                  {order.issueDescription}
                </p>
              </div>
            )}
            {order.diagnosticNotes && (
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                  Werkstattbefund
                </span>
                <p className="p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 rounded-xl text-slate-800 dark:text-slate-200">
                  {order.diagnosticNotes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Kostenvoranschlag & Freigabe */}
        {order.positions.length > 0 && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Kostenaufstellung & Positionen</h3>
                <p className="text-[11px] text-slate-500">Transparente Übersicht aller Arbeitswerte und Ersatzteile</p>
              </div>
              <span className="font-mono text-base font-bold text-blue-600 dark:text-blue-400">
                {fmtEuro(order.totalGross)}
              </span>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Leistung / Teil</th>
                    <th className="py-2 px-3 font-semibold text-right">Menge</th>
                    <th className="py-2 px-3 font-semibold text-right">Betrag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {order.positions.map((pos) => (
                    <tr key={pos.id}>
                      <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">{pos.name}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                        {pos.quantity} {pos.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {fmtEuro(pos.quantity * pos.unitPriceNet * (1 + pos.taxRate / 100))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center text-xs pt-2">
              <span className="text-slate-500">Inklusive 19% gesetzlicher Mehrwertsteuer</span>
              <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
                Gesamtkosten: {fmtEuro(order.totalGross)}
              </span>
            </div>

            {/* Freigabebutton */}
            {order.estimateStatus !== "approved" && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-900 dark:text-amber-200">
                      Freigabe durch den Kunden erforderlich
                    </h4>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                      Bitte bestätige die Reparaturpositionen, damit die Werkstatt die Ersatzteile montieren kann.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleApproveEstimate}
                  disabled={approving}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 text-xs"
                >
                  <Check className="w-4 h-4" />
                  {approving ? "Wird übermittelt..." : "Reparatur & Kostenvoranschlag jetzt freigeben"}
                </button>
              </div>
            )}

            {approvedSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Vielen Dank! Deine Freigabe wurde erfolgreich an die Werkstatt übermittelt.</span>
              </div>
            )}
          </div>
        )}

        {/* Werkstattkontakt */}
        {company && (
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-200">{company.name}</p>
              {company.street && company.zip && company.city && (
                <p className="text-[11px]">
                  {company.street}, {company.zip} {company.city}
                </p>
              )}
            </div>
            {company.phone && (
              <a
                href={`tel:${company.phone}`}
                className="font-mono text-blue-600 dark:text-blue-400 font-semibold text-xs"
              >
                {company.phone}
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
