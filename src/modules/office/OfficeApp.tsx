import { useEffect, useState } from "react";
import { FolderKanban, Clock, FileText, Receipt, Users, Settings2, Plus, ArrowRight, WalletCards } from "lucide-react";
import type { Me } from "../../api";
import { AppIcon, Link } from "../../components";
import { navigate } from "../../router";
import { findApp } from "../../../shared/apps";
import { useOfficeI18n } from "./i18n";
import { ProjectsTab } from "./ProjectsTab";
import { TimeTab } from "./TimeTab";
import { ExpensesTab } from "./ExpensesTab";
import { QuotesTab } from "./QuotesTab";
import { InvoicesTab } from "./InvoicesTab";
import { ClientsTab } from "./ClientsTab";
import { SettingsTab } from "./SettingsTab";
import type { LineItem } from "../../../shared/office";
import "./office.css";

export const BASE = "/app/buero";

export default function OfficeApp({ me, path }: { me: Me; path: string }) {
  const { o, appText } = useOfficeI18n();
  const app = findApp("buero")!;
  const isManager = me.user.role !== "staff";

  // Sub-path routing: /app/buero/:section
  const [, , , section, subId] = path.split("/");

  const SECTIONS: Record<string, string> = {
    zeiten: "time",
    auslagen: "expenses",
    angebote: "quotes",
    rechnungen: "invoices",
    kunden: "clients",
    einstellungen: "settings",
  };

  const tab = SECTIONS[section ?? ""] ?? "projects";

  // Context passing for cross-tab shortcuts
  const [selectedClientForProjects, setSelectedClientForProjects] = useState<string | undefined>(undefined);
  const [selectedProjectForTime, setSelectedProjectForTime] = useState<string | undefined>(undefined);
  const [selectedProjectForExpenses, setSelectedProjectForExpenses] = useState<string | undefined>(undefined);
  const [initialInvoiceData, setInitialInvoiceData] = useState<{
    clientId: string;
    projectId: string | null;
    items: LineItem[];
  } | null>(null);

  const tabs = [
    { id: "projects", to: BASE, label: o("tabs.projects"), icon: FolderKanban },
    { id: "time", to: `${BASE}/zeiten`, label: o("tabs.time"), icon: Clock },
    { id: "expenses", to: `${BASE}/auslagen`, label: o("tabs.expenses"), icon: WalletCards },
    { id: "quotes", to: `${BASE}/angebote`, label: o("tabs.quotes"), icon: FileText },
    { id: "invoices", to: `${BASE}/rechnungen`, label: o("tabs.invoices"), icon: Receipt },
    { id: "clients", to: `${BASE}/kunden`, label: o("tabs.clients"), icon: Users },
    ...(isManager ? [{ id: "settings", to: `${BASE}/einstellungen`, label: o("tabs.settings"), icon: Settings2 }] : []),
  ];

  return (
    <div className="stack-lg office">
      <header className="page-head with-icon office-head">
        <AppIcon app={app} size="lg" />
        <div>
          <h1 className="display">{appText(app.id).name}</h1>
          <p className="muted">{appText(app.id).tagline}</p>
        </div>
        <div className="row gap office-actions push-end">
          <button
            className="button"
            onClick={() => {
              setSelectedProjectForTime(undefined);
              navigate(`${BASE}/zeiten`);
            }}
          >
            <Clock size={17} /> {o("time.logTime")}
          </button>
          <button
            className="button primary"
            onClick={() => {
              navigate(BASE);
            }}
          >
            <Plus size={18} /> {o("projects.newProject")}
          </button>
        </div>
      </header>

      <div className="page-tabs office-tabs" role="tablist">
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

      {tab === "projects" && (
        <ProjectsTab
          isManager={isManager}
          initialClientId={selectedClientForProjects}
          onNavigateToTime={(projId) => {
            setSelectedProjectForTime(projId);
            navigate(`${BASE}/zeiten`);
          }}
          onNavigateToExpenses={(projId) => {
            setSelectedProjectForExpenses(projId);
            navigate(`${BASE}/auslagen`);
          }}
        />
      )}

      {tab === "time" && (
        <TimeTab
          me={me}
          initialProjectId={selectedProjectForTime}
          onNavigateToNewInvoiceWithItems={(clientId, projectId, items) => {
            setInitialInvoiceData({ clientId, projectId, items });
            navigate(`${BASE}/rechnungen`);
          }}
        />
      )}

      {tab === "expenses" && (
        <ExpensesTab
          isManager={isManager}
          initialProjectId={selectedProjectForExpenses}
          onNavigateToInvoiceWithItems={(clientId, projectId, items) => {
            setInitialInvoiceData({ clientId, projectId, items });
            navigate(`${BASE}/rechnungen`);
          }}
        />
      )}

      {tab === "quotes" && <QuotesTab isManager={isManager} />}

      {tab === "invoices" && (
        <InvoicesTab
          isManager={isManager}
          initialData={initialInvoiceData}
        />
      )}

      {tab === "clients" && (
        <ClientsTab
          isManager={isManager}
          onSelectClient={(cId) => {
            setSelectedClientForProjects(cId);
            navigate(BASE);
          }}
        />
      )}

      {tab === "settings" && isManager && <SettingsTab />}
    </div>
  );
}
