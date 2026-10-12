import { useState } from "react";
import { ArrowLeft, Check, Download, Languages, MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import { api, type Me } from "../api";
import { AppIcon, appStyle, Link } from "../components";
import { navigate } from "../router";
import type { CatalogApp } from "../../shared/apps";
import { useI18n } from "../i18n";

export function AppDetail({ app, me, onAppsChanged }: { app: CatalogApp; me: Me; onAppsChanged: (apps: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const installed = me.installedApps.includes(app.id);
  const isManager = me.user.role !== "staff";
  const { t, errorText, appText, money } = useI18n();
  const text = appText(app.id);

  const toggle = async () => {
    if (installed && !confirm(t("detail.confirmRemove", { name: text.name }))) return;
    setBusy(true);
    setError("");
    try {
      const { installedApps } = await api<{ installedApps: string[] }>(`/apps/${app.id}`, { method: installed ? "DELETE" : "POST" });
      onAppsChanged(installedApps);
      if (!installed) navigate(`/app/${app.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-lg">
      <Link to="/katalog" className="text-link back"><ArrowLeft size={16} className="flip-rtl" /> {t("nav.catalog")}</Link>

      <section className="detail-hero" style={appStyle(app)}>
        <span className="card-glow" aria-hidden />
        <AppIcon app={app} size="lg" />
        <div className="stack-sm">
          <span className="pill">{t(`catalog.categories.${app.category}`)}</span>
          <h1 className="display">{text.name}</h1>
          <p>{text.description}</p>
        </div>
        <div className="detail-buy">
          <p><strong className="price">{money(app.priceMonthly)}</strong> <span className="muted">{t("common.perMonth")}</span></p>
          {isManager ? (
            <button className={installed ? "button" : "button primary"} onClick={toggle} disabled={busy}>
              {installed ? <><Trash2 size={18} /> {t("common.remove")}</> : <><Download size={18} /> {busy ? t("detail.installing") : t("detail.install")}</>}
            </button>
          ) : (
            <p className="muted">{t("detail.managersOnly")}</p>
          )}
          {installed && <Link to={`/app/${app.id}`} className="button primary">{t("palette.open")}</Link>}
          {error && <p className="error" role="alert">{error}</p>}
          <small className="muted">{t("detail.cancelAnytime")}</small>
        </div>
      </section>

      <div className="columns">
        <section className="card">
          <h2>{t("detail.included")}</h2>
          <ul className="feature-list large">
            {text.features.map((f) => <li key={f}><Check size={18} /> {f}</li>)}
          </ul>
        </section>
        <section className="card">
          <h2>{t("detail.sameForAll")}</h2>
          <ul className="benefits">
            <li><ShieldCheck size={20} /><span><strong>{t("detail.b1Title")}</strong><small className="muted">{t("detail.b1Text")}</small></span></li>
            <li><MonitorSmartphone size={20} /><span><strong>{t("detail.b2Title")}</strong><small className="muted">{t("detail.b2Text")}</small></span></li>
            <li><Languages size={20} /><span><strong>{t("detail.b3Title")}</strong><small className="muted">{t("detail.b3Text")}</small></span></li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export function InstalledApp({ app }: { app: CatalogApp }) {
  const { t, appText } = useI18n();
  const text = appText(app.id);
  return (
    <div className="stack-lg">
      <header className="page-head with-icon">
        <AppIcon app={app} size="lg" />
        <div>
          <h1 className="display">{text.name}</h1>
          <p className="muted">{text.tagline}</p>
        </div>
      </header>
      {app.status === "preview" && (
        <p className="notice">{t("detail.building")}</p>
      )}
      <div className="module-grid" style={appStyle(app)}>
        {text.features.map((f) => (
          <div key={f} className="module-tile">
            <strong>{f}</strong>
            <small className="muted">{t("detail.comingSoon")}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
