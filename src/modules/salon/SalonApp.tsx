import { useState } from "react";
import { Calendar, Clock, Scissors, Users, Settings2, Plus, Sparkles, ShoppingCart, Palette, ListOrdered, CheckCircle2, Printer, CreditCard, Banknote, ArrowRight } from "lucide-react";
import { api, type Me } from "../../api";
import { AppIcon, Link } from "../../components";
import { navigate } from "../../router";
import { findApp } from "../../../shared/apps";
import { POS_APP_ID } from "../../../shared/pos";
import type { SalonAppointment } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";
import { CalendarTab } from "./CalendarTab";
import { AppointmentsTab } from "./AppointmentsTab";
import { ClientsTab } from "./ClientsTab";
import { ServicesTab } from "./ServicesTab";
import { StaffTab } from "./StaffTab";
import { SettingsTab } from "./SettingsTab";
import { SalonReceiptPrint } from "./SalonReceiptPrint";
import "./salon.css";

export const BASE = "/app/friseur";

export default function SalonApp({ me, path }: { me: Me; path: string }) {
  const { s, appText, euro } = useSalonI18n();
  const app = findApp("friseur")!;
  const isManager = me.user.role !== "staff";
  const hasPos = me.installedApps.includes(POS_APP_ID);

  // Sub-path routing: /app/friseur/:section
  const [, , , section] = path.split("/");

  const SECTIONS: Record<string, string> = {
    termine: "appointments",
    kunden: "clients",
    leistungen: "services",
    team: "staff",
    einstellungen: "settings",
  };

  const tab = SECTIONS[section ?? ""] ?? "calendar";

  const [checkoutApp, setCheckoutApp] = useState<SalonAppointment | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<{
    appointment: SalonAppointment;
    payMethod: "bar" | "karte";
  } | null>(null);
  const [printApp, setPrintApp] = useState<{
    appointment: SalonAppointment;
    payMethod: "bar" | "karte";
  } | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs = [
    { id: "calendar", to: BASE, label: s("tabs.calendar"), icon: Calendar },
    { id: "appointments", to: `${BASE}/termine`, label: s("tabs.appointments"), icon: ListOrdered },
    { id: "clients", to: `${BASE}/kunden`, label: s("tabs.clients"), icon: Users },
    { id: "services", to: `${BASE}/leistungen`, label: s("tabs.services"), icon: Scissors },
    { id: "staff", to: `${BASE}/team`, label: s("tabs.staff"), icon: Sparkles },
    ...(isManager ? [{ id: "settings", to: `${BASE}/einstellungen`, label: s("tabs.settings"), icon: Settings2 }] : []),
  ];

  const handleCheckoutAppointment = (appToCheckout: SalonAppointment) => {
    setCheckoutApp(appToCheckout);
  };

  const executeCheckout = async (method: "bar" | "karte") => {
    if (!checkoutApp) return;
    setCheckoutBusy(true);
    try {
      await api(`/salon/appointments/${checkoutApp.id}/checkout`, { method: "POST" });
      const completedApp = { ...checkoutApp, status: "completed" as const, paid: true };
      setCheckoutSuccess({
        appointment: completedApp,
        payMethod: method,
      });
      setCheckoutApp(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <div className="stack-lg salon">
      <header className="page-head with-icon salon-head">
        <AppIcon app={app} size="lg" />
        <div>
          <h1 className="display">{appText(app.id).name}</h1>
          <p className="muted">{appText(app.id).tagline}</p>
        </div>
        <div className="row gap salon-actions push-end">
          {hasPos && (
            <Link to="/kasse" className="button" title="Zur Kasse wechseln">
              <ShoppingCart size={17} /> Kasse
            </Link>
          )}
          <button
            className="button primary"
            onClick={() => {
              navigate(BASE);
            }}
          >
            <Plus size={18} /> {s("actions.newAppointment")}
          </button>
        </div>
      </header>

      {/* Horizontale Wisch-Tabs */}
      <div className="page-tabs salon-tabs" role="tablist">
        {tabs.map(({ id: tabId, to, label, icon: Icon }) => (
          <button
            key={tabId}
            role="tab"
            aria-selected={tab === tabId}
            className={tab === tabId ? "active" : ""}
            onClick={() => navigate(to)}
          >
            <Icon size={17} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab === "calendar" && (
        <CalendarTab
          key={refreshKey}
          isManager={isManager}
          onNavigateToCheckout={handleCheckoutAppointment}
        />
      )}

      {tab === "appointments" && (
        <AppointmentsTab
          key={refreshKey}
          isManager={isManager}
          onNavigateToCheckout={handleCheckoutAppointment}
          onOpenNewAppointment={() => navigate(BASE)}
        />
      )}

      {tab === "clients" && <ClientsTab isManager={isManager} />}

      {tab === "services" && <ServicesTab isManager={isManager} />}

      {tab === "staff" && <StaffTab isManager={isManager} />}

      {tab === "settings" && isManager && <SettingsTab />}

      {/* Checkout / Kassen-Dialog */}
      {checkoutApp && (
        <div className="salon-modal-overlay" onClick={() => setCheckoutApp(null)}>
          <div className="salon-modal" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="salon-modal-head">
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={18} style={{ color: "var(--accent)" }} />
                Termin abrechnen
              </h3>
              <button className="icon-button" onClick={() => setCheckoutApp(null)}>
                ×
              </button>
            </div>

            <div className="card" style={{ padding: "16px", display: "grid", gap: "10px", background: "var(--panel-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong style={{ fontSize: "1.05rem", display: "block" }}>{checkoutApp.clientName}</strong>
                  <span className="small muted">Stylist: {checkoutApp.staffName}</span>
                </div>
                <span className="pill success">Behandlung fertig</span>
              </div>

              <div style={{ borderTop: "1px solid var(--line)", paddingTop: "10px" }}>
                <span className="small muted" style={{ fontWeight: 600 }}>Erbrachte Leistungen:</span>
                <ul style={{ margin: "6px 0", paddingLeft: "20px", display: "grid", gap: "4px" }}>
                  {checkoutApp.serviceNames.map((sn, i) => (
                    <li key={i} style={{ fontSize: "0.9rem" }}>{sn}</li>
                  ))}
                </ul>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: "10px", fontSize: "1.25rem", fontWeight: 800 }}>
                <span>Gesamtbetrag:</span>
                <span style={{ color: "var(--accent)" }}>{euro(checkoutApp.totalCents)}</span>
              </div>
            </div>

            <div className="stack-sm">
              <p className="small muted" style={{ margin: 0, fontWeight: 600 }}>
                Zahlart wählen:
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <button
                  className="button primary"
                  disabled={checkoutBusy}
                  style={{ minHeight: "46px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                  onClick={() => executeCheckout("bar")}
                >
                  <Banknote size={18} /> Bar bezahlt
                </button>
                <button
                  className="button"
                  disabled={checkoutBusy}
                  style={{ minHeight: "46px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                  onClick={() => executeCheckout("karte")}
                >
                  <CreditCard size={18} /> Kartenzahlung
                </button>
              </div>

              {hasPos && (
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: "12px", marginTop: "4px" }}>
                  <Link
                    to="/kasse"
                    className="button"
                    style={{ width: "100%", justifyContent: "center", gap: "8px" }}
                    onClick={() => {
                      executeCheckout("bar");
                    }}
                  >
                    <ShoppingCart size={16} /> Mit Plattform-Kasse abrechnen & Bon drucken
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Erfolgs-Modal nach Abrechnung mit Bon-Druck */}
      {checkoutSuccess && (
        <div className="salon-modal-overlay" onClick={() => setCheckoutSuccess(null)}>
          <div className="salon-modal" style={{ maxWidth: "440px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "color-mix(in srgb, var(--success) 15%, var(--panel))", color: "var(--success)", display: "grid", placeItems: "center", margin: "0 auto" }}>
              <CheckCircle2 size={30} />
            </div>

            <h3 style={{ margin: "4px 0" }}>Abrechnung erfolgreich!</h3>
            <p className="muted" style={{ margin: 0, fontSize: "0.92rem" }}>
              Die Zahlung über <strong>{euro(checkoutSuccess.appointment.totalCents)}</strong> ({checkoutSuccess.payMethod === "bar" ? "Bar" : "Karte"}) wurde erfasst und der Termin als abgeschlossen markiert.
            </p>

            <div className="row gap" style={{ justifyContent: "center", marginTop: "12px", flexWrap: "wrap" }}>
              <button
                className="button primary"
                onClick={() => {
                  setPrintApp(checkoutSuccess);
                  setCheckoutSuccess(null);
                }}
              >
                <Printer size={16} /> Beleg drucken
              </button>
              <button
                className="button"
                onClick={() => setCheckoutSuccess(null)}
              >
                Fertig
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Druckansicht für Beleg / Quittung */}
      {printApp && (
        <SalonReceiptPrint
          appointment={printApp.appointment}
          payMethod={printApp.payMethod}
          onClose={() => setPrintApp(null)}
        />
      )}
    </div>
  );
}
