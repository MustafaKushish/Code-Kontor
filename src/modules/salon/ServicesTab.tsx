import { useEffect, useState } from "react";
import { Plus, Clock, Pencil, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { SalonService, ServiceCategory } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";
import { Dialog } from "../../pos/ui";
import { currencySymbol } from "../../money";

export function ServicesTab({ isManager }: { isManager: boolean }) {
  const { s, euro } = useSalonI18n();
  const [services, setServices] = useState<SalonService[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<SalonService | null>(null);

  const [form, setForm] = useState({
    name: "",
    category: "cut_style" as ServiceCategory,
    description: "",
    durationMinutes: 45,
    priceEuro: "48.00",
    vatRate: 19,
    colorHex: "#ec4899",
    active: true,
  });
  const [errorMsg, setErrorMsg] = useState("");

  const loadServices = async () => {
    try {
      const res = await api<{ services: SalonService[] }>("/salon/services?all=true");
      setServices(res.services);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const openNew = () => {
    setEditingService(null);
    setForm({
      name: "",
      category: categoryFilter !== "all" ? (categoryFilter as ServiceCategory) : "cut_style",
      description: "",
      durationMinutes: 45,
      priceEuro: "48.00",
      vatRate: 19,
      colorHex: "#ec4899",
      active: true,
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const openEdit = (srv: SalonService) => {
    setEditingService(srv);
    setForm({
      name: srv.name,
      category: srv.category,
      description: srv.description || "",
      durationMinutes: srv.durationMinutes,
      priceEuro: (srv.priceCents / 100).toFixed(2),
      vatRate: srv.vatRate,
      colorHex: srv.colorHex || "#ec4899",
      active: srv.active,
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const priceCents = Math.round(parseFloat(form.priceEuro.replace(",", ".")) * 100) || 0;
    try {
      await api("/salon/services", {
        method: "POST",
        body: {
          ...(editingService ? { id: editingService.id } : {}),
          ...form,
          priceCents,
        },
      });
      setModalOpen(false);
      await loadServices();
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim Speichern der Dienstleistung");
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setActionError(null);
    try {
      await api(`/salon/services/${id}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      await loadServices();
    } catch (err: any) {
      setActionError(err?.message || "Fehler beim Deaktivieren der Dienstleistung");
    }
  };

  const filteredServices = services.filter((srv) =>
    categoryFilter === "all" ? true : srv.category === categoryFilter
  );

  return (
    <div className="stack">
      {/* Kategorien & Aktion */}
      <div className="salon-toolbar">
        <div className="chips" role="tablist">
          {["all", "cut_style", "color", "care", "beard", "cosmetics", "package"].map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={categoryFilter === cat}
              className={categoryFilter === cat ? "chip active" : "chip"}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === "all" ? "Alle Kategorien" : s(`categories.${cat}`)}
            </button>
          ))}
        </div>

        {isManager && (
          <button className="button primary push-end" onClick={openNew}>
            <Plus size={18} /> {s("actions.newService")}
          </button>
        )}
      </div>

      {actionError && <p className="error" role="alert">{actionError}</p>}

      {loading ? (
        <p className="muted">Lade Dienstleistungen...</p>
      ) : filteredServices.length === 0 ? (
        <section className="card list-card">
          <p className="empty muted">{s("services.noServices")}</p>
        </section>
      ) : (
        <div className="salon-grid">
          {filteredServices.map((srv) => (
            <section key={srv.id} className="card">
              <div className="section-head">
                <span className="stack-sm">
                  <strong>{srv.name}</strong>
                  <span className="pill">{s(`categories.${srv.category}`)}</span>
                </span>
                <span className="salon-row-meta">
                  <span className="salon-price">{euro(srv.priceCents)}</span>
                  <small className="muted">{srv.vatRate}% MwSt.</small>
                </span>
              </div>

              {srv.description && <p className="small muted">{srv.description}</p>}

              <div className="salon-card-foot">
                <span className="salon-meta">
                  <span><Clock size={15} /> <strong>{srv.durationMinutes} Minuten</strong></span>
                </span>

                {isManager && (
                  <div className="row gap">
                    <button className="icon-button" onClick={() => openEdit(srv)} title={s("actions.edit")} aria-label={s("actions.edit")}>
                      <Pencil size={16} />
                    </button>
                    {deleteConfirmId === srv.id ? (
                      <>
                        <button className="button danger small-button" onClick={() => handleDelete(srv.id)} title="Unwiderruflich deaktivieren">
                          Deaktivieren
                        </button>
                        <button className="button small-button" onClick={() => setDeleteConfirmId(null)}>
                          Abbr.
                        </button>
                      </>
                    ) : (
                      <button className="icon-button danger" onClick={() => setDeleteConfirmId(srv.id)} title={s("actions.delete")} aria-label={s("actions.delete")}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Dialog: Dienstleistung bearbeiten / anlegen */}
      {modalOpen && (
        <Dialog title={editingService ? "Dienstleistung bearbeiten" : s("actions.newService")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="salon-dialog stack">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

            <div className="grid form-grid">
              <Field label="Name der Dienstleistung" required wide>
                <input type="text" required placeholder="z.B. Waschen, Schneiden & Föhnen" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>

              <Field label="Kategorie" required>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ServiceCategory })}>
                  <option value="cut_style">{s("categories.cut_style")}</option>
                  <option value="color">{s("categories.color")}</option>
                  <option value="care">{s("categories.care")}</option>
                  <option value="beard">{s("categories.beard")}</option>
                  <option value="cosmetics">{s("categories.cosmetics")}</option>
                  <option value="package">{s("categories.package")}</option>
                </select>
              </Field>

              <Field label="Dauer (Minuten)" required>
                <input
                  type="number"
                  min="5"
                  step="5"
                  required
                  value={form.durationMinutes}
                  onChange={(e) => setForm({ ...form, durationMinutes: parseInt(e.target.value, 10) || 30 })}
                />
              </Field>

              <Field label={`Preis (${currencySymbol("de-DE")}, brutto)`} required>
                <input type="text" required placeholder="48.00" value={form.priceEuro} onChange={(e) => setForm({ ...form, priceEuro: e.target.value })} />
              </Field>
              <Field label="MwSt.-Satz (%)">
                <select value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: parseFloat(e.target.value) || 19 })}>
                  <option value="19">19% (Regulär)</option>
                  <option value="7">7% (Ermäßigt)</option>
                  <option value="0">0% (Steuerfrei)</option>
                </select>
              </Field>

              <Field label="Beschreibung" wide>
                <textarea
                  rows={3}
                  placeholder="Detaillierte Beschreibung der Behandlung..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>

            <div className="actions">
              <button type="button" className="button" onClick={() => setModalOpen(false)}>
                {s("actions.cancel")}
              </button>
              <button type="submit" className="button primary">
                {s("actions.save")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
