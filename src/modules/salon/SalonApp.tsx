import { useState } from "react";
import { Calendar, Scissors, Users, Settings2, Plus, Sparkles, ShoppingCart, ListOrdered } from "lucide-react";
import type { Me } from "../../api";
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
import { ModuleCheckout } from "../../pos/ModuleCheckout";
import "./salon.css";

export const BASE = "/app/friseur";

export default function SalonApp({ me, path }: { me: Me; path: string }) {
  const { s, appText } = useSalonI18n();
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

      {/* Abrechnen über die Kasse der Plattform: Preise und Steuersätze vom Server, Beleg mit Nummer */}
      {checkoutApp && (
        <ModuleCheckout
          source="salon"
          kind="appointment"
          refId={checkoutApp.id}
          title={checkoutApp.clientName}
          onClose={() => setCheckoutApp(null)}
          onPaid={() => {
            setCheckoutApp(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
