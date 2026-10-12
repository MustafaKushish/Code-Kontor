import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import type { Me } from "../api";
import { AppIcon, appStyle, euro, Link } from "../components";
import { CATALOG } from "../../shared/apps";

const CATEGORIES = ["Alle", ...new Set(CATALOG.map((a) => a.category))];

export function Catalog({ me }: { me: Me }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Alle");

  const apps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter(
      (a) =>
        (category === "Alle" || a.category === category) &&
        (!q || [a.name, a.tagline, ...a.features].some((t) => t.toLowerCase().includes(q))),
    );
  }, [query, category]);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1>App-Katalog</h1>
          <p className="muted">Fertige Systeme für jede Branche. Installieren, Firmendaten sind schon drin, loslegen.</p>
        </div>
      </header>

      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input placeholder="System oder Funktion suchen …" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Suchen" />
        </label>
        <div className="chips" role="tablist">
          {CATEGORIES.map((c) => (
            <button key={c} role="tab" aria-selected={c === category} className={c === category ? "chip active" : "chip"} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="catalog-grid">
        {apps.map((app) => {
          const installed = me.installedApps.includes(app.id);
          return (
            <Link key={app.id} to={`/katalog/${app.id}`} className="catalog-card" style={appStyle(app)}>
              <div className="catalog-card-top">
                <AppIcon app={app} size="lg" />
                {installed ? (
                  <span className="pill success"><Check size={14} /> Installiert</span>
                ) : (
                  <span className="pill">{app.category}</span>
                )}
              </div>
              <div className="stack-sm">
                <h3>{app.name}</h3>
                <p className="muted">{app.tagline}</p>
              </div>
              <ul className="feature-list">
                {app.features.slice(0, 3).map((f) => <li key={f}><Check size={15} /> {f}</li>)}
              </ul>
              <div className="catalog-card-foot">
                <span><strong>{euro(app.priceMonthly)}</strong> <small className="muted">/ Monat</small></span>
                <span className="text-link">Ansehen</span>
              </div>
            </Link>
          );
        })}
        {apps.length === 0 && <p className="muted">Kein System gefunden. Versuch einen anderen Suchbegriff.</p>}
      </div>
    </div>
  );
}
