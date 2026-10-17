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
import { useWorkshopI18n } from "./i18n";

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

// Texte der Phasen kommen aus public.phases.<id>
const PHASES: { id: WorkshopOrderStatus }[] = [
  { id: "annahme" },
  { id: "diagnose" },
  { id: "wartet_teile" },
  { id: "in_arbeit" },
  { id: "endkontrolle" },
  { id: "abholbereit" },
];

export default function WorkshopStatusPage({ tenantId, token }: StatusPageProps) {
  const { t, euro, num, unit } = useWorkshopI18n();
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

  const fmtEuro = (amount: number) => euro(amount, currency);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/workshop/public/${tenantId}/status/${token}`);
        if (!res.ok) throw new Error(t("public.notFound"));
        const data = (await res.json()) as any;
        setOrder(data.order);
        setCompany(data.company);
        if (data.currency) setCurrency(data.currency);
      } catch (err: any) {
        setErrorMsg(err.message || t("public.loadError"));
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
      if (!res.ok) throw new Error(t("public.approveNotPossible"));
      const data = (await res.json()) as any;
      setOrder(data.order);
      setApprovedSuccess(true);
    } catch (err: any) {
      setApproveError(err.message || t("public.approveError"));
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="workshop-status-page">
        <p className="muted workshop-center">{t("public.loading")}</p>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div className="workshop-status-page">
        <section className="card stack workshop-center">
          <span className="stat-icon warn workshop-status-icon"><AlertTriangle size={22} /></span>
          <h1 className="display">{t("public.notFoundTitle")}</h1>
          <p className="muted">
            {t("public.notFoundText")}
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
            <strong>{company?.name || t("public.defaultCompany")}</strong>
            <small className="muted">{t("public.liveStatus")}</small>
          </span>
        </div>
        {company?.phone && (
          <a href={`tel:${company.phone}`} className="button small-button" aria-label={t("public.call")}>
            <Phone size={16} />
            <span className="workshop-hide-phone">{t("public.call")}</span>
          </a>
        )}
      </header>

      <main className="stack">
        {/* Fahrzeug-Banner */}
        <section className="card stack workshop-status-hero">
          <span className="workshop-plate-badge">{order.licensePlate}</span>
          <h1 className="display">{order.vehicleInfo}</h1>
          <p className="muted">
            {t("public.orderNo")} <span className="workshop-mono">{order.orderNumber}</span> · {t("public.mileage")}{" "}
            <span className="workshop-mono">{t("common.km", { n: num(order.mileage) })}</span>
          </p>
          <p>
            <span className="muted">{t("public.customer")}</span> <strong>{order.customerName}</strong>
          </p>
        </section>

        {/* Status-Phasenleiste */}
        <section className="card stack">
          <div className="section-head">
            <h2>{t("public.progress")}</h2>
            <span className={order.status === "abholbereit" ? "pill pos" : "pill"}>
              {order.status === "abholbereit"
                ? t("public.badge.ready")
                : order.status === "in_arbeit"
                ? t("public.badge.inWork")
                : order.status === "wartet_teile"
                ? t("public.badge.waiting")
                : t("public.badge.processing")}
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
                    <strong>{t(`public.phases.${p.id}.label`)}</strong>
                    <small className="muted">{t(`public.phases.${p.id}.desc`)}</small>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Diagnose & Mängelbeschreibung */}
        {(order.issueDescription || order.diagnosticNotes) && (
          <section className="card stack">
            <h2>{t("public.protocol")}</h2>
            {order.issueDescription && (
              <div className="stack-sm">
                <span className="tile-label">{t("public.customerOrder")}</span>
                <p className="workshop-panel">{order.issueDescription}</p>
              </div>
            )}
            {order.diagnosticNotes && (
              <div className="stack-sm">
                <span className="tile-label">{t("public.findings")}</span>
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
                <h2>{t("public.costs")}</h2>
                <small className="muted">{t("public.costsHint")}</small>
              </div>
              <strong className="workshop-num workshop-big">{fmtEuro(order.totalGross)}</strong>
            </div>

            <div className="workshop-items">
              {order.positions.map((pos) => (
                <div key={pos.id} className="workshop-item">
                  <span className="list-main">
                    <strong>{pos.name}</strong>
                    <small className="muted workshop-mono">
                      {num(pos.quantity)} {unit(pos.unit)}
                    </small>
                  </span>
                  <strong className="workshop-num">{fmtEuro(pos.quantity * pos.unitPriceNet * (1 + pos.taxRate / 100))}</strong>
                </div>
              ))}
            </div>

            <div className="workshop-total-line">
              <small className="muted">{t("public.inclVat")}</small>
              <strong className="workshop-num">{t("public.totalCosts", { amount: fmtEuro(order.totalGross) })}</strong>
            </div>

            {/* Freigabebutton */}
            {approveError && <p className="error" role="alert">{approveError}</p>}

            {order.estimateStatus !== "approved" && order.estimateStatus !== "rejected" && !order.paid && order.status !== "abgerechnet" && (
              <div className="notice stack-sm">
                <strong className="workshop-icon-text">
                  <AlertTriangle size={17} />
                  {t("public.approvalRequired")}
                </strong>
                <span>{t("public.approvalText")}</span>
                <button type="button" onClick={handleApproveEstimate} disabled={approving} className="button primary block">
                  <Check size={18} />
                  {approving ? t("public.approving") : t("public.approve")}
                </button>
              </div>
            )}

            {approvedSuccess && (
              <p className="notice success">
                <CheckCircle2 size={17} />
                {t("public.thanks")}
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
