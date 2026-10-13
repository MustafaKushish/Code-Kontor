import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api, ApiError, type Me } from "./api";
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
import { setTaxSettings } from "./money";
import { TerminalPage } from "./pages/Terminal";
import { ImprintPage, PrivacyPage } from "./pages/Legal";
import { findApp } from "../shared/apps";

// Branchen-Systeme werden erst geladen, wenn sie gebraucht werden
const RepairsApp = lazy(() => import("./modules/repairs/RepairsApp"));
const RepairStatusPage = lazy(() => import("./modules/repairs/StatusPage"));
const RepairBookingPage = lazy(() => import("./modules/repairs/BookingPage"));
// Die Kasse gehört zur Plattform (eine für alle Systeme), wird aber auch erst bei Bedarf geladen
const PosApp = lazy(() => import("./pos/PosApp"));

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingCompany, setEditingCompany] = useState(false);
  const path = usePath();

  const refresh = useCallback(async () => {
    try {
      const next = await api<Me>("/me");
      setTaxSettings(next.tax);
      setMe(next);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) console.error(error);
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
    setMe(null);
    navigate("/");
  };

  // Stempeluhr: eigene Ansicht ohne Anmeldung
  const [, firstPart, terminalToken] = path.split("/");
  if (firstPart === "terminal" && terminalToken) return <TerminalPage token={terminalToken} />;
  // Rechtstexte immer erreichbar, mit und ohne Anmeldung
  if (firstPart === "impressum") return <ImprintPage />;
  if (firstPart === "datenschutz") return <PrivacyPage />;
  // Reparaturstatus für Endkunden: ebenfalls ohne Anmeldung
  const statusToken = path.split("/")[3];
  if (firstPart === "status" && terminalToken && statusToken) return <Suspense fallback={null}><RepairStatusPage tenantId={terminalToken} token={statusToken} /></Suspense>;
  if (firstPart === "termin" && terminalToken) return <Suspense fallback={null}><RepairBookingPage tenantId={terminalToken} token={statusToken || undefined} /></Suspense>;

  if (loading) return <div className="splash"><img src="/icon.svg" alt="" width={56} height={56} /></div>;

  // Links aus E-Mails funktionieren mit und ohne Anmeldung
  const [, linkKind, token] = path.split("/");
  if (linkKind === "einladung" && token) return <InvitePage token={token} onDone={refresh} />;
  if (linkKind === "passwort-neu" && token) return <ResetPage token={token} onDone={refresh} />;
  if (linkKind === "bestaetigen" && token) return <VerifyPage token={token} onDone={refresh} />;

  if (!me) return <AuthPage onDone={refresh} />;

  const isManager = me.user.role !== "staff";
  if ((!me.setupComplete && isManager) || editingCompany)
    return (
      <SetupWizard
        firstRun={!me.setupComplete}
        onDone={async () => {
          setEditingCompany(false);
          await refresh();
        }}
        onCancel={me.setupComplete ? () => setEditingCompany(false) : undefined}
        onLogout={logout}
      />
    );

  const setInstalledApps = (installedApps: string[]) => setMe({ ...me, installedApps });

  let page;
  const [, section, id] = path.split("/");
  if (section === "katalog" && id && findApp(id)) {
    page = <AppDetail app={findApp(id)!} me={me} onAppsChanged={setInstalledApps} />;
  } else if (section === "katalog") {
    page = <Catalog me={me} />;
  } else if (section === "app" && id === "handy-it" && me.installedApps.includes(id)) {
    page = <Suspense fallback={null}><RepairsApp me={me} path={path} /></Suspense>;
  } else if (section === "app" && id && findApp(id) && me.installedApps.includes(id)) {
    page = <InstalledApp app={findApp(id)!} />;
  } else if (section === "kasse") {
    page = <Suspense fallback={null}><PosApp me={me} path={path} /></Suspense>;
  } else if (section === "team" && isManager) {
    page = <Team me={me} />;
  } else if (section === "buchhaltung" && isManager) {
    page = <AccountingPage me={me} />;
  } else if (section === "zeiten") {
    page = <TimePage me={me} />;
  } else if (section === "konto") {
    page = <AccountPage me={me} onChanged={refresh} />;
  } else if (section === "einstellungen") {
    page = <Settings me={me} onEdit={() => setEditingCompany(true)} onTaxChanged={refresh} />;
  } else {
    page = <Overview me={me} />;
  }

  return (
    <Shell me={me} path={path} onLogout={logout}>
      {page}
    </Shell>
  );
}
