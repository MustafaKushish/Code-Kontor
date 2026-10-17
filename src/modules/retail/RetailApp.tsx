import { useState } from "react";
import { Package, ShoppingCart, Truck } from "lucide-react";
import type { Me } from "../../api";
import { AppIcon, Link } from "../../components";
import { findApp } from "../../../shared/apps";
import { ProductsTab } from "./ProductsTab";
import { OrdersTab } from "./OrdersTab";
import { POS_APP_ID } from "../../../shared/pos";
import { useRetailI18n } from "./i18n";
import "./retail.css";

export default function RetailApp({ me, path }: { me: Me; path: string }) {
  const { appText, r } = useRetailI18n();
  const app = findApp("einzelhandel")!;
  const isManager = me.user.role === "owner" || me.user.role === "admin";
  const hasPos = me.installedApps.includes(POS_APP_ID);

  const [activeTab, setActiveTab] = useState<"products" | "orders">("products");

  const tabs = [
    { id: "products" as const, label: r("tabs.products"), icon: Package },
    { id: "orders" as const, label: r("tabs.orders"), icon: Truck },
  ];

  return (
    <div className="stack-lg retail">
      <header className="page-head with-icon retail-head">
        <AppIcon app={app} size="lg" />
        <div>
          <h1 className="display">{appText(app.id).name}</h1>
          <p className="muted">{appText(app.id).tagline}</p>
        </div>
        {hasPos && (
          <div className="row gap push-end">
            <Link to="/kasse" className="button">
              <ShoppingCart size={18} /> {r("app.toPos")}
            </Link>
          </div>
        )}
      </header>

      <div className="page-tabs" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={activeTab === id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)}>
            <Icon size={17} aria-hidden /> {label}
          </button>
        ))}
      </div>

      {activeTab === "products" && <ProductsTab isManager={isManager} />}
      {activeTab === "orders" && <OrdersTab isManager={isManager} />}
    </div>
  );
}
