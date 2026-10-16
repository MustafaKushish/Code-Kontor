import { useEffect, useState, type ReactNode } from "react";
import { Calculator, ChartColumn, Clock, ShoppingCart, Laptop, LayoutDashboard, LogOut, Moon, Search, Settings, ShieldCheck, Store, Sun, Users, Menu, X, FolderKanban } from "lucide-react";
import type { Me } from "../api";
import { AppIcon, Avatar, Link, Logo } from "../components";
import { useTheme, type ThemeChoice } from "../theme";
import { CommandPalette } from "./CommandPalette";
import { findApp } from "../../shared/apps";
import { POS_APP_ID } from "../../shared/pos";
import { useI18n } from "../i18n";
import { LanguageSwitch } from "./LanguageSwitch";
import { Assistant } from "./Assistant";
import { VerifyBanner } from "../pages/Account";
import { BillingBanner } from "../pages/Billing";
import { LegalLinks } from "../pages/Legal";

const NAV = [
  { to: "/", label: "nav.overview", short: "nav.startShort", icon: LayoutDashboard },
  { to: "/auswertung", label: "nav.insights", short: "nav.insights", icon: ChartColumn, managersOnly: true, notInTabbar: true },
  { to: "/kasse", label: "nav.pos", short: "nav.pos", icon: ShoppingCart },
  { to: "/zeiten", label: "nav.time", short: "nav.time", icon: Clock },
  { to: "/katalog", label: "nav.catalog", short: "nav.catalogShort", icon: Store, notInTabbar: true },
  { to: "/team", label: "nav.team", short: "nav.team", icon: Users, managersOnly: true },
  { to: "/buchhaltung", label: "nav.accounting", short: "nav.accountingShort", icon: Calculator, managersOnly: true },
  { to: "/einstellungen", label: "nav.company", short: "nav.company", icon: Settings, notInTabbar: true },
  { to: "/konto", label: "nav.account", short: "nav.account", icon: ShieldCheck },
];

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "theme.light", icon: Sun },
  { value: "dark", label: "theme.dark", icon: Moon },
  { value: "system", label: "theme.system", icon: Laptop },
];

export function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  const { t } = useI18n();
  return (
    <div className="theme-switch" role="radiogroup" aria-label={t("theme.label")}>
      {THEMES.map(({ value, label: key, icon: Icon }) => {
        const label = t(key);
        return (
        <button key={value} role="radio" aria-checked={theme === value} aria-label={label} title={label} className={theme === value ? "active" : ""} onClick={() => setTheme(value)}>
          <Icon size={16} />
        </button>
        );
      })}
    </div>
  );
}

export function Shell({ me, path, onLogout, children }: { me: Me; path: string; onLogout: () => void; children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t, lang, appText } = useI18n();
  const isManager = me.user.role !== "staff";
  // Die Kasse steht oben im Menü, sobald das Kassenmodul gebucht ist
  const hasPos = me.installedApps.includes(POS_APP_ID);
  const items = NAV.filter((item) => (!item.managersOnly || isManager) && (item.to !== "/kasse" || hasPos));
  const apps = me.installedApps.filter((id) => id !== POS_APP_ID).map(findApp).filter((a) => a !== undefined);
  const active = (to: string) => (to === "/" ? path === "/" : path.startsWith(to));
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo />
        <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
          <Search size={17} />
          <span>{t("common.search")}</span>
          <kbd>{isMac ? "⌘" : lang === "de" ? "Strg" : "Ctrl"} K</kbd>
        </button>
        <nav className="nav">
          {items.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className={active(to) ? "nav-item active" : "nav-item"}>
              <Icon size={19} /> {t(label)}
              {to === "/zeiten" && !!me.timeRequests && <span className="count-badge">{me.timeRequests}</span>}
            </Link>
          ))}
        </nav>
        {apps.length > 0 && (
          <div className="nav-group">
            <p className="nav-title">{t("nav.yourSystems")}</p>
            {apps.map((app) => (
              <Link key={app.id} to={`/app/${app.id}`} className={path.startsWith(`/app/${app.id}`) ? "nav-item active" : "nav-item"}>
                <AppIcon app={app} size="sm" /> {appText(app.id).name}
              </Link>
            ))}
          </div>
        )}
        <div className="sidebar-foot">
          <LegalLinks />
          <div className="row foot-switches">
            <ThemeSwitch />
            <LanguageSwitch compact up />
          </div>
          <div className="sidebar-user">
            <Avatar name={me.user.name} />
            <div>
              <strong>{me.user.name}</strong>
              <small>{t(`roles.${me.user.role}`)} · {me.user.tenantName}</small>
            </div>
            <button className="icon-button" onClick={onLogout} title={t("common.logout")} aria-label={t("common.logout")}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <header className="mobile-bar">
        <div className="row gap">
          <button
            className="icon-button mobile-menu-btn"
            onClick={() => setMobileMenuOpen(true)}
            aria-label={t("nav.menu") || "Menü"}
            title={t("nav.menu") || "Menü"}
          >
            <Menu size={22} />
          </button>
          <Logo />
        </div>
        <div className="row">
          <button className="icon-button" onClick={() => setPaletteOpen(true)} aria-label={t("common.search")}>
            <Search size={20} />
          </button>
          <LanguageSwitch compact />
          <button className="icon-button" onClick={onLogout} aria-label={t("common.logout")}>
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Mobile Drawer (Touch-Optimized Menu for Phones & Tablets) */}
      {mobileMenuOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <aside className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-head">
              <div className="sidebar-user" style={{ background: "transparent", padding: 0 }}>
                <Avatar name={me.user.name} />
                <div>
                  <strong>{me.user.name}</strong>
                  <small>{t(`roles.${me.user.role}`)} · {me.user.tenantName}</small>
                </div>
              </div>
              <button
                className="icon-button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label={t("common.close") || "Schließen"}
              >
                <X size={20} />
              </button>
            </div>

            {apps.length > 0 && (
              <div className="nav-group" style={{ marginTop: "16px" }}>
                <p className="nav-title">{t("nav.yourSystems")}</p>
                <div className="mobile-app-cards">
                  {apps.map((app) => (
                    <Link
                      key={app.id}
                      to={`/app/${app.id}`}
                      className={path.startsWith(`/app/${app.id}`) ? "mobile-app-card active" : "mobile-app-card"}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <AppIcon app={app} size="md" />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong>{appText(app.id).name}</strong>
                        <small>{appText(app.id).tagline}</small>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="nav-group" style={{ marginTop: "18px" }}>
              <p className="nav-title">{t("nav.menu") || "Navigation"}</p>
              <nav className="nav">
                {items.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className={active(to) ? "nav-item active" : "nav-item"}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon size={19} /> {t(label)}
                    {to === "/zeiten" && !!me.timeRequests && <span className="count-badge">{me.timeRequests}</span>}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="mobile-drawer-foot" style={{ marginTop: "auto", paddingTop: "20px" }}>
              <LegalLinks />
              <div className="row foot-switches" style={{ marginTop: "14px", marginBottom: "14px", justifyContent: "space-between" }}>
                <ThemeSwitch />
                <LanguageSwitch compact up />
              </div>
              <button className="button danger block" onClick={onLogout}>
                <LogOut size={18} /> {t("common.logout")}
              </button>
            </div>
          </aside>
        </div>
      )}

      <main className="content" key={path}>
        <BillingBanner me={me} />
        <VerifyBanner me={me} />
        {children}
        <LegalLinks className="mobile-only" />
      </main>

      <nav className="tabbar" aria-label={t("nav.menu")}>
        {/* Auf dem Smartphone/Tablet die Kernpunkte + Schnellzugriff auf Systeme */}
        {items.filter((item) => !item.notInTabbar).slice(0, 4).map(({ to, short, icon: Icon }) => (
          <Link key={to} to={to} className={active(to) ? "tab active" : "tab"}>
            <Icon size={21} />
            {to === "/zeiten" && !!me.timeRequests && <span className="count-badge tab-badge">{me.timeRequests}</span>}
            <span>{t(short)}</span>
          </Link>
        ))}
        {apps.length === 1 ? (
          <Link
            to={`/app/${apps[0].id}`}
            className={path.startsWith(`/app/${apps[0].id}`) ? "tab active" : "tab"}
          >
            <AppIcon app={apps[0]} size="sm" />
            <span>{appText(apps[0].id).name.split(" ")[0]}</span>
          </Link>
        ) : apps.length > 1 ? (
          <button
            className={`tab ${path.startsWith("/app/") ? "active" : ""}`}
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Systeme"
          >
            <FolderKanban size={21} />
            <span>Systeme</span>
          </button>
        ) : (
          <Link to="/katalog" className={active("/katalog") ? "tab active" : "tab"}>
            <Store size={21} />
            <span>{t("nav.catalogShort")}</span>
          </Link>
        )}
      </nav>

      <CommandPalette me={me} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {/* Ohne Freigabe nur die fertigen Vorschläge der Auswertung, nichts geht an die KI */}
      <Assistant me={me} ai={!!me.privacy?.assistant} />
    </div>
  );
}
