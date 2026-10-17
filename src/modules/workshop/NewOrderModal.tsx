import { useState } from "react";
import { Car, User, Wrench, Check } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
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
    <Dialog title="Neuer Werkstattauftrag" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="stack workshop-dialog">
        <p className="muted workshop-dialog-sub"><Wrench size={16} aria-hidden /> Dialogannahme & Erfassung des Fahrzeugs</p>

        {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

        {/* Fahrzeugdaten */}
        <h3 className="card-subtitle"><Car size={17} aria-hidden /> Fahrzeuginformationen</h3>
        <div className="grid form-grid">
          <Field label="Amtliches Kennzeichen *">
            <input
              type="text"
              required
              placeholder="z. B. HH-WM 2024"
              value={licensePlate}
              onChange={(e) => handlePlateChange(e.target.value)}
              className="workshop-mono workshop-upper"
            />
          </Field>
          <Field label="Fahrzeugmodell / Motor">
            <input type="text" placeholder="z. B. VW Golf VII 2.0 TDI" value={vehicleInfo} onChange={(e) => setVehicleInfo(e.target.value)} />
          </Field>
          <Field label="Kilometerstand (km)">
            <input type="number" value={mileage} onChange={(e) => setMileage(Number(e.target.value))} className="workshop-mono" />
          </Field>
          <Field label="Fahrgestellnummer (FIN / VIN)">
            <input
              type="text"
              placeholder="17-stellig (optional)"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              className="workshop-mono workshop-upper"
            />
          </Field>
        </div>

        {/* Kundendaten */}
        <h3 className="card-subtitle"><User size={17} aria-hidden /> Kunde & Erreichbarkeit</h3>
        <div className="grid form-grid">
          <Field label="Kundenname *">
            <input type="text" required placeholder="Vorname Nachname" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </Field>
          <Field label="Telefon / Mobilfunk *">
            <input type="tel" required placeholder="+49 171 ..." value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </Field>
          <Field label="E-Mail für Status-Link" wide>
            <input type="email" placeholder="kunde@beispiel.de" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
          </Field>
        </div>

        {/* Werkstattzuweisung */}
        <div className="grid form-grid">
          <Field label="Hebebühne / Arbeitsplatz">
            <select value={liftBay} onChange={(e) => setLiftBay(e.target.value)}>
              <option value="Bühne 1">Bühne 1 (2-Säulen)</option>
              <option value="Bühne 2">Bühne 2 (Scherenbühne)</option>
              <option value="Bühne 3">Bühne 3 (4-Säulen)</option>
              <option value="Bühne 4 (Achsmessung)">Bühne 4 (Achsmessung)</option>
              <option value="Prüfstraße">Prüfstraße (Bremsen/Licht)</option>
              <option value="Hof / Parkplatz">Hof / Parkplatz</option>
            </select>
          </Field>
          <Field label="Zuständiger Mechaniker / Berater">
            <input type="text" value={mechanicName} onChange={(e) => setMechanicName(e.target.value)} />
          </Field>

          {/* Beanstandung */}
          <Field label="Kundenbeanstandung / Gewünschte Arbeiten *" wide>
            <textarea
              required
              rows={3}
              placeholder="z. B. Inspektion nach Herstellervorgabe, Bremsbeläge prüfen, Schleifgeräusch vorn rechts..."
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
            />
          </Field>
        </div>

        <div className="row gap workshop-dialog-actions">
          <button type="button" onClick={onClose} className="button">
            Abbrechen
          </button>
          <button type="submit" disabled={saving} className="button primary">
            <Check size={18} />
            {saving ? "Wird angelegt..." : "Auftrag annehmen & anlegen"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
