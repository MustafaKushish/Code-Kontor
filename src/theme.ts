import { useEffect, useState } from "react";

// Hell, Dunkel oder wie das Gerät. Wird nur im Browser gemerkt.
export type ThemeChoice = "system" | "light" | "dark";
const KEY = "ck-theme";

export function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice) {
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
}

export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  useEffect(() => {
    applyTheme(theme);
    try {
      if (theme === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      // Speicher gesperrt (z. B. privates Fenster): Auswahl gilt nur für diese Sitzung
    }
  }, [theme]);
  return [theme, setTheme];
}
