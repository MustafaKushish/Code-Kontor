import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Building2, Check, Image, Landmark, Palette, Receipt, ShieldCheck, type LucideIcon } from "lucide-react";
import { ThemeSwitch } from "../layout/Shell";
import { LanguageSwitch } from "../layout/LanguageSwitch";
import { useI18n } from "../i18n";
import { api, ApiError, type Me } from "../api";
import { type CompanyErrors, type CompanyProfile } from "../../shared/company";
import { COUNTRY_TAX, type TaxSettings } from "../../shared/countries";
import { CompanyFields, PART_FIELDS, partErrors, useCountryName, withDefaults, type CompanyPart } from "./CompanyForm";

type TaxInfo = TaxSettings & { country: string; custom: boolean };
type Privacy = NonNullable<Me["privacy"]>;

const CURRENCIES = [...new Set(Object.values(COUNTRY_TAX).map((c) => c.currency))].sort();

type SectionId = "address" | "tax" | "bank" | "logo" | "privacy" | "display";
const SECTIONS: { id: SectionId; icon: LucideIcon; title: string }[] = [
  { id: "address", icon: Building2, title: "settings.companyAddress" },
  { id: "tax", icon: Receipt, title: "settings.taxes" },
  { id: "bank", icon: Landmark, title: "settings.bankPayment" },
  { id: "logo", icon: Image, title: "settings.logo" },
  { id: "privacy", icon: ShieldCheck, title: "settings.privacyTitle" },
  { id: "display", icon: Palette, title: "settings.display" },
];

const rateText = (rates: number[], lang: string) => rates.map((r) => String(r).replace(".", lang === "en" ? "." : ",")).join("; ");

/** Ein Bereich der Einstellungen als Karte mit Sprungziel für die Navigation. */
function Section({ id, icon: Icon, title, intro, children }: { id: SectionId; icon: LucideIcon; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={`einstellung-${id}`} className="card stack settings-section">
      <div>
        <h2 className="card-title"><Icon size={20} /> {title}</h2>
        {intro && <p className="muted small">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

/** Speichern / Verwerfen unter einem Formular; „Gespeichert“ bleibt kurz stehen. */
function SaveBar({ dirty, busy, saved, error, onDiscard }: { dirty: boolean; busy: boolean; saved: boolean; error: string; onDiscard: () => void }) {
  const { t } = useI18n();
  if (!dirty && !saved && !error) return null;
  return (
    <div className="stack-sm">
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row wrap gap settings-save">
        <button className="button primary" disabled={!dirty || busy}>{busy ? t("wizard.saving") : t("settings.save")}</button>
        {dirty && <button type="button" className="button" onClick={onDiscard} disabled={busy}>{t("settings.discard")}</button>}
        {!dirty && saved && !error && <span className="success-text row gap" role="status"><Check size={16} /> {t("settings.saved")}</span>}
        {dirty && !busy && <span className="muted small">{t("settings.unsaved")}</span>}
      </div>
    </div>
  );
}

/** Firmendaten eines Bereichs direkt bearbeiten und einzeln speichern. */
function CompanySection({ part, saved, onSaved, canEdit, addressLookup, children }: {
  part: CompanyPart;
  saved: CompanyProfile;
  onSaved: (company: CompanyProfile) => void;
  canEdit: boolean;
  addressLookup: boolean;
  children?: ReactNode;
}) {
  const { errorText } = useI18n();
  const [draft, setDraft] = useState(saved);
  const [errors, setErrors] = useState<CompanyErrors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const fields = PART_FIELDS[part];
  // Felder anderer Bereiche immer vom gespeicherten Stand, damit nur dieser Bereich gespeichert wird
  const merged: CompanyProfile = { ...saved, ...Object.fromEntries(fields.map((f) => [f, draft[f]])) };
  const dirty = fields.some((f) => draft[f] !== saved[f]) || (part === "address" && draft.paymentMethods !== saved.paymentMethods);

  const update = (fn: (c: CompanyProfile) => CompanyProfile) => {
    setDone(false);
    setDraft(fn);
  };
  const discard = () => {
    setDraft(saved);
    setErrors({});
    setError("");
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Beim Land ändern sich die vorgeschlagenen Zahlarten mit
    const body = part === "address" ? { ...merged, paymentMethods: draft.paymentMethods } : merged;
    const found = partErrors(body, [part]);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setError("");
    try {
      await api("/company", { method: "PUT", body });
      onSaved(body);
      setDraft(body);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors as CompanyErrors);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <CompanyFields part={part} company={draft} setCompany={update} errors={errors} setErrors={setErrors} addressLookup={addressLookup} disabled={!canEdit} />
      {children}
      {canEdit && <SaveBar dirty={dirty} busy={busy} saved={done} error={error} onDiscard={discard} />}
    </form>
  );
}

/** Land, Währung und Steuersätze: Vorgaben des Landes, vom Inhaber oder Admin anpassbar. */
function TaxRates({ canEdit, onChanged }: { canEdit: boolean; onChanged: () => void }) {
  const { t, lang, errorText } = useI18n();
  const countryName = useCountryName();
  const [tax, setTax] = useState<TaxInfo | null>(null);
  const [currency, setCurrency] = useState("EUR");
  const [rates, setRates] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = (next: TaxInfo) => {
    setTax(next);
    setCurrency(next.currency);
    setRates(rateText(next.vatRates, lang));
  };
  useEffect(() => {
    api<{ tax: TaxInfo }>("/tax").then((r) => load(r.tax)).catch(() => undefined);
  }, []);

  const save = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ tax: TaxInfo }>("/tax", { method: "PUT", body });
      load(r.tax);
      setDone(true);
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
  const dirty = currency !== tax.currency || rates !== rateText(tax.vatRates, lang);
  return (
    <form className="stack settings-subform" onSubmit={submit}>
      <div className="section-head">
        <strong>{t("settings.vatRates")}</strong>
        <span className="pill">{tax.custom ? t("settings.customValues") : t("settings.countryDefaults", { country: countryName(tax.country) })}</span>
      </div>
      <fieldset className="grid" disabled={!canEdit}>
        <label className="field">
          <span className="field-label">{t("settings.currency")}</span>
          <select value={currency} onChange={(e) => (setCurrency(e.target.value), setDone(false))}>
            {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t("settings.ratesLabel")}</span>
          <input value={rates} onChange={(e) => (setRates(e.target.value), setDone(false))} inputMode="decimal" placeholder="19; 7" />
        </label>
        <small className="muted wide">{t("settings.ratesHint")} {t("settings.taxNote")}</small>
      </fieldset>
      {canEdit && (
        <>
          <SaveBar dirty={dirty} busy={busy} saved={done} error={error} onDiscard={() => load(tax)} />
          {tax.custom && <button type="button" className="text-button" disabled={busy} onClick={() => save({ reset: true })}>{t("settings.resetDefaults")}</button>}
        </>
      )}
    </form>
  );
}

/** Ob KI-Assistent und Adressvorschläge Daten an fremde Dienste senden dürfen; wirkt sofort. */
function PrivacyOptions({ me, canEdit, onChanged }: { me: Me; canEdit: boolean; onChanged: () => void }) {
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
    <label className="settings-toggle">
      <span className="list-main">
        <strong>{label}</strong>
        <small className="muted">{hint}</small>
      </span>
      <input type="checkbox" role="switch" checked={privacy[key]} disabled={!canEdit || busy} onChange={(e) => toggle(key, e.target.checked)} />
    </label>
  );

  return (
    <div className="stack-sm">
      <div className="list-card settings-toggles">
        {option("assistant", t("settings.privacyAssistant"), t("settings.privacyAssistantHint"))}
        {option("addressLookup", t("settings.privacyAddress"), t("settings.privacyAddressHint"))}
      </div>
      {!canEdit && <p className="muted small">{t("settings.privacyStaff")}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export function Settings({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [active, setActive] = useState<SectionId>("address");
  const canEdit = me.user.role !== "staff";
  const addressLookup = !!me.privacy?.addressLookup;
  const { t } = useI18n();

  useEffect(() => {
    api<{ company: CompanyProfile | null }>("/company").then((r) => {
      const c = withDefaults(r.company);
      // Mitarbeiter sehen die Kontonummer nur gekürzt
      setCompany(canEdit || !c.iban ? c : { ...c, iban: `•••• ${c.iban.slice(-4)}` });
    });
  }, []);

  // Aktiven Bereich in der Navigation mitführen
  useEffect(() => {
    if (!company) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id.replace("einstellung-", "") as SectionId);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(`einstellung-${s.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [!!company]);

  const jump = (id: SectionId) => {
    setActive(id);
    document.getElementById(`einstellung-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saved = (next: CompanyProfile) => {
    setCompany(next);
    onChanged();
  };

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <h1 className="display">{t("nav.company")}</h1>
          <p className="muted">{t("settings.subtitle")}</p>
        </div>
      </header>

      {!me.setupComplete && <p className="notice">{canEdit ? t("settings.incomplete") : t("settings.incompleteStaff")}</p>}
      {!canEdit && <p className="notice">{t("settings.staffReadOnly")}</p>}

      {company ? (
        <div className="settings-layout">
          <nav className="settings-nav" aria-label={t("nav.company")}>
            {SECTIONS.map(({ id, icon: Icon, title }) => (
              <button key={id} type="button" className={active === id ? "active" : ""} aria-current={active === id ? "true" : undefined} onClick={() => jump(id)}>
                <Icon size={17} aria-hidden /> {t(title)}
              </button>
            ))}
          </nav>

          <div className="stack-lg settings-sections">
            <Section id="address" icon={Building2} title={t("settings.companyAddress")} intro={t("wizard.step1Intro")}>
              <CompanySection part="address" saved={company} onSaved={saved} canEdit={canEdit} addressLookup={addressLookup} />
            </Section>
            <Section id="tax" icon={Receipt} title={t("settings.taxes")} intro={t("wizard.step2Intro")}>
              <CompanySection part="tax" saved={company} onSaved={saved} canEdit={canEdit} addressLookup={addressLookup} />
              <TaxRates canEdit={canEdit} onChanged={onChanged} />
            </Section>
            <Section id="bank" icon={Landmark} title={t("settings.bankPayment")}>
              <CompanySection part="bank" saved={company} onSaved={saved} canEdit={canEdit} addressLookup={addressLookup} />
            </Section>
            <Section id="logo" icon={Image} title={t("settings.logo")}>
              <CompanySection part="logo" saved={company} onSaved={saved} canEdit={canEdit} addressLookup={addressLookup} />
            </Section>
            <Section id="privacy" icon={ShieldCheck} title={t("settings.privacyTitle")} intro={t("settings.privacyText")}>
              <PrivacyOptions me={me} canEdit={canEdit} onChanged={onChanged} />
            </Section>
            <Section id="display" icon={Palette} title={t("settings.display")} intro={t("theme.text")}>
              <div className="row wrap gap settings-display">
                <ThemeSwitch />
                <LanguageSwitch />
              </div>
            </Section>
          </div>
        </div>
      ) : (
        <p className="muted">{t("common.loading")}</p>
      )}
    </div>
  );
}
