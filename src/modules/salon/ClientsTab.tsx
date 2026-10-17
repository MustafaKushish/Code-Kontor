import { useEffect, useState } from "react";
import { Plus, Search, Phone, Mail, Pencil, Trash2, AlertTriangle, Calendar, Heart, Palette } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { SalonClient, SalonColorFormula, SalonStaff } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";
import { Dialog } from "../../pos/ui";

export function ClientsTab({ isManager }: { isManager: boolean }) {
  const { s, euro, day: formatDay } = useSalonI18n();
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
    } catch (err: any) {
      setFormulaError(err?.message || "Fehler beim Speichern der Rezeptur");
    }
  };

  const handleDeleteFormula = async (id: string) => {
    setFormulaError(null);
    try {
      await api(`/salon/formulas/${id}`, { method: "DELETE" });
      setDeleteConfirmFormulaId(null);
      if (formulaModalClient) await loadFormulas(formulaModalClient.id);
    } catch (err: any) {
      setFormulaError(err?.message || "Fehler beim Löschen der Rezeptur");
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
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim Speichern des Kunden");
    }
  };

  const handleDeleteClient = async (id: string) => {
    setClientError(null);
    try {
      await api(`/salon/clients/${id}`, { method: "DELETE" });
      setDeleteConfirmClientId(null);
      await loadData();
    } catch (err: any) {
      setClientError(err?.message || "Fehler beim Löschen des Kunden");
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
        <p className="muted">Lade Kundenkartei...</p>
      ) : (
        <section className="card list-card">
          {clients.length === 0 && <p className="empty muted">{s("clients.noClients")}</p>}
          {clients.map((c) => {
            const preferredStaff = staff.find((st) => st.id === c.preferredStaffId);

            return (
              <div key={c.id} className="list-row salon-row">
                <span className="salon-avatar" aria-hidden>{initials(c.name)}</span>
                <span className="list-main">
                  <strong>{c.name} <small className="muted">· Kunden-Nr. #{c.number}</small></strong>
                  {(c.phone || c.email) && (
                    <small className="muted">
                      {c.phone && <><Phone size={13} /> {c.phone} </>}
                      {c.email && <><Mail size={13} /> {c.email}</>}
                    </small>
                  )}
                  {(c.birthday || preferredStaff) && (
                    <small className="muted">
                      {c.birthday && <><Calendar size={13} /> Geburtstag: {c.birthday} </>}
                      {preferredStaff && <><Heart size={13} /> Wunsch-Stylist: {preferredStaff.name}</>}
                    </small>
                  )}
                  {c.allergies && (
                    <small className="error"><AlertTriangle size={13} /> {s("clients.allergies")}: {c.allergies}</small>
                  )}
                  {c.notes && <small className="muted">„{c.notes}“</small>}
                </span>
                <span className="salon-row-meta">
                  {c.totalVisits ? (
                    <span className="pill pos">
                      {c.totalVisits} Besuche ({euro(c.totalSpentCents || 0)})
                    </span>
                  ) : (
                    <span className="pill">Neu</span>
                  )}
                  <span className="salon-row-actions">
                    <button className="button small-button" onClick={() => openFormulasModal(c)} title="Farbrezepturen und Behandlungshistorie ansehen">
                      <Palette size={15} /> Farbkarten
                    </button>
                    <button className="icon-button" onClick={() => openEditClient(c)} title={s("actions.edit")} aria-label={s("actions.edit")}>
                      <Pencil size={16} />
                    </button>
                    {isManager && (
                      deleteConfirmClientId === c.id ? (
                        <>
                          <button className="button danger small-button" onClick={() => handleDeleteClient(c.id)} title="Unwiderruflich löschen">
                            Löschen
                          </button>
                          <button className="button small-button" onClick={() => setDeleteConfirmClientId(null)}>
                            Abbr.
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
        <Dialog title={editingClient ? "Kunde bearbeiten" : s("actions.newClient")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSaveClient} className="salon-dialog stack">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

            <div className="grid form-grid">
              <Field label="Name des Kunden" required wide>
                <input type="text" required placeholder="Vor- und Nachname" value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} />
              </Field>

              <Field label="Telefonnummer">
                <input type="tel" placeholder="+49 171 1234567" value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} />
              </Field>
              <Field label="E-Mail-Adresse">
                <input type="email" placeholder="kunde@example.de" value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} />
              </Field>

              <Field label="Geburtstag (für Gratulation / Rabatt)">
                <input type="date" value={clientForm.birthday} onChange={(e) => setClientForm({ ...clientForm, birthday: e.target.value })} />
              </Field>
              <Field label="Bevorzugter Stylist">
                <select value={clientForm.preferredStaffId} onChange={(e) => setClientForm({ ...clientForm, preferredStaffId: e.target.value })}>
                  <option value="">-- Keine Präferenz --</option>
                  {staff.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.title})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Allergien, Kopfhautempfindlichkeit oder Unverträglichkeiten" wide>
                <input
                  type="text"
                  placeholder="z.B. PPD-Allergie, brennt bei 9%, empfindlicher Nacken"
                  value={clientForm.allergies}
                  onChange={(e) => setClientForm({ ...clientForm, allergies: e.target.value })}
                />
              </Field>

              <Field label="Notizen & Vorlieben" wide>
                <textarea
                  rows={3}
                  placeholder="Haarstruktur, bevorzugter Scheitel, Getränkewunsch (Espresso, Latte, Prosecco)..."
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
        <Dialog title="Farbrezepturen & Behandlungsakte" onClose={() => setFormulaModalClient(null)} wide>
          <div className="salon-dialog stack">
            <p className="muted">Kunde: {formulaModalClient.name}</p>

            {formulaError && <p className="error" role="alert">{formulaError}</p>}

            {/* Neue Rezeptur anlegen */}
            <form onSubmit={handleSaveFormula} className="salon-formula">
              <strong>Neue Rezeptur dokumentieren</strong>
              <div className="grid form-grid">
                <Field label="Farbmarke / Produktlinie">
                  <input
                    type="text"
                    placeholder="z.B. Wella Koleston / Color Touch"
                    value={formulaForm.brand}
                    onChange={(e) => setFormulaForm({ ...formulaForm, brand: e.target.value })}
                  />
                </Field>
                <Field label="Stylist">
                  <select value={formulaForm.staffId} onChange={(e) => setFormulaForm({ ...formulaForm, staffId: e.target.value })}>
                    {staff.map((st) => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Rezeptur & Mischungsverhältnis" required wide>
                  <input
                    type="text"
                    required
                    placeholder="z.B. 40g 8/1 + 20g 9/16 mit 6% Welloxon (1:1)"
                    value={formulaForm.formula}
                    onChange={(e) => setFormulaForm({ ...formulaForm, formula: e.target.value })}
                  />
                </Field>

                <Field label="Einwirkzeit (Minuten)">
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={formulaForm.developmentMinutes}
                    onChange={(e) => setFormulaForm({ ...formulaForm, developmentMinutes: Number(e.target.value) || 35 })}
                  />
                </Field>
                <Field label="Anwendung / Technik / Notizen">
                  <input
                    type="text"
                    placeholder="z.B. Ansatz 6%, Längen & Spitzen mit 1.9% glossed"
                    value={formulaForm.notes}
                    onChange={(e) => setFormulaForm({ ...formulaForm, notes: e.target.value })}
                  />
                </Field>
              </div>

              <div>
                <button type="submit" className="button primary">
                  <Plus size={17} /> Rezeptur speichern
                </button>
              </div>
            </form>

            {/* Bisherige Rezepturen */}
            <div className="stack-sm salon-formula-list">
              <small className="muted">Gespeicherte Farbkarten:</small>
              {clientFormulas.length === 0 ? (
                <p className="empty muted">Bisher keine Farbrezepturen für diesen Kunden hinterlegt.</p>
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
                                Löschen
                              </button>
                              <button className="button small-button" onClick={() => setDeleteConfirmFormulaId(null)}>
                                Abbr.
                              </button>
                            </>
                          ) : (
                            <button className="icon-button danger" onClick={() => setDeleteConfirmFormulaId(f.id)} title="Löschen" aria-label="Löschen">
                              <Trash2 size={15} />
                            </button>
                          )
                        )}
                      </span>
                    </div>
                    <code>{f.formula}</code>
                    <small className="muted">
                      Einwirkzeit: <strong>{f.developmentMinutes} Min</strong>{f.notes ? ` · ${f.notes}` : ""}
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
