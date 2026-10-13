import { useEffect, useState } from "react";
import { CalendarClock, ClipboardList, Hourglass, PackageCheck, PackageSearch, Plus, Repeat, Search, Settings2, ShieldCheck, ShoppingCart, TriangleAlert, Users, Wallet, Wrench } from "lucide-react";
import { api, type Me } from "../../api";
import { AppIcon, Link } from "../../components";
import { navigate } from "../../router";
import { findApp } from "../../../shared/apps";
import type { RepairOrderRow, StatusGroup } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { IntakeForm } from "./IntakeForm";
import { OrderDetail } from "./OrderDetail";
import { StockTab } from "./Stock";
import { InvoicesTab } from "./Invoices";
import { SettingsTab } from "./Settings";
import { SalesTab } from "./Sales";
import { UsedTab } from "./Used";
import { WarrantyTab } from "./Warranty";
import { PricesPanel } from "./Prices";
import { LoanersPanel } from "./Loaners";
import { CustomersTab, CustomerCard } from "./Customers";
import { CashDayPanel, StatsPanel } from "./Cash";
import { StatusPill, deviceLabel } from "./parts";
import "./repairs.css";

export const BASE = "/app/handy-it";

/** System „Handy- & IT-Service“: Aufträge, Verkauf, Ankauf, Kunden, Lager, Garantie, Kasse, Einstellungen. */
export default function RepairsApp({ me, path }: { me: Me; path: string }) {
  const { r, appText, ready } = useRepairI18n();
  const app = findApp("handy-it")!;
  const isManager = me.user.role !== "staff";
  const [, , , section, id, sub] = path.split("/");

  if (!ready) return null;

  if (section === "neu") return <IntakeForm />;
  if (section === "auftrag" && id) return sub === "bearbeiten" ? <IntakeForm editId={id} /> : <OrderDetail id={id} me={me} />;

  const SECTIONS: Record<string, string> = { verkauf: "sales", ankauf: "used", kunden: "customers", lager: "stock", garantie: "warranty", kasse: "cash", rechnungen: "cash" };
  const tab = SECTIONS[section ?? ""] ?? (section === "einstellungen" && isManager ? "settings" : "orders");
  const tabs = [
    { id: "orders", to: BASE, label: r("tabs.orders"), icon: ClipboardList },
    { id: "sales", to: `${BASE}/verkauf`, label: r("tabs.sales"), icon: ShoppingCart },
    { id: "used", to: `${BASE}/ankauf`, label: r("tabs.used"), icon: Repeat },
    { id: "customers", to: `${BASE}/kunden`, label: r("tabs.customers"), icon: Users },
    { id: "stock", to: `${BASE}/lager`, label: r("tabs.stock"), icon: PackageSearch },
    { id: "warranty", to: `${BASE}/garantie`, label: r("tabs.warranty"), icon: ShieldCheck },
    { id: "cash", to: `${BASE}/kasse`, label: r("tabs.cash"), icon: Wallet },
    ...(isManager ? [{ id: "settings", to: `${BASE}/einstellungen`, label: r("tabs.settings"), icon: Settings2 }] : []),
  ];
  const stockSub = id === "preise" ? "prices" : id === "leihgeraete" ? "loaners" : "parts";
  const cashSub = section === "rechnungen" ? "invoices" : id === "auswertung" && isManager ? "stats" : "day";

  return (
    <div className="stack-lg repairs">
      <header className="page-head with-icon repairs-head">
        <AppIcon app={app} size="lg" />
        <div>
          <h1 className="display">{appText(app.id).name}</h1>
          <p className="muted">{appText(app.id).tagline}</p>
        </div>
        <Link to={`${BASE}/neu`} className="button primary repairs-new"><Plus size={18} /> {r("newOrder")}</Link>
      </header>

      <div className="page-tabs repairs-tabs" role="tablist">
        {tabs.map(({ id: tabId, to, label, icon: Icon }) => (
          <button key={tabId} role="tab" aria-selected={tab === tabId} className={tab === tabId ? "active" : ""} onClick={() => navigate(to)}>
            <Icon size={17} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab === "orders" && <OrdersTab />}
      {tab === "sales" && <SalesTab />}
      {tab === "used" && <UsedTab isManager={isManager} />}
      {tab === "customers" && (id ? <CustomerCard id={id} isManager={isManager} /> : <CustomersTab />)}
      {tab === "stock" && (
        <>
          <SubNav current={stockSub} items={[
            { id: "parts", to: `${BASE}/lager`, label: r("tabs.parts") },
            { id: "prices", to: `${BASE}/lager/preise`, label: r("tabs.prices") },
            { id: "loaners", to: `${BASE}/lager/leihgeraete`, label: r("tabs.loaners") },
          ]} />
          {stockSub === "parts" && <StockTab isManager={isManager} />}
          {stockSub === "prices" && <PricesPanel isManager={isManager} />}
          {stockSub === "loaners" && <LoanersPanel isManager={isManager} />}
        </>
      )}
      {tab === "cash" && (
        <>
          <SubNav current={cashSub} items={[
            { id: "day", to: `${BASE}/kasse`, label: r("tabs.cashDay") },
            ...(isManager ? [{ id: "stats", to: `${BASE}/kasse/auswertung`, label: r("tabs.stats") }] : []),
            { id: "invoices", to: `${BASE}/rechnungen`, label: r("tabs.invoices") },
          ]} />
          {cashSub === "day" && <CashDayPanel />}
          {cashSub === "stats" && <StatsPanel />}
          {cashSub === "invoices" && <InvoicesTab />}
        </>
      )}
      {tab === "warranty" && <WarrantyTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

function SubNav({ current, items }: { current: string; items: { id: string; to: string; label: string }[] }) {
  return (
    <div className="chips sub-nav" role="tablist">
      {items.map((i) => (
        <button key={i.id} role="tab" aria-selected={current === i.id} className={current === i.id ? "chip active" : "chip"} onClick={() => navigate(i.to)}>{i.label}</button>
      ))}
    </div>
  );
}

const GROUP_KEY = "ck-repairs-group";

function OrdersTab() {
  const { r, repairError, euro, day } = useRepairI18n();
  const [group, setGroup] = useState<StatusGroup>(() => {
    try {
      return (sessionStorage.getItem(GROUP_KEY) as StatusGroup) || "open";
    } catch {
      return "open";
    }
  });
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ orders: RepairOrderRow[]; counts: Record<StatusGroup, number>; lowStock: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      sessionStorage.setItem(GROUP_KEY, group);
    } catch {
      // egal
    }
    const timer = setTimeout(() => {
      api<typeof data>(`/repairs/orders?group=${query ? "all" : group}&q=${encodeURIComponent(query)}`)
        .then((d) => (setData(d), setError("")))
        .catch((e) => setError(repairError(e)));
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [group, query]);

  const todayDay = new Date().toLocaleDateString("en-CA");
  const groups: StatusGroup[] = ["open", "waiting", "pickup", "done", "all"];

  return (
    <div className="stack">
      {data && (
        <div className="repairs-stats">
          <button className={`tile stat-tile ${group === "open" ? "active" : ""}`} onClick={() => setGroup("open")}>
            <span className="stat-icon"><Wrench size={18} /></span>
            <strong>{data.counts.open}</strong><small>{r("list.statOpen")}</small>
          </button>
          <button className={`tile stat-tile ${group === "waiting" ? "active" : ""}`} onClick={() => setGroup("waiting")}>
            <span className="stat-icon"><Hourglass size={18} /></span>
            <strong>{data.counts.waiting}</strong><small>{r("list.statWaiting")}</small>
          </button>
          <button className={`tile stat-tile ${group === "pickup" ? "active" : ""}`} onClick={() => setGroup("pickup")}>
            <span className="stat-icon"><PackageCheck size={18} /></span>
            <strong>{data.counts.pickup}</strong><small>{r("list.statPickup")}</small>
          </button>
        </div>
      )}
      {!!data?.lowStock && (
        <Link to={`${BASE}/lager`} className="notice repairs-low"><TriangleAlert size={17} /> {r("list.lowStock", { n: data.lowStock })}</Link>
      )}

      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={r("list.search")} aria-label={r("list.search")} />
        </label>
        {!query && (
          <div className="chips" role="tablist">
            {groups.map((g) => (
              <button key={g} role="tab" aria-selected={group === g} className={group === g ? "chip active" : "chip"} onClick={() => setGroup(g)}>
                {r(`groups.${g}`)}{data && g !== "all" ? ` · ${data.counts[g]}` : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {data && (
        <section className="card list-card">
          {data.orders.length === 0 && <p className="empty muted">{data.counts.all ? r("list.empty") : r("list.emptyFirst")}</p>}
          {data.orders.map((o) => {
            const overdue = o.dueDay && o.dueDay < todayDay && !["ready", "notRepaired", "pickedUp", "canceled"].includes(o.status);
            return (
              <Link key={o.id} to={`${BASE}/auftrag/${o.id}`} className="list-row repair-row">
                <span className="repair-number">#{o.number}</span>
                <span className="list-main">
                  <strong>{deviceLabel(o.device)}</strong>
                  <small className="muted">{o.customerName}{o.problem ? ` · ${o.problem}` : ""}</small>
                </span>
                <span className="repair-row-meta">
                  <StatusPill status={o.status} />
                  {o.dueDay && !["pickedUp", "canceled"].includes(o.status) && (
                    <small className={overdue ? "error" : "muted"}><CalendarClock size={13} /> {overdue ? r("list.overdue") : r("list.due", { day: day(o.dueDay, { day: "2-digit", month: "2-digit" }) })}</small>
                  )}
                  {!!o.totalCents && <small className="muted">{euro(o.totalCents)}</small>}
                </span>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
