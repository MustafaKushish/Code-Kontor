import { useState } from "react";
import { Car, User, Wrench, Check } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { Vehicle, WorkshopOrder } from "../../../shared/workshop";
import { useWorkshopI18n, LIFT_KEYS } from "./i18n";

interface NewOrderModalProps {
  vehicles: Vehicle[];
  onClose: () => void;
  onCreated: (order: WorkshopOrder) => void;
}

export function NewOrderModal({ vehicles, onClose, onCreated }: NewOrderModalProps) {
  const { t, workshopError } = useWorkshopI18n();
  const [licensePlate, setLicensePlate] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState<number>(100000);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [liftBay, setLiftBay] = useState<string>("Bühne 1");
  const [mechanicName, setMechanicName] = useState(() => t("newOrder.defaultMechanic"));

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
      setErrorMsg(t("newOrder.required"));
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const created = await api<WorkshopOrder>("/workshop/orders", {
        method: "POST",
        body: {
          licensePlate: licensePlate.trim().toUpperCase(),
          vehicleInfo: vehicleInfo.trim() || t("newOrder.defaultVehicle"),
          vin: vin.trim(),
          mileage: Number(mileage) || 0,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim() || undefined,
          issueDescription: issueDescription.trim() || t("newOrder.defaultIssue"),
          liftBay,
          mechanicName,
        },
      });
      onCreated(created);
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, t("newOrder.createError")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title={t("newOrder.title")} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="stack workshop-dialog">
        <p className="muted workshop-dialog-sub"><Wrench size={16} aria-hidden /> {t("newOrder.subtitle")}</p>

        {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

        {/* Fahrzeugdaten */}
        <h3 className="card-subtitle"><Car size={17} aria-hidden /> {t("newOrder.vehicleSection")}</h3>
        <div className="grid form-grid">
          <Field label={t("common.plate")}>
            <input
              type="text"
              required
              placeholder={t("common.platePlaceholder")}
              value={licensePlate}
              onChange={(e) => handlePlateChange(e.target.value)}
              className="workshop-mono workshop-upper"
            />
          </Field>
          <Field label={t("newOrder.model")}>
            <input type="text" placeholder={t("newOrder.modelPlaceholder")} value={vehicleInfo} onChange={(e) => setVehicleInfo(e.target.value)} />
          </Field>
          <Field label={t("common.mileage")}>
            <input type="number" value={mileage} onChange={(e) => setMileage(Number(e.target.value))} className="workshop-mono" />
          </Field>
          <Field label={t("common.vin")}>
            <input
              type="text"
              placeholder={t("common.vinPlaceholder")}
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              className="workshop-mono workshop-upper"
            />
          </Field>
        </div>

        {/* Kundendaten */}
        <h3 className="card-subtitle"><User size={17} aria-hidden /> {t("newOrder.customerSection")}</h3>
        <div className="grid form-grid">
          <Field label={t("common.customerNameRequired")}>
            <input type="text" required placeholder={t("newOrder.namePlaceholder")} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </Field>
          <Field label={t("newOrder.phone")}>
            <input type="tel" required placeholder={t("newOrder.phonePlaceholder")} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </Field>
          <Field label={t("newOrder.email")} wide>
            <input type="email" placeholder={t("newOrder.emailPlaceholder")} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
          </Field>
        </div>

        {/* Werkstattzuweisung */}
        <div className="grid form-grid">
          <Field label={t("newOrder.lift")}>
            <select value={liftBay} onChange={(e) => setLiftBay(e.target.value)}>
              {(Object.keys(LIFT_KEYS) as (keyof typeof LIFT_KEYS)[]).map((value) => (
                <option key={value} value={value}>
                  {t(`lifts.${LIFT_KEYS[value]}.option`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("newOrder.mechanic")}>
            <input type="text" value={mechanicName} onChange={(e) => setMechanicName(e.target.value)} />
          </Field>

          {/* Beanstandung */}
          <Field label={t("newOrder.issue")} wide>
            <textarea
              required
              rows={3}
              placeholder={t("newOrder.issuePlaceholder")}
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
            />
          </Field>
        </div>

        <div className="row gap workshop-dialog-actions">
          <button type="button" onClick={onClose} className="button">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={saving} className="button primary">
            <Check size={18} />
            {saving ? t("newOrder.submitting") : t("newOrder.submit")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
