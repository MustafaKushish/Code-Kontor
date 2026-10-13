import { useEffect, useState } from "react";
import { CheckCircle2, Download, MonitorSmartphone, Share, SquarePlus } from "lucide-react";
import { useI18n } from "../i18n";

// Chrome, Edge, Samsung Internet & Co. melden „Installierbar“ über dieses Ereignis.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** Früh in main.tsx aufrufen, sonst ist das Ereignis schon vorbei. */
export function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

type Platform = "ios" | "macSafari" | "android" | "desktop" | "firefox";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return "ios";
  if (/Firefox\//.test(ua) && !/Android/.test(ua)) return "firefox";
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return "macSafari";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

const isInstalled = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Karte „App installieren“: Code Kontor als App auf Handy, Tablet und Computer (Windows, macOS, Linux, ChromeOS, Android, iOS). */
export function InstallCard() {
  const { t } = useI18n();
  const [, rerender] = useState(0);
  const [installed, setInstalled] = useState(isInstalled);
  const platform = detectPlatform();

  useEffect(() => {
    const update = () => { rerender((n) => n + 1); setInstalled(isInstalled()); };
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") { deferred = null; setInstalled(true); }
  };

  return (
    <section className="card stack install-card">
      <h2 className="card-title"><MonitorSmartphone size={20} /> {t("install.title")}</h2>
      <p className="muted">{t("install.text")}</p>
      {installed ? (
        <p className="notice success"><CheckCircle2 size={18} /> {t("install.installed")}</p>
      ) : deferred ? (
        <button className="button primary" onClick={install}><Download size={18} /> {t("install.button")}</button>
      ) : platform === "ios" ? (
        <ol className="steps">
          <li><Share size={16} aria-hidden /> {t("install.ios1")}</li>
          <li><SquarePlus size={16} aria-hidden /> {t("install.ios2")}</li>
        </ol>
      ) : platform === "macSafari" ? (
        <p>{t("install.macSafari")}</p>
      ) : platform === "firefox" ? (
        <p>{t("install.firefox")}</p>
      ) : (
        <p>{t(platform === "android" ? "install.android" : "install.desktop")}</p>
      )}
      <p className="muted small">{t("install.everywhere")}</p>
    </section>
  );
}
