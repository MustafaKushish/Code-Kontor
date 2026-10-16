import { useEffect, useState } from "react";
import { Plus, Users, Search, Phone, Mail, Sparkles, Pencil, Trash2, X, AlertTriangle, Calendar, Heart, Palette } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { SalonClient, SalonColorFormula, SalonStaff } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";

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
      {/* Toolbar */}
      <div className="toolbar" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div style={{ position: "relative", minWidth: "260px", flex: 1, maxWidth: "420px" }}>
          <input
            type="text"
            className="input"
            placeholder={s("clients.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button className="button primary push-end" onClick={openNewClient}>
          <Plus size={18} /> {s("actions.newClient")}
        </button>
      </div>

      {clientError && <div className="notice warning">{clientError}</div>}

      {/* Grid */}
      {loading ? (
        <p className="muted">Lade Kundenkartei...</p>
      ) : clients.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <Users size={36} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
          <h3>{s("clients.noClients")}</h3>
        </div>
      ) : (
        <div className="salon-grid">
          {clients.map((c) => {
            const preferredStaff = staff.find((st) => st.id === c.preferredStaffId);

            return (
              <div key={c.id} className="salon-card">
                <div className="salon-card-header">
                  <div>
                    <h3 style={{ margin: "0 0 2px" }}>{c.name}</h3>
                    <small className="muted">Kunden-Nr. #{c.number}</small>
                  </div>
                  {c.totalVisits ? (
                    <span className="pill success">
                      {c.totalVisits} Besuche ({euro(c.totalSpentCents || 0)})
                    </span>
                  ) : (
                    <span className="pill">Neu</span>
                  )}
                </div>

                <div className="stack-sm" style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
                  {c.phone && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Phone size={14} /> <span>{c.phone}</span>
                    </div>
                  )}
                  {c.email && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Mail size={14} /> <span>{c.email}</span>
                    </div>
                  )}
                  {c.birthday && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Calendar size={14} /> <span>Geburtstag: {c.birthday}</span>
                    </div>
                  )}
                  {preferredStaff && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Heart size={14} style={{ color: "var(--accent)" }} />
                      <span>Wunsch-Stylist: <strong style={{ color: "var(--ink)" }}>{preferredStaff.name}</strong></span>
                    </div>
                  )}
                </div>

                {/* Allergien / Besonderheiten */}
                {c.allergies && (
                  <div className="notice warning" style={{ padding: "8px 12px", fontSize: "0.82rem", borderRadius: "10px" }}>
                    <strong>{s("clients.allergies")}:</strong> {c.allergies}
                  </div>
                )}

                {/* Notizen */}
                {c.notes && (
                  <p className="small muted" style={{ margin: 0, fontStyle: "italic" }}>
                    „{c.notes}“
                  </p>
                )}

                {/* Fußzeile mit Aktionen */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: "12px", marginTop: "auto", flexWrap: "wrap", gap: "8px" }}>
                  <button
                    className="button small"
                    onClick={() => openFormulasModal(c)}
                    style={{ background: "color-mix(in srgb, var(--accent) 12%, var(--panel))", borderColor: "color-mix(in srgb, var(--accent) 30%, var(--line))", color: "var(--accent)" }}
                    title="Farbrezepturen und Behandlungshistorie ansehen"
                  >
                    <Palette size={15} /> Farbkarten
                  </button>

                  <div className="row gap" style={{ flexWrap: "wrap", alignItems: "center" }}>
                    <button className="button small" onClick={() => openEditClient(c)} title={s("actions.edit")}>
                      <Pencil size={14} />
                    </button>
                    {isManager && (
                      deleteConfirmClientId === c.id ? (
                        <div className="row gap" style={{ alignItems: "center" }}>
                          <button
                            className="button danger small"
                            onClick={() => handleDeleteClient(c.id)}
                            title="Unwiderruflich löschen"
                          >
                            Löschen
                          </button>
                          <button
                            className="button small"
                            onClick={() => setDeleteConfirmClientId(null)}
                          >
                            Abbr.
                          </button>
                        </div>
                      ) : (
                        <button className="button small danger" onClick={() => setDeleteConfirmClientId(c.id)} title={s("actions.delete")}>
                          <Trash2 size={14} />
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Kunde anlegen / bearbeiten */}
      {modalOpen && (
        <div className="salon-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="salon-modal" onClick={(e) => e.stopPropagation()}>
            <div className="salon-modal-head">
              <h3>{editingClient ? "Kunde bearbeiten" : s("actions.newClient")}</h3>
              <button className="icon-button" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && <div className="notice warning">{errorMsg}</div>}

            <form onSubmit={handleSaveClient} className="stack">
              <Field label="Name des Kunden" required>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="Vor- und Nachname"
                  value={clientForm.name}
                  onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                />
              </Field>

              <div className="row-grid">
                <Field label="Telefonnummer">
                  <input
                    type="tel"
                    className="input"
                    placeholder="+49 171 1234567"
                    value={clientForm.phone}
                    onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                  />
                </Field>
                <Field label="E-Mail-Adresse">
                  <input
                    type="email"
                    className="input"
                    placeholder="kunde@example.de"
                    value={clientForm.email}
                    onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                  />
                </Field>
              </div>

              <div className="row-grid">
                <Field label="Geburtstag (für Gratulation / Rabatt)">
                  <input
                    type="date"
                    className="input"
                    value={clientForm.birthday}
                    onChange={(e) => setClientForm({ ...clientForm, birthday: e.target.value })}
                  />
                </Field>
                <Field label="Bevorzugter Stylist">
                  <select
                    className="input"
                    value={clientForm.preferredStaffId}
                    onChange={(e) => setClientForm({ ...clientForm, preferredStaffId: e.target.value })}
                  >
                    <option value="">-- Keine Präferenz --</option>
                    {staff.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.title})
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Allergien, Kopfhautempfindlichkeit oder Unverträglichkeiten">
                <input
                  type="text"
                  className="input"
                  placeholder="z.B. PPD-Allergie, brennt bei 9%, empfindlicher Nacken"
                  value={clientForm.allergies}
                  onChange={(e) => setClientForm({ ...clientForm, allergies: e.target.value })}
                />
              </Field>

              <Field label="Notizen & Vorlieben">
                <textarea
                  rows={3}
                  className="input"
                  placeholder="Haarstruktur, bevorzugter Scheitel, Getränkewunsch (Espresso, Latte, Prosecco)..."
                  value={clientForm.notes}
                  onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
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

      {/* Modal: Farbrezepturen (Farbkartei) */}
      {formulaModalClient && (
        <div className="salon-modal-overlay" onClick={() => setFormulaModalClient(null)}>
          <div className="salon-modal" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
            <div className="salon-modal-head">
              <div>
                <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                  <Palette size={20} style={{ color: "var(--accent)" }} />
                  Farbrezepturen & Behandlungsakte
                </h3>
                <small className="muted">Kunde: {formulaModalClient.name}</small>
              </div>
              <button className="icon-button" onClick={() => setFormulaModalClient(null)}>
                <X size={20} />
              </button>
            </div>

            {formulaError && <div className="notice warning">{formulaError}</div>}

            {/* Neue Rezeptur anlegen */}
            <form onSubmit={handleSaveFormula} className="card" style={{ padding: "14px", background: "var(--panel-2)", border: "1px solid var(--line)" }}>
              <strong style={{ display: "block", marginBottom: "8px", fontSize: "0.92rem" }}>
                Neue Rezeptur dokumentieren
              </strong>
              <div className="row-grid">
                <Field label="Farbmarke / Produktlinie">
                  <input
                    type="text"
                    className="input"
                    placeholder="z.B. Wella Koleston / Color Touch"
                    value={formulaForm.brand}
                    onChange={(e) => setFormulaForm({ ...formulaForm, brand: e.target.value })}
                  />
                </Field>
                <Field label="Stylist">
                  <select
                    className="input"
                    value={formulaForm.staffId}
                    onChange={(e) => setFormulaForm({ ...formulaForm, staffId: e.target.value })}
                  >
                    {staff.map((st) => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Rezeptur & Mischungsverhältnis" required>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="z.B. 40g 8/1 + 20g 9/16 mit 6% Welloxon (1:1)"
                  value={formulaForm.formula}
                  onChange={(e) => setFormulaForm({ ...formulaForm, formula: e.target.value })}
                />
              </Field>

              <div className="row-grid">
                <Field label="Einwirkzeit (Minuten)">
                  <input
                    type="number"
                    min="1"
                    max="120"
                    className="input"
                    value={formulaForm.developmentMinutes}
                    onChange={(e) => setFormulaForm({ ...formulaForm, developmentMinutes: Number(e.target.value) || 35 })}
                  />
                </Field>
                <Field label="Anwendung / Technik / Notizen">
                  <input
                    type="text"
                    className="input"
                    placeholder="z.B. Ansatz 6%, Längen & Spitzen mit 1.9% glossed"
                    value={formulaForm.notes}
                    onChange={(e) => setFormulaForm({ ...formulaForm, notes: e.target.value })}
                  />
                </Field>
              </div>

              <button type="submit" className="button primary" style={{ marginTop: "6px", justifySelf: "start" }}>
                <Plus size={16} /> Rezeptur speichern
              </button>
            </form>

            {/* Bisherige Rezepturen */}
            <div className="stack-sm" style={{ maxHeight: "320px", overflowY: "auto" }}>
              <span className="small muted">Gespeicherte Farbkarten:</span>
              {clientFormulas.length === 0 ? (
                <p className="muted" style={{ textAlign: "center", padding: "16px" }}>
                  Bisher keine Farbrezepturen für diesen Kunden hinterlegt.
                </p>
              ) : (
                clientFormulas.map((f) => (
                  <div key={f.id} className="formula-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="formula-brand">{f.brand}</span>
                      <div className="row gap" style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                        <span>{formatDay(f.date)}</span>
                        {f.staffName && <span>· {f.staffName}</span>}
                        {isManager && (
                          deleteConfirmFormulaId === f.id ? (
                            <div className="row gap" style={{ alignItems: "center" }}>
                              <button
                                className="button danger small"
                                style={{ padding: "2px 6px", fontSize: "0.75rem" }}
                                onClick={() => handleDeleteFormula(f.id)}
                              >
                                Löschen
                              </button>
                              <button
                                className="button small"
                                style={{ padding: "2px 6px", fontSize: "0.75rem" }}
                                onClick={() => setDeleteConfirmFormulaId(null)}
                              >
                                Abbr.
                              </button>
                            </div>
                          ) : (
                            <button
                              className="icon-button danger"
                              style={{ width: "28px", height: "28px" }}
                              onClick={() => setDeleteConfirmFormulaId(f.id)}
                              title="Löschen"
                            >
                              <Trash2 size={13} />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    <div className="formula-text">{f.formula}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--muted)" }}>
                      <span>Einwirkzeit: <strong>{f.developmentMinutes} Min</strong></span>
                      {f.notes && <span>{f.notes}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
