import { useEffect, useState } from "react";
import { Save, Check, Settings2 } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { OfficeSettings } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";

export function SettingsTab() {
  const { o, officeError } = useOfficeI18n();
  const [settings, setSettings] = useState<OfficeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    api<{ settings: OfficeSettings }>("/office/settings")
      .then((d) => setSettings(d.settings))
      .catch((err) => setErrorMsg(officeError(err)))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setErrorMsg("");
    setSaved(false);
    try {
      const res = await api<{ settings: OfficeSettings }>("/office/settings", {
        method: "PUT",
        body: settings,
      });
      setSettings(res.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setErrorMsg(officeError(err));
    }
  };

  if (loading || !settings) return <p className="muted">Laden...</p>;

  return (
    <div className="stack" style={{ maxWidth: "680px" }}>
      {saved && (
        <div className="notice success" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Check size={18} /> {o("settings.saved")}
        </div>
      )}
      {errorMsg && <div className="notice warning">{errorMsg}</div>}

      <form onSubmit={handleSubmit} className="card stack">
        <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0 0 8px" }}>
          <Settings2 size={20} style={{ color: "var(--accent)" }} />
          {o("settings.title")}
        </h3>

        <div className="row-grid">
          <Field label={o("settings.defaultHourlyRate")} required>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              className="input"
              value={(settings.defaultHourlyRateCents / 100) || ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultHourlyRateCents: Math.round(parseFloat(e.target.value || "0") * 100),
                })
              }
            />
          </Field>
          <Field label={o("settings.defaultPaymentTerms")} required>
            <input
              type="number"
              min="0"
              max="180"
              required
              className="input"
              value={settings.defaultPaymentTermsDays}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultPaymentTermsDays: parseInt(e.target.value, 10) || 14,
                })
              }
            />
          </Field>
        </div>

        <div className="row-grid">
          <Field label={o("settings.quotePrefix")} required>
            <input
              type="text"
              required
              className="input"
              value={settings.quotePrefix}
              onChange={(e) => setSettings({ ...settings, quotePrefix: e.target.value.trim().toUpperCase() })}
            />
          </Field>
          <Field label={o("settings.invoicePrefix")} required>
            <input
              type="text"
              required
              className="input"
              value={settings.invoicePrefix}
              onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value.trim().toUpperCase() })}
            />
          </Field>
        </div>

        <Field label={o("settings.buyerReferenceDefault")}>
          <input
            type="text"
            className="input"
            placeholder="z.B. Leitweg-ID für öffentliche Auftraggeber"
            value={settings.buyerReferenceDefault}
            onChange={(e) => setSettings({ ...settings, buyerReferenceDefault: e.target.value })}
          />
        </Field>

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
          <label className="checkbox-label" style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              style={{ marginTop: "4px" }}
              checked={settings.eInvoiceEnabled}
              onChange={(e) => setSettings({ ...settings, eInvoiceEnabled: e.target.checked })}
            />
            <div>
              <strong>{o("settings.eInvoiceEnabled")}</strong>
              <div className="small muted">
                Generiert automatisch den EN16931-konformen XRechnung-Standard (UBL 2.1) für Rechnungen an Behörden und B2B-Kunden in Deutschland und der EU.
              </div>
            </div>
          </label>
        </div>

        <div className="row" style={{ justifyContent: "flex-end", marginTop: "12px" }}>
          <button type="submit" className="button primary">
            <Save size={18} /> {o("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
