import { useEffect, useState } from "react";
import { Plus, Search, Phone, Mail, Pencil, Trash2, AlertTriangle, Calendar, Heart, Palette } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { SalonClient, SalonColorFormula, SalonStaff } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";
import { Dialog } from "../../pos/ui";

export function ClientsTab({ isManager }: { isManager: boolean }) {
  const { s, euro, day: formatDay, errorText } = useSalonI18n();
  const [clients, setClients] = useState<SalonClient[]>([]);
  const [staff, setStaff] = useState<SalonStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<SalonClient | null>(null);

  // Farbrezeptur Modal
  const [formulaModalClient, setFormulaModalClient] = useState<SalonClient | null>(null);
  const [clientFormulas, setClientFormulas] = useState<SalonColorFormula[]>([]);
  const [formulaForm, setFormulaForm] = useState({
    brand: "Wella Koleston",
    formula: "",
    developmentMinutes: 35,
    staffId: "",
    notes: "",
  });

  const [clientForm, setClientForm] = useState({
    name: "",
    phone: "",
    email: "",
    birthday: "",
    notes: "",
    allergies: "",
    preferredStaffId: "",
  });
  const [errorMsg, setErrorMsg] = useState("");

  const loadData = async () => {
    try {
      const [cRes, sRes] = await Promise.all([
        api<{ clients: SalonClient[] }>(`/salon/clients?q=${encodeURIComponent(search)}`),
        api<{ staff: SalonStaff[] }>("/salon/staff"),
      ]);
      setClients(cRes.clients);
      setStaff(sRes.staff);
      if (sRes.staff.length > 0 && !formulaForm.staffId) {
        setFormulaForm((f) => ({ ...f, staffId: sRes.staff[0].id }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(loadData, search ? 200 : 0);
    return () => clearTimeout(t);
  }, [search]);

  const loadFormulas = async (clientId: string) => {
    try {
      const res = await api<{ formulas: SalonColorFormula[] }>(`/salon/formulas?clientId=${clientId}`);
      setClientFormulas(res.formulas);
    } catch (err) {
      console.error(err);
    }
  };

  const openFormulasModal = (client: SalonClient) => {
    setFormulaModalClient(client);
    setFormulaForm({
      brand: "Wella Koleston",
      formula: "",
      developmentMinutes: 35,
      staffId: staff[0]?.id || "",
      notes: "",
    });
    loadFormulas(client.id);
  };

  const [deleteConfirmClientId, setDeleteConfirmClientId] = useState<string | null>(null);
  const [deleteConfirmFormulaId, setDeleteConfirmFormulaId] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [formulaError, setFormulaError] = useState<string | null>(null);

  const handleSaveFormula = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formulaModalClient || !formulaForm.formula.trim()) return;
    setFormulaError(null);

    const chosenStaff = staff.find((s) => s.id === formulaForm.staffId);
    try {
      await api("/salon/formulas", {
        method: "POST",
        body: {
          clientId: formulaModalClient.id,
          brand: formulaForm.brand,
          formula: formulaForm.formula.trim(),
          developmentMinutes: Number(formulaForm.developmentMinutes) || 35,
          staffId: formulaForm.staffId,
          staffName: chosenStaff?.name || "",
          notes: formulaForm.notes,
        },
      });
      setFormulaForm((f) => ({ ...f, formula: "", notes: "" }));
      await loadFormulas(formulaModalClient.id);
      await loadData();
    } catch (err) {
      setFormulaError(errorText(err));
    }
  };

  const handleDeleteFormula = async (id: string) => {
    setFormulaError(null);
    try {
      await api(`/salon/formulas/${id}`, { method: "DELETE" });
      setDeleteConfirmFormulaId(null);
      if (formulaModalClient) await loadFormulas(formulaModalClient.id);
    } catch (err) {
      setFormulaError(errorText(err));
    }
  };

  const openNewClient = () => {
    setEditingClient(null);
    setClientForm({
      name: "",
      phone: "",
      email: "",
      birthday: "",
      notes: "",
      allergies: "",
      preferredStaffId: staff[0]?.id || "",
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const openEditClient = (c: SalonClient) => {
    setEditingClient(c);
    setClientForm({
      name: c.name,
      phone: c.phone,
      email: c.email,
      birthday: c.birthday || "",
      notes: c.notes || "",
      allergies: c.allergies || "",
      preferredStaffId: c.preferredStaffId || "",
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    try {
      await api("/salon/clients", {
        method: "POST",
        body: {
          ...(editingClient ? { id: editingClient.id } : {}),
          ...clientForm,
        },
      });
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setErrorMsg(errorText(err));
    }
  };

  const handleDeleteClient = async (id: string) => {
    setClientError(null);
    try {
      await api(`/salon/clients/${id}`, { method: "DELETE" });
      setDeleteConfirmClientId(null);
      await loadData();
    } catch (err) {
      setClientError(errorText(err));
    }
  };

  return (
    <div className="stack">
      {/* Suche & Aktion */}
      <div className="salon-toolbar">
        <label className="search">
          <Search size={18} />
          <input type="search" placeholder={s("clients.search")} aria-label={s("clients.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button className="button primary" onClick={openNewClient}>
          <Plus size={18} /> {s("actions.newClient")}
        </button>
      </div>

      {clientError && <p className="error" role="alert">{clientError}</p>}

      {loading ? (
        <p className="muted">{s("clients.loading")}</p>
      ) : (
        <section className="card list-card">
          {clients.length === 0 && <p className="empty muted">{s("clients.noClients")}</p>}
          {clients.map((c) => {
            const preferredStaff = staff.find((st) => st.id === c.preferredStaffId);

            return (
              <div key={c.id} className="list-row salon-row">
                <span className="salon-avatar" aria-hidden>{initials(c.name)}</span>
                <span className="list-main">
                  <strong>{c.name} <small className="muted">· {s("clients.number", { n: c.number })}</small></strong>
                  {(c.phone || c.email) && (
                    <small className="muted">
                      {c.phone && <><Phone size={13} /> {c.phone} </>}
                      {c.email && <><Mail size={13} /> {c.email}</>}
                    </small>
                  )}
                  {(c.birthday || preferredStaff) && (
                    <small className="muted">
                      {c.birthday && <><Calendar size={13} /> {s("clients.birthday", { date: c.birthday })} </>}
                      {preferredStaff && <><Heart size={13} /> {s("clients.preferredStylist", { name: preferredStaff.name })}</>}
                    </small>
                  )}
                  {c.allergies && (
                    <small className="error"><AlertTriangle size={13} /> {s("clients.allergies")}: {c.allergies}</small>
                  )}
                  {c.notes && <small className="muted">{s("common.quote", { text: c.notes })}</small>}
                </span>
                <span className="salon-row-meta">
                  {c.totalVisits ? (
                    <span className="pill pos">
                      {s("clients.visits", { n: c.totalVisits, amount: euro(c.totalSpentCents || 0) })}
                    </span>
                  ) : (
                    <span className="pill">{s("clients.new")}</span>
                  )}
                  <span className="salon-row-actions">
                    <button className="button small-button" onClick={() => openFormulasModal(c)} title={s("clients.colorCardsTitle")}>
                      <Palette size={15} /> {s("clients.colorCards")}
                    </button>
                    <button className="icon-button" onClick={() => openEditClient(c)} title={s("actions.edit")} aria-label={s("actions.edit")}>
                      <Pencil size={16} />
                    </button>
                    {isManager && (
                      deleteConfirmClientId === c.id ? (
                        <>
                          <button className="button danger small-button" onClick={() => handleDeleteClient(c.id)} title={s("actions.deleteForever")}>
                            {s("actions.delete")}
                          </button>
                          <button className="button small-button" onClick={() => setDeleteConfirmClientId(null)}>
                            {s("actions.cancelShort")}
                          </button>
                        </>
                      ) : (
                        <button className="icon-button danger" onClick={() => setDeleteConfirmClientId(c.id)} title={s("actions.delete")} aria-label={s("actions.delete")}>
                          <Trash2 size={16} />
                        </button>
                      )
                    )}
                  </span>
                </span>
              </div>
            );
          })}
        </section>
      )}

      {/* Dialog: Kunde anlegen / bearbeiten */}
      {modalOpen && (
        <Dialog title={editingClient ? s("clients.edit") : s("actions.newClient")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSaveClient} className="salon-dialog stack">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

            <div className="grid form-grid">
              <Field label={s("clients.name")} required wide>
                <input type="text" required placeholder={s("common.fullNamePlaceholder")} value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} />
              </Field>

              <Field label={s("common.phone")}>
                <input type="tel" placeholder={s("common.phonePlaceholder")} value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} />
              </Field>
              <Field label={s("common.email")}>
                <input type="email" placeholder={s("common.emailPlaceholder")} value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} />
              </Field>

              <Field label={s("clients.birthdayLabel")}>
                <input type="date" value={clientForm.birthday} onChange={(e) => setClientForm({ ...clientForm, birthday: e.target.value })} />
              </Field>
              <Field label={s("clients.preferredStaff")}>
                <select value={clientForm.preferredStaffId} onChange={(e) => setClientForm({ ...clientForm, preferredStaffId: e.target.value })}>
                  <option value="">{s("clients.noPreference")}</option>
                  {staff.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.title})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={s("clients.allergiesLabel")} wide>
                <input
                  type="text"
                  placeholder={s("clients.allergiesPlaceholder")}
                  value={clientForm.allergies}
                  onChange={(e) => setClientForm({ ...clientForm, allergies: e.target.value })}
                />
              </Field>

              <Field label={s("clients.notes")} wide>
                <textarea
                  rows={3}
                  placeholder={s("clients.notesPlaceholder")}
                  value={clientForm.notes}
                  onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
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

      {/* Dialog: Farbrezepturen (Farbkartei) */}
      {formulaModalClient && (
        <Dialog title={s("formulas.title")} onClose={() => setFormulaModalClient(null)} wide>
          <div className="salon-dialog stack">
            <p className="muted">{s("formulas.client", { name: formulaModalClient.name })}</p>

            {formulaError && <p className="error" role="alert">{formulaError}</p>}

            {/* Neue Rezeptur anlegen */}
            <form onSubmit={handleSaveFormula} className="salon-formula">
              <strong>{s("formulas.newTitle")}</strong>
              <div className="grid form-grid">
                <Field label={s("formulas.brand")}>
                  <input
                    type="text"
                    placeholder={s("formulas.brandPlaceholder")}
                    value={formulaForm.brand}
                    onChange={(e) => setFormulaForm({ ...formulaForm, brand: e.target.value })}
                  />
                </Field>
                <Field label={s("common.stylist")}>
                  <select value={formulaForm.staffId} onChange={(e) => setFormulaForm({ ...formulaForm, staffId: e.target.value })}>
                    {staff.map((st) => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label={s("formulas.formula")} required wide>
                  <input
                    type="text"
                    required
                    placeholder={s("formulas.formulaPlaceholder")}
                    value={formulaForm.formula}
                    onChange={(e) => setFormulaForm({ ...formulaForm, formula: e.target.value })}
                  />
                </Field>

                <Field label={s("formulas.development")}>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={formulaForm.developmentMinutes}
                    onChange={(e) => setFormulaForm({ ...formulaForm, developmentMinutes: Number(e.target.value) || 35 })}
                  />
                </Field>
                <Field label={s("formulas.notes")}>
                  <input
                    type="text"
                    placeholder={s("formulas.notesPlaceholder")}
                    value={formulaForm.notes}
                    onChange={(e) => setFormulaForm({ ...formulaForm, notes: e.target.value })}
                  />
                </Field>
              </div>

              <div>
                <button type="submit" className="button primary">
                  <Plus size={17} /> {s("formulas.save")}
                </button>
              </div>
            </form>

            {/* Bisherige Rezepturen */}
            <div className="stack-sm salon-formula-list">
              <small className="muted">{s("formulas.saved")}</small>
              {clientFormulas.length === 0 ? (
                <p className="empty muted">{s("formulas.empty")}</p>
              ) : (
                clientFormulas.map((f) => (
                  <div key={f.id} className="salon-formula">
                    <div className="section-head">
                      <strong>{f.brand}</strong>
                      <span className="row gap">
                        <small className="muted">{formatDay(f.date)}{f.staffName ? ` · ${f.staffName}` : ""}</small>
                        {isManager && (
                          deleteConfirmFormulaId === f.id ? (
                            <>
                              <button className="button danger small-button" onClick={() => handleDeleteFormula(f.id)}>
                                {s("actions.delete")}
                              </button>
                              <button className="button small-button" onClick={() => setDeleteConfirmFormulaId(null)}>
                                {s("actions.cancelShort")}
                              </button>
                            </>
                          ) : (
                            <button className="icon-button danger" onClick={() => setDeleteConfirmFormulaId(f.id)} title={s("actions.delete")} aria-label={s("actions.delete")}>
                              <Trash2 size={15} />
                            </button>
                          )
                        )}
                      </span>
                    </div>
                    <code>{f.formula}</code>
                    <small className="muted">
                      {s("formulas.developmentLabel")} <strong>{s("common.minutes", { n: f.developmentMinutes })}</strong>{f.notes ? ` · ${f.notes}` : ""}
                    </small>
                  </div>
                ))
              )}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
