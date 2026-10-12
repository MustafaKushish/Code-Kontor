import { useEffect, useState } from "react";
import { ArrowRight, CircleCheck, Clock, LayoutGrid, MonitorSmartphone, ShieldCheck, Store, Users } from "lucide-react";
import { api, type Me } from "../api";
import { AppIcon, Link } from "../components";
import { CATALOG, findApp } from "../../shared/apps";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function Overview({ me }: { me: Me }) {
  const [teamSize, setTeamSize] = useState<number | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const isManager = me.user.role !== "staff";
  const apps = me.installedApps.map(findApp).filter((a) => a !== undefined);
  const suggestions = CATALOG.filter((a) => !me.installedApps.includes(a.id)).slice(0, 3);
  const firstName = me.user.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";

  useEffect(() => {
    if (isManager) api<{ users: unknown[] }>("/users").then((r) => setTeamSize(r.users.length));
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isManager]);

  return (
    <div className="stack-lg">
      <section className="hero-card">
        <div>
          <p className="hero-eyebrow">{me.user.tenantName}</p>
          <h1>{greeting}, {firstName}!</h1>
          <p className="hero-text">
            {apps.length
              ? `Du nutzt ${apps.length === 1 ? "ein System" : `${apps.length} Systeme`}. Alles an einem Ort, auf jedem Gerät.`
              : "Wähle im App-Katalog das System, das zu deinem Geschäft passt."}
          </p>
        </div>
        <div className="hero-actions">
          <Link to="/katalog" className="button light">
            <Store size={18} /> App-Katalog öffnen
          </Link>
          {installPrompt && (
            <button className="button ghost-light" onClick={() => installPrompt.prompt().then(() => setInstallPrompt(null))}>
              <MonitorSmartphone size={18} /> Als App installieren
            </button>
          )}
        </div>
      </section>

      <section className="stats">
        <div className="stat">
          <span className="stat-icon"><LayoutGrid size={20} /></span>
          <div><strong>{apps.length}</strong><small>Systeme installiert</small></div>
        </div>
        <div className="stat">
          <span className="stat-icon"><Users size={20} /></span>
          <div><strong>{teamSize ?? "–"}</strong><small>Personen im Team</small></div>
        </div>
        <div className="stat">
          <span className="stat-icon">{me.setupComplete ? <CircleCheck size={20} /> : <Clock size={20} />}</span>
          <div>
            <strong>{me.setupComplete ? "Fertig" : "Offen"}</strong>
            <small>Firmendaten</small>
          </div>
        </div>
        <div className="stat">
          <span className="stat-icon"><ShieldCheck size={20} /></span>
          <div><strong>Eigene</strong><small>Datenbank, getrennt</small></div>
        </div>
      </section>

      {apps.length > 0 && (
        <section className="stack">
          <h2>Deine Systeme</h2>
          <div className="app-grid">
            {apps.map((app) => (
              <Link key={app.id} to={`/app/${app.id}`} className="app-tile">
                <AppIcon app={app} size="lg" />
                <strong>{app.name}</strong>
                <small className="muted">{app.tagline}</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="stack">
          <div className="section-head">
            <h2>{apps.length ? "Weitere Systeme" : "Beliebte Systeme"}</h2>
            <Link to="/katalog" className="text-link">Alle ansehen <ArrowRight size={16} /></Link>
          </div>
          <div className="app-grid">
            {suggestions.map((app) => (
              <Link key={app.id} to={`/katalog/${app.id}`} className="app-tile">
                <AppIcon app={app} size="lg" />
                <strong>{app.name}</strong>
                <small className="muted">{app.tagline}</small>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
