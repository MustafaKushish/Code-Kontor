import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import type { Me } from "../api";
import { AppIcon, appStyle, Link } from "../components";
import { CATALOG } from "../../shared/apps";
import { useI18n } from "../i18n";

const CATEGORIES = ["all", ...new Set(CATALOG.map((a) => a.category))];

export function Catalog({ me }: { me: Me }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const { t, appText, money } = useI18n();

  const apps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter(
      (a) =>
        (category === "all" || a.category === category) &&
        (!q || [appText(a.id).name, appText(a.id).tagline, ...appText(a.id).features].some((s) => s.toLowerCase().includes(q))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, t]);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1 className="display">{t("catalog.title")}</h1>
          <p className="muted">{t("catalog.subtitle")}</p>
        </div>
      </header>

      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input placeholder={t("catalog.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("common.search")} />
        </label>
        <div className="chips" role="tablist">
          {CATEGORIES.map((c) => (
            <button key={c} role="tab" aria-selected={c === category} className={c === category ? "chip active" : "chip"} onClick={() => setCategory(c)}>
              {c === "all" ? t("catalog.all") : t(`catalog.categories.${c}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="catalog-grid">
        {apps.map((app) => {
          const installed = me.installedApps.includes(app.id);
          return (
            <Link key={app.id} to={`/katalog/${app.id}`} className="catalog-card" style={appStyle(app)}>
              <span className="card-glow" aria-hidden />
              <div className="catalog-card-top">
                <AppIcon app={app} size="lg" />
                {installed ? (
                  <span className="pill success"><Check size={14} /> {t("catalog.installed")}</span>
                ) : (
                  <span className="pill">{t(`catalog.categories.${app.category}`)}</span>
                )}
              </div>
              <div className="stack-sm">
                <h3>{appText(app.id).name}</h3>
                <p className="muted">{appText(app.id).tagline}</p>
              </div>
              <ul className="feature-list">
                {appText(app.id).features.slice(0, 3).map((f) => <li key={f}><Check size={15} /> {f}</li>)}
              </ul>
              <div className="catalog-card-foot">
                <span><strong>{money(app.priceMonthly)}</strong> <small className="muted">{t("common.perMonth")}</small></span>
                <span className="text-link">{t("catalog.view")}</span>
              </div>
            </Link>
          );
        })}
        {apps.length === 0 && <p className="muted">{t("catalog.none")}</p>}
      </div>
    </div>
  );
}
