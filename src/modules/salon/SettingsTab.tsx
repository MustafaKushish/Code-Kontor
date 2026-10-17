import { useEffect, useState } from "react";
import { CheckCircle2, Globe, Clock, Copy, Check } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { SalonSettings } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";

export function SettingsTab() {
  const { s } = useSalonI18n();
  const [settings, setSettings] = useState<SalonSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tenantId, setTenantId] = useState("");

  const loadData = async () => {
    try {
      const [sRes, meRes] = await Promise.all([
        api<{ settings: SalonSettings }>("/salon/settings"),
        api<any>("/me"),
      ]);
      setSettings(sRes.settings);
      setTenantId(meRes.user.tenantId);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const [errorMsg, setErrorMsg] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setErrorMsg("");
    try {
      const res = await api<{ settings: SalonSettings }>("/salon/settings", {
        method: "POST",
        body: settings,
      });
      setSettings(res.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim Speichern der Einstellungen");
    }
  };

  if (loading || !settings) return <p className="muted">Lade Einstellungen...</p>;

  const publicBookingUrl = typeof window !== "undefined"
    ? `${window.location.origin}/termin/salon/${tenantId}`
    : `/termin/salon/${tenantId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(publicBookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="stack salon-settings">
      {saved && (
        <p className="notice success">
          <CheckCircle2 size={18} /> {s("settings.saveSuccess")}
        </p>
      )}
      {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

      {/* Öffentlicher Buchungslink */}
      <section className="card stack">
        <h2 className="card-title">
          <Globe size={20} /> {s("settings.onlineBooking")}
        </h2>
        <p className="small muted">
          Teilen Sie diesen Link auf Ihrer Website, Instagram oder Google Maps, damit Kunden Termine rund um die Uhr selbstständig buchen können.
        </p>
        <div className="salon-toolbar">
          <label className="search">
            <Globe size={18} />
            <input type="text" readOnly value={publicBookingUrl} aria-label={s("settings.onlineBooking")} />
          </label>
          <button className="button primary" onClick={copyLink}>
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? "Kopiert!" : "Link kopieren"}
          </button>
        </div>
      </section>

      {/* Salon Einstellungen Formular */}
      <form onSubmit={handleSave} className="card stack">
        <h2 className="card-title"><Clock size={20} /> {s("settings.hours")} & Terminregeln</h2>

        <label className="check">
          <input type="checkbox" checked={settings.onlineBookingEnabled} onChange={(e) => setSettings({ ...settings, onlineBookingEnabled: e.target.checked })} />
          <span className="stack-sm"><span>Online-Terminbuchung erlauben</span><small className="muted">Kunden buchen über den Link oben freie Zeiten selbst.</small></span>
        </label>

        <div className="grid form-grid">
          <Field label="Salonname / Studio" wide>
            <input type="text" required value={settings.salonName} onChange={(e) => setSettings({ ...settings, salonName: e.target.value })} />
          </Field>

          <Field label="Öffnung morgens">
            <input type="time" required value={settings.openTime} onChange={(e) => setSettings({ ...settings, openTime: e.target.value })} />
          </Field>
          <Field label="Schließung abends">
            <input type="time" required value={settings.closeTime} onChange={(e) => setSettings({ ...settings, closeTime: e.target.value })} />
          </Field>

          <Field label="Terminraster (Minuten)">
            <select value={settings.slotIntervalMinutes} onChange={(e) => setSettings({ ...settings, slotIntervalMinutes: Number(e.target.value) || 15 })}>
              <option value="15">15 Minuten (Empfohlen)</option>
              <option value="30">30 Minuten</option>
              <option value="60">60 Minuten</option>
            </select>
          </Field>

          <Field label="Buchbar im Voraus (Tage)">
            <input
              type="number"
              min="7"
              max="180"
              value={settings.bookingAdvanceDays}
              onChange={(e) => setSettings({ ...settings, bookingAdvanceDays: Number(e.target.value) || 30 })}
            />
          </Field>

          <Field label="Geöffnete Wochentage" wide>
            <div className="chips wrap">
              {[
                { d: 1, label: "Montag" },
                { d: 2, label: "Dienstag" },
                { d: 3, label: "Mittwoch" },
                { d: 4, label: "Donnerstag" },
                { d: 5, label: "Freitag" },
                { d: 6, label: "Samstag" },
                { d: 7, label: "Sonntag" },
              ].map(({ d, label }) => {
                const active = settings.openDays.includes(d);
                return (
                  <button
                    type="button"
                    key={d}
                    className={`chip ${active ? "active" : ""}`}
                    onClick={() => {
                      if (active) {
                        setSettings({ ...settings, openDays: settings.openDays.filter((x) => x !== d) });
                      } else {
                        setSettings({ ...settings, openDays: [...settings.openDays, d].sort() });
                      }
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Hinweis für Kunden bei der Buchung" wide>
            <input
              type="text"
              placeholder="z.B. Bitte 5 Minuten vor dem Termin erscheinen. Kostenfreie Stornierung bis 24h vorher."
              value={settings.noticeText}
              onChange={(e) => setSettings({ ...settings, noticeText: e.target.value })}
            />
          </Field>
        </div>

        <div className="actions">
          <button type="submit" className="button primary">
            <CheckCircle2 size={17} /> {s("actions.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
