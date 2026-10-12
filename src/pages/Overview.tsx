import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, CircleCheck, Clock, MonitorSmartphone, Plus, ShieldCheck, Store, Users } from "lucide-react";
import { api, type Me } from "../api";
import { AppIcon, appStyle, Link } from "../components";
import { CATALOG, findApp } from "../../shared/apps";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function Overview({ me }: { me: Me }) {
  const [teamSize, setTeamSize] = useState<number | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const now = useNow();
  const isManager = me.user.role !== "staff";
  const apps = me.installedApps.map(findApp).filter((a) => a !== undefined);
  const suggestions = CATALOG.filter((a) => !me.installedApps.includes(a.id)).slice(0, 4);
  const firstName = me.user.name.split(" ")[0];
  const hour = now.getHours();
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
    <div className="bento">
      <section className="tile hero-tile area-h">
        <div className="aurora" aria-hidden><span /><span /><span /></div>
        <div className="hero-body">
          <p className="hero-eyebrow">{me.user.tenantName}</p>
          <h1 className="display">{greeting},<br />{firstName}.</h1>
          <p className="hero-text">
            {apps.length
              ? `${apps.length === 1 ? "Ein System läuft" : `${apps.length} Systeme laufen`} für dich. Alles an einem Ort, auf jedem Gerät.`
              : "Wähle im App-Katalog das System, das zu deinem Geschäft passt."}
          </p>
          <div className="hero-actions">
            <Link to="/katalog" className="button light"><Store size={18} /> App-Katalog</Link>
            {installPrompt && (
              <button className="button glass" onClick={() => installPrompt.prompt().then(() => setInstallPrompt(null))}>
                <MonitorSmartphone size={18} /> Als App installieren
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="tile today-tile area-t">
        <p className="tile-label">Heute</p>
        <p className="today-day">{now.toLocaleDateString("de-DE", { weekday: "long" })}</p>
        <p className="today-date display">{now.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}</p>
        <p className="today-time">{now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</p>
      </section>

      <Link to="/katalog" className="tile stat-tile area-a">
        <span className="stat-icon"><Store size={20} /></span>
        <strong className="display">{apps.length}</strong>
        <small>Systeme installiert</small>
      </Link>
      {isManager ? (
        <Link to="/team" className="tile stat-tile area-b">
          <span className="stat-icon"><Users size={20} /></span>
          <strong className="display">{teamSize ?? "–"}</strong>
          <small>Personen im Team</small>
        </Link>
      ) : (
        <div className="tile stat-tile area-b">
          <span className="stat-icon"><ShieldCheck size={20} /></span>
          <strong className="display">Sicher</strong>
          <small>Eigene Datenbank</small>
        </div>
      )}
      <Link to="/einstellungen" className="tile stat-tile area-f">
        <span className="stat-icon">{me.setupComplete ? <CircleCheck size={20} /> : <Clock size={20} />}</span>
        <strong className="display">{me.setupComplete ? "Bereit" : "Offen"}</strong>
        <small>Firmendaten</small>
      </Link>

      <section className="tile wide-tile area-s">
        <div className="section-head">
          <h2>Deine Systeme</h2>
          <Link to="/katalog" className="text-link">Katalog <ArrowRight size={16} /></Link>
        </div>
        {apps.length ? (
          <div className="system-row">
            {apps.map((app) => (
              <Link key={app.id} to={`/app/${app.id}`} className="system-chip" style={appStyle(app)}>
                <AppIcon app={app} size="md" />
                <span><strong>{app.name}</strong><small>{app.tagline}</small></span>
                <ArrowUpRight size={18} className="system-arrow" />
              </Link>
            ))}
          </div>
        ) : (
          <Link to="/katalog" className="empty-cta">
            <Plus size={22} />
            <span><strong>Erstes System installieren</strong><small>Friseur, Werkstatt, Restaurant, Laden und mehr</small></span>
          </Link>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="tile wide-tile area-d">
          <div className="section-head">
            <h2>Entdecken</h2>
          </div>
          <div className="discover">
            {suggestions.map((app) => (
              <Link key={app.id} to={`/katalog/${app.id}`} className="discover-card" style={appStyle(app)}>
                <AppIcon app={app} size="lg" />
                <strong>{app.name}</strong>
                <small>{app.tagline}</small>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
