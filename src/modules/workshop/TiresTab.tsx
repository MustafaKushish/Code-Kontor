import { useState } from "react";
import { Search, Plus, Disc, Shield, Pencil, Trash2, X, Check, Car, User, Phone } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { TireStorage, Vehicle } from "../../../shared/workshop";

interface TiresTabProps {
  tires: TireStorage[];
  vehicles: Vehicle[];
  onTiresChanged: (tires: TireStorage[]) => void;
}

export function TiresTab({ tires, vehicles, onTiresChanged }: TiresTabProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTire, setEditingTire] = useState<TireStorage | null>(null);

  const [form, setForm] = useState({
    licensePlate: "",
    customerName: "",
    customerPhone: "",
    type: "Sommer" as TireStorage["type"],
    brand: "",
    dimension: "",
    dot: "",
    rimType: "Alufelge" as TireStorage["rimType"],
    treadDepthFL: 6.0,
    treadDepthFR: 6.0,
    treadDepthRL: 5.5,
    treadDepthRR: 5.5,
    condition: "gut" as TireStorage["condition"],
    storageLocation: "Reifenregal 1 - Fach A1",
  });

  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const filtered = tires.filter((t) => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.licensePlate.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.brand.toLowerCase().includes(q) ||
        t.dimension.toLowerCase().includes(q) ||
        t.storageLocation.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openNewModal = () => {
    setEditingTire(null);
    setForm({
      licensePlate: "",
      customerName: "",
      customerPhone: "",
      type: "Winter",
      brand: "Continental WinterContact TS 870",
      dimension: "205/55 R16 91H",
      dot: "2422",
      rimType: "Alufelge",
      treadDepthFL: 6.5,
      treadDepthFR: 6.5,
      treadDepthRL: 6.0,
      treadDepthRR: 6.0,
      condition: "gut",
      storageLocation: "Reifenregal 2 - Fach B1",
    });
    setModalOpen(true);
  };

  const openEditModal = (t: TireStorage) => {
    setEditingTire(t);
    setForm({
      licensePlate: t.licensePlate,
      customerName: t.customerName,
      customerPhone: t.customerPhone,
      type: t.type,
      brand: t.brand,
      dimension: t.dimension,
      dot: t.dot,
      rimType: t.rimType,
      treadDepthFL: t.treadDepthFL,
      treadDepthFR: t.treadDepthFR,
      treadDepthRL: t.treadDepthRL,
      treadDepthRR: t.treadDepthRR,
      condition: t.condition,
      storageLocation: t.storageLocation,
    });
    setModalOpen(true);
  };

  const handlePlateChange = (val: string) => {
    const clean = val.toUpperCase();
    setForm((prev) => {
      const updated = { ...prev, licensePlate: clean };
      const match = vehicles.find((v) => v.licensePlate.replace(/\s+/g, "") === clean.replace(/\s+/g, ""));
      if (match) {
        updated.customerName = match.customerName;
        updated.customerPhone = match.customerPhone;
      }
      return updated;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.licensePlate.trim() || !form.brand.trim() || !form.dimension.trim()) {
      setErrorMsg("Bitte mindestens Kennzeichen, Reifenmarke und Dimension ausfüllen.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const saved = await api<TireStorage>("/workshop/tires", {
        method: "POST",
        body: {
          id: editingTire?.id,
          licensePlate: form.licensePlate.trim().toUpperCase(),
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          type: form.type,
          brand: form.brand.trim(),
          dimension: form.dimension.trim(),
          dot: form.dot.trim(),
          rimType: form.rimType,
          treadDepthFL: Number(form.treadDepthFL) || 0,
          treadDepthFR: Number(form.treadDepthFR) || 0,
          treadDepthRL: Number(form.treadDepthRL) || 0,
          treadDepthRR: Number(form.treadDepthRR) || 0,
          condition: form.condition,
          storageLocation: form.storageLocation.trim(),
        },
      });

      if (editingTire) {
        onTiresChanged(tires.map((t) => (t.id === saved.id ? saved : t)));
      } else {
        onTiresChanged([saved, ...tires]);
      }
      setModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Speichern der Reifeneinlagerung.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/workshop/tires/${id}`, { method: "DELETE" });
      onTiresChanged(tires.filter((t) => t.id !== id));
      setDeleteConfirmId(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Löschen.");
    }
  };

  return (
    <div className="stack">
      {/* Filter- & Aktionsleiste */}
      <div className="workshop-toolbar">
        <label className="search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Kennzeichen, Halter, Dimension, Lagerplatz..."
            aria-label="Kennzeichen, Halter, Dimension, Lagerplatz..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="workshop-select" aria-label="Reifensaison">
          <option value="all">Alle Reifensaisons</option>
          <option value="Sommer">Sommerreifen</option>
          <option value="Winter">Winterreifen</option>
          <option value="Ganzjahr">Ganzjahresreifen</option>
        </select>

        <button onClick={openNewModal} className="button primary workshop-toolbar-end">
          <Plus size={18} />
          Radsatz einlagern
        </button>
      </div>

      {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

      {/* Reifenkarten */}
      {filtered.length === 0 ? (
        <section className="card list-card">
          <p className="empty muted">Keine Reifensätze im Räderhotel eingelagert.</p>
        </section>
      ) : (
        <div className="workshop-cards">
          {filtered.map((t) => (
            <article key={t.id} className="card workshop-card">
              <div className="workshop-card-top">
                <span className="list-main">
                  <strong className="workshop-plate">{t.licensePlate}</strong>
                  <span>{t.brand}</span>
                </span>
                <span className="pill">
                  {t.type} · {t.rimType}
                </span>
              </div>

              <p className="workshop-mono">
                {t.dimension} {t.dot && <span className="muted">(DOT {t.dot})</span>}
              </p>

              {/* Profiltiefen-Gitter */}
              <div className="workshop-panel stack-sm">
                <small className="muted">Gemessene Profiltiefe (mm)</small>
                <div className="workshop-tread">
                  <span><small className="muted">Vorne Links</small><strong className="workshop-num">{t.treadDepthFL.toFixed(1)} mm</strong></span>
                  <span><small className="muted">Vorne Rechts</small><strong className="workshop-num">{t.treadDepthFR.toFixed(1)} mm</strong></span>
                  <span><small className="muted">Hinten Links</small><strong className="workshop-num">{t.treadDepthRL.toFixed(1)} mm</strong></span>
                  <span><small className="muted">Hinten Rechts</small><strong className="workshop-num">{t.treadDepthRR.toFixed(1)} mm</strong></span>
                </div>
              </div>

              {/* Lagerplatz & Halter */}
              <dl className="workshop-facts">
                <dt>Lagerort:</dt>
                <dd>{t.storageLocation}</dd>
                <dt>Kunde:</dt>
                <dd>
                  {t.customerName} {t.customerPhone && <small className="muted">({t.customerPhone})</small>}
                </dd>
              </dl>

              <div className="workshop-card-foot">
                <button onClick={() => openEditModal(t)} className="text-button workshop-icon-text">
                  <Pencil size={15} />
                  Bearbeiten
                </button>
                {deleteConfirmId === t.id ? (
                  <div className="row gap">
                    <button onClick={() => handleDelete(t.id)} className="button danger small-button">
                      Löschen
                    </button>
                    <button onClick={() => setDeleteConfirmId(null)} className="text-button">
                      Nein
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirmId(t.id)} className="icon-button danger" aria-label="Löschen">
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Dialog: Radsatz erfassen / bearbeiten */}
      {modalOpen && (
        <Dialog title={editingTire ? "Radsatz bearbeiten" : "Radsatz im Räderhotel einlagern"} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="stack workshop-dialog">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}
            <div className="grid form-grid">
              <Field label="Amtliches Kennzeichen *">
                <input
                  type="text"
                  required
                  placeholder="z. B. HH-WM 2024"
                  value={form.licensePlate}
                  onChange={(e) => handlePlateChange(e.target.value)}
                  className="workshop-mono workshop-upper"
                />
              </Field>
              <Field label="Saison / Reifentyp">
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
                  <option value="Sommer">Sommerreifen</option>
                  <option value="Winter">Winterreifen</option>
                  <option value="Ganzjahr">Ganzjahresreifen</option>
                </select>
              </Field>
              <Field label="Reifenmarke & Profil *">
                <input type="text" required placeholder="z. B. Continental WinterContact" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </Field>
              <Field label="Reifendimension *">
                <input
                  type="text"
                  required
                  placeholder="z. B. 205/55 R16 91H"
                  value={form.dimension}
                  onChange={(e) => setForm({ ...form, dimension: e.target.value })}
                  className="workshop-mono"
                />
              </Field>
              <Field label="DOT (Herstellungswoche/Jahr)">
                <input type="text" placeholder="z. B. 3822" value={form.dot} onChange={(e) => setForm({ ...form, dot: e.target.value })} className="workshop-mono" />
              </Field>
              <Field label="Felgentyp">
                <select value={form.rimType} onChange={(e) => setForm({ ...form, rimType: e.target.value as any })}>
                  <option value="Alufelge">Alufelge</option>
                  <option value="Stahlfelge">Stahlfelge</option>
                </select>
              </Field>
              <Field label="Lagerplatz im Räderhotel *" wide>
                <input
                  type="text"
                  required
                  placeholder="z. B. Reifenregal 2 - Fach B1"
                  value={form.storageLocation}
                  onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
                />
              </Field>
            </div>

            {/* Profiltiefen */}
            <h3 className="card-subtitle"><Disc size={17} aria-hidden /> Profiltiefenmessung (mm)</h3>
            <div className="workshop-tread-form">
              <Field label="Vorne Links (VL)">
                <input type="number" step="0.1" value={form.treadDepthFL} onChange={(e) => setForm({ ...form, treadDepthFL: Number(e.target.value) })} className="workshop-mono" />
              </Field>
              <Field label="Vorne Rechts (VR)">
                <input type="number" step="0.1" value={form.treadDepthFR} onChange={(e) => setForm({ ...form, treadDepthFR: Number(e.target.value) })} className="workshop-mono" />
              </Field>
              <Field label="Hinten Links (HL)">
                <input type="number" step="0.1" value={form.treadDepthRL} onChange={(e) => setForm({ ...form, treadDepthRL: Number(e.target.value) })} className="workshop-mono" />
              </Field>
              <Field label="Hinten Rechts (HR)">
                <input type="number" step="0.1" value={form.treadDepthRR} onChange={(e) => setForm({ ...form, treadDepthRR: Number(e.target.value) })} className="workshop-mono" />
              </Field>
            </div>

            {/* Halterdaten */}
            <div className="grid form-grid">
              <Field label="Kundenname">
                <input type="text" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
              </Field>
              <Field label="Telefon">
                <input type="tel" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
              </Field>
            </div>

            <div className="row gap workshop-dialog-actions">
              <button type="button" onClick={() => setModalOpen(false)} className="button">
                Abbrechen
              </button>
              <button type="submit" disabled={saving} className="button primary">
                <Check size={18} />
                {saving ? "Wird gespeichert..." : "Radsatz einlagern"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
