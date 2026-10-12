import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, CircleCheck, Clock, MonitorSmartphone, Plus, ShieldCheck, Store, Users } from "lucide-react";
import { api, type Me } from "../api";
import { AppIcon, appStyle, Link } from "../components";
import { CATALOG, findApp } from "../../shared/apps";
import { useI18n } from "../i18n";

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
  const { t, lang, appText } = useI18n();
  const isManager = me.user.role !== "staff";
  const apps = me.installedApps.map(findApp).filter((a) => a !== undefined);
  const suggestions = CATALOG.filter((a) => !me.installedApps.includes(a.id)).slice(0, 4);
  const firstName = me.user.name.split(" ")[0];
  const hour = now.getHours();
  const greeting = t(hour < 11 ? "overview.morning" : hour < 18 ? "overview.hello" : "overview.evening");

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
          <h1 className="display">{greeting}{lang === "ar" ? "،" : ","}<br />{firstName}.</h1>
          <p className="hero-text">
            {apps.length
              ? apps.length === 1 ? t("overview.oneRunning") : t("overview.manyRunning", { n: apps.length })
              : t("overview.chooseSystem")}
          </p>
          <div className="hero-actions">
            <Link to="/katalog" className="button light"><Store size={18} /> {t("nav.catalog")}</Link>
            {installPrompt && (
              <button className="button glass" onClick={() => installPrompt.prompt().then(() => setInstallPrompt(null))}>
                <MonitorSmartphone size={18} /> {t("overview.installApp")}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="tile today-tile area-t">
        <p className="tile-label">{t("overview.today")}</p>
        <p className="today-day">{now.toLocaleDateString(lang, { weekday: "long" })}</p>
        <p className="today-date display">{now.toLocaleDateString(lang, { day: "numeric", month: "long" })}</p>
        <p className="today-time">{t("overview.clock", { time: now.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }) })}</p>
      </section>

      <Link to="/katalog" className="tile stat-tile area-a">
        <span className="stat-icon"><Store size={20} /></span>
        <strong className="display">{apps.length}</strong>
        <small>{t("overview.systemsInstalled")}</small>
      </Link>
      {isManager ? (
        <Link to="/team" className="tile stat-tile area-b">
          <span className="stat-icon"><Users size={20} /></span>
          <strong className="display">{teamSize ?? "–"}</strong>
          <small>{t("overview.teamMembers")}</small>
        </Link>
      ) : (
        <div className="tile stat-tile area-b">
          <span className="stat-icon"><ShieldCheck size={20} /></span>
          <strong className="display">{t("overview.secure")}</strong>
          <small>{t("overview.ownDb")}</small>
        </div>
      )}
      <Link to="/einstellungen" className="tile stat-tile area-f">
        <span className="stat-icon">{me.setupComplete ? <CircleCheck size={20} /> : <Clock size={20} />}</span>
        <strong className="display">{me.setupComplete ? t("overview.ready") : t("overview.open")}</strong>
        <small>{t("overview.companyData")}</small>
      </Link>

      <section className="tile wide-tile area-s">
        <div className="section-head">
          <h2>{t("nav.yourSystems")}</h2>
          <Link to="/katalog" className="text-link">{t("overview.catalogLink")} <ArrowRight size={16} className="flip-rtl" /></Link>
        </div>
        {apps.length ? (
          <div className="system-row">
            {apps.map((app) => (
              <Link key={app.id} to={`/app/${app.id}`} className="system-chip" style={appStyle(app)}>
                <AppIcon app={app} size="md" />
                <span><strong>{appText(app.id).name}</strong><small>{appText(app.id).tagline}</small></span>
                <ArrowUpRight size={18} className="system-arrow flip-rtl" />
              </Link>
            ))}
          </div>
        ) : (
          <Link to="/katalog" className="empty-cta">
            <Plus size={22} />
            <span><strong>{t("overview.firstSystemTitle")}</strong><small>{t("overview.firstSystemText")}</small></span>
          </Link>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="tile wide-tile area-d">
          <div className="section-head">
            <h2>{t("overview.discover")}</h2>
          </div>
          <div className="discover">
            {suggestions.map((app) => (
              <Link key={app.id} to={`/katalog/${app.id}`} className="discover-card" style={appStyle(app)}>
                <AppIcon app={app} size="lg" />
                <strong>{appText(app.id).name}</strong>
                <small>{appText(app.id).tagline}</small>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
