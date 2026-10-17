import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X, Dumbbell, ShieldCheck, QrCode, CheckCircle2 } from "lucide-react";
import { api } from "../../api";
import type { CompanyProfile } from "../../../shared/company";
import type { FitnessMember, FitnessPlan } from "../../../shared/fitness";
import { useFitnessI18n } from "./i18n";

interface FitnessPrintProps {
  member: FitnessMember;
  plan?: FitnessPlan;
  company?: CompanyProfile | null;
  type: "contract" | "card";
  onClose: () => void;
}

export function FitnessPrint({
  member,
  plan,
  company: given,
  type,
  onClose,
}: FitnessPrintProps) {
  const { t, money, day, statusLabel, lang } = useFitnessI18n();
  const fmtEuro = money;

  const handlePrint = () => {
    window.print();
  };

  // Firmendaten wie bei den anderen Ausdrucken: übergeben oder aus /company
  const [company, setCompany] = useState<CompanyProfile | null>(given ?? null);
  const companyName = company?.name || "";
  const companyAddress = [company?.street, [company?.postalCode, company?.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");

  // Druckebene: beim Drucken wird nur das Blatt ausgegeben (Regeln in styles.css)
  useEffect(() => {
    document.body.classList.add("ck-printing");
    if (!given) api<{ company: CompanyProfile | null }>("/company").then((d) => setCompany(d.company)).catch(() => {});
    return () => document.body.classList.remove("ck-printing");
  }, []);

  return createPortal(
    <div className="print-layer">
      {/* Toolbar - Screen only */}
      <div className="print-toolbar fitness-print-toolbar">
        <span className="fitness-print-title">
          {type === "contract" ? t("print.contractTitle") : t("print.cardTitle")} · {member.firstName}{" "}
          {member.lastName} · {member.memberNumber}
        </span>
        <button onClick={handlePrint} className="button primary">
          <Printer size={18} />
          {t("print.print")}
        </button>
        <button onClick={onClose} className="button" title={t("print.close")}>
          <X size={18} />
          {t("print.close")}
        </button>
      </div>

      {/* --- DOKUMENT-INHALT --- */}
      {type === "contract" ? (
        <article className="print-sheet fitness-print">
          {/* Briefkopf */}
          <header className="print-head">
            <div>
              <strong className="fitness-print-brand">
                <Dumbbell size={20} />
                <span>{companyName}</span>
              </strong>
              {companyAddress && <p className="fitness-print-sub">{companyAddress}</p>}
            </div>
            <div className="print-meta">
              <strong>{t("print.memberNo", { n: member.memberNumber })}</strong>
              <span>{t("print.contractStart", { date: day(member.joinDate) })}</span>
              <span>{t("print.issued", { date: day(new Date().toISOString()) })}</span>
            </div>
          </header>

          <div className="fitness-print-center">
            <h1>{t("print.agreement")}</h1>
            <p className="fitness-print-sub">{t("print.agreementSub")}</p>
          </div>

          {/* Vertragspartner & Mitgliedsdaten */}
          <div className="print-grid">
            <section className="fitness-print-box">
              <h2>{t("print.memberData")}</h2>
              <p className="plain">
                <strong className="big">
                  {member.firstName} {member.lastName}
                </strong>
              </p>
              <p className="plain">{t("print.birthDate", { date: member.birthDate ? day(member.birthDate) : "–" })}</p>
              <p className="plain">{t("print.email", { email: member.email })}</p>
              <p className="plain">{t("print.phone", { phone: member.phone || "–" })}</p>
              {member.emergencyContact && (
                <p className="plain fitness-print-sub">
                  <strong>{t("print.emergency")}</strong> {member.emergencyContact}
                </p>
              )}
            </section>

            <section className="fitness-print-box">
              <h2>{t("print.planTerms")}</h2>
              <p className="plain">
                <strong className="big">{member.planName}</strong>
              </p>
              <p>
                <span>{t("print.monthlyFee")}</span>
                <strong>{fmtEuro(member.monthlyFee)}</strong>
              </p>
              {plan?.admissionFee ? (
                <p className="fitness-print-sub">
                  <span>{t("print.admissionFee")}</span>
                  <span>{fmtEuro(plan.admissionFee)}</span>
                </p>
              ) : null}
              <p className="fitness-print-sub">
                <span>{t("print.minTerm")}</span>
                <span>{t("print.months", { n: plan?.durationMonths || 12 })}</span>
              </p>
              <p className="fitness-print-sub">
                <span>{t("print.validUntil")}</span>
                <span>{member.validUntil ? day(member.validUntil) : t("common.unlimited")}</span>
              </p>
            </section>
          </div>

          {/* Inklusivleistungen */}
          <section>
            <h2>{t("print.includes")}</h2>
            <div className="fitness-print-includes">
              <span>
                <CheckCircle2 size={14} />
                {t("print.inclGym")}
              </span>
              <span className={plan?.includesCourses ? "" : "off"}>
                <CheckCircle2 size={14} />
                {t("print.inclCourses")}
              </span>
              <span className={plan?.includesSauna ? "" : "off"}>
                <CheckCircle2 size={14} />
                {t("print.inclSauna")}
              </span>
            </div>
          </section>

          {/* SEPA-Lastschriftmandat */}
          <section className="fitness-print-box">
            <h2>
              <ShieldCheck size={12} /> {t("print.sepaTitle")}
            </h2>
            <p className="plain fitness-print-sub">
              {t("print.sepaText", { company: companyName || "____________________" })}
            </p>
            <div className="fitness-print-sepa">
              <div>
                <small>{t("print.iban")}</small>
                <strong>{member.iban || "DE__ ____ ____ ____ ____ __"}</strong>
              </div>
              <div>
                <small>{t("print.creditorId")}</small>
                {/* Keine Gläubiger-ID hinterlegt: Linie zum Ausfüllen von Hand */}
                <strong>____________________ / {member.memberNumber}</strong>
              </div>
            </div>
          </section>

          {/* Hausordnung & Auszüge */}
          <div className="print-terms">
            <strong>{t("print.rulesTitle")}</strong>
            {"\n"}{t("print.rule1")}
            {"\n"}{t("print.rule2")}
            {"\n"}{t("print.rule3")}
          </div>

          {/* Unterschriftenblock */}
          <div className="print-sign">
            <div>
              <span />
              <strong>{t("print.placeDate")}</strong>
              <br />
              {t("print.signStudio")}
            </div>
            <div>
              <span />
              <strong>{t("print.placeDate")}</strong>
              <br />
              {t("print.signMember")}
            </div>
          </div>
        </article>
      ) : (
        /* --- MITGLIEDSAUSWEIS --- */
        <article className="print-sheet fitness-print">
          <div className="fitness-print-center">
            <h1>{t("print.cardHeading")}</h1>
            <p className="fitness-print-sub">
              {t("print.cardSub")}
            </p>
          </div>

          <div className="fitness-print-cards">
            {/* Vorderseite Ausweis */}
            <div className="fitness-idcard">
              <div className="fitness-idcard-top">
                <div>
                  <div className="fitness-idcard-brand">
                    <Dumbbell size={14} />
                    <span>{companyName}</span>
                  </div>
                  <span className="label">{t("print.memberPass")}</span>
                </div>
                <span className="status">{statusLabel(member.status).toLocaleUpperCase(lang)}</span>
              </div>

              <div>
                <span className="label">{t("print.member")}</span>
                <div className="name">
                  {member.firstName} {member.lastName}
                </div>
                <div>{member.planName}</div>
              </div>

              <div className="fitness-idcard-foot">
                <span>{t("print.validFrom", { date: day(member.joinDate) })}</span>
                <strong>{member.memberNumber}</strong>
              </div>
            </div>

            {/* Rückseite Ausweis mit Barcode & QR */}
            <div className="fitness-idcard">
              <div className="fitness-idcard-top">
                <span className="label">{t("print.deskCheckIn")}</span>
                <span className="label">{t("print.emergencyShort", { contact: member.emergencyContact || "112" })}</span>
              </div>

              {/* Strichcode-Simulation */}
              <div>
                <div className="fitness-barcode">
                  {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 3, 1, 2, 4, 1, 3, 2, 4, 1, 2, 3, 2, 4, 1].map((w, i) => (
                    <span key={i} style={{ width: `${w * 2}px` }} />
                  ))}
                </div>
                <div className="fitness-barcode-text">*{member.memberNumber}*</div>
              </div>

              <div className="fitness-idcard-foot">
                <span>{t("print.found")}</span>
                <QrCode size={14} />
              </div>
            </div>
          </div>
        </article>
      )}
    </div>,
    document.body,
  );
}
