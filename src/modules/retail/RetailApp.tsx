import { useState } from "react";
import { Package, ShoppingCart, Truck, Layers, Barcode, ArrowRight, Store } from "lucide-react";
import type { Me } from "../../api";
import { ProductsTab } from "./ProductsTab";
import { OrdersTab } from "./OrdersTab";
import { POS_APP_ID } from "../../../shared/pos";
import "./retail.css";

export default function RetailApp({ me, path }: { me: Me; path: string }) {
  const isManager = me.user.role === "owner" || me.user.role === "admin";
  const hasPos = me.installedApps.includes(POS_APP_ID);

  const [activeTab, setActiveTab] = useState<"products" | "orders">("products");

  return (
    <div className="min-h-full pb-16 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Einzelhandel & Warenwirtschaft
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Artikelstamm, EAN/Barcode-Scanner, Mindestbestände & Lieferantenbestellungen
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasPos && (
                <a
                  href="/kasse"
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition-colors"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Zur Kasse wechseln
                </a>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 border-t border-slate-200 dark:border-slate-800 pt-2 pb-2">
            <button
              onClick={() => setActiveTab("products")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "products"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Package className="w-4 h-4" />
              Artikel & Lagerbestand
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "orders"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Truck className="w-4 h-4" />
              Bestellungen & Wareneingang
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === "products" && <ProductsTab isManager={isManager} />}
        {activeTab === "orders" && <OrdersTab isManager={isManager} />}
      </main>
    </div>
  );
}
