import { useState } from "react";
import { Plus, Edit, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { FitnessPlan } from "../../../shared/fitness";
import { currencySymbol } from "../../money";
import { useFitnessI18n } from "./i18n";

interface PlansTabProps {
  plans: FitnessPlan[];
  onRefreshPlans: () => void;
}

export function PlansTab({ plans, onRefreshPlans }: PlansTabProps) {
  const { t, fitnessError, money, lang } = useFitnessI18n();
  const [error, setError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formState, setFormState] = useState({
    name: "",
    priceMonthly: 49.9,
    admissionFee: 29.0,
    durationMonths: 12,
    includesSauna: true,
    includesCourses: true,
    includesDrinks: true,
    isPass10: false,
    active: true,
  });

  const fmtEuro = money;
  const symbol = currencySymbol(lang);

  const handleOpenNew = () => {
    setEditingPlanId(null);
    setFormState({
      name: "",
      priceMonthly: 49.9,
      admissionFee: 29.0,
      durationMonths: 12,
      includesSauna: true,
      includesCourses: true,
      includesDrinks: true,
      isPass10: false,
      active: true,
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (p: FitnessPlan) => {
    setEditingPlanId(p.id);
    setFormState({
      name: p.name,
      priceMonthly: p.priceMonthly,
      admissionFee: p.admissionFee,
      durationMonths: p.durationMonths,
      includesSauna: p.includesSauna,
      includesCourses: p.includesCourses,
      includesDrinks: p.includesDrinks,
      isPass10: p.isPass10,
      active: p.active,
    });
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim()) return;

    setSaving(true);
    setError("");
    try {
      if (editingPlanId) {
        await api<FitnessPlan>(`/fitness/plans/${editingPlanId}`, {
          method: "PUT",
          body: formState,
        });
      } else {
        await api<FitnessPlan>("/fitness/plans", {
          method: "POST",
          body: formState,
        });
      }
      setIsFormOpen(false);
      onRefreshPlans();
    } catch (err) {
      setError(fitnessError(err));
    } finally {
      setSaving(false);
    }
  };

  const feature = (included: boolean, label: string) => (
    <li className={included ? "" : "off"}>
      {included ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      <span>{label}</span>
    </li>
  );

  return (
    <div className="stack">
      {error && !isFormOpen && <p className="error" role="alert">{error}</p>}
      {/* Kopfzeile */}
      <section className="card">
        <div className="section-head fitness-toolbar">
          <div className="stack-sm">
            <h2>{t("plans.title")}</h2>
            <p className="small muted">{t("plans.subtitle")}</p>
          </div>
          <button onClick={handleOpenNew} className="button primary">
            <Plus size={18} />
            {t("plans.add")}
          </button>
        </div>
      </section>

      {/* Tarifkarten Raster */}
      <div className="fitness-grid plans">
        {plans.map((plan) => (
          <section
            key={plan.id}
            className={`card fitness-card fitness-plan ${
              plan.isPass10 ? "pass" : plan.name.includes("Premium") || plan.name.includes("All-Inclusive") ? "featured" : ""
            }`}
          >
            <div className="fitness-card-top">
              <span className={plan.isPass10 ? "pill warn" : "pill"}>
                {plan.isPass10 ? t("common.pass10") : t("plans.duration", { n: plan.durationMonths })}
              </span>
              <button onClick={() => handleOpenEdit(plan)} className="icon-button" title={t("plans.edit")} aria-label={t("plans.edit")}>
                <Edit size={16} />
              </button>
            </div>

            <h3>{plan.name}</h3>

            <div className="fitness-price">
              <strong>{fmtEuro(plan.priceMonthly)}</strong>
              <span className="small muted">{plan.isPass10 ? t("plans.oneTime") : t("plans.perMonth")}</span>
            </div>

            {plan.admissionFee > 0 && (
              <p className="small muted">{t("plans.admission", { amount: fmtEuro(plan.admissionFee) })}</p>
            )}

            {/* Inklusivleistungen */}
            <ul className="fitness-features">
              {feature(true, t("plans.featureGym"))}
              {feature(plan.includesCourses, t("plans.featureCourses"))}
              {feature(plan.includesSauna, t("plans.featureSauna"))}
              {feature(plan.includesDrinks, t("plans.featureDrinks"))}
            </ul>

            <div className="fitness-plan-foot fitness-card-foot">
              <span className="muted">{t("plans.status")}</span>
              <strong className={plan.active ? "success-text" : "muted"}>{plan.active ? t("plans.bookable") : t("plans.disabled")}</strong>
            </div>
          </section>
        ))}
      </div>

      {/* --- TARIF ERSTELLEN / BEARBEITEN DIALOG --- */}
      {isFormOpen && (
        <Dialog title={editingPlanId ? t("plans.edit") : t("plans.newTitle")} onClose={() => setIsFormOpen(false)}>
          <form onSubmit={handleSave} className="fitness-dialog">
            {error && <p className="error" role="alert">{error}</p>}
            <div className="grid form-grid">
              <Field label={t("plans.name")} required wide>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder={t("plans.phName")}
                />
              </Field>
              <Field label={formState.isPass10 ? t("plans.pricePass", { c: symbol }) : t("plans.priceMonthly", { c: symbol })}>
                <input
                  type="number"
                  step="0.10"
                  required
                  value={formState.priceMonthly}
                  onChange={(e) =>
                    setFormState({ ...formState, priceMonthly: parseFloat(e.target.value) || 0 })
                  }
                />
              </Field>
              <Field label={t("plans.admissionFee", { c: symbol })}>
                <input
                  type="number"
                  step="0.10"
                  value={formState.admissionFee}
                  onChange={(e) =>
                    setFormState({ ...formState, admissionFee: parseFloat(e.target.value) || 0 })
                  }
                />
              </Field>
              <Field label={t("plans.durationMonths")}>
                <input
                  type="number"
                  min="1"
                  max="36"
                  value={formState.durationMonths}
                  onChange={(e) =>
                    setFormState({ ...formState, durationMonths: parseInt(e.target.value, 10) || 12 })
                  }
                />
              </Field>
              <label className="check fitness-check-cell">
                <input
                  type="checkbox"
                  checked={formState.isPass10}
                  onChange={(e) => setFormState({ ...formState, isPass10: e.target.checked })}
                />
                <strong>{t("plans.isPass10")}</strong>
              </label>
            </div>

            {/* Inklusiv-Schalter */}
            <div className="fitness-checks">
              <span className="field-label">{t("plans.includes")}</span>
              <label className="check">
                <input
                  type="checkbox"
                  checked={formState.includesCourses}
                  onChange={(e) => setFormState({ ...formState, includesCourses: e.target.checked })}
                />
                <span>{t("plans.inclCourses")}</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={formState.includesSauna}
                  onChange={(e) => setFormState({ ...formState, includesSauna: e.target.checked })}
                />
                <span>{t("plans.inclSauna")}</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={formState.includesDrinks}
                  onChange={(e) => setFormState({ ...formState, includesDrinks: e.target.checked })}
                />
                <span>{t("plans.inclDrinks")}</span>
              </label>
            </div>

            <div className="actions-end">
              <button type="button" onClick={() => setIsFormOpen(false)} className="button">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={saving} className="button primary">
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
