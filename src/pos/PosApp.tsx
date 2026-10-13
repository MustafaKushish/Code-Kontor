import { BookOpen, Receipt, Settings2, ShoppingCart } from "lucide-react";
import type { Me } from "../api";
import { navigate } from "../router";
import { usePosI18n } from "./i18n";
import { Register } from "./Register";
import { Receipts } from "./Receipts";
import { CashBook } from "./CashBook";
import { PosSettingsTab } from "./Settings";
import "./pos.css";

const BASE = "/kasse";

/** Die Kasse der Firma: für alle installierten Systeme gemeinsam. */
export default function PosApp({ me, path }: { me: Me; path: string }) {
  const { p, ready } = usePosI18n();
  const isManager = me.user.role !== "staff";
  const section = path.split("/")[2] ?? "";
  if (!ready) return null;

  const TABS = { "": "sell", belege: "receipts", kassenbuch: "cashbook", einstellungen: "settings" } as const;
  let tab: (typeof TABS)[keyof typeof TABS] = TABS[section as keyof typeof TABS] ?? "sell";
  if (tab === "settings" && !isManager) tab = "sell";
  const tabs = [
    { id: "sell", to: BASE, icon: ShoppingCart },
    { id: "receipts", to: `${BASE}/belege`, icon: Receipt },
    { id: "cashbook", to: `${BASE}/kassenbuch`, icon: BookOpen },
    ...(isManager ? [{ id: "settings", to: `${BASE}/einstellungen`, icon: Settings2 }] : []),
  ];
  const country = me.tax?.country ?? "DE";

  return (
    <div className="stack-lg pos">
      <header className="page-head">
        <div>
          <h1 className="display">{p("title")}</h1>
          <p className="muted">{p("subtitle")}</p>
        </div>
      </header>
      <div className="page-tabs pos-tabs" role="tablist">
        {tabs.map(({ id, to, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => navigate(to)}>
            <Icon size={17} aria-hidden /> {p(`tabs.${id}`)}
          </button>
        ))}
      </div>
      {country === "DE" && tab === "sell" && <p className="notice small">{p("tse.notice")}</p>}
      {tab === "sell" && <Register />}
      {tab === "receipts" && <Receipts isManager={isManager} />}
      {tab === "cashbook" && <CashBook isManager={isManager} />}
      {tab === "settings" && <PosSettingsTab country={country} />}
    </div>
  );
}
