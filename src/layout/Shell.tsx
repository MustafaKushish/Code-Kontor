import { useEffect, useState, type ReactNode } from "react";
import { Laptop, LayoutDashboard, LogOut, Moon, Search, Settings, Store, Sun, Users } from "lucide-react";
import { roleLabel, type Me } from "../api";
import { AppIcon, Avatar, Link, Logo } from "../components";
import { useTheme, type ThemeChoice } from "../theme";
import { CommandPalette } from "./CommandPalette";
import { findApp } from "../../shared/apps";

const NAV = [
  { to: "/", label: "Übersicht", short: "Start", icon: LayoutDashboard },
  { to: "/katalog", label: "App-Katalog", short: "Katalog", icon: Store },
  { to: "/team", label: "Team", short: "Team", icon: Users, managersOnly: true },
  { to: "/einstellungen", label: "Firma", short: "Firma", icon: Settings },
];

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
  { value: "system", label: "Wie Gerät", icon: Laptop },
];

export function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Darstellung">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button key={value} role="radio" aria-checked={theme === value} aria-label={label} title={label} className={theme === value ? "active" : ""} onClick={() => setTheme(value)}>
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}

export function Shell({ me, path, onLogout, children }: { me: Me; path: string; onLogout: () => void; children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
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
          <span>Suchen</span>
          <kbd>{isMac ? "⌘" : "Strg"} K</kbd>
        </button>
        <nav className="nav">
          {items.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className={active(to) ? "nav-item active" : "nav-item"}>
              <Icon size={19} /> {label}
            </Link>
          ))}
        </nav>
        {apps.length > 0 && (
          <div className="nav-group">
            <p className="nav-title">Deine Systeme</p>
            {apps.map((app) => (
              <Link key={app.id} to={`/app/${app.id}`} className={path === `/app/${app.id}` ? "nav-item active" : "nav-item"}>
                <AppIcon app={app} size="sm" /> {app.name}
              </Link>
            ))}
          </div>
        )}
        <div className="sidebar-foot">
          <ThemeSwitch />
          <div className="sidebar-user">
            <Avatar name={me.user.name} />
            <div>
              <strong>{me.user.name}</strong>
              <small>{roleLabel[me.user.role]} · {me.user.tenantName}</small>
            </div>
            <button className="icon-button" onClick={onLogout} title="Abmelden" aria-label="Abmelden">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <header className="mobile-bar">
        <Logo />
        <div className="row">
          <button className="icon-button" onClick={() => setPaletteOpen(true)} aria-label="Suchen">
            <Search size={20} />
          </button>
          <button className="icon-button" onClick={onLogout} aria-label="Abmelden">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="content" key={path}>
        {children}
      </main>

      <nav className="tabbar" aria-label="Hauptmenü">
        {items.map(({ to, short, icon: Icon }) => (
          <Link key={to} to={to} className={active(to) ? "tab active" : "tab"}>
            <Icon size={21} />
            <span>{short}</span>
          </Link>
        ))}
      </nav>

      <CommandPalette me={me} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
