import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Check, MessageCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { MESSAGE_FIELDS, type BookingSettings, type MessageTemplate, type RepairSettings } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { MoneyInput } from "./parts";
import { defaultTemplates } from "./Media";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

export function SettingsTab() {
  const { r, lang, repairError } = useRepairI18n();
  const [settings, setSettings] = useState<RepairSettings | null>(null);
  const [mailEnabled, setMailEnabled] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ settings: RepairSettings; mailEnabled: boolean }>("/repairs/settings")
      .then((d) => (setSettings(d.settings), setMailEnabled(d.mailEnabled)))
      .catch((e) => setError(repairError(e)));
  }, []);

  if (!settings) return error ? <p className="error">{error}</p> : null;
  const set = (patch: Partial<RepairSettings>) => (setSettings({ ...settings, ...patch }), setSaved(false));
  const setBooking = (patch: Partial<BookingSettings>) => set({ booking: { ...settings.booking, ...patch } });
  const templates = settings.messages.length ? settings.messages : defaultTemplates(r);
  const setTemplate = (id: string, patch: Partial<MessageTemplate>) => set({ messages: templates.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const weekdayName = (d: number) => new Date(Date.UTC(2024, 0, 7 + d)).toLocaleDateString(lang, { weekday: "short", timeZone: "UTC" });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      setSettings((await api<{ settings: RepairSettings }>("/repairs/settings", { method: "PUT", body: settings })).settings);
      setSaved(true);
    } catch (err) {
      setError(repairError(err));
    }
  };

  return (
    <form className="card stack repair-settings" onSubmit={save}>
      <h2>{r("settings.title")}</h2>
      <label className="check">
        <input type="checkbox" checked={settings.smallBusiness} onChange={(e) => set({ smallBusiness: e.target.checked })} />
        <span className="stack-sm"><span>{r("settings.smallBusiness")}</span><small className="muted">{r("settings.smallBusinessHint")}</small></span>
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.notifyByMail} onChange={(e) => set({ notifyByMail: e.target.checked })} />
        <span className="stack-sm"><span>{r("settings.notify")}</span><small className="muted">{r("settings.notifyHint")}</small></span>
      </label>
      {!mailEnabled && <p className="notice">{r("settings.mailMissing")}</p>}
      <div className="grid form-grid">
        <Field label={r("settings.warranty")}>
          <input type="number" min={0} max={60} value={settings.warrantyMonths} onChange={(e) => set({ warrantyMonths: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
        </Field>
        <Field label={r("settings.usedWarranty")} hint={r("settings.usedWarrantyHint")}>
          <input type="number" min={0} max={60} value={settings.usedWarrantyMonths} onChange={(e) => set({ usedWarrantyMonths: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
        </Field>
        <Field label={r("settings.labor")}>
          <MoneyInput cents={settings.laborCents} onChange={(c) => c !== null && set({ laborCents: c })} />
        </Field>
      </div>
      <Field label={r("settings.terms")} wide>
        <textarea rows={5} value={settings.intakeTerms} onChange={(e) => set({ intakeTerms: e.target.value })} />
      </Field>

      <h2 className="card-title"><MessageCircle size={20} /> {r("messages.settingsTitle")}</h2>
      <p className="muted small">{r("messages.settingsText")} <span className="mono">{MESSAGE_FIELDS.map((f) => `{${f}}`).join(" ")}</span></p>
      {templates.map((t) => (
        <div key={t.id} className="template-row">
          <input value={t.name} onChange={(e) => setTemplate(t.id, { name: e.target.value })} aria-label={r("messages.name")} placeholder={r("messages.name")} />
          <textarea rows={3} value={t.text} onChange={(e) => setTemplate(t.id, { text: e.target.value })} aria-label={r("messages.text")} />
          <button type="button" className="icon-button danger" onClick={() => set({ messages: templates.filter((x) => x.id !== t.id) })} aria-label={r("messages.remove")}><Trash2 size={16} /></button>
        </div>
      ))}
      <div className="row wrap gap">
        {templates.length < 20 && <button type="button" className="button" onClick={() => set({ messages: [...templates, { id: crypto.randomUUID(), name: "", text: "" }] })}><Plus size={16} /> {r("messages.add")}</button>}
        {settings.messages.length > 0 && <button type="button" className="text-button" onClick={() => set({ messages: [] })}><RotateCcw size={15} /> {r("messages.reset")}</button>}
      </div>
      <Field label={r("messages.countryCode")} hint={r("messages.countryCodeHint")}>
        <input inputMode="numeric" value={settings.countryCode} onChange={(e) => set({ countryCode: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="short-input" />
      </Field>

      <h2 className="card-title"><CalendarDays size={20} /> {r("bookings.settingsTitle")}</h2>
      <label className="check">
        <input type="checkbox" checked={settings.booking.enabled} onChange={(e) => setBooking({ enabled: e.target.checked })} />
        <span className="stack-sm"><span>{r("bookings.enable")}</span><small className="muted">{r("bookings.enableHint")}</small></span>
      </label>
      {settings.booking.enabled && (
        <>
          <div className="field">
            <span className="field-label">{r("bookings.weekdays")}</span>
            <div className="chips wrap">
              {WEEKDAYS.map((d) => {
                const on = settings.booking.weekdays.includes(d);
                return <button type="button" key={d} aria-pressed={on} className={on ? "chip active" : "chip"} onClick={() => setBooking({ weekdays: on ? settings.booking.weekdays.filter((x) => x !== d) : [...settings.booking.weekdays, d] })}>{weekdayName(d)}</button>;
              })}
            </div>
          </div>
          <div className="grid form-grid">
            <Field label={r("bookings.from")}><input type="time" value={settings.booking.from} onChange={(e) => setBooking({ from: e.target.value })} /></Field>
            <Field label={r("bookings.to")} hint={r("bookings.toHint")}><input type="time" value={settings.booking.to} onChange={(e) => setBooking({ to: e.target.value })} /></Field>
            <Field label={r("bookings.slot")}>
              <select value={settings.booking.slotMinutes} onChange={(e) => setBooking({ slotMinutes: Number(e.target.value) })}>
                {[15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{r("prices.minutesShort", { n: m })}</option>)}
              </select>
            </Field>
            <Field label={r("bookings.perSlot")}><input type="number" min={1} max={20} value={settings.booking.perSlot} onChange={(e) => setBooking({ perSlot: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></Field>
            <Field label={r("bookings.daysAhead")}><input type="number" min={1} max={60} value={settings.booking.daysAhead} onChange={(e) => setBooking({ daysAhead: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} /></Field>
            <Field label={r("bookings.note")} hint={r("bookings.noteHint")} wide><textarea rows={2} value={settings.booking.note} onChange={(e) => setBooking({ note: e.target.value })} /></Field>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
      <div className="row gap">
        <button className="button primary">{r("settings.save")}</button>
        {saved && <span className="success-text"><Check size={16} /> {r("settings.saved")}</span>}
      </div>
    </form>
  );
}
