import { useEffect, useState } from "react";
import { Barcode, BookOpen, LayoutDashboard, Maximize, Menu, Minimize, Monitor, Receipt, Settings2, ShieldAlert, ShoppingCart, X } from "lucide-react";
import { Avatar } from "../components";
import type { Me } from "../api";
import { navigate } from "../router";
import { usePosI18n } from "./i18n";
import { Register } from "./Register";
import { Receipts } from "./Receipts";
import { CashBook } from "./CashBook";
import { ItemsTab } from "./Items";
import { PosSettingsTab } from "./Settings";
import { setDeviceRegister, useRegisters } from "./registers";
import { usePosSettings } from "./PayPanel";
import "./pos.css";

const BASE = "/kasse";
const KIOSK = `${BASE}/modus`;

/** Adresse ersetzen, ohne einen Schritt in der Zurück-Liste (sonst landet Zurück wieder hier). */
function replacePath(path: string) {
  history.replaceState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Die Kasse der Firma: für alle installierten Systeme gemeinsam. */
export default function PosApp({ me, path }: { me: Me; path: string }) {
  const { p, ready } = usePosI18n();
  const isManager = me.user.role !== "staff";
  const section = path.split("/")[2] ?? "";
  const [settings] = usePosSettings();
  const direct = settings?.directKiosk ?? false;
  // Direkt in den Kassenmodus; Übergaben wie „?auftrag=…“ nimmt er mit
  useEffect(() => {
    if (direct && section === "") replacePath(`${KIOSK}${location.search}`);
  }, [direct, section]);
  if (!ready || (direct && section === "")) return null;

  const TABS = { "": "sell", artikel: "items", belege: "receipts", kassenbuch: "cashbook", einstellungen: "settings" } as const;
  let tab: (typeof TABS)[keyof typeof TABS] = TABS[section as keyof typeof TABS] ?? "sell";
  if (tab === "settings" && !isManager) tab = "sell";
  const tabs = [
    { id: "sell", to: direct ? KIOSK : BASE, icon: ShoppingCart },
    { id: "items", to: `${BASE}/artikel`, icon: Barcode },
    { id: "receipts", to: `${BASE}/belege`, icon: Receipt },
    { id: "cashbook", to: `${BASE}/kassenbuch`, icon: BookOpen },
    ...(isManager ? [{ id: "settings", to: `${BASE}/einstellungen`, icon: Settings2 }] : []),
  ];
  const country = me.tax?.country ?? "DE";

  return (
    <div className="stack-lg pos">
      <header className="page-head">
        <div>
          <h1 className="display">{p("title")}</h1>
          <p className="muted">{p("subtitle")}</p>
        </div>
        <div className="row gap pos-head-actions">
          <RegisterSelect />
          <button className="button" onClick={() => navigate(`${BASE}/modus`)}><Monitor size={18} /> {p("kiosk.open")}</button>
        </div>
      </header>
      <div className="page-tabs pos-tabs" role="tablist">
        {tabs.map(({ id, to, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => navigate(to)}>
            <Icon size={17} aria-hidden /> {p(`tabs.${id}`)}
          </button>
        ))}
      </div>
      {country === "DE" && tab === "sell" && <p className="notice small">{p("tse.notice")}</p>}
      {tab === "sell" && <Register isManager={isManager} />}
      {tab === "items" && <ItemsTab isManager={isManager} />}
      {tab === "receipts" && <Receipts isManager={isManager} />}
      {tab === "cashbook" && <CashBook isManager={isManager} />}
      {tab === "settings" && <PosSettingsTab country={country} />}
    </div>
  );
}

/** Auswahl des Kassenplatzes für dieses Gerät; erscheint erst ab zwei Plätzen. */
export function RegisterSelect() {
  const { p } = usePosI18n();
  const { registers, current } = useRegisters();
  if (registers.length < 2) return null;
  return (
    <label className="pos-register-select">
      <select value={current.id} onChange={(e) => setDeviceRegister(e.target.value)} aria-label={p("registers.label")}>
        {registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </label>
  );
}

/** Kassenmodus: nur Verkaufen, ohne Menü der Plattform, großflächig für Theke und Tablet; Scanner ist immer bereit. */
export function Kiosk({ me }: { me: Me }) {
  const { p, ready } = usePosI18n();
  const [full, setFull] = useState(!!document.fullscreenElement);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  if (!ready) return null;

  const isManager = me.user.role !== "staff";
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  const go = (to: string) => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    navigate(to);
  };
  const links = [
    { to: `${BASE}/artikel`, label: p("tabs.items"), icon: Barcode },
    { to: `${BASE}/belege`, label: p("tabs.receipts"), icon: Receipt },
    { to: `${BASE}/kassenbuch`, label: p("tabs.cashbook"), icon: BookOpen },
    ...(isManager ? [{ to: `${BASE}/einstellungen`, label: p("tabs.settings"), icon: Settings2 }] : []),
    { to: "/", label: p("kiosk.overview"), icon: LayoutDashboard },
  ];

  return (
    <div className="pos pos-kiosk">
      <header className="pos-kiosk-bar">
        <img className="pos-kiosk-logo" src="/icon.svg" alt="" width={36} height={36} />
        <span className="pos-kiosk-title">
          <strong>{me.user.tenantName}</strong>
          <small><Avatar name={me.user.name} /> {me.user.name}</small>
        </span>
        <span className="row gap-sm push-end">
          {(me.tax?.country ?? "DE") === "DE" && <span className="pos-tse-chip" title={p("tse.notice")}><ShieldAlert size={15} aria-hidden /> <span>{p("tse.short")}</span></span>}
          <Clock />
          <RegisterSelect />
          {document.fullscreenEnabled && (
            <button className="button icon-only" onClick={toggleFull} aria-label={full ? p("kiosk.leaveFullscreen") : p("kiosk.fullscreen")} title={full ? p("kiosk.leaveFullscreen") : p("kiosk.fullscreen")}>
              {full ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          )}
          <span className="pos-menu">
            <button className="button" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={18} /> : <Menu size={18} />} {p("kiosk.menu")}</button>
            {menu && (
              <span className="pos-menu-list card" role="menu">
                {links.map(({ to, label, icon: Icon }) => (
                  <button key={to} role="menuitem" onClick={() => go(to)}><Icon size={17} aria-hidden /> {label}</button>
                ))}
              </span>
            )}
          </span>
        </span>
      </header>
      <Register isManager={isManager} kiosk />
    </div>
  );
}

/** Uhrzeit und Datum an der Theke; die Kasse bleibt den ganzen Tag offen. */
function Clock() {
  const { lang } = usePosI18n();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="pos-clock">
      <strong>{now.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}</strong>
      <small>{now.toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" })}</small>
    </span>
  );
}
