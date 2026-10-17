import { useState } from "react";
import { Search, Plus, Disc, Shield, Pencil, Trash2, X, Check, Car, User, Phone } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type { TireStorage, Vehicle } from "../../../shared/workshop";
import { useWorkshopI18n } from "./i18n";

interface TiresTabProps {
  isManager: boolean;
  tires: TireStorage[];
  vehicles: Vehicle[];
  onTiresChanged: (tires: TireStorage[]) => void;
}

export function TiresTab({ tires, vehicles, onTiresChanged, isManager }: TiresTabProps) {
  const { t: tr, workshopError, num } = useWorkshopI18n();
  const mm = (value: number) => tr("common.mm", { n: num(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
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
    storageLocation: tr("tires.defaultLocation"),
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
      storageLocation: tr("tires.defaultLocationNew"),
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
      setErrorMsg(tr("tires.required"));
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
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, tr("tires.saveError")));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/workshop/tires/${id}`, { method: "DELETE" });
      onTiresChanged(tires.filter((t) => t.id !== id));
      setDeleteConfirmId(null);
    } catch (err: unknown) {
      setErrorMsg(workshopError(err, tr("common.deleteError")));
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
            placeholder={tr("tires.searchPlaceholder")}
            aria-label={tr("tires.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="workshop-select" aria-label={tr("tires.seasonFilter")}>
          <option value="all">{tr("tires.allSeasons")}</option>
          <option value="Sommer">{tr("tires.seasonOptions.Sommer")}</option>
          <option value="Winter">{tr("tires.seasonOptions.Winter")}</option>
          <option value="Ganzjahr">{tr("tires.seasonOptions.Ganzjahr")}</option>
        </select>

        <button onClick={openNewModal} className="button primary workshop-toolbar-end">
          <Plus size={18} />
          {tr("tires.store")}
        </button>
      </div>

      {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

      {/* Reifenkarten */}
      {filtered.length === 0 ? (
        <section className="card list-card">
          <p className="empty muted">{tr("tires.empty")}</p>
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
                  {tr(`tires.seasons.${t.type}`)} · {tr(`tires.rims.${t.rimType}`)}
                </span>
              </div>

              <p className="workshop-mono">
                {t.dimension} {t.dot && <span className="muted">({tr("tires.dot", { dot: t.dot })})</span>}
              </p>

              {/* Profiltiefen-Gitter */}
              <div className="workshop-panel stack-sm">
                <small className="muted">{tr("tires.treadTitle")}</small>
                <div className="workshop-tread">
                  <span><small className="muted">{tr("tires.fl")}</small><strong className="workshop-num">{mm(t.treadDepthFL)}</strong></span>
                  <span><small className="muted">{tr("tires.fr")}</small><strong className="workshop-num">{mm(t.treadDepthFR)}</strong></span>
                  <span><small className="muted">{tr("tires.rl")}</small><strong className="workshop-num">{mm(t.treadDepthRL)}</strong></span>
                  <span><small className="muted">{tr("tires.rr")}</small><strong className="workshop-num">{mm(t.treadDepthRR)}</strong></span>
                </div>
              </div>

              {/* Lagerplatz & Halter */}
              <dl className="workshop-facts">
                <dt>{tr("tires.location")}</dt>
                <dd>{t.storageLocation}</dd>
                <dt>{tr("tires.customer")}</dt>
                <dd>
                  {t.customerName} {t.customerPhone && <small className="muted">({t.customerPhone})</small>}
                </dd>
              </dl>

              <div className="workshop-card-foot">
                <button onClick={() => openEditModal(t)} className="text-button workshop-icon-text">
                  <Pencil size={15} />
                  {tr("common.edit")}
                </button>
                {!isManager ? null : deleteConfirmId === t.id ? (
                  <div className="row gap">
                    <button onClick={() => handleDelete(t.id)} className="button danger small-button">
                      {tr("common.delete")}
                    </button>
                    <button onClick={() => setDeleteConfirmId(null)} className="text-button">
                      {tr("common.no")}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirmId(t.id)} className="icon-button danger" aria-label={tr("common.delete")}>
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
        <Dialog title={editingTire ? tr("tires.editTitle") : tr("tires.newTitle")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="stack workshop-dialog">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}
            <div className="grid form-grid">
              <Field label={tr("common.plate")}>
                <input
                  type="text"
                  required
                  placeholder={tr("common.platePlaceholder")}
                  value={form.licensePlate}
                  onChange={(e) => handlePlateChange(e.target.value)}
                  className="workshop-mono workshop-upper"
                />
              </Field>
              <Field label={tr("tires.season")}>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
                  <option value="Sommer">{tr("tires.seasonOptions.Sommer")}</option>
                  <option value="Winter">{tr("tires.seasonOptions.Winter")}</option>
                  <option value="Ganzjahr">{tr("tires.seasonOptions.Ganzjahr")}</option>
                </select>
              </Field>
              <Field label={tr("tires.brand")}>
                <input type="text" required placeholder={tr("tires.brandPlaceholder")} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </Field>
              <Field label={tr("tires.dimension")}>
                <input
                  type="text"
                  required
                  placeholder={tr("tires.dimensionPlaceholder")}
                  value={form.dimension}
                  onChange={(e) => setForm({ ...form, dimension: e.target.value })}
                  className="workshop-mono"
                />
              </Field>
              <Field label={tr("tires.dotLabel")}>
                <input type="text" placeholder={tr("tires.dotPlaceholder")} value={form.dot} onChange={(e) => setForm({ ...form, dot: e.target.value })} className="workshop-mono" />
              </Field>
              <Field label={tr("tires.rim")}>
                <select value={form.rimType} onChange={(e) => setForm({ ...form, rimType: e.target.value as any })}>
                  <option value="Alufelge">{tr("tires.rims.Alufelge")}</option>
                  <option value="Stahlfelge">{tr("tires.rims.Stahlfelge")}</option>
                </select>
              </Field>
              <Field label={tr("tires.storageLocation")} wide>
                <input
                  type="text"
                  required
                  placeholder={tr("tires.storageLocationPlaceholder")}
                  value={form.storageLocation}
                  onChange={(e) => setForm({ ...form, storageLocation: e.target.value })}
                />
              </Field>
            </div>

            {/* Profiltiefen */}
            <h3 className="card-subtitle"><Disc size={17} aria-hidden /> {tr("tires.treadSection")}</h3>
            <div className="workshop-tread-form">
              <Field label={tr("tires.flField")}>
                <input type="number" step="0.1" value={form.treadDepthFL} onChange={(e) => setForm({ ...form, treadDepthFL: Number(e.target.value) })} className="workshop-mono" />
              </Field>
              <Field label={tr("tires.frField")}>
                <input type="number" step="0.1" value={form.treadDepthFR} onChange={(e) => setForm({ ...form, treadDepthFR: Number(e.target.value) })} className="workshop-mono" />
              </Field>
              <Field label={tr("tires.rlField")}>
                <input type="number" step="0.1" value={form.treadDepthRL} onChange={(e) => setForm({ ...form, treadDepthRL: Number(e.target.value) })} className="workshop-mono" />
              </Field>
              <Field label={tr("tires.rrField")}>
                <input type="number" step="0.1" value={form.treadDepthRR} onChange={(e) => setForm({ ...form, treadDepthRR: Number(e.target.value) })} className="workshop-mono" />
              </Field>
            </div>

            {/* Halterdaten */}
            <div className="grid form-grid">
              <Field label={tr("common.customerName")}>
                <input type="text" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
              </Field>
              <Field label={tr("common.phone")}>
                <input type="tel" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
              </Field>
            </div>

            <div className="row gap workshop-dialog-actions">
              <button type="button" onClick={() => setModalOpen(false)} className="button">
                {tr("common.cancel")}
              </button>
              <button type="submit" disabled={saving} className="button primary">
                <Check size={18} />
                {saving ? tr("common.saving") : tr("tires.store")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
