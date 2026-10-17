import { useState } from "react";
import { Calendar, Scissors, Users, Settings2, Plus, Sparkles, ShoppingCart, ListOrdered, CheckCircle2, Printer, CreditCard, Banknote } from "lucide-react";
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
import { Dialog } from "../../pos/ui";
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
        <div className="row gap push-end">
          {hasPos && (
            <Link to="/kasse" className="button" title="Zur Kasse wechseln">
              <ShoppingCart size={18} /> Kasse
            </Link>
          )}
          <button className="button primary" onClick={() => navigate(BASE)}>
            <Plus size={18} /> {s("actions.newAppointment")}
          </button>
        </div>
      </header>

      <div className="page-tabs" role="tablist">
        {tabs.map(({ id: tabId, to, label, icon: Icon }) => (
          <button key={tabId} role="tab" aria-selected={tab === tabId} className={tab === tabId ? "active" : ""} onClick={() => navigate(to)}>
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
        <Dialog title="Termin abrechnen" onClose={() => setCheckoutApp(null)}>
          <div className="salon-dialog stack">
            <div className="section-head">
              <span className="list-main">
                <strong>{checkoutApp.clientName}</strong>
                <small className="muted">Stylist: {checkoutApp.staffName}</small>
              </span>
              <span className="pill success">Behandlung fertig</span>
            </div>

            <div className="stack-sm">
              <small className="muted">Erbrachte Leistungen:</small>
              <ul>
                {checkoutApp.serviceNames.map((sn, i) => (
                  <li key={i}>{sn}</li>
                ))}
              </ul>
            </div>

            <div className="salon-total">
              <span>Gesamtbetrag:</span>
              <strong>{euro(checkoutApp.totalCents)}</strong>
            </div>

            <div className="stack-sm">
              <small className="muted">Zahlart wählen:</small>
              <div className="grid">
                <button className="button primary" disabled={checkoutBusy} onClick={() => executeCheckout("bar")}>
                  <Banknote size={18} /> Bar bezahlt
                </button>
                <button className="button" disabled={checkoutBusy} onClick={() => executeCheckout("karte")}>
                  <CreditCard size={18} /> Kartenzahlung
                </button>
              </div>
            </div>

            {hasPos && (
              <Link
                to="/kasse"
                className="button block"
                onClick={() => {
                  executeCheckout("bar");
                }}
              >
                <ShoppingCart size={17} /> Mit Plattform-Kasse abrechnen & Bon drucken
              </Link>
            )}
          </div>
        </Dialog>
      )}

      {/* Erfolgs-Dialog nach Abrechnung mit Bon-Druck */}
      {checkoutSuccess && (
        <Dialog title="Abrechnung erfolgreich!" onClose={() => setCheckoutSuccess(null)}>
          <div className="salon-dialog stack salon-done">
            <span className="salon-done-icon"><CheckCircle2 size={30} /></span>
            <p className="muted">
              Die Zahlung über <strong>{euro(checkoutSuccess.appointment.totalCents)}</strong> ({checkoutSuccess.payMethod === "bar" ? "Bar" : "Karte"}) wurde erfasst und der Termin als abgeschlossen markiert.
            </p>
            <div className="row wrap gap">
              <button
                className="button primary"
                onClick={() => {
                  setPrintApp(checkoutSuccess);
                  setCheckoutSuccess(null);
                }}
              >
                <Printer size={17} /> Beleg drucken
              </button>
              <button className="button" onClick={() => setCheckoutSuccess(null)}>
                Fertig
              </button>
            </div>
          </div>
        </Dialog>
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
