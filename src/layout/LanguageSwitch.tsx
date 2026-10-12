import { Languages } from "lucide-react";
import { LANGUAGES, useI18n, type Lang } from "../i18n";

/** Sprachauswahl: zeigt jede Sprache in ihrer eigenen Schrift. */
export function LanguageSwitch({ compact }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <label className={compact ? "lang-switch compact" : "lang-switch"} title={t("common.language")}>
      <Languages size={16} aria-hidden />
      <select value={lang} aria-label={t("common.language")} onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
