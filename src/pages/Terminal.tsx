import { useEffect, useRef, useState, type FormEvent } from "react";
import { LogIn, LogOut, Nfc, TriangleAlert } from "lucide-react";
import { api } from "../api";
import { useI18n } from "../i18n";
import { LanguageSwitch } from "../layout/LanguageSwitch";

interface StampResult { name: string; kind: "in" | "out"; at: string; duplicate: boolean }

/**
 * Stempeluhr ohne Anmeldung, z. B. auf einem Tablet am Eingang.
 * USB-Chipleser arbeiten wie eine Tastatur: Sie tippen die Chipnummer und drücken Enter.
 */
export function TerminalPage({ token }: { token: string }) {
  const { t, errorText, lang } = useI18n();
  const [info, setInfo] = useState<{ name: string; company: string } | null>(null);
  const [invalid, setInvalid] = useState("");
  const [chip, setChip] = useState("");
  const [result, setResult] = useState<StampResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ name: string; company: string }>(`/terminal/${token}`).then(setInfo).catch((e) => setInvalid(errorText(e)));
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [token]);

  // Als eigene App installierbar machen und den Bildschirm wach halten
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const before = link?.href;
    if (link) link.href = `/api/terminal/${token}/manifest`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#0a0b10");
    let lock: { release: () => Promise<void> } | null = null;
    const wake = async () => {
      try {
        lock = (await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
      } catch {
        // Nicht jedes Gerät erlaubt das, dann eben nicht
      }
    };
    wake();
    const onVisible = () => document.visibilityState === "visible" && wake();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (link && before) link.href = before;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => undefined);
    };
  }, [token]);

  // Eingabe immer im Fokus halten, damit der Leser jederzeit tippen kann
  useEffect(() => {
    const keep = () => setTimeout(() => input.current?.focus(), 50);
    keep();
    document.addEventListener("click", keep);
    return () => document.removeEventListener("click", keep);
  }, [info]);

  // Meldung nach ein paar Sekunden wieder ausblenden
  useEffect(() => {
    if (!result && !error) return;
    const timer = setTimeout(() => { setResult(null); setError(""); }, 5000);
    return () => clearTimeout(timer);
  }, [result, error]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = chip.trim();
    setChip("");
    if (!value || busy) return;
    setBusy(true);
    setResult(null);
    setError("");
    try {
      setResult(await api<StampResult>(`/terminal/${token}/stamp`, { method: "POST", body: { chip: value } }));
      navigator.vibrate?.(80);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const time = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(now);
  const date = new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long" }).format(now);

  if (invalid)
    return (
      <main className="kiosk">
        <div className="kiosk-panel"><TriangleAlert size={48} /><p className="kiosk-msg">{invalid}</p></div>
      </main>
    );

  return (
    <main className="kiosk">
      <header className="kiosk-head">
        <span>{info?.company}</span>
        <span className="muted">{info?.name}</span>
        <LanguageSwitch compact />
      </header>
      <div className="kiosk-panel">
        <p className="kiosk-time">{time}</p>
        <p className="kiosk-date">{date}</p>
        {result ? (
          <div className={`kiosk-result ${result.kind}`} role="status">
            {result.kind === "in" ? <LogIn size={44} /> : <LogOut size={44} />}
            <strong>{t(result.kind === "in" ? "time.welcome" : "time.goodbye", { name: result.name })}</strong>
            <span>
              {t(result.kind === "in" ? "time.stampedIn" : "time.stampedOut", { time: new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(new Date(result.at)) })}
              {result.duplicate && ` · ${t("time.alreadyStamped")}`}
            </span>
          </div>
        ) : error ? (
          <div className="kiosk-result error" role="alert"><TriangleAlert size={44} /><strong>{error}</strong></div>
        ) : (
          <div className="kiosk-hint"><Nfc size={56} /><span>{t("time.holdChip")}</span></div>
        )}
        <form onSubmit={submit} className="kiosk-form">
          <input
            ref={input} value={chip} onChange={(e) => setChip(e.target.value)} autoComplete="off" autoFocus
            aria-label={t("time.chipNumber")} placeholder={t("time.chipNumber")} inputMode="text"
          />
          <button className="button primary" disabled={busy}>{t("time.stamp")}</button>
        </form>
      </div>
    </main>
  );
}
