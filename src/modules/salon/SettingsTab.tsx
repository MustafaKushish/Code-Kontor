import { useEffect, useState } from "react";
import { CheckCircle2, Globe, Clock, Calendar, Copy, Check, QrCode } from "lucide-react";
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
    <div className="stack" style={{ maxWidth: "800px" }}>
      {saved && (
        <div className="notice success" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle2 size={18} /> {s("settings.saveSuccess")}
        </div>
      )}
      {errorMsg && (
        <div className="notice warning">
          {errorMsg}
        </div>
      )}

      {/* Öffentlicher Buchungslink */}
      <div className="card" style={{ background: "linear-gradient(135deg, var(--panel), color-mix(in srgb, var(--accent) 10%, var(--panel)))", border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--line))" }}>
        <h3 style={{ margin: "0 0 6px", display: "flex", alignItems: "center", gap: "8px" }}>
          <Globe size={20} style={{ color: "var(--accent)" }} />
          {s("settings.onlineBooking")}
        </h3>
        <p className="small muted">
          Teilen Sie diesen Link auf Ihrer Website, Instagram oder Google Maps, damit Kunden Termine rund um die Uhr selbstständig buchen können.
        </p>

        <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
          <input
            type="text"
            readOnly
            className="input"
            style={{ flex: 1, minWidth: "240px", background: "var(--panel)" }}
            value={publicBookingUrl}
          />
          <button className="button primary" onClick={copyLink}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Kopiert!" : "Link kopieren"}
          </button>
        </div>
      </div>

      {/* Salon Einstellungen Formular */}
      <form onSubmit={handleSave} className="card stack">
        <h3>{s("settings.hours")} & Terminregeln</h3>

        <Field label="Salonname / Studio">
          <input
            type="text"
            required
            className="input"
            value={settings.salonName}
            onChange={(e) => setSettings({ ...settings, salonName: e.target.value })}
          />
        </Field>

        <div className="row-grid">
          <Field label="Öffnung morgens">
            <input
              type="time"
              required
              className="input"
              value={settings.openTime}
              onChange={(e) => setSettings({ ...settings, openTime: e.target.value })}
            />
          </Field>
          <Field label="Schließung abends">
            <input
              type="time"
              required
              className="input"
              value={settings.closeTime}
              onChange={(e) => setSettings({ ...settings, closeTime: e.target.value })}
            />
          </Field>
        </div>

        <div className="row-grid">
          <Field label="Terminraster (Minuten)">
            <select
              className="input"
              value={settings.slotIntervalMinutes}
              onChange={(e) => setSettings({ ...settings, slotIntervalMinutes: Number(e.target.value) || 15 })}
            >
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
              className="input"
              value={settings.bookingAdvanceDays}
              onChange={(e) => setSettings({ ...settings, bookingAdvanceDays: Number(e.target.value) || 30 })}
            />
          </Field>
        </div>

        <Field label="Geöffnete Wochentage">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {[
              { d: 1, label: "Montag" },
              { d: 2, label: "Dienstag" },
              { d: 3, label: "Mittwoch" },
              { d: 4, label: "Donnerstag" },
              { d: 5, label: "Freitag" },
              { d: 6, label: "Samstag" },
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

        <Field label="Hinweis für Kunden bei der Buchung">
          <input
            type="text"
            className="input"
            placeholder="z.B. Bitte 5 Minuten vor dem Termin erscheinen. Kostenfreie Stornierung bis 24h vorher."
            value={settings.noticeText}
            onChange={(e) => setSettings({ ...settings, noticeText: e.target.value })}
          />
        </Field>

        <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "12px" }}>
          <button type="submit" className="button primary">
            <CheckCircle2 size={17} /> {s("actions.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
