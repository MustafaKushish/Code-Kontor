import { useState } from "react";
import { Plus, Edit, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { FitnessPlan } from "../../../shared/fitness";
import { currency as companyCurrency, currencySymbol } from "../../money";

interface PlansTabProps {
  plans: FitnessPlan[];
  onRefreshPlans: () => void;
}

export function PlansTab({ plans, onRefreshPlans }: PlansTabProps) {
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

  const fmtEuro = (amount: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: companyCurrency() }).format(amount);

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
    } catch {
      // Fehler
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
      {/* Kopfzeile */}
      <section className="card">
        <div className="section-head fitness-toolbar">
          <div className="stack-sm">
            <h2>Tarife & Mitgliedschaftsmodelle</h2>
            <p className="small muted">Definiere Monatsbeiträge, Laufzeiten und Inklusivleistungen für Neuverträge</p>
          </div>
          <button onClick={handleOpenNew} className="button primary">
            <Plus size={18} />
            Tarif anlegen
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
                {plan.isPass10 ? "10er-Karte" : `${plan.durationMonths} Monate Laufzeit`}
              </span>
              <button onClick={() => handleOpenEdit(plan)} className="icon-button" title="Tarif bearbeiten" aria-label="Tarif bearbeiten">
                <Edit size={16} />
              </button>
            </div>

            <h3>{plan.name}</h3>

            <div className="fitness-price">
              <strong>{fmtEuro(plan.priceMonthly)}</strong>
              <span className="small muted">{plan.isPass10 ? "einmalig" : "/ Monat"}</span>
            </div>

            {plan.admissionFee > 0 && (
              <p className="small muted">+ {fmtEuro(plan.admissionFee)} einmalige Aufnahmegebühr</p>
            )}

            {/* Inklusivleistungen */}
            <ul className="fitness-features">
              {feature(true, "Cardio- & Kraftgeräte")}
              {feature(plan.includesCourses, "Alle Gruppenkurse")}
              {feature(plan.includesSauna, "Sauna & Wellnessbereich")}
              {feature(plan.includesDrinks, "Mineralgetränke-Flat")}
            </ul>

            <div className="fitness-plan-foot fitness-card-foot">
              <span className="muted">Status:</span>
              <strong className={plan.active ? "success-text" : "muted"}>{plan.active ? "Buchbar" : "Deaktiviert"}</strong>
            </div>
          </section>
        ))}
      </div>

      {/* --- TARIF ERSTELLEN / BEARBEITEN DIALOG --- */}
      {isFormOpen && (
        <Dialog title={editingPlanId ? "Tarif bearbeiten" : "Neuen Tarif anlegen"} onClose={() => setIsFormOpen(false)}>
          <form onSubmit={handleSave} className="fitness-dialog">
            <div className="grid form-grid">
              <Field label="Tarifbezeichnung" required wide>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="z. B. All-Inclusive Premium"
                />
              </Field>
              <Field label={formState.isPass10 ? `Preis 10er-Karte (${currencySymbol("de-DE")})` : `Monatsbeitrag (${currencySymbol("de-DE")})`}>
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
              <Field label={`Aufnahmegebühr (${currencySymbol("de-DE")})`}>
                <input
                  type="number"
                  step="0.10"
                  value={formState.admissionFee}
                  onChange={(e) =>
                    setFormState({ ...formState, admissionFee: parseFloat(e.target.value) || 0 })
                  }
                />
              </Field>
              <Field label="Laufzeit (Monate)">
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
                <strong>Ist 10er-Karte</strong>
              </label>
            </div>

            {/* Inklusiv-Schalter */}
            <div className="fitness-checks">
              <span className="field-label">Inklusivleistungen:</span>
              <label className="check">
                <input
                  type="checkbox"
                  checked={formState.includesCourses}
                  onChange={(e) => setFormState({ ...formState, includesCourses: e.target.checked })}
                />
                <span>Kurse & Yoga inklusive</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={formState.includesSauna}
                  onChange={(e) => setFormState({ ...formState, includesSauna: e.target.checked })}
                />
                <span>Sauna & Wellness inklusive</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={formState.includesDrinks}
                  onChange={(e) => setFormState({ ...formState, includesDrinks: e.target.checked })}
                />
                <span>Getränke-Flat inklusive</span>
              </label>
            </div>

            <div className="actions-end">
              <button type="button" onClick={() => setIsFormOpen(false)} className="button">
                Abbrechen
              </button>
              <button type="submit" disabled={saving} className="button primary">
                {saving ? "Wird gespeichert..." : "Speichern"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
