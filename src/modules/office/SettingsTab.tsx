import { useEffect, useState } from "react";
import { Save, Check, Settings2, Plus, Trash2, Users, AlertTriangle } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { OfficeSettings, RoleRate } from "../../../shared/office";
import { useOfficeI18n } from "./i18n";

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
    <div className="stack" style={{ maxWidth: "760px" }}>
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

        {/* Allgemeine Standards */}
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

        {/* Standard Skonto */}
        <div className="row-grid">
          <Field label="Standard Skonto-Frist (Tage)">
            <input
              type="number"
              min="0"
              max="60"
              className="input"
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
              className="input"
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
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h4 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <Users size={18} style={{ color: "var(--accent)" }} /> Rollen- & tätigkeitsbasierte Stundensätze
            </h4>
          </div>
          <p className="small muted" style={{ margin: "0 0 12px" }}>
            Definieren Sie Stundensätze nach Qualifikation oder Aufgabenrolle (z.B. Junior, Senior, Beratung, Entwicklung, Kreation).
          </p>

          <div className="stack-sm" style={{ marginBottom: "12px" }}>
            {(settings.roleRates || []).map((r) => (
              <div key={r.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--panel-2)" }}>
                <div>
                  <strong>{r.name}</strong>
                  <div className="small muted">Stundensatz: <strong>{euro(r.hourlyRateCents)} / Std (netto)</strong></div>
                </div>
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={() => handleRemoveRoleRate(r.id)}
                  title="Rolle entfernen"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="row-grid" style={{ gridTemplateColumns: "2fr 1fr auto", alignItems: "flex-end" }}>
            <Field label="Neue Rolle / Tätigkeit">
              <input
                type="text"
                className="input"
                placeholder="z.B. Senior Consultant, Grafikdesign..."
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
              />
            </Field>
            <Field label="Satz (€/Std)">
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                value={newRoleRateEur}
                onChange={(e) => setNewRoleRateEur(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className="button"
              onClick={handleAddRoleRate}
              disabled={!newRoleName.trim()}
            >
              <Plus size={16} /> Rolle hinzufügen
            </button>
          </div>
        </div>

        {/* Mahnwesen & Gebühren */}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
          <h4 style={{ margin: "0 0 6px", display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertTriangle size={18} style={{ color: "var(--warning)" }} /> Mahnwesen & Gebühren
          </h4>
          <p className="small muted" style={{ margin: "0 0 10px" }}>
            Feste Gebührensätze für Mahnungen überfälliger Rechnungen (Stufe 1 Zahlungserinnerung ist kostenlos).
          </p>
          <div className="row-grid">
            <Field label="Mahngebühr 1. Mahnung (Stufe 2, €)">
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                value={(settings.dunningFeeLevel2Cents / 100) || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dunningFeeLevel2Cents: Math.round(parseFloat(e.target.value || "0") * 100),
                  })
                }
              />
            </Field>
            <Field label="Mahngebühr 2. / Letzte Mahnung (Stufe 3, €)">
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
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
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
          <h4 style={{ margin: "0 0 10px" }}>Nummernkreise & Rechnungsstandards</h4>
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

          <div style={{ marginTop: "12px" }}>
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
