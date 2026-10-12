import type { ReactNode } from "react";
import { LayoutDashboard, LogOut, Settings, Store, Users } from "lucide-react";
import { roleLabel, type Me } from "../api";
import { AppIcon, Avatar, Link, Logo } from "../components";
import { findApp } from "../../shared/apps";

const NAV = [
  { to: "/", label: "Übersicht", icon: LayoutDashboard },
  { to: "/katalog", label: "App-Katalog", icon: Store },
  { to: "/team", label: "Team", icon: Users, managersOnly: true },
  { to: "/einstellungen", label: "Firma", icon: Settings },
];

export function Shell({ me, path, onLogout, children }: { me: Me; path: string; onLogout: () => void; children: ReactNode }) {
  const isManager = me.user.role !== "staff";
  const items = NAV.filter((item) => !item.managersOnly || isManager);
  const apps = me.installedApps.map(findApp).filter((a) => a !== undefined);
  const active = (to: string) => (to === "/" ? path === "/" : path.startsWith(to));

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo />
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
      </aside>

      <header className="mobile-bar">
        <Logo />
        <button className="icon-button" onClick={onLogout} aria-label="Abmelden">
          <LogOut size={20} />
        </button>
      </header>

      <main className="content">{children}</main>

      <nav className="tabbar" aria-label="Hauptmenü">
        {items.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className={active(to) ? "tab active" : "tab"}>
            <Icon size={22} />
            <span>{label === "App-Katalog" ? "Katalog" : label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
