import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, LayoutDashboard, Search, Settings, Store, Users } from "lucide-react";
import type { Me } from "../api";
import { AppIcon } from "../components";
import { navigate } from "../router";
import { CATALOG } from "../../shared/apps";

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

  const entries = useMemo<Entry[]>(() => {
    const pages: Entry[] = [
      { id: "home", label: "Übersicht", hint: "Seite", to: "/", icon: <LayoutDashboard size={18} /> },
      { id: "catalog", label: "App-Katalog", hint: "Seite", to: "/katalog", icon: <Store size={18} /> },
      { id: "company", label: "Firmendaten", hint: "Seite", to: "/einstellungen", icon: <Settings size={18} /> },
    ];
    if (me.user.role !== "staff") pages.push({ id: "team", label: "Team", hint: "Seite", to: "/team", icon: <Users size={18} /> });
    const apps = CATALOG.map((app) => {
      const installed = me.installedApps.includes(app.id);
      return {
        id: app.id,
        label: app.name,
        hint: installed ? "Öffnen" : "Im Katalog",
        to: installed ? `/app/${app.id}` : `/katalog/${app.id}`,
        icon: <AppIcon app={app} size="sm" />,
      };
    });
    const q = query.trim().toLowerCase();
    return [...pages, ...apps].filter((e) => !q || e.label.toLowerCase().includes(q));
  }, [me, query]);

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
      <div className="palette" role="dialog" aria-label="Schnellsuche" onMouseDown={(e) => e.stopPropagation()}>
        <label className="palette-input">
          <Search size={20} />
          <input
            ref={input}
            value={query}
            placeholder="Wohin möchtest du?"
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
          {entries.length === 0 && <li className="palette-empty">Nichts gefunden.</li>}
        </ul>
      </div>
    </div>
  );
}
