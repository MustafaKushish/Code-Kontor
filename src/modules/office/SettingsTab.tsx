import { useEffect, useState } from "react";
import { Save, Check, Settings2, Plus, Trash2, Users, AlertTriangle, Hash } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { OfficeSettings, RoleRate } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";
import { currencySymbol } from "../../money";

export function SettingsTab() {
  const { o, euro, officeError } = useOfficeI18n();
  const [settings, setSettings] = useState<OfficeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleRateEur, setNewRoleRateEur] = useState("100.00");

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

  const handleAddRoleRate = () => {
    if (!settings || !newRoleName.trim()) return;
    const cents = Math.round((parseFloat(newRoleRateEur) || 0) * 100);
    const newRole: RoleRate = {
      id: crypto.randomUUID(),
      name: newRoleName.trim(),
      hourlyRateCents: cents,
    };
    setSettings({
      ...settings,
      roleRates: [...(settings.roleRates || []), newRole],
    });
    setNewRoleName("");
    setNewRoleRateEur("100.00");
  };

  const handleRemoveRoleRate = (id: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      roleRates: (settings.roleRates || []).filter((r) => r.id !== id),
    });
  };

  if (loading || !settings) return <p className="muted">Laden...</p>;

  return (
    <div className="stack office-settings">
      {saved && (
        <p className="notice success"><Check size={18} /> {o("settings.saved")}</p>
      )}
      {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

      <form onSubmit={handleSubmit} className="card stack">
        <div className="section-head">
          <h2 className="card-title"><Settings2 size={20} /> {o("settings.title")}</h2>
        </div>

        {/* Allgemeine Standards */}
        <div className="grid form-grid">
          <Field label={o("settings.defaultHourlyRate")} required>
            <input
              type="number"
              step="0.01"
              min="0"
              required
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
              value={settings.defaultPaymentTermsDays}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultPaymentTermsDays: parseInt(e.target.value, 10) || 14,
                })
              }
            />
          </Field>
          <Field label="Standard Skonto-Frist (Tage)">
            <input
              type="number"
              min="0"
              max="60"
              value={settings.defaultSkontoDays || ""}
              placeholder="z.B. 7"
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultSkontoDays: parseInt(e.target.value, 10) || 0,
                })
              }
            />
          </Field>
          <Field label="Standard Skonto-Satz (%)">
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              value={settings.defaultSkontoPercent || ""}
              placeholder="z.B. 2"
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultSkontoPercent: parseFloat(e.target.value) || 0,
                })
              }
            />
          </Field>
        </div>

        {/* Rollen- & Tätigkeitsbasierte Stundensätze */}
        <div className="office-section">
          <h3 className="card-subtitle"><Users size={18} /> Rollen- & tätigkeitsbasierte Stundensätze</h3>
          <p className="small muted">
            Definieren Sie Stundensätze nach Qualifikation oder Aufgabenrolle (z.B. Junior, Senior, Beratung, Entwicklung, Kreation).
          </p>

          {(settings.roleRates || []).length > 0 && (
            <div className="office-sublist">
              {(settings.roleRates || []).map((r) => (
                <div key={r.id} className="list-row">
                  <span className="list-main">
                    <strong>{r.name}</strong>
                    <small className="muted">Stundensatz: {euro(r.hourlyRateCents)} / Std (netto)</small>
                  </span>
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => handleRemoveRoleRate(r.id)}
                    title="Rolle entfernen"
                    aria-label="Rolle entfernen"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="office-add">
            <Field label="Neue Rolle / Tätigkeit">
              <input
                type="text"
                placeholder="z.B. Senior Consultant, Grafikdesign..."
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
              />
            </Field>
            <Field label={`Satz (${currencySymbol("de-DE")}/Std)`}>
              <input type="number" step="0.01" min="0" value={newRoleRateEur} onChange={(e) => setNewRoleRateEur(e.target.value)} />
            </Field>
            <button type="button" className="button" onClick={handleAddRoleRate} disabled={!newRoleName.trim()}>
              <Plus size={17} /> Rolle hinzufügen
            </button>
          </div>
        </div>

        {/* Mahnwesen & Gebühren */}
        <div className="office-section">
          <h3 className="card-subtitle"><AlertTriangle size={18} /> Mahnwesen & Gebühren</h3>
          <p className="small muted">
            Feste Gebührensätze für Mahnungen überfälliger Rechnungen (Stufe 1 Zahlungserinnerung ist kostenlos).
          </p>
          <div className="grid form-grid">
            <Field label={`Mahngebühr 1. Mahnung (Stufe 2, ${currencySymbol("de-DE")})`}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={(settings.dunningFeeLevel2Cents / 100) || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dunningFeeLevel2Cents: Math.round(parseFloat(e.target.value || "0") * 100),
                  })
                }
              />
            </Field>
            <Field label={`Mahngebühr 2. / Letzte Mahnung (Stufe 3, ${currencySymbol("de-DE")})`}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={(settings.dunningFeeLevel3Cents / 100) || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dunningFeeLevel3Cents: Math.round(parseFloat(e.target.value || "0") * 100),
                  })
                }
              />
            </Field>
          </div>
        </div>

        {/* Nummernkreise & E-Rechnung */}
        <div className="office-section">
          <h3 className="card-subtitle"><Hash size={18} /> Nummernkreise & Rechnungsstandards</h3>
          <div className="grid form-grid">
            <Field label={o("settings.quotePrefix")} required>
              <input
                type="text"
                required
                value={settings.quotePrefix}
                onChange={(e) => setSettings({ ...settings, quotePrefix: e.target.value.trim().toUpperCase() })}
              />
            </Field>
            <Field label={o("settings.invoicePrefix")} required>
              <input
                type="text"
                required
                value={settings.invoicePrefix}
                onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value.trim().toUpperCase() })}
              />
            </Field>
            <Field label={o("settings.buyerReferenceDefault")} wide>
              <input
                type="text"
                placeholder="z.B. Leitweg-ID für öffentliche Auftraggeber"
                value={settings.buyerReferenceDefault}
                onChange={(e) => setSettings({ ...settings, buyerReferenceDefault: e.target.value })}
              />
            </Field>
          </div>

          <label className="check office-check">
            <input
              type="checkbox"
              checked={settings.eInvoiceEnabled}
              onChange={(e) => setSettings({ ...settings, eInvoiceEnabled: e.target.checked })}
            />
            <span className="stack-sm">
              <strong>{o("settings.eInvoiceEnabled")}</strong>
              <small className="muted">
                Generiert automatisch den EN16931-konformen XRechnung-Standard (UBL 2.1) für Rechnungen an Behörden und B2B-Kunden in Deutschland und der EU.
              </small>
            </span>
          </label>
        </div>

        <div className="row end">
          <button type="submit" className="button primary">
            <Save size={18} /> {o("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
