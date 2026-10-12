import { useState } from "react";
import { ArrowLeft, Check, Cloud, Download, MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import { api, ApiError, type Me } from "../api";
import { AppIcon, appStyle, euro, Link } from "../components";
import { navigate } from "../router";
import type { CatalogApp } from "../../shared/apps";

export function AppDetail({ app, me, onAppsChanged }: { app: CatalogApp; me: Me; onAppsChanged: (apps: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const installed = me.installedApps.includes(app.id);
  const isManager = me.user.role !== "staff";

  const toggle = async () => {
    if (installed && !confirm(`${app.name} wirklich entfernen? Deine Daten bleiben gespeichert.`)) return;
    setBusy(true);
    setError("");
    try {
      const { installedApps } = await api<{ installedApps: string[] }>(`/apps/${app.id}`, { method: installed ? "DELETE" : "POST" });
      onAppsChanged(installedApps);
      if (!installed) navigate(`/app/${app.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Keine Verbindung zum Server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-lg">
      <Link to="/katalog" className="text-link back"><ArrowLeft size={16} /> App-Katalog</Link>

      <section className="detail-hero" style={appStyle(app)}>
        <AppIcon app={app} size="lg" />
        <div className="stack-sm">
          <span className="pill">{app.category}</span>
          <h1>{app.name}</h1>
          <p>{app.description}</p>
        </div>
        <div className="detail-buy">
          <p><strong className="price">{euro(app.priceMonthly)}</strong> <span className="muted">/ Monat</span></p>
          {isManager ? (
            <button className={installed ? "button" : "button primary"} onClick={toggle} disabled={busy}>
              {installed ? <><Trash2 size={18} /> Entfernen</> : <><Download size={18} /> {busy ? "Wird installiert …" : "Installieren"}</>}
            </button>
          ) : (
            <p className="muted">Installieren kann der Inhaber oder ein Admin.</p>
          )}
          {installed && <Link to={`/app/${app.id}`} className="button primary">Öffnen</Link>}
          {error && <p className="error" role="alert">{error}</p>}
          <small className="muted">Monatlich kündbar. Preis zzgl. MwSt.</small>
        </div>
      </section>

      <div className="columns">
        <section className="card">
          <h2>Das ist dabei</h2>
          <ul className="feature-list large">
            {app.features.map((f) => <li key={f}><Check size={18} /> {f}</li>)}
          </ul>
        </section>
        <section className="card">
          <h2>Für alle Systeme gleich</h2>
          <ul className="benefits">
            <li><ShieldCheck size={20} /><span><strong>Eigene Datenbank</strong><small className="muted">Deine Daten liegen getrennt von allen anderen Kunden.</small></span></li>
            <li><MonitorSmartphone size={20} /><span><strong>Jedes Gerät</strong><small className="muted">Handy, Tablet und Laptop, auch als App installierbar.</small></span></li>
            <li><Cloud size={20} /><span><strong>Immer aktuell</strong><small className="muted">Updates kommen automatisch, ohne Installation.</small></span></li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export function InstalledApp({ app }: { app: CatalogApp }) {
  return (
    <div className="stack-lg">
      <header className="page-head with-icon">
        <AppIcon app={app} size="lg" />
        <div>
          <h1>{app.name}</h1>
          <p className="muted">{app.tagline}</p>
        </div>
      </header>
      {app.status === "preview" && (
        <p className="notice">Dieses System wird gerade gebaut. Die Bereiche unten werden nach und nach freigeschaltet.</p>
      )}
      <div className="module-grid" style={appStyle(app)}>
        {app.features.map((f) => (
          <div key={f} className="module-tile">
            <strong>{f}</strong>
            <small className="muted">Bald verfügbar</small>
          </div>
        ))}
      </div>
    </div>
  );
}
