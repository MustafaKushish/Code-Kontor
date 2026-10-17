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
import type { OrderPosition, WorkshopOrder, WorkshopOrderStatus } from "../../../shared/workshop";
import { formatMoney } from "../../money";

/** Was die Statusseite vom Server bekommt (ohne Kontaktdaten und Zahlungsdaten). */
type PublicOrder = Pick<WorkshopOrder, "orderNumber" | "licensePlate" | "vehicleInfo" | "mileage" | "customerName" | "status" | "issueDescription" | "diagnosticNotes" | "estimateStatus" | "totalNet" | "totalTax" | "totalGross" | "createdAt" | "updatedAt"> & {
  positions: Pick<OrderPosition, "id" | "name" | "quantity" | "unit" | "unitPriceNet" | "taxRate" | "approvedByCustomer">[];
  paid: boolean;
};
import "./workshop.css";

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
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [currency, setCurrency] = useState("EUR");
  const [approveError, setApproveError] = useState("");
  const [company, setCompany] = useState<{
    name: string;
    phone?: string;
    email?: string;
    street?: string;
    postalCode?: string;
    city?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [approving, setApproving] = useState(false);
  const [approvedSuccess, setApprovedSuccess] = useState(false);

  const fmtEuro = (amount: number) => formatMoney(Math.round(amount * 100), "de-DE", currency);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/workshop/public/${tenantId}/status/${token}`);
        if (!res.ok) throw new Error("Status nicht gefunden");
        const data = (await res.json()) as any;
        setOrder(data.order);
        setCompany(data.company);
        if (data.currency) setCurrency(data.currency);
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
    setApproveError("");
    try {
      const res = await fetch(`/api/workshop/public/${tenantId}/approve-estimate/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Die Freigabe ist nicht mehr möglich. Bitte rufe die Werkstatt an.");
      const data = (await res.json()) as any;
      setOrder(data.order);
      setApprovedSuccess(true);
    } catch (err: any) {
      setApproveError(err.message || "Fehler bei der KVA-Freigabe.");
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="workshop-status-page">
        <p className="muted workshop-center">Status wird geladen...</p>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div className="workshop-status-page">
        <section className="card stack workshop-center">
          <span className="stat-icon warn workshop-status-icon"><AlertTriangle size={22} /></span>
          <h1 className="display">Auftrag nicht gefunden</h1>
          <p className="muted">
            Der Link ist ungültig oder der Reparaturauftrag wurde bereits archiviert. Bitte wende dich direkt an die Werkstatt.
          </p>
        </section>
      </div>
    );
  }

  const currentIdx = PHASES.findIndex((p) => p.id === order.status);
  const activeIdx = currentIdx >= 0 ? currentIdx : order.status === "abgerechnet" ? PHASES.length : 0;

  return (
    <div className="workshop-status-page">
      {/* Kopfbereich */}
      <header className="workshop-status-top">
        <div className="workshop-status-brand">
          <Wrench size={22} />
          <span className="list-main">
            <strong>{company?.name || "Kfz-Meisterbetrieb"}</strong>
            <small className="muted">Live-Reparaturstatus deines Fahrzeugs</small>
          </span>
        </div>
        {company?.phone && (
          <a href={`tel:${company.phone}`} className="button small-button" aria-label="Werkstatt anrufen">
            <Phone size={16} />
            <span className="workshop-hide-phone">Werkstatt anrufen</span>
          </a>
        )}
      </header>

      <main className="stack">
        {/* Fahrzeug-Banner */}
        <section className="card stack workshop-status-hero">
          <span className="workshop-plate-badge">{order.licensePlate}</span>
          <h1 className="display">{order.vehicleInfo}</h1>
          <p className="muted">
            Auftrags-Nr. <span className="workshop-mono">{order.orderNumber}</span> · KM-Stand:{" "}
            <span className="workshop-mono">{order.mileage.toLocaleString("de-DE")} km</span>
          </p>
          <p>
            <span className="muted">Kunde:</span> <strong>{order.customerName}</strong>
          </p>
        </section>

        {/* Status-Phasenleiste */}
        <section className="card stack">
          <div className="section-head">
            <h2>Reparaturfortschritt</h2>
            <span className={order.status === "abholbereit" ? "pill pos" : "pill"}>
              {order.status === "abholbereit"
                ? "✓ Bereit zur Abholung"
                : order.status === "in_arbeit"
                ? "Auf Hebebühne in Arbeit"
                : order.status === "wartet_teile"
                ? "Warten auf Teile"
                : "In Bearbeitung"}
            </span>
          </div>

          <ol className="workshop-phases">
            {PHASES.map((p, idx) => {
              const isPast = idx < activeIdx;
              const isCurrent = idx === activeIdx;
              return (
                <li key={p.id} className={isPast ? "done" : isCurrent ? "current" : ""}>
                  <span className="workshop-phase-bullet">{isPast ? <Check size={14} /> : idx + 1}</span>
                  <span className="list-main">
                    <strong>{p.label}</strong>
                    <small className="muted">{p.desc}</small>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Diagnose & Mängelbeschreibung */}
        {(order.issueDescription || order.diagnosticNotes) && (
          <section className="card stack">
            <h2>Auftrags- & Diagnoseprotokoll</h2>
            {order.issueDescription && (
              <div className="stack-sm">
                <span className="tile-label">Kundenauftrag</span>
                <p className="workshop-panel">{order.issueDescription}</p>
              </div>
            )}
            {order.diagnosticNotes && (
              <div className="stack-sm">
                <span className="tile-label">Werkstattbefund</span>
                <p className="workshop-panel workshop-panel-accent">{order.diagnosticNotes}</p>
              </div>
            )}
          </section>
        )}

        {/* Kostenvoranschlag & Freigabe */}
        {order.positions.length > 0 && (
          <section className="card stack">
            <div className="section-head">
              <div className="stack-sm">
                <h2>Kostenaufstellung & Positionen</h2>
                <small className="muted">Transparente Übersicht aller Arbeitswerte und Ersatzteile</small>
              </div>
              <strong className="workshop-num workshop-big">{fmtEuro(order.totalGross)}</strong>
            </div>

            <div className="workshop-items">
              {order.positions.map((pos) => (
                <div key={pos.id} className="workshop-item">
                  <span className="list-main">
                    <strong>{pos.name}</strong>
                    <small className="muted workshop-mono">
                      {pos.quantity} {pos.unit}
                    </small>
                  </span>
                  <strong className="workshop-num">{fmtEuro(pos.quantity * pos.unitPriceNet * (1 + pos.taxRate / 100))}</strong>
                </div>
              ))}
            </div>

            <div className="workshop-total-line">
              <small className="muted">Inklusive gesetzlicher Mehrwertsteuer</small>
              <strong className="workshop-num">Gesamtkosten: {fmtEuro(order.totalGross)}</strong>
            </div>

            {/* Freigabebutton */}
            {approveError && <p className="error" role="alert">{approveError}</p>}

            {order.estimateStatus !== "approved" && order.estimateStatus !== "rejected" && !order.paid && order.status !== "abgerechnet" && (
              <div className="notice stack-sm">
                <strong className="workshop-icon-text">
                  <AlertTriangle size={17} />
                  Freigabe durch den Kunden erforderlich
                </strong>
                <span>Bitte bestätige die Reparaturpositionen, damit die Werkstatt die Ersatzteile montieren kann.</span>
                <button type="button" onClick={handleApproveEstimate} disabled={approving} className="button primary block">
                  <Check size={18} />
                  {approving ? "Wird übermittelt..." : "Reparatur & Kostenvoranschlag jetzt freigeben"}
                </button>
              </div>
            )}

            {approvedSuccess && (
              <p className="notice success">
                <CheckCircle2 size={17} />
                Vielen Dank! Deine Freigabe wurde erfolgreich an die Werkstatt übermittelt.
              </p>
            )}
          </section>
        )}

        {/* Werkstattkontakt */}
        {company && (
          <section className="card stack-sm">
            {company.phone && (
              <a href={`tel:${company.phone}`} className="button">
                <Phone size={16} />
                {company.phone}
              </a>
            )}
            <p className="muted workshop-small">
              <strong>{company.name}</strong>
              {company.street && company.postalCode && company.city && (
                <>
                  {" · "}
                  {company.street}, {company.postalCode} {company.city}
                </>
              )}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
