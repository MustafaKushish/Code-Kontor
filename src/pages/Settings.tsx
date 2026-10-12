import { useEffect, useState } from "react";
import { Building2, Landmark, Languages, Palette, Pencil, Receipt } from "lucide-react";
import { ThemeSwitch } from "../layout/Shell";
import { LanguageSwitch } from "../layout/LanguageSwitch";
import { useI18n } from "../i18n";
import { api, type Me } from "../api";
import { emptyCompanyProfile, type CompanyProfile } from "../../shared/company";
import { AccountCard } from "./Account";

export function Settings({ me, onEdit }: { me: Me; onEdit: () => void }) {
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
          <section className="card">
            <h2 className="card-title"><Receipt size={20} /> {t("settings.taxes")}</h2>
            <dl className="facts">
              <dt>{t("settings.taxNumber")}</dt><dd>{c.taxNumber || "–"}</dd>
              <dt>{t("settings.vatId")}</dt><dd>{c.vatId || "–"}</dd>
            </dl>
          </section>
          <section className="card">
            <h2 className="card-title"><Landmark size={20} /> {t("settings.bank")}</h2>
            <dl className="facts">
              <dt>{t("settings.iban")}</dt><dd>{maskedIban}</dd>
              <dt>{t("settings.bic")}</dt><dd>{c.bic || "–"}</dd>
              <dt>{t("settings.bankName")}</dt><dd>{c.bankName || "–"}</dd>
            </dl>
          </section>
          <AccountCard me={me} />
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
