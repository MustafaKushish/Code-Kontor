import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, CornerDownLeft, LayoutDashboard, Search, Settings, ShieldCheck, Store, Users } from "lucide-react";
import type { Me } from "../api";
import { AppIcon } from "../components";
import { navigate } from "../router";
import { CATALOG } from "../../shared/apps";
import { useI18n } from "../i18n";

interface Entry {
  id: string;
  label: string;
  hint: string;
  to: string;
  icon: React.ReactNode;
}

/** Schnellsuche: Strg+K bzw. ⌘K öffnet sie von überall. */
export function CommandPalette({ me, open, onClose }: { me: Me; open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const { t, appText } = useI18n();

  const entries = useMemo<Entry[]>(() => {
    const pages: Entry[] = [
      { id: "home", label: t("nav.overview"), hint: t("palette.page"), to: "/", icon: <LayoutDashboard size={18} /> },
      { id: "catalog", label: t("nav.catalog"), hint: t("palette.page"), to: "/katalog", icon: <Store size={18} /> },
      { id: "company", label: t("palette.companyData"), hint: t("palette.page"), to: "/einstellungen", icon: <Settings size={18} /> },
      { id: "account", label: t("nav.account"), hint: t("palette.page"), to: "/konto", icon: <ShieldCheck size={18} /> },
    ];
    if (me.user.role !== "staff") pages.push({ id: "team", label: t("nav.team"), hint: t("palette.page"), to: "/team", icon: <Users size={18} /> });
    if (me.user.role !== "staff") pages.push({ id: "accounting", label: t("nav.accounting"), hint: t("palette.page"), to: "/buchhaltung", icon: <Calculator size={18} /> });
    const apps = CATALOG.map((app) => {
      const installed = me.installedApps.includes(app.id);
      return {
        id: app.id,
        label: appText(app.id).name,
        hint: installed ? t("palette.open") : t("palette.inCatalog"),
        to: installed ? `/app/${app.id}` : `/katalog/${app.id}`,
        icon: <AppIcon app={app} size="sm" />,
      };
    });
    const q = query.trim().toLowerCase();
    return [...pages, ...apps].filter((e) => !q || e.label.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, query, t]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const go = (entry?: Entry) => {
    if (!entry) return;
    onClose();
    navigate(entry.to);
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label={t("palette.title")} onMouseDown={(e) => e.stopPropagation()}>
        <label className="palette-input">
          <Search size={20} />
          <input
            ref={input}
            value={query}
            placeholder={t("palette.placeholder")}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, entries.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter") go(entries[index]);
              if (e.key === "Escape") onClose();
            }}
          />
          <kbd>Esc</kbd>
        </label>
        <ul className="palette-list" role="listbox">
          {entries.map((entry, i) => (
            <li
              key={entry.id}
              role="option"
              aria-selected={i === index}
              className={i === index ? "active" : undefined}
              onMouseEnter={() => setIndex(i)}
              onClick={() => go(entry)}
            >
              <span className="palette-icon">{entry.icon}</span>
              <span className="palette-label">{entry.label}</span>
              <span className="palette-hint">{entry.hint}</span>
              {i === index && <CornerDownLeft size={16} className="palette-enter" />}
            </li>
          ))}
          {entries.length === 0 && <li className="palette-empty">{t("palette.nothing")}</li>}
        </ul>
      </div>
    </div>
  );
}
