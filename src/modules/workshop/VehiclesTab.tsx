import { useState } from "react";
import { Search, Plus, Car, Calendar, User, Phone, Mail, Trash2, Pencil, X, Check, Wrench } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { Vehicle, WorkshopOrder } from "../../../shared/workshop";

interface VehiclesTabProps {
  vehicles: Vehicle[];
  orders: WorkshopOrder[];
  onVehiclesChanged: (vehicles: Vehicle[]) => void;
}

export function VehiclesTab({ vehicles, orders, onVehiclesChanged }: VehiclesTabProps) {
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
    <div className="space-y-4">
      {/* Such- & Aktionsleiste */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative min-w-[240px] max-w-md flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Kennzeichen, Modell, Kunde, Fahrgestellnummer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={openNewModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs shadow-sm transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Fahrzeug erfassen
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Fahrzeugliste */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 text-xs">
            Keine Fahrzeuge gefunden. Erfasse ein neues Kundenfahrzeug über den Button oben.
          </div>
        ) : (
          filtered.map((v) => {
            const vehicleOrders = orders.filter((o) => o.vehicleId === v.id || o.licensePlate === v.licensePlate);
            return (
              <div
                key={v.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-base text-blue-600 dark:text-blue-400 block">
                        {v.licensePlate}
                      </span>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                        {v.brand} {v.model}
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                      {v.year}
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-slate-500 space-y-1">
                    <p>
                      Kilometerstand: <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{v.mileage.toLocaleString("de-DE")} km</span>
                    </p>
                    {v.nextInspection && (
                      <p>
                        Nächste HU / TÜV:{" "}
                        <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                          {v.nextInspection}
                        </span>
                      </p>
                    )}
                    {v.vin && (
                      <p className="truncate font-mono text-[10px] text-slate-400">
                        FIN: {v.vin}
                      </p>
                    )}
                  </div>

                  {/* Halterinfo */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{v.customerName}</p>
                    <p className="text-[11px]">{v.customerPhone}</p>
                    {v.customerEmail && <p className="text-[11px] truncate">{v.customerEmail}</p>}
                  </div>

                  {/* Historie / Aufträge */}
                  {vehicleOrders.length > 0 && (
                    <div className="mt-2 text-[11px] text-slate-500">
                      <span>{vehicleOrders.length} Werkstattauftrag/-aufträge erfasst</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <button
                    onClick={() => openEditModal(v)}
                    className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-blue-600 font-medium"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Bearbeiten
                  </button>

                  {deleteConfirmId === v.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="px-2 py-0.5 bg-red-600 text-white rounded text-[10px] font-semibold"
                      >
                        Löschen
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="text-slate-400 text-[10px]"
                      >
                        Nein
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(v.id)}
                      className="p-1 text-slate-300 hover:text-red-500 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Fahrzeug erfassen / bearbeiten */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl shadow-xl max-w-2xl w-full p-6 relative border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Car className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold">
                  {editingVehicle ? "Fahrzeug bearbeiten" : "Neues Kundenfahrzeug erfassen"}
                </h2>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Field label="Amtliches Kennzeichen *">
                    <input
                      type="text"
                      required
                      placeholder="z. B. HH-WM 2024"
                      value={form.licensePlate}
                      onChange={(e) => setForm({ ...form, licensePlate: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold uppercase text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Fahrgestellnummer (FIN / VIN)">
                    <input
                      type="text"
                      placeholder="17-stellig (optional)"
                      value={form.vin}
                      onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono uppercase text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Hersteller / Marke">
                    <input
                      type="text"
                      placeholder="z. B. Volkswagen, BMW, Audi"
                      value={form.brand}
                      onChange={(e) => setForm({ ...form, brand: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Modell / Typ">
                    <input
                      type="text"
                      placeholder="z. B. Golf VII Variant 2.0 TDI"
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Baujahr / Erstzulassung">
                    <input
                      type="number"
                      value={form.year}
                      onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Kilometerstand (km)">
                    <input
                      type="number"
                      value={form.mileage}
                      onChange={(e) => setForm({ ...form, mileage: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-sm"
                    />
                  </Field>
                </div>

                <div>
                  <Field label="Kraftstoff">
                    <select
                      value={form.fuelType}
                      onChange={(e) => setForm({ ...form, fuelType: e.target.value as any })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                    >
                      <option value="Benzin">Benzin</option>
                      <option value="Diesel">Diesel</option>
                      <option value="Hybrid">Hybrid</option>
                      <option value="Elektro">Elektro</option>
                      <option value="LPG">LPG / Autogas</option>
                    </select>
                  </Field>
                </div>

                <div>
                  <Field label="Nächste HU / TÜV (JJJJ-MM)">
                    <input
                      type="text"
                      placeholder="2026-08"
                      value={form.nextInspection}
                      onChange={(e) => setForm({ ...form, nextInspection: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-sm"
                    />
                  </Field>
                </div>
              </div>

              {/* Halterdaten */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                  Fahrzeughalter
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Field label="Kundenname *">
                      <input
                        type="text"
                        required
                        value={form.customerName}
                        onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                        className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                      />
                    </Field>
                  </div>

                  <div>
                    <Field label="Telefon *">
                      <input
                        type="tel"
                        required
                        value={form.customerPhone}
                        onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                        className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                      />
                    </Field>
                  </div>

                  <div>
                    <Field label="E-Mail">
                      <input
                        type="email"
                        value={form.customerEmail}
                        onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                        className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                      />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 rounded-lg text-xs"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium shadow-sm transition-colors"
                >
                  {saving ? "Wird gespeichert..." : "Fahrzeug speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
