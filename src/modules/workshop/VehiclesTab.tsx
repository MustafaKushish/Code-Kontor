import { useState } from "react";
import { Search, Plus, Car, Calendar, User, Phone, Mail, Trash2, Pencil, X, Check, Wrench } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { Vehicle, WorkshopOrder } from "../../../shared/workshop";
import { useWorkshopI18n } from "./i18n";

interface VehiclesTabProps {
  isManager: boolean;
  vehicles: Vehicle[];
  orders: WorkshopOrder[];
  onVehiclesChanged: (vehicles: Vehicle[]) => void;
}

export function VehiclesTab({ vehicles, orders, onVehiclesChanged, isManager }: VehiclesTabProps) {
  const { t, workshopError, num } = useWorkshopI18n();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  const [form, setForm] = useState({
    licensePlate: "",
    vin: "",
    brand: "",
    model: "",
    year: 2020,
    mileage: 100000,
    hsn: "",
    tsn: "",
    fuelType: "Benzin" as Vehicle["fuelType"],
    transmission: "Schaltgetriebe" as Vehicle["transmission"],
    powerHp: 150,
    nextInspection: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const filtered = vehicles.filter((v) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      v.licensePlate.toLowerCase().includes(q) ||
      v.brand.toLowerCase().includes(q) ||
      v.model.toLowerCase().includes(q) ||
      v.customerName.toLowerCase().includes(q) ||
      v.vin.toLowerCase().includes(q)
    );
  });

  const openNewModal = () => {
    setEditingVehicle(null);
    setForm({
      licensePlate: "",
      vin: "",
      brand: "",
      model: "",
      year: new Date().getFullYear() - 3,
      mileage: 80000,
      hsn: "",
      tsn: "",
      fuelType: "Benzin",
      transmission: "Schaltgetriebe",
      powerHp: 150,
      nextInspection: `${new Date().getFullYear() + 1}-06`,
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      notes: "",
    });
    setModalOpen(true);
  };

  const openEditModal = (v: Vehicle) => {
    setEditingVehicle(v);
    setForm({
      licensePlate: v.licensePlate,
      vin: v.vin,
      brand: v.brand,
      model: v.model,
      year: v.year,
      mileage: v.mileage,
      hsn: v.hsn || "",
      tsn: v.tsn || "",
      fuelType: v.fuelType,
      transmission: v.transmission,
      powerHp: v.powerHp || 150,
      nextInspection: v.nextInspection,
      customerName: v.customerName,
      customerPhone: v.customerPhone,
      customerEmail: v.customerEmail || "",
      notes: v.notes || "",
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.licensePlate.trim() || !form.customerName.trim()) {
      setErrorMsg(t("vehicles.required"));
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const saved = await api<Vehicle>("/workshop/vehicles", {
        method: "POST",
        body: {
          id: editingVehicle?.id,
          licensePlate: form.licensePlate.trim().toUpperCase(),
          vin: form.vin.trim().toUpperCase(),
          brand: form.brand.trim() || t("vehicles.defaultBrand"),
          model: form.model.trim() || t("vehicles.defaultModel"),
          year: Number(form.year) || 2020,
          mileage: Number(form.mileage) || 0,
          hsn: form.hsn.trim(),
          tsn: form.tsn.trim(),
          fuelType: form.fuelType,
          transmission: form.transmission,
          powerHp: Number(form.powerHp) || 150,
          nextInspection: form.nextInspection.trim(),
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim() || undefined,
          notes: form.notes.trim() || undefined,
        },
      });

      if (editingVehicle) {
        onVehiclesChanged(vehicles.map((v) => (v.id === saved.id ? saved : v)));
      } else {
        onVehiclesChanged([saved, ...vehicles]);
      }
      setModalOpen(false);
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, t("vehicles.saveError")));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/workshop/vehicles/${id}`, { method: "DELETE" });
      onVehiclesChanged(vehicles.filter((v) => v.id !== id));
      setDeleteConfirmId(null);
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, t("common.deleteError")));
    }
  };

  return (
    <div className="stack">
      {/* Such- & Aktionsleiste */}
      <div className="workshop-toolbar">
        <label className="search">
          <Search size={18} />
          <input
            type="search"
            placeholder={t("vehicles.searchPlaceholder")}
            aria-label={t("vehicles.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button onClick={openNewModal} className="button primary workshop-toolbar-end">
          <Plus size={18} />
          {t("vehicles.add")}
        </button>
      </div>

      {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

      {/* Fahrzeugliste */}
      {filtered.length === 0 ? (
        <section className="card list-card">
          <p className="empty muted">{t("vehicles.empty")}</p>
        </section>
      ) : (
        <div className="workshop-cards">
          {filtered.map((v) => {
            const vehicleOrders = orders.filter((o) => o.vehicleId === v.id || o.licensePlate === v.licensePlate);
            return (
              <article key={v.id} className="card workshop-card">
                <div className="workshop-card-top">
                  <span className="list-main">
                    <strong className="workshop-plate">{v.licensePlate}</strong>
                    <span>
                      {v.brand} {v.model}
                    </span>
                  </span>
                  <span className="pill workshop-mono">{v.year}</span>
                </div>

                <dl className="workshop-facts">
                  <dt>{t("vehicles.mileage")}</dt>
                  <dd className="workshop-mono">{t("common.km", { n: num(v.mileage) })}</dd>
                  {v.nextInspection && (
                    <>
                      <dt>{t("vehicles.nextInspection")}</dt>
                      <dd><span className="pill warn workshop-mono">{v.nextInspection}</span></dd>
                    </>
                  )}
                  {v.vin && (
                    <>
                      <dt>{t("vehicles.vin")}</dt>
                      <dd className="workshop-mono muted">{v.vin}</dd>
                    </>
                  )}
                </dl>

                {/* Halterinfo */}
                <div className="workshop-card-owner">
                  <strong>{v.customerName}</strong>
                  <small className="muted">{v.customerPhone}</small>
                  {v.customerEmail && <small className="muted">{v.customerEmail}</small>}
                  {vehicleOrders.length > 0 && <small className="muted">{t("vehicles.ordersCount", { n: vehicleOrders.length })}</small>}
                </div>

                <div className="workshop-card-foot">
                  <button onClick={() => openEditModal(v)} className="text-button workshop-icon-text">
                    <Pencil size={15} />
                    {t("common.edit")}
                  </button>
                  {!isManager ? null : deleteConfirmId === v.id ? (
                    <div className="row gap">
                      <button onClick={() => handleDelete(v.id)} className="button danger small-button">
                        {t("common.delete")}
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)} className="text-button">
                        {t("common.no")}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(v.id)} className="icon-button danger" aria-label={t("common.delete")}>
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Dialog: Fahrzeug erfassen / bearbeiten */}
      {modalOpen && (
        <Dialog title={editingVehicle ? t("vehicles.editTitle") : t("vehicles.newTitle")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="stack workshop-dialog">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}
            <div className="grid form-grid">
              <Field label={t("common.plate")}>
                <input
                  type="text"
                  required
                  placeholder={t("common.platePlaceholder")}
                  value={form.licensePlate}
                  onChange={(e) => setForm({ ...form, licensePlate: e.target.value.toUpperCase() })}
                  className="workshop-mono workshop-upper"
                />
              </Field>
              <Field label={t("common.vin")}>
                <input
                  type="text"
                  placeholder={t("common.vinPlaceholder")}
                  value={form.vin}
                  onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })}
                  className="workshop-mono workshop-upper"
                />
              </Field>
              <Field label={t("common.brand")}>
                <input type="text" placeholder={t("vehicles.brandPlaceholder")} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </Field>
              <Field label={t("vehicles.model")}>
                <input type="text" placeholder={t("vehicles.modelPlaceholder")} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </Field>
              <Field label={t("vehicles.year")}>
                <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} className="workshop-mono" />
              </Field>
              <Field label={t("common.mileage")}>
                <input type="number" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: Number(e.target.value) })} className="workshop-mono" />
              </Field>
              <Field label={t("vehicles.fuel")}>
                <select value={form.fuelType} onChange={(e) => setForm({ ...form, fuelType: e.target.value as any })}>
                  {(["Benzin", "Diesel", "Hybrid", "Elektro", "LPG"] as const).map((fuel) => (
                    <option key={fuel} value={fuel}>
                      {t(`vehicles.fuels.${fuel}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("vehicles.inspection")}>
                <input type="text" placeholder={t("vehicles.inspectionPlaceholder")} value={form.nextInspection} onChange={(e) => setForm({ ...form, nextInspection: e.target.value })} className="workshop-mono" />
              </Field>
            </div>

            {/* Halterdaten */}
            <h3 className="card-subtitle"><User size={17} aria-hidden /> {t("vehicles.ownerSection")}</h3>
            <div className="grid form-grid">
              <Field label={t("common.customerNameRequired")} wide>
                <input type="text" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
              </Field>
              <Field label={t("common.phoneRequired")}>
                <input type="tel" required value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
              </Field>
              <Field label={t("common.email")}>
                <input type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} />
              </Field>
            </div>

            <div className="row gap workshop-dialog-actions">
              <button type="button" onClick={() => setModalOpen(false)} className="button">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={saving} className="button primary">
                <Check size={18} />
                {saving ? t("common.saving") : t("vehicles.save")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
