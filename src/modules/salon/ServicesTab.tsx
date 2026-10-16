import { useEffect, useState } from "react";
import { Plus, Scissors, Clock, Pencil, Trash2, X, CheckCircle, Sparkles } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { SalonService, ServiceCategory } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";

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
      {/* Toolbar & Kategorien */}
      <div className="toolbar" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
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

      {/* Grid */}
      {loading ? (
        <p className="muted">Lade Dienstleistungen...</p>
      ) : filteredServices.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <Scissors size={36} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
          <h3>{s("services.noServices")}</h3>
        </div>
      ) : (
        <div className="salon-grid">
          {filteredServices.map((srv) => (
            <div key={srv.id} className="salon-card">
              <div className="salon-card-header">
                <div>
                  <h3 style={{ margin: "0 0 4px" }}>{srv.name}</h3>
                  <span className="pill">{s(`categories.${srv.category}`)}</span>
                </div>
                <div style={{ textAlign: "end" }}>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--accent)" }}>
                    {euro(srv.priceCents)}
                  </div>
                  <small className="muted">{srv.vatRate}% MwSt.</small>
                </div>
              </div>

              {srv.description && (
                <p className="small muted" style={{ margin: 0 }}>
                  {srv.description}
                </p>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: "12px", marginTop: "auto", fontSize: "0.86rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Clock size={15} style={{ color: "var(--muted)" }} />
                  <strong>{srv.durationMinutes} Minuten</strong>
                </span>

                {isManager && (
                  <div className="row gap" style={{ flexWrap: "wrap", alignItems: "center" }}>
                    <button className="button small" onClick={() => openEdit(srv)} title={s("actions.edit")}>
                      <Pencil size={14} />
                    </button>
                    {deleteConfirmId === srv.id ? (
                      <div className="row gap" style={{ alignItems: "center" }}>
                        <button
                          className="button danger small"
                          onClick={() => handleDelete(srv.id)}
                          title="Unwiderruflich deaktivieren"
                        >
                          Deaktivieren
                        </button>
                        <button
                          className="button small"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          Abbr.
                        </button>
                      </div>
                    ) : (
                      <button className="button small danger" onClick={() => setDeleteConfirmId(srv.id)} title={s("actions.delete")}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Dienstleistung bearbeiten / anlegen */}
      {modalOpen && (
        <div className="salon-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="salon-modal" onClick={(e) => e.stopPropagation()}>
            <div className="salon-modal-head">
              <h3>{editingService ? "Dienstleistung bearbeiten" : s("actions.newService")}</h3>
              <button className="icon-button" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && <div className="notice warning">{errorMsg}</div>}

            <form onSubmit={handleSave} className="stack">
              <Field label="Name der Dienstleistung" required>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="z.B. Waschen, Schneiden & Föhnen"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>

              <div className="row-grid">
                <Field label="Kategorie" required>
                  <select
                    className="input"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as ServiceCategory })}
                  >
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
                    className="input"
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: parseInt(e.target.value, 10) || 30 })}
                  />
                </Field>
              </div>

              <div className="row-grid">
                <Field label="Preis (€, brutto)" required>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="48.00"
                    value={form.priceEuro}
                    onChange={(e) => setForm({ ...form, priceEuro: e.target.value })}
                  />
                </Field>
                <Field label="MwSt.-Satz (%)">
                  <select
                    className="input"
                    value={form.vatRate}
                    onChange={(e) => setForm({ ...form, vatRate: parseFloat(e.target.value) || 19 })}
                  >
                    <option value="19">19% (Regulär)</option>
                    <option value="7">7% (Ermäßigt)</option>
                    <option value="0">0% (Steuerfrei)</option>
                  </select>
                </Field>
              </div>

              <Field label="Beschreibung">
                <textarea
                  rows={3}
                  className="input"
                  placeholder="Detaillierte Beschreibung der Behandlung..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>

              <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "12px" }}>
                <button type="button" className="button" onClick={() => setModalOpen(false)}>
                  {s("actions.cancel")}
                </button>
                <button type="submit" className="button primary">
                  {s("actions.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
