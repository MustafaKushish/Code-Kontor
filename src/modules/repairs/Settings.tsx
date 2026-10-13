import { useEffect, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { RepairSettings } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { MoneyInput } from "./parts";

export function SettingsTab() {
  const { r, repairError } = useRepairI18n();
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
        <Field label={r("settings.labor")}>
          <MoneyInput cents={settings.laborCents} onChange={(c) => c !== null && set({ laborCents: c })} />
        </Field>
      </div>
      <Field label={r("settings.terms")} wide>
        <textarea rows={5} value={settings.intakeTerms} onChange={(e) => set({ intakeTerms: e.target.value })} />
      </Field>
      {error && <p className="error">{error}</p>}
      <div className="row gap">
        <button className="button primary">{r("settings.save")}</button>
        {saved && <span className="success-text"><Check size={16} /> {r("settings.saved")}</span>}
      </div>
    </form>
  );
}
