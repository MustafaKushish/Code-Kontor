import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { LANGUAGES, useI18n } from "../i18n";

/**
 * Sprachauswahl als eigenes Menü im Stil der App.
 * compact: nur Symbol und Kürzel (Seitenleiste, Handy-Leiste).
 * up: Menü öffnet sich nach oben (unten in der Seitenleiste).
 */
export function LanguageSwitch({ compact, up }: { compact?: boolean; up?: boolean }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = LANGUAGES.find((l) => l.code === lang)!;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const move = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(list.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div className={`lang ${compact ? "compact" : ""} ${up ? "up" : ""}`} ref={root}>
      <button
        type="button"
        className="lang-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("common.language")}: ${current.name}`}
        title={t("common.language")}
        onClick={() => setOpen(!open)}
      >
        <Globe size={17} aria-hidden />
        {compact ? <span className="lang-code">{current.code.toUpperCase()}</span> : <span>{current.name}</span>}
        {!compact && <ChevronDown size={16} className="lang-chevron" aria-hidden />}
      </button>
      {open && (
        <ul className="lang-menu" role="menu" aria-label={t("common.language")} ref={list} onKeyDown={move}>
          {LANGUAGES.map((l) => (
            <li key={l.code} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={l.code === lang}
                lang={l.code}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
              >
                <span className="lang-badge">{l.code.toUpperCase()}</span>
                <span className="lang-name">{l.name}</span>
                {l.code === lang && <Check size={16} className="lang-check" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
