import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarClock, Camera, Car, Check, FileSignature, ImagePlus, Pencil, Search, Star, Trash2, Wrench } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { navigate } from "../../router";
import { Dialog } from "../../pos/ui";
import {
  CONDITION_LABEL,
  VEHICLE_STATUS_LABEL,
  vehicleLabel,
  type FuelType,
  type StockVehicle,
  type Taxation,
  type Transmission,
  type VehicleCondition,
  type VehiclePhoto,
  type VehicleStatus,
} from "../../../shared/autohaus";
import type { TabProps } from "./AutohausApp";
import { BASE, errorText, euro, km, monthLabel, psFromKw, shrinkPhoto, vehicleFacts, VehicleStatusPill, sym } from "./parts";

type Filter = "aktiv" | VehicleStatus | "alle";

export function StockTab({ vehicles, me, reload, creating, onCreatingDone }: TabProps & { creating: boolean; onCreatingDone: () => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("aktiv");
  const [editing, setEditing] = useState<StockVehicle | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (creating) {
      setEditing("new");
      onCreatingDone();
    }
  }, [creating, onCreatingDone]);

  const q = search.trim().toLowerCase();
  const shown = vehicles.filter((v) => {
    if (filter === "aktiv" ? v.status === "verkauft" : filter !== "alle" && v.status !== filter) return false;
    return !q || [v.stockNumber, v.make, v.model, v.variant, v.vin, v.licensePlate, v.color].some((s) => s.toLowerCase().includes(q));
  });
  const count = (f: Filter) => vehicles.filter((v) => (f === "aktiv" ? v.status !== "verkauft" : f === "alle" || v.status === f)).length;
  const filters: [Filter, string][] = [
    ["aktiv", "Im Bestand"],
    ["verfuegbar", "Verfügbar"],
    ["aufbereitung", "In Aufbereitung"],
    ["reserviert", "Reserviert"],
    ["verkauft", "Verkauft"],
  ];
  const open = vehicles.find((v) => v.id === openId) ?? null;

  return (
    <div className="stack">
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input type="search" placeholder="Marke, Modell, FIN, Kennzeichen, Bestandsnr." aria-label="Fahrzeug suchen" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="chips" role="tablist">
          {filters.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? "chip active" : "chip"} onClick={() => setFilter(id)}>
              {label} <span className="autohaus-count">{count(id)}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <section className="card list-card">
          <p className="empty muted">{vehicles.length ? "Keine Fahrzeuge für diese Auswahl." : "Noch keine Fahrzeuge im Bestand. Nimm dein erstes Fahrzeug über „Fahrzeug aufnehmen“ auf."}</p>
        </section>
      ) : (
        <div className="autohaus-grid">
          {shown.map((v) => (
            <button key={v.id} className="card autohaus-car" onClick={() => setOpenId(v.id)}>
              <span className="autohaus-photo">
                {v.coverPhoto ? <img src={v.coverPhoto} alt="" loading="lazy" /> : <Car size={40} aria-hidden />}
                <span className="autohaus-photo-badges">
                  <VehicleStatusPill status={v.status} />
                  {v.photoCount > 0 && <span className="pill"><Camera size={13} aria-hidden /> {v.photoCount}</span>}
                </span>
              </span>
              <span className="autohaus-car-body">
                <span className="autohaus-car-title">
                  <strong>{v.make} {v.model}</strong>
                  <small className="muted">{v.variant || CONDITION_LABEL[v.condition]}</small>
                </span>
                <small className="muted">{vehicleFacts(v)}</small>
                <span className="autohaus-car-foot">
                  <strong className="autohaus-price">{v.price ? euro(v.price) : "Preis offen"}</strong>
                  <small className="muted autohaus-mono">{v.stockNumber}</small>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && <VehicleDetail vehicle={open} isManager={me.user.role !== "staff"} hasWorkshop={me.installedApps.includes("werkstatt")} reload={reload} onEdit={() => setEditing(open)} onClose={() => setOpenId(null)} />}
      {editing && (
        <VehicleForm
          vehicle={editing === "new" ? null : editing}
          isManager={me.user.role !== "staff"}
          onClose={() => setEditing(null)}
          onSaved={async (v) => {
            setEditing(null);
            await reload();
            setOpenId(v.id);
          }}
        />
      )}
    </div>
  );
}

function VehicleDetail({ vehicle: v, isManager, hasWorkshop, reload, onEdit, onClose }: { vehicle: StockVehicle; isManager: boolean; hasWorkshop: boolean; reload: () => Promise<void>; onEdit: () => void; onClose: () => void }) {
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<VehiclePhoto[]>(`/autohaus/vehicles/${v.id}/photos`).then(setPhotos).catch((err) => setError(errorText(err)));
  }, [v.id]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error && err.message === "photoTooLarge" ? "Das Bild ist zu groß." : errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const addPhotos = (files: FileList | null) =>
    run(async () => {
      for (const file of Array.from(files ?? [])) {
        const dataUrl = await shrinkPhoto(file);
        setPhotos(await api<VehiclePhoto[]>(`/autohaus/vehicles/${v.id}/photos`, { method: "POST", body: { dataUrl } }));
      }
      await reload();
    });

  const facts: [string, string][] = [
    ["Zustand", CONDITION_LABEL[v.condition]],
    ["Erstzulassung", v.condition === "neu" ? "Neuwagen" : monthLabel(v.firstRegistration) || "–"],
    ["Kilometerstand", km(v.mileage)],
    ["Leistung", v.powerKw ? `${v.powerKw} kW (${psFromKw(v.powerKw)} PS)` : "–"],
    ["Kraftstoff", v.fuel],
    ["Getriebe", v.transmission],
    ["Farbe", v.color || "–"],
    ["Vorbesitzer", String(v.previousOwners)],
    ["HU fällig", monthLabel(v.nextInspection) || "–"],
    ["FIN", v.vin || "–"],
    ["Kennzeichen", v.licensePlate || "–"],
    ["Besteuerung", v.taxation === "differenz" ? "Differenzbesteuert (§ 25a UStG)" : "MwSt. ausweisbar"],
  ];
  const canSell = v.status === "verfuegbar" || v.status === "aufbereitung";
  const margin = v.price - v.purchasePrice;

  return (
    <Dialog title={`${vehicleLabel(v)} · ${v.stockNumber}`} onClose={onClose} wide>
      <div className="stack autohaus-dialog">
        {error && <p className="error" role="alert">{error}</p>}

        <div className="autohaus-gallery">
          <div className="autohaus-gallery-main">
            {photos[active] ? <img src={photos[active]!.dataUrl} alt={`Foto ${active + 1} von ${vehicleLabel(v)}`} /> : <Car size={56} aria-hidden />}
          </div>
          <div className="autohaus-thumbs">
            {photos.map((p, i) => (
              <span key={p.id} className={i === active ? "autohaus-thumb active" : "autohaus-thumb"}>
                <button onClick={() => setActive(i)} aria-label={`Foto ${i + 1} zeigen`}><img src={p.dataUrl} alt="" /></button>
                <span className="autohaus-thumb-actions">
                  {i > 0 && (
                    <button className="icon-button" aria-label="Als Titelbild" title="Als Titelbild" disabled={busy} onClick={() => run(async () => { setPhotos(await api(`/autohaus/vehicles/${v.id}/photos/${p.id}/cover`, { method: "POST" })); setActive(0); await reload(); })}>
                      <Star size={15} />
                    </button>
                  )}
                  <button className="icon-button" aria-label="Foto löschen" title="Foto löschen" disabled={busy} onClick={() => run(async () => { setPhotos(await api(`/autohaus/vehicles/${v.id}/photos/${p.id}`, { method: "DELETE" })); setActive(0); await reload(); })}>
                    <Trash2 size={15} />
                  </button>
                </span>
              </span>
            ))}
            {photos.length < 8 && (
              <button className="autohaus-thumb add" onClick={() => fileInput.current?.click()} disabled={busy}>
                <ImagePlus size={20} aria-hidden />
                <small>{busy ? "Lädt …" : "Foto hinzufügen"}</small>
              </button>
            )}
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
          </div>
        </div>

        <div className="autohaus-detail-head">
          <div>
            <strong className="autohaus-price big">{v.price ? euro(v.price) : "Preis offen"}</strong>
            {isManager && v.purchasePrice > 0 && <small className="muted">Einkauf {euro(v.purchasePrice)} · Marge {euro(margin)}</small>}
          </div>
          <VehicleStatusPill status={v.status} />
        </div>

        <dl className="autohaus-facts">
          {facts.map(([k, val]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{val}</dd>
            </div>
          ))}
        </dl>
        {v.equipment && (
          <div className="stack-sm">
            <h3 className="card-subtitle">Ausstattung</h3>
            <div className="autohaus-equipment">{v.equipment.split(/[,\n]/).map((e) => e.trim()).filter(Boolean).map((e) => <span key={e} className="pill">{e}</span>)}</div>
          </div>
        )}
        {v.notes && <p className="muted autohaus-notes">{v.notes}</p>}

        <div className="row wrap gap">
          {canSell && <button className="button primary" onClick={() => navigate(`${BASE}/vertraege/neu/${v.id}`)}><FileSignature size={18} /> Kaufvertrag</button>}
          {v.status !== "verkauft" && <button className="button" onClick={() => navigate(`${BASE}/probefahrten/neu/${v.id}`)}><CalendarClock size={18} /> Probefahrt</button>}
          {v.status === "aufbereitung" && <button className="button" disabled={busy} onClick={() => run(async () => { await api(`/autohaus/vehicles/${v.id}/status`, { method: "POST", body: { status: "verfuegbar" } }); await reload(); })}><Check size={18} /> Verkaufsbereit</button>}
          {v.status === "verfuegbar" && <button className="button" disabled={busy} onClick={() => run(async () => { await api(`/autohaus/vehicles/${v.id}/status`, { method: "POST", body: { status: "aufbereitung" } }); await reload(); })}><Wrench size={18} /> In Aufbereitung</button>}
          <button className="button" onClick={onEdit}><Pencil size={18} /> Bearbeiten</button>
          {isManager && v.status !== "verkauft" && v.status !== "reserviert" && (
            confirmDelete ? (
              <span className="row gap push-end">
                <button className="button danger" disabled={busy} onClick={() => run(async () => { await api(`/autohaus/vehicles/${v.id}`, { method: "DELETE" }); await reload(); onClose(); })}>Endgültig löschen</button>
                <button className="text-button" onClick={() => setConfirmDelete(false)}>Abbrechen</button>
              </span>
            ) : (
              <button className="icon-button danger push-end" aria-label="Fahrzeug löschen" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></button>
            )
          )}
        </div>
        {hasWorkshop && v.status === "verkauft" && <p className="muted small">Tipp: Im Kaufvertrag kannst du das Fahrzeug mit einem Klick an die Werkstatt übergeben.</p>}
      </div>
    </Dialog>
  );
}

const EMPTY = {
  make: "",
  model: "",
  variant: "",
  condition: "gebraucht" as VehicleCondition,
  firstRegistration: "",
  mileage: "",
  fuel: "Benzin" as FuelType,
  transmission: "Schaltgetriebe" as Transmission,
  powerKw: "",
  color: "",
  vin: "",
  licensePlate: "",
  previousOwners: "1",
  nextInspection: "",
  price: "",
  purchasePrice: "",
  taxation: "differenz" as Taxation,
  status: "verfuegbar" as VehicleStatus,
  equipment: "",
  notes: "",
};

function VehicleForm({ vehicle, isManager, onClose, onSaved }: { vehicle: StockVehicle | null; isManager: boolean; onClose: () => void; onSaved: (v: StockVehicle) => void }) {
  const [form, setForm] = useState(() =>
    vehicle
      ? {
          ...EMPTY,
          ...vehicle,
          mileage: String(vehicle.mileage),
          powerKw: vehicle.powerKw ? String(vehicle.powerKw) : "",
          previousOwners: String(vehicle.previousOwners),
          price: vehicle.price ? String(vehicle.price) : "",
          purchasePrice: vehicle.purchasePrice ? String(vehicle.purchasePrice) : "",
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const isNew = form.condition === "neu";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const saved = await api<StockVehicle>("/autohaus/vehicles", { method: "POST", body: { ...form, id: vehicle?.id } });
      onSaved(saved);
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  return (
    <Dialog title={vehicle ? `${vehicleLabel(vehicle)} bearbeiten` : "Fahrzeug aufnehmen"} onClose={onClose} wide>
      <form className="stack autohaus-dialog" onSubmit={submit}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="grid form-grid">
          <Field label="Marke" required>
            <input value={form.make} onChange={set("make")} placeholder="z. B. Volkswagen" required autoFocus={!vehicle} />
          </Field>
          <Field label="Modell" required>
            <input value={form.model} onChange={set("model")} placeholder="z. B. Golf" required />
          </Field>
          <Field label="Ausführung / Motor" wide>
            <input value={form.variant} onChange={set("variant")} placeholder="z. B. 1.5 TSI Life" />
          </Field>
          <Field label="Zustand">
            <select value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value as VehicleCondition, taxation: e.target.value === "neu" ? "regel" : f.taxation }))}>
              {Object.entries(CONDITION_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          <Field label="Erstzulassung" hint={isNew ? "Bei Neuwagen leer" : undefined}>
            <input type="month" value={form.firstRegistration} onChange={set("firstRegistration")} disabled={isNew} />
          </Field>
          <Field label="Kilometerstand">
            <input inputMode="numeric" value={form.mileage} onChange={set("mileage")} placeholder="0" />
          </Field>
          <Field label="Leistung in kW" hint={Number(form.powerKw) ? `${psFromKw(Number(form.powerKw))} PS` : undefined}>
            <input inputMode="numeric" value={form.powerKw} onChange={set("powerKw")} />
          </Field>
          <Field label="Kraftstoff">
            <select value={form.fuel} onChange={set("fuel")}>
              {["Benzin", "Diesel", "Hybrid", "Elektro", "LPG"].map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="Getriebe">
            <select value={form.transmission} onChange={set("transmission")}>
              <option>Schaltgetriebe</option>
              <option>Automatik</option>
            </select>
          </Field>
          <Field label="Farbe">
            <input value={form.color} onChange={set("color")} />
          </Field>
          <Field label="Vorbesitzer">
            <input inputMode="numeric" value={form.previousOwners} onChange={set("previousOwners")} />
          </Field>
          <Field label="Fahrgestellnummer (FIN)">
            <input className="autohaus-mono" value={form.vin} maxLength={17} onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value.toUpperCase() }))} />
          </Field>
          <Field label="Kennzeichen">
            <input value={form.licensePlate} onChange={(e) => setForm((f) => ({ ...f, licensePlate: e.target.value.toUpperCase() }))} />
          </Field>
          <Field label="Nächste HU">
            <input type="month" value={form.nextInspection} onChange={set("nextInspection")} />
          </Field>
        </div>

        <h3 className="card-subtitle">Preis und Verkauf</h3>
        <div className="grid form-grid">
          <Field label={`Verkaufspreis (brutto, ${sym()})`}>
            <input inputMode="decimal" value={form.price} onChange={set("price")} placeholder="0" />
          </Field>
          {isManager && (
            <Field label={`Einkaufspreis (${sym()})`} hint="Sehen nur Inhaber und Verwalter">
              <input inputMode="decimal" value={form.purchasePrice} onChange={set("purchasePrice")} placeholder="0" />
            </Field>
          )}
          <Field label="Besteuerung">
            <select value={form.taxation} onChange={set("taxation")}>
              <option value="differenz">Differenzbesteuert (§ 25a UStG)</option>
              <option value="regel">Regelbesteuert, MwSt. ausweisbar</option>
            </select>
          </Field>
          {(!vehicle || vehicle.status === "verfuegbar" || vehicle.status === "aufbereitung") && (
            <Field label="Status">
              <select value={form.status} onChange={set("status")}>
                <option value="verfuegbar">{VEHICLE_STATUS_LABEL.verfuegbar}</option>
                <option value="aufbereitung">{VEHICLE_STATUS_LABEL.aufbereitung}</option>
              </select>
            </Field>
          )}
          <Field label="Ausstattung" hint="Mit Komma trennen, z. B. Navi, Sitzheizung" wide>
            <textarea rows={2} value={form.equipment} onChange={set("equipment")} />
          </Field>
          <Field label="Interne Notizen" wide>
            <textarea rows={2} value={form.notes} onChange={set("notes")} />
          </Field>
        </div>

        <div className="row gap autohaus-actions">
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="button primary" disabled={saving}><Check size={18} /> {saving ? "Wird gespeichert …" : "Speichern"}</button>
        </div>
      </form>
    </Dialog>
  );
}
