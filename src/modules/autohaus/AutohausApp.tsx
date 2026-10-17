import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Car, FileSignature, Gauge, Plus, Repeat, ShoppingCart, TrendingUp, Users } from "lucide-react";
import { api, type Me } from "../../api";
import { AppIcon, Link } from "../../components";
import { navigate } from "../../router";
import { findApp } from "../../../shared/apps";
import { POS_APP_ID } from "../../../shared/pos";
import type { AutohausStats, Lead, SalesContract, StockVehicle, TestDrive, TradeIn } from "../../../shared/autohaus";
import { BASE, errorText, euro } from "./parts";
import { StockTab } from "./StockTab";
import { LeadsTab } from "./LeadsTab";
import { TestDrivesTab } from "./TestDrivesTab";
import { ContractsTab } from "./ContractsTab";
import { TradeInsTab } from "./TradeInsTab";
import "./autohaus.css";

export interface AutohausData {
  vehicles: StockVehicle[];
  leads: Lead[];
  drives: TestDrive[];
  tradeIns: TradeIn[];
  contracts: SalesContract[];
}

export interface TabProps extends AutohausData {
  me: Me;
  reload: () => Promise<void>;
  /** Fahrzeug-ID aus „…/neu/<id>“: öffnet direkt das Formular für dieses Fahrzeug. */
  preset: string | null;
  /** Dritter Teil der Adresse, z. B. die ID eines geöffneten Kaufvertrags. */
  sub: string | null;
}

const EMPTY_STATS: AutohausStats = { inStock: 0, reserved: 0, stockValue: 0, avgDaysInStock: 0, openLeads: 0, testDrivesToday: 0, salesThisMonth: 0, revenueThisMonth: 0 };

/** System „Autohaus“: Fahrzeugbestand, Interessenten, Probefahrten, Kaufverträge und Inzahlungnahme. */
export default function AutohausApp({ me, path }: { me: Me; path: string }) {
  const app = findApp("autohaus")!;
  const [, , , section, action, target] = path.split("/");
  const [data, setData] = useState<AutohausData>({ vehicles: [], leads: [], drives: [], tradeIns: [], contracts: [] });
  const [stats, setStats] = useState<AutohausStats>(EMPTY_STATS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [newVehicle, setNewVehicle] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [vehicles, leads, drives, tradeIns, contracts, s] = await Promise.all([
        api<StockVehicle[]>("/autohaus/vehicles"),
        api<Lead[]>("/autohaus/leads"),
        api<TestDrive[]>("/autohaus/testdrives"),
        api<TradeIn[]>("/autohaus/tradeins"),
        api<SalesContract[]>("/autohaus/contracts"),
        api<AutohausStats>("/autohaus/stats"),
      ]);
      setData({ vehicles, leads, drives, tradeIns, contracts });
      setStats(s);
      setError("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const SECTIONS: Record<string, string> = { interessenten: "leads", probefahrten: "drives", vertraege: "contracts", inzahlungnahme: "tradeins" };
  const tab = SECTIONS[section ?? ""] ?? "stock";
  const tabs = [
    { id: "stock", to: BASE, label: "Bestand", icon: Car },
    { id: "leads", to: `${BASE}/interessenten`, label: "Interessenten", icon: Users },
    { id: "drives", to: `${BASE}/probefahrten`, label: "Probefahrten", icon: CalendarClock },
    { id: "contracts", to: `${BASE}/vertraege`, label: "Kaufverträge", icon: FileSignature },
    { id: "tradeins", to: `${BASE}/inzahlungnahme`, label: "Inzahlungnahme", icon: Repeat },
  ];

  const kpis = [
    { label: "Im Bestand", value: String(stats.inStock), hint: stats.reserved ? `davon ${stats.reserved} reserviert` : "verfügbar und in Aufbereitung", icon: Car },
    { label: "Bestandswert", value: euro(stats.stockValue), hint: `Ø ${stats.avgDaysInStock} Standtage`, icon: Gauge },
    { label: "Offene Interessenten", value: String(stats.openLeads), hint: `${stats.testDrivesToday} Probefahrten heute`, icon: Users },
    { label: "Verkäufe diesen Monat", value: String(stats.salesThisMonth), hint: euro(stats.revenueThisMonth), icon: TrendingUp },
  ];

  const props: TabProps = { ...data, me, reload, preset: action === "neu" ? (target ?? "") : null, sub: action ?? null };

  return (
    <div className="stack-lg autohaus">
      <header className="page-head with-icon autohaus-head">
        <AppIcon app={app} size="lg" />
        <div>
          <h1 className="display">Autohaus</h1>
          <p className="muted">Fahrzeugbestand, Interessenten, Probefahrten, Kaufverträge und Inzahlungnahme</p>
        </div>
        <div className="row gap push-end">
          {me.installedApps.includes(POS_APP_ID) && (
            <Link to="/kasse" className="button">
              <ShoppingCart size={18} /> Kasse
            </Link>
          )}
          <button
            className="button primary"
            onClick={() => {
              navigate(BASE);
              setNewVehicle(true);
            }}
          >
            <Plus size={18} /> Fahrzeug aufnehmen
          </button>
        </div>
      </header>

      <div className="page-tabs" role="tablist">
        {tabs.map(({ id, to, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => navigate(to)}>
            <Icon size={17} aria-hidden /> {label}
          </button>
        ))}
      </div>

      <div className="autohaus-stats">
        {kpis.map(({ label, value, hint, icon: Icon }) => (
          <div key={label} className="tile stat-tile">
            <span className="stat-icon"><Icon size={18} /></span>
            <strong>{value}</strong>
            <small>{label}</small>
            <small className="faint">{hint}</small>
          </div>
        ))}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {loaded && tab === "stock" && <StockTab {...props} creating={newVehicle} onCreatingDone={() => setNewVehicle(false)} />}
      {loaded && tab === "leads" && <LeadsTab {...props} />}
      {loaded && tab === "drives" && <TestDrivesTab {...props} />}
      {loaded && tab === "contracts" && <ContractsTab {...props} />}
      {loaded && tab === "tradeins" && <TradeInsTab {...props} />}
    </div>
  );
}
