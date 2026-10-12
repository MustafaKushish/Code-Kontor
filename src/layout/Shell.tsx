import { useEffect, useState, type ReactNode } from "react";
import { Calculator, Laptop, LayoutDashboard, LogOut, Moon, Search, Settings, ShieldCheck, Store, Sun, Users } from "lucide-react";
import type { Me } from "../api";
import { AppIcon, Avatar, Link, Logo } from "../components";
import { useTheme, type ThemeChoice } from "../theme";
import { CommandPalette } from "./CommandPalette";
import { findApp } from "../../shared/apps";
import { useI18n } from "../i18n";
import { LanguageSwitch } from "./LanguageSwitch";
import { Assistant } from "./Assistant";
import { VerifyBanner } from "../pages/Account";

const NAV = [
  { to: "/", label: "nav.overview", short: "nav.startShort", icon: LayoutDashboard },
  { to: "/katalog", label: "nav.catalog", short: "nav.catalogShort", icon: Store },
  { to: "/team", label: "nav.team", short: "nav.team", icon: Users, managersOnly: true },
  { to: "/buchhaltung", label: "nav.accounting", short: "nav.accountingShort", icon: Calculator, managersOnly: true },
  { to: "/einstellungen", label: "nav.company", short: "nav.company", icon: Settings },
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
  const { t, lang, appText } = useI18n();
  const isManager = me.user.role !== "staff";
  const items = NAV.filter((item) => !item.managersOnly || isManager);
  const apps = me.installedApps.map(findApp).filter((a) => a !== undefined);
  const active = (to: string) => (to === "/" ? path === "/" : path.startsWith(to));
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
            </Link>
          ))}
        </nav>
        {apps.length > 0 && (
          <div className="nav-group">
            <p className="nav-title">{t("nav.yourSystems")}</p>
            {apps.map((app) => (
              <Link key={app.id} to={`/app/${app.id}`} className={path === `/app/${app.id}` ? "nav-item active" : "nav-item"}>
                <AppIcon app={app} size="sm" /> {appText(app.id).name}
              </Link>
            ))}
          </div>
        )}
        <div className="sidebar-foot">
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
        <Logo />
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

      <main className="content" key={path}>
        <VerifyBanner me={me} />
        {children}
      </main>

      <nav className="tabbar" aria-label={t("nav.menu")}>
        {items.map(({ to, short, icon: Icon }) => (
          <Link key={to} to={to} className={active(to) ? "tab active" : "tab"}>
            <Icon size={21} />
            <span>{t(short)}</span>
          </Link>
        ))}
      </nav>

      <CommandPalette me={me} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Assistant me={me} />
    </div>
  );
}
