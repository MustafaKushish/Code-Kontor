import { useEffect, useState, type FormEvent } from "react";
import { Building2, Landmark, Languages, Palette, Pencil, Receipt, ShieldCheck } from "lucide-react";
import { ThemeSwitch } from "../layout/Shell";
import { LanguageSwitch } from "../layout/LanguageSwitch";
import { useI18n } from "../i18n";
import { api, type Me } from "../api";
import { emptyCompanyProfile, type CompanyProfile } from "../../shared/company";
import { COUNTRY_TAX, type TaxSettings } from "../../shared/countries";
import { formatRate } from "../money";

type TaxInfo = TaxSettings & { country: string; custom: boolean };

const CURRENCIES = [...new Set(Object.values(COUNTRY_TAX).map((c) => c.currency))].sort();

/** Land, Währung und Steuersätze: Vorgaben des Landes, vom Inhaber oder Admin anpassbar. */
function TaxSettingsCard({ canEdit, onChanged, company }: { canEdit: boolean; onChanged: () => void; company: CompanyProfile }) {
  const { t, lang, errorText } = useI18n();
  const [tax, setTax] = useState<TaxInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [currency, setCurrency] = useState("EUR");
  const [rates, setRates] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ tax: TaxInfo }>("/tax").then((r) => setTax(r.tax)).catch(() => undefined);
  }, []);

  const countryName = (code: string) => {
    try {
      return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? code;
    } catch {
      return code;
    }
  };
  const startEdit = () => {
    if (!tax) return;
    setCurrency(tax.currency);
    setRates(tax.vatRates.map((r) => String(r).replace(".", lang === "en" ? "." : ",")).join("; "));
    setError("");
    setEditing(true);
  };
  const save = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ tax: TaxInfo }>("/tax", { method: "PUT", body });
      setTax(r.tax);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parts = rates.split(/[;\s]+/).map((p) => p.replace("%", "").replace(",", ".").trim()).filter(Boolean);
    const numbers = parts.map(Number);
    if (numbers.some((n) => !Number.isFinite(n) || n < 0 || n >= 100)) return setError(t("settings.ratesInvalid"));
    save({ currency, vatRates: numbers.filter((n) => n > 0) });
  };

  if (!tax) return null;
  return (
    <div className="stack-sm">
      <dl className="facts">
        <dt>{t("settings.taxNumber")}</dt><dd>{company.taxNumber || "–"}</dd>
        <dt>{t("settings.vatId")}</dt><dd>{company.vatId || "–"}</dd>
        <dt>{t("settings.country")}</dt><dd>{countryName(tax.country)}</dd>
        <dt>{t("settings.currency")}</dt><dd>{tax.currency}</dd>
        <dt>{t("settings.vatRates")}</dt>
        <dd>{tax.vatRates.length ? tax.vatRates.map((r) => formatRate(r, lang)).join(", ") : t("settings.noVat")}</dd>
      </dl>
      <p className="muted small">{tax.custom ? t("settings.customValues") : t("settings.countryDefaults", { country: countryName(tax.country) })}</p>
      {editing ? (
        <form className="stack-sm" onSubmit={submit}>
          <label className="field">
            <span className="field-label">{t("settings.currency")}</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t("settings.ratesLabel")}</span>
            <input value={rates} onChange={(e) => setRates(e.target.value)} inputMode="decimal" placeholder="19; 7" />
            <small className="muted">{t("settings.ratesHint")}</small>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
            <button className="button primary" disabled={busy}>{t("settings.save")}</button>
            <button type="button" className="button" onClick={() => setEditing(false)}>{t("common.cancel")}</button>
            {tax.custom && <button type="button" className="text-button" disabled={busy} onClick={() => save({ reset: true })}>{t("settings.resetDefaults")}</button>}
          </div>
        </form>
      ) : (
        canEdit && <button className="button" onClick={startEdit}><Pencil size={16} /> {t("settings.adjust")}</button>
      )}
      <p className="muted small">{t("settings.taxNote")}</p>
    </div>
  );
}

type Privacy = NonNullable<Me["privacy"]>;

/** Ob KI-Assistent und Adressvorschläge Daten an fremde Dienste senden dürfen. */
function PrivacyCard({ me, canEdit, onChanged }: { me: Me; canEdit: boolean; onChanged: () => void }) {
  const { t, errorText } = useI18n();
  const [privacy, setPrivacy] = useState<Privacy>(me.privacy ?? { assistant: false, addressLookup: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = async (key: keyof Privacy, value: boolean) => {
    const next = { ...privacy, [key]: value };
    setBusy(true);
    setError("");
    try {
      const r = await api<{ privacy: Privacy }>("/privacy", { method: "PUT", body: next });
      setPrivacy(r.privacy);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const option = (key: keyof Privacy, label: string, hint: string) => (
    <label className="check">
      <input type="checkbox" checked={privacy[key]} disabled={!canEdit || busy} onChange={(e) => toggle(key, e.target.checked)} />
      <span>{label}<br /><span className="muted small">{hint}</span></span>
    </label>
  );

  return (
    <div className="stack-sm">
      <p className="muted">{t("settings.privacyText")}</p>
      {option("assistant", t("settings.privacyAssistant"), t("settings.privacyAssistantHint"))}
      {option("addressLookup", t("settings.privacyAddress"), t("settings.privacyAddressHint"))}
      {!canEdit && <p className="muted small">{t("settings.privacyStaff")}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export function Settings({ me, onEdit, onTaxChanged }: { me: Me; onEdit: () => void; onTaxChanged: () => void }) {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const canEdit = me.user.role !== "staff";
  const { t } = useI18n();

  useEffect(() => {
    api<{ company: CompanyProfile | null }>("/company").then((r) => setCompany(r.company ?? emptyCompanyProfile));
  }, []);

  const c = company;
  const maskedIban = c?.iban ? `${c.iban.slice(0, 4)} •••• •••• ${c.iban.slice(-4)}` : "–";
  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1 className="display">{t("nav.company")}</h1>
          <p className="muted">{t("settings.subtitle")}</p>
        </div>
        {canEdit && <button className="button primary" onClick={onEdit}><Pencil size={18} /> {t("common.edit")}</button>}
      </header>

      {!me.setupComplete && <p className="notice">{canEdit ? t("settings.incomplete") : t("settings.incompleteStaff")}</p>}

      {c ? (
        <div className="columns">
          <section className="card">
            <h2 className="card-title"><Building2 size={20} /> {t("settings.companyAddress")}</h2>
            {c.logoDataUrl && <img className="company-logo" src={c.logoDataUrl} alt={t("settings.logoAlt")} />}
            <dl className="facts">
              <dt>{t("settings.name")}</dt><dd>{c.name || "–"}{c.legalForm && ` (${c.legalForm})`}</dd>
              <dt>{t("settings.address")}</dt><dd>{[c.street, `${c.postalCode} ${c.city}`.trim()].filter(Boolean).join(", ") || "–"}</dd>
              <dt>{t("settings.email")}</dt><dd>{c.email || "–"}</dd>
              <dt>{t("settings.phone")}</dt><dd>{c.phone || "–"}</dd>
            </dl>
          </section>
          <section className="card stack">
            <h2 className="card-title"><Receipt size={20} /> {t("settings.taxes")}</h2>
            <TaxSettingsCard canEdit={canEdit} onChanged={onTaxChanged} company={c} />
          </section>
          <section className="card">
            <h2 className="card-title"><Landmark size={20} /> {t("settings.bank")}</h2>
            <dl className="facts">
              <dt>{t("settings.iban")}</dt><dd>{maskedIban}</dd>
              <dt>{t("settings.bic")}</dt><dd>{c.bic || "–"}</dd>
              <dt>{t("settings.bankName")}</dt><dd>{c.bankName || "–"}</dd>
            </dl>
          </section>
          <section className="card stack">
            <h2 className="card-title"><ShieldCheck size={20} /> {t("settings.privacyTitle")}</h2>
            <PrivacyCard me={me} canEdit={canEdit} onChanged={onTaxChanged} />
          </section>
          <section className="card">
            <h2 className="card-title"><Palette size={20} /> {t("theme.label")}</h2>
            <p className="muted">{t("theme.text")}</p>
            <ThemeSwitch />
          </section>
          <section className="card">
            <h2 className="card-title"><Languages size={20} /> {t("common.language")}</h2>
            <LanguageSwitch />
          </section>
        </div>
      ) : (
        <p className="muted">{t("common.loading")}</p>
      )}
    </div>
  );
}
