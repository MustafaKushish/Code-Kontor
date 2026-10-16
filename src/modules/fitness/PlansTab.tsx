import { useState } from "react";
import {
  CreditCard,
  Plus,
  Edit,
  CheckCircle2,
  XCircle,
  X,
  Sparkles,
  ShieldCheck,
  Check,
  Calendar,
  Layers,
} from "lucide-react";
import { api } from "../../api";
import type { FitnessPlan } from "../../../shared/fitness";

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
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);

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
          body: JSON.stringify(formState),
        });
      } else {
        await api<FitnessPlan>("/fitness/plans", {
          method: "POST",
          body: JSON.stringify(formState),
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

  return (
    <div className="space-y-6">
      {/* Kopfzeile */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-xs flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-zinc-900">Tarife & Mitgliedschaftsmodelle</h3>
          <p className="text-xs text-zinc-500">
            Definiere Monatsbeiträge, Laufzeiten und Inklusivleistungen für Neuverträge
          </p>
        </div>
        <button
          onClick={handleOpenNew}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tarif anlegen</span>
        </button>
      </div>

      {/* Tarifkarten Raster */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`bg-white rounded-2xl border p-5 flex flex-col justify-between shadow-xs transition-all relative ${
              plan.isPass10
                ? "border-amber-300 ring-2 ring-amber-100"
                : plan.name.includes("Premium") || plan.name.includes("All-Inclusive")
                ? "border-emerald-300 ring-2 ring-emerald-100"
                : "border-zinc-200"
            }`}
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    plan.isPass10
                      ? "bg-amber-100 text-amber-800"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {plan.isPass10 ? "10er-Karte" : `${plan.durationMonths} Monate Laufzeit`}
                </span>
                <button
                  onClick={() => handleOpenEdit(plan)}
                  className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
                  title="Tarif bearbeiten"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>

              <h4 className="text-base font-bold text-zinc-900 mb-1">{plan.name}</h4>

              <div className="flex items-baseline gap-1 my-3">
                <span className="text-2xl font-extrabold text-zinc-900">
                  {fmtEuro(plan.priceMonthly)}
                </span>
                <span className="text-xs text-zinc-500">
                  {plan.isPass10 ? "einmalig" : "/ Monat"}
                </span>
              </div>

              {plan.admissionFee > 0 && (
                <p className="text-xs text-zinc-500 mb-4">
                  + {fmtEuro(plan.admissionFee)} einmalige Aufnahmegebühr
                </p>
              )}

              {/* Inklusivleistungen */}
              <div className="space-y-2 border-t border-zinc-100 pt-3 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-zinc-800 font-medium">Cardio- & Kraftgeräte</span>
                </div>
                <div className="flex items-center gap-2">
                  {plan.includesCourses ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-zinc-300 shrink-0" />
                  )}
                  <span className={plan.includesCourses ? "text-zinc-800 font-medium" : "text-zinc-400"}>
                    Alle Gruppenkurse
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {plan.includesSauna ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-zinc-300 shrink-0" />
                  )}
                  <span className={plan.includesSauna ? "text-zinc-800 font-medium" : "text-zinc-400"}>
                    Sauna & Wellnessbereich
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {plan.includesDrinks ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-zinc-300 shrink-0" />
                  )}
                  <span className={plan.includesDrinks ? "text-zinc-800 font-medium" : "text-zinc-400"}>
                    Mineralgetränke-Flat
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-zinc-100 flex items-center justify-between text-xs">
              <span className="text-zinc-400">Status:</span>
              <span
                className={`font-semibold ${
                  plan.active ? "text-emerald-700" : "text-zinc-400"
                }`}
              >
                {plan.active ? "Buchbar" : "Deaktiviert"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* --- TARIF ERSTELLEN / BEARBEITEN MODAL --- */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-zinc-200">
              <h3 className="text-base font-bold text-zinc-900">
                {editingPlanId ? "Tarif bearbeiten" : "Neuen Tarif anlegen"}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 mb-1">Tarifbezeichnung *</label>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="z. B. All-Inclusive Premium"
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">
                    {formState.isPass10 ? "Preis 10er-Karte (€)" : "Monatsbeitrag (€)"}
                  </label>
                  <input
                    type="number"
                    step="0.10"
                    required
                    value={formState.priceMonthly}
                    onChange={(e) =>
                      setFormState({ ...formState, priceMonthly: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Aufnahmegebühr (€)</label>
                  <input
                    type="number"
                    step="0.10"
                    value={formState.admissionFee}
                    onChange={(e) =>
                      setFormState({ ...formState, admissionFee: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Laufzeit (Monate)</label>
                  <input
                    type="number"
                    min="1"
                    max="36"
                    value={formState.durationMonths}
                    onChange={(e) =>
                      setFormState({ ...formState, durationMonths: parseInt(e.target.value, 10) || 12 })
                    }
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-xs"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.isPass10}
                      onChange={(e) => setFormState({ ...formState, isPass10: e.target.checked })}
                      className="rounded text-emerald-600"
                    />
                    <span className="font-bold text-zinc-800">Ist 10er-Karte</span>
                  </label>
                </div>
              </div>

              {/* Inklusiv-Schalter */}
              <div className="pt-2 border-t border-zinc-100 space-y-2">
                <span className="font-bold text-zinc-700 block">Inklusivleistungen:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.includesCourses}
                    onChange={(e) => setFormState({ ...formState, includesCourses: e.target.checked })}
                    className="rounded text-emerald-600"
                  />
                  <span>Kurse & Yoga inklusive</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.includesSauna}
                    onChange={(e) => setFormState({ ...formState, includesSauna: e.target.checked })}
                    className="rounded text-emerald-600"
                  />
                  <span>Sauna & Wellness inklusive</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.includesDrinks}
                    onChange={(e) => setFormState({ ...formState, includesDrinks: e.target.checked })}
                    className="rounded text-emerald-600"
                  />
                  <span>Getränke-Flat inklusive</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 rounded-lg cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  {saving ? "Wird gespeichert..." : "Speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
