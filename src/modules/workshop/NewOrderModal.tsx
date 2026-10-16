import { useState } from "react";
import { X, Car, User, Wrench, Plus, Check } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { Vehicle, WorkshopOrder } from "../../../shared/workshop";

interface NewOrderModalProps {
  vehicles: Vehicle[];
  onClose: () => void;
  onCreated: (order: WorkshopOrder) => void;
}

export function NewOrderModal({ vehicles, onClose, onCreated }: NewOrderModalProps) {
  const [licensePlate, setLicensePlate] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState<number>(100000);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [liftBay, setLiftBay] = useState<string>("Bühne 1");
  const [mechanicName, setMechanicName] = useState("Meister");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Bei Eingabe des Kennzeichens vorhandene Fahrzeugdaten automatisch vorschlagen
  const handlePlateChange = (val: string) => {
    const clean = val.toUpperCase();
    setLicensePlate(clean);
    const match = vehicles.find((v) => v.licensePlate.replace(/\s+/g, "") === clean.replace(/\s+/g, ""));
    if (match) {
      setVehicleInfo(`${match.brand} ${match.model}`);
      setVin(match.vin);
      setMileage(match.mileage);
      setCustomerName(match.customerName);
      setCustomerPhone(match.customerPhone);
      setCustomerEmail(match.customerEmail || "");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licensePlate.trim() || !customerName.trim()) {
      setErrorMsg("Bitte mindestens Kennzeichen und Kundenname angeben.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const created = await api<WorkshopOrder>("/workshop/orders", {
        method: "POST",
        body: {
          licensePlate: licensePlate.trim().toUpperCase(),
          vehicleInfo: vehicleInfo.trim() || "Fahrzeug",
          vin: vin.trim(),
          mileage: Number(mileage) || 0,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim() || undefined,
          issueDescription: issueDescription.trim() || "Allgemeine Wartung / Reparatur",
          liftBay,
          mechanicName,
        },
      });
      onCreated(created);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Erstellen des Auftrags.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl shadow-xl max-w-2xl w-full p-6 relative border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Neuer Werkstattauftrag</h2>
              <p className="text-xs text-slate-500">Dialogannahme & Erfassung des Fahrzeugs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* Fahrzeugdaten */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5" />
              Fahrzeuginformationen
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Field label="Amtliches Kennzeichen *">
                  <input
                    type="text"
                    required
                    placeholder="z. B. HH-WM 2024"
                    value={licensePlate}
                    onChange={(e) => handlePlateChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </Field>
              </div>

              <div>
                <Field label="Fahrzeugmodell / Motor">
                  <input
                    type="text"
                    placeholder="z. B. VW Golf VII 2.0 TDI"
                    value={vehicleInfo}
                    onChange={(e) => setVehicleInfo(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                  />
                </Field>
              </div>

              <div>
                <Field label="Kilometerstand (km)">
                  <input
                    type="number"
                    value={mileage}
                    onChange={(e) => setMileage(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-sm"
                  />
                </Field>
              </div>

              <div>
                <Field label="Fahrgestellnummer (FIN / VIN)">
                  <input
                    type="text"
                    placeholder="17-stellig (optional)"
                    value={vin}
                    onChange={(e) => setVin(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-sm uppercase"
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Kundendaten */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Kunde & Erreichbarkeit
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Field label="Kundenname *">
                  <input
                    type="text"
                    required
                    placeholder="Vorname Nachname"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                  />
                </Field>
              </div>

              <div>
                <Field label="Telefon / Mobilfunk *">
                  <input
                    type="tel"
                    required
                    placeholder="+49 171 ..."
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                  />
                </Field>
              </div>

              <div>
                <Field label="E-Mail für Status-Link">
                  <input
                    type="email"
                    placeholder="kunde@beispiel.de"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Werkstattzuweisung */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Field label="Hebebühne / Arbeitsplatz">
                  <select
                    value={liftBay}
                    onChange={(e) => setLiftBay(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                  >
                    <option value="Bühne 1">Bühne 1 (2-Säulen)</option>
                    <option value="Bühne 2">Bühne 2 (Scherenbühne)</option>
                    <option value="Bühne 3">Bühne 3 (4-Säulen)</option>
                    <option value="Bühne 4 (Achsmessung)">Bühne 4 (Achsmessung)</option>
                    <option value="Prüfstraße">Prüfstraße (Bremsen/Licht)</option>
                    <option value="Hof / Parkplatz">Hof / Parkplatz</option>
                  </select>
                </Field>
              </div>

              <div>
                <Field label="Zuständiger Mechaniker / Berater">
                  <input
                    type="text"
                    value={mechanicName}
                    onChange={(e) => setMechanicName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Beanstandung */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <Field label="Kundenbeanstandung / Gewünschte Arbeiten *">
              <textarea
                required
                rows={3}
                placeholder="z. B. Inspektion nach Herstellervorgabe, Bremsbeläge prüfen, Schleifgeräusch vorn rechts..."
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm shadow-sm transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {saving ? "Wird angelegt..." : "Auftrag annehmen & anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
