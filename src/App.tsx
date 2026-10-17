import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api, ApiError, setStoredToken, type Me } from "./api";
import { usePath, navigate } from "./router";
import { Shell } from "./layout/Shell";
import { AuthPage } from "./pages/AuthPage";
import { InvitePage, ResetPage, VerifyPage } from "./pages/AccountLinks";
import { SetupWizard } from "./pages/SetupWizard";
import { Overview } from "./pages/Overview";
import { Catalog } from "./pages/Catalog";
import { AppDetail, InstalledApp } from "./pages/AppDetail";
import { Team } from "./pages/Team";
import { Settings } from "./pages/Settings";
import { AccountPage } from "./pages/Account";
import { AccountingPage } from "./pages/Accounting";
import { TimePage } from "./pages/Time";
import { InsightsPage } from "./pages/Insights";
import { setTaxSettings } from "./money";
import { TerminalPage } from "./pages/Terminal";
import { ImprintPage, PrivacyPage } from "./pages/Legal";
import { findApp } from "../shared/apps";
import { POS_APP_ID } from "../shared/pos";

const RepairsApp = lazy(() => import("./modules/repairs/RepairsApp"));
const RepairStatusPage = lazy(() => import("./modules/repairs/StatusPage"));
const RepairBookingPage = lazy(() => import("./modules/repairs/BookingPage"));
const OfficeApp = lazy(() => import("./modules/office/OfficeApp"));
const SalonApp = lazy(() => import("./modules/salon/SalonApp"));
const SalonBookingPage = lazy(() => import("./modules/salon/PublicBookingPage"));
const RetailApp = lazy(() => import("./modules/retail/RetailApp"));
const WorkshopApp = lazy(() => import("./modules/workshop/WorkshopApp"));
const WorkshopStatusPage = lazy(() => import("./modules/workshop/WorkshopStatusPage"));
const RestaurantApp = lazy(() => import("./modules/restaurant/RestaurantApp"));
const PickupDisplayPage = lazy(() => import("./modules/restaurant/PickupDisplayPage"));
const CraftApp = lazy(() => import("./modules/craft/CraftApp"));
const FitnessApp = lazy(() => import("./modules/fitness/FitnessApp"));
const AutohausApp = lazy(() => import("./modules/autohaus/AutohausApp"));
// Die Kasse gehört zur Plattform (eine für alle Systeme), wird aber auch erst bei Bedarf geladen
const PosApp = lazy(() => import("./pos/PosApp"));
const PosKiosk = lazy(() => import("./pos/PosApp").then((m) => ({ default: m.Kiosk })));

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const path = usePath();

  const refresh = useCallback(async () => {
    try {
      const next = await api<Me>("/me");
      setTaxSettings(next.tax);
      setMe(next);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) console.error(error);
      if (error instanceof ApiError && error.status === 401) setStoredToken(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setStoredToken(null);
    setMe(null);
    navigate("/");
  };

  // Stempeluhr: eigene Ansicht ohne Anmeldung
  const [, firstPart, terminalToken] = path.split("/");
  if (firstPart === "terminal" && terminalToken) return <TerminalPage token={terminalToken} />;
  // Rechtstexte immer erreichbar, mit und ohne Anmeldung
  if (firstPart === "impressum") return <ImprintPage />;
  if (firstPart === "datenschutz") return <PrivacyPage />;
  // Reparaturstatus & Online-Terminbuchung für Kunden: ohne Anmeldung
  const statusToken = path.split("/")[3];
  if (firstPart === "status" && terminalToken === "kfz" && statusToken) {
    const kfzToken = path.split("/")[4];
    return <Suspense fallback={null}><WorkshopStatusPage tenantId={statusToken} token={kfzToken} /></Suspense>;
  }
  if (firstPart === "status" && terminalToken && statusToken) return <Suspense fallback={null}><RepairStatusPage tenantId={terminalToken} token={statusToken} /></Suspense>;
  if (firstPart === "abholung" && terminalToken) return <Suspense fallback={null}><PickupDisplayPage tenantId={terminalToken} /></Suspense>;
  if (firstPart === "termin" && terminalToken === "salon" && statusToken) return <Suspense fallback={null}><SalonBookingPage tenantId={statusToken} /></Suspense>;
  if (firstPart === "termin" && terminalToken) return <Suspense fallback={null}><RepairBookingPage tenantId={terminalToken} token={statusToken || undefined} /></Suspense>;

  if (loading) return <div className="splash"><img src="/icon.svg" alt="" width={56} height={56} /></div>;

  // Links aus E-Mails funktionieren mit und ohne Anmeldung
  const [, linkKind, token] = path.split("/");
  if (linkKind === "einladung" && token) return <InvitePage token={token} onDone={refresh} />;
  if (linkKind === "passwort-neu" && token) return <ResetPage token={token} onDone={refresh} />;
  if (linkKind === "bestaetigen" && token) return <VerifyPage token={token} onDone={refresh} />;

  if (!me) return <AuthPage onDone={refresh} />;

  const isManager = me.user.role !== "staff";
  if (!me.setupComplete && isManager)
    return (
      <SetupWizard
        firstRun={!me.setupComplete}
        addressLookup={!!me.privacy?.addressLookup}
        onDone={refresh}
        onLogout={logout}
      />
    );

  const setInstalledApps = (installedApps: string[]) => setMe({ ...me, installedApps });

  let page;
  const [, section, id] = path.split("/");
  const hasPos = me.installedApps.includes(POS_APP_ID);
  // Kassenmodus: ganzer Bildschirm ohne Menü
  if (section === "kasse" && id === "modus" && hasPos) return <Suspense fallback={null}><PosKiosk me={me} /></Suspense>;

  if (section === "katalog" && id && findApp(id)) {
    page = <AppDetail app={findApp(id)!} me={me} onAppsChanged={setInstalledApps} />;
  } else if (section === "katalog") {
    page = <Catalog me={me} />;
  } else if (section === "app" && id === "handy-it" && me.installedApps.includes(id)) {
    page = <Suspense fallback={null}><RepairsApp me={me} path={path} /></Suspense>;
  } else if (section === "app" && id === "buero" && me.installedApps.includes(id)) {
    page = <Suspense fallback={null}><OfficeApp me={me} path={path} /></Suspense>;
  } else if (section === "app" && id === "friseur" && me.installedApps.includes(id)) {
    page = <Suspense fallback={null}><SalonApp me={me} path={path} /></Suspense>;
  } else if (section === "app" && id === "einzelhandel" && me.installedApps.includes(id)) {
    page = <Suspense fallback={null}><RetailApp me={me} path={path} /></Suspense>;
  } else if (section === "app" && id === "werkstatt" && me.installedApps.includes(id)) {
    page = <Suspense fallback={null}><WorkshopApp me={me} path={path} /></Suspense>;
  } else if (section === "app" && id === "restaurant" && me.installedApps.includes(id)) {
    page = <Suspense fallback={null}><RestaurantApp me={me} path={path} /></Suspense>;
  } else if (section === "app" && id === "handwerk" && me.installedApps.includes(id)) {
    page = <Suspense fallback={null}><CraftApp me={me} path={path} /></Suspense>;
  } else if (section === "app" && id === "fitness" && me.installedApps.includes(id)) {
    page = <Suspense fallback={null}><FitnessApp me={me} path={path} /></Suspense>;
  } else if (section === "app" && id === "autohaus" && me.installedApps.includes(id)) {
    page = <Suspense fallback={null}><AutohausApp me={me} path={path} /></Suspense>;
  } else if (section === "app" && id === POS_APP_ID && hasPos) {
    page = <Suspense fallback={null}><PosApp me={me} path="/kasse" /></Suspense>;
  } else if (section === "app" && id && findApp(id) && me.installedApps.includes(id)) {
    page = <InstalledApp app={findApp(id)!} />;
  } else if (section === "kasse" && hasPos) {
    page = <Suspense fallback={null}><PosApp me={me} path={path} /></Suspense>;
  } else if (section === "kasse") {
    // Ohne gebuchtes Kassenmodul: zeigen, was es kann, und buchen lassen
    page = <AppDetail app={findApp(POS_APP_ID)!} me={me} onAppsChanged={setInstalledApps} />;
  } else if (section === "team" && isManager) {
    page = <Team me={me} />;
  } else if (section === "auswertung" && isManager) {
    page = <InsightsPage me={me} />;
  } else if (section === "buchhaltung" && isManager) {
    page = <AccountingPage me={me} />;
  } else if (section === "zeiten") {
    page = <TimePage me={me} />;
  } else if (section === "konto") {
    page = <AccountPage me={me} onChanged={refresh} />;
  } else if (section === "einstellungen") {
    page = <Settings me={me} onChanged={refresh} />;
  } else {
    page = <Overview me={me} />;
  }

  return (
    <Shell me={me} path={path} onLogout={logout}>
      {page}
    </Shell>
  );
}
