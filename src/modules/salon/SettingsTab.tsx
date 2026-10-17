import { useEffect, useState } from "react";
import { CheckCircle2, Globe, Clock, Copy, Check } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { SalonSettings } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";

export function SettingsTab() {
  const { s, errorText } = useSalonI18n();
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
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  if (loading || !settings) return <p className="muted">{s("settings.loading")}</p>;

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
          {s("settings.shareHint")}
        </p>
        <div className="salon-toolbar">
          <label className="search">
            <Globe size={18} />
            <input type="text" readOnly value={publicBookingUrl} aria-label={s("settings.onlineBooking")} />
          </label>
          <button className="button primary" onClick={copyLink}>
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? s("settings.copied") : s("settings.copyLink")}
          </button>
        </div>
      </section>

      {/* Salon Einstellungen Formular */}
      <form onSubmit={handleSave} className="card stack">
        <h2 className="card-title"><Clock size={20} /> {s("settings.hoursAndRules")}</h2>

        <label className="check">
          <input type="checkbox" checked={settings.onlineBookingEnabled} onChange={(e) => setSettings({ ...settings, onlineBookingEnabled: e.target.checked })} />
          <span className="stack-sm"><span>{s("settings.allowOnline")}</span><small className="muted">{s("settings.allowOnlineHint")}</small></span>
        </label>

        <div className="grid form-grid">
          <Field label={s("settings.salonName")} wide>
            <input type="text" required value={settings.salonName} onChange={(e) => setSettings({ ...settings, salonName: e.target.value })} />
          </Field>

          <Field label={s("settings.openTime")}>
            <input type="time" required value={settings.openTime} onChange={(e) => setSettings({ ...settings, openTime: e.target.value })} />
          </Field>
          <Field label={s("settings.closeTime")}>
            <input type="time" required value={settings.closeTime} onChange={(e) => setSettings({ ...settings, closeTime: e.target.value })} />
          </Field>

          <Field label={s("settings.slotInterval")}>
            <select value={settings.slotIntervalMinutes} onChange={(e) => setSettings({ ...settings, slotIntervalMinutes: Number(e.target.value) || 15 })}>
              <option value="15">{s("settings.slot15")}</option>
              <option value="30">{s("settings.slot30")}</option>
              <option value="60">{s("settings.slot60")}</option>
            </select>
          </Field>

          <Field label={s("settings.advanceDays")}>
            <input
              type="number"
              min="7"
              max="180"
              value={settings.bookingAdvanceDays}
              onChange={(e) => setSettings({ ...settings, bookingAdvanceDays: Number(e.target.value) || 30 })}
            />
          </Field>

          <Field label={s("settings.openDays")} wide>
            <div className="chips wrap">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const label = s(`weekdays.${d}`);
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

          <Field label={s("settings.notice")} wide>
            <input
              type="text"
              placeholder={s("settings.noticePlaceholder")}
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
