import { useState } from "react";
import { Search, Plus, Car, Calendar, User, Phone, Mail, Trash2, Pencil, X, Check, Wrench } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { Vehicle, WorkshopOrder } from "../../../shared/workshop";

interface VehiclesTabProps {
  isManager: boolean;
  vehicles: Vehicle[];
  orders: WorkshopOrder[];
  onVehiclesChanged: (vehicles: Vehicle[]) => void;
}

export function VehiclesTab({ vehicles, orders, onVehiclesChanged, isManager }: VehiclesTabProps) {
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
      setErrorMsg("Bitte mindestens Kennzeichen und Kundenname ausfüllen.");
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
          brand: form.brand.trim() || "Kfz",
          model: form.model.trim() || "Modell",
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
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Speichern des Fahrzeugs.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/workshop/vehicles/${id}`, { method: "DELETE" });
      onVehiclesChanged(vehicles.filter((v) => v.id !== id));
      setDeleteConfirmId(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Löschen.");
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
            placeholder="Kennzeichen, Modell, Kunde, Fahrgestellnummer..."
            aria-label="Kennzeichen, Modell, Kunde, Fahrgestellnummer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button onClick={openNewModal} className="button primary workshop-toolbar-end">
          <Plus size={18} />
          Fahrzeug erfassen
        </button>
      </div>

      {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

      {/* Fahrzeugliste */}
      {filtered.length === 0 ? (
        <section className="card list-card">
          <p className="empty muted">Keine Fahrzeuge gefunden. Erfasse ein neues Kundenfahrzeug über den Button oben.</p>
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
                  <dt>Kilometerstand:</dt>
                  <dd className="workshop-mono">{v.mileage.toLocaleString("de-DE")} km</dd>
                  {v.nextInspection && (
                    <>
                      <dt>Nächste HU / TÜV:</dt>
                      <dd><span className="pill warn workshop-mono">{v.nextInspection}</span></dd>
                    </>
                  )}
                  {v.vin && (
                    <>
                      <dt>FIN:</dt>
                      <dd className="workshop-mono muted">{v.vin}</dd>
                    </>
                  )}
                </dl>

                {/* Halterinfo */}
                <div className="workshop-card-owner">
                  <strong>{v.customerName}</strong>
                  <small className="muted">{v.customerPhone}</small>
                  {v.customerEmail && <small className="muted">{v.customerEmail}</small>}
                  {vehicleOrders.length > 0 && <small className="muted">{vehicleOrders.length} Werkstattauftrag/-aufträge erfasst</small>}
                </div>

                <div className="workshop-card-foot">
                  <button onClick={() => openEditModal(v)} className="text-button workshop-icon-text">
                    <Pencil size={15} />
                    Bearbeiten
                  </button>
                  {!isManager ? null : deleteConfirmId === v.id ? (
                    <div className="row gap">
                      <button onClick={() => handleDelete(v.id)} className="button danger small-button">
                        Löschen
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)} className="text-button">
                        Nein
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(v.id)} className="icon-button danger" aria-label="Löschen">
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
        <Dialog title={editingVehicle ? "Fahrzeug bearbeiten" : "Neues Kundenfahrzeug erfassen"} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="stack workshop-dialog">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}
            <div className="grid form-grid">
              <Field label="Amtliches Kennzeichen *">
                <input
                  type="text"
                  required
                  placeholder="z. B. HH-WM 2024"
                  value={form.licensePlate}
                  onChange={(e) => setForm({ ...form, licensePlate: e.target.value.toUpperCase() })}
                  className="workshop-mono workshop-upper"
                />
              </Field>
              <Field label="Fahrgestellnummer (FIN / VIN)">
                <input
                  type="text"
                  placeholder="17-stellig (optional)"
                  value={form.vin}
                  onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })}
                  className="workshop-mono workshop-upper"
                />
              </Field>
              <Field label="Hersteller / Marke">
                <input type="text" placeholder="z. B. Volkswagen, BMW, Audi" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </Field>
              <Field label="Modell / Typ">
                <input type="text" placeholder="z. B. Golf VII Variant 2.0 TDI" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </Field>
              <Field label="Baujahr / Erstzulassung">
                <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} className="workshop-mono" />
              </Field>
              <Field label="Kilometerstand (km)">
                <input type="number" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: Number(e.target.value) })} className="workshop-mono" />
              </Field>
              <Field label="Kraftstoff">
                <select value={form.fuelType} onChange={(e) => setForm({ ...form, fuelType: e.target.value as any })}>
                  <option value="Benzin">Benzin</option>
                  <option value="Diesel">Diesel</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="Elektro">Elektro</option>
                  <option value="LPG">LPG / Autogas</option>
                </select>
              </Field>
              <Field label="Nächste HU / TÜV (JJJJ-MM)">
                <input type="text" placeholder="2026-08" value={form.nextInspection} onChange={(e) => setForm({ ...form, nextInspection: e.target.value })} className="workshop-mono" />
              </Field>
            </div>

            {/* Halterdaten */}
            <h3 className="card-subtitle"><User size={17} aria-hidden /> Fahrzeughalter</h3>
            <div className="grid form-grid">
              <Field label="Kundenname *" wide>
                <input type="text" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
              </Field>
              <Field label="Telefon *">
                <input type="tel" required value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
              </Field>
              <Field label="E-Mail">
                <input type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} />
              </Field>
            </div>

            <div className="row gap workshop-dialog-actions">
              <button type="button" onClick={() => setModalOpen(false)} className="button">
                Abbrechen
              </button>
              <button type="submit" disabled={saving} className="button primary">
                <Check size={18} />
                {saving ? "Wird gespeichert..." : "Fahrzeug speichern"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
