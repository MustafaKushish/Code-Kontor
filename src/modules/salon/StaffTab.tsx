import { useEffect, useState } from "react";
import { Plus, User, Clock, Calendar, Pencil, Trash2, X, Sparkles, CheckCircle } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { SalonStaff } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";

export function StaffTab({ isManager }: { isManager: boolean }) {
  const { s } = useSalonI18n();
  const [staff, setStaff] = useState<SalonStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<SalonStaff | null>(null);

  const [form, setForm] = useState({
    name: "",
    title: "",
    email: "",
    phone: "",
    colorHex: "#e11d48",
    specialtiesText: "",
    workStart: "09:00",
    workEnd: "18:00",
    workingDays: [1, 2, 3, 4, 5, 6],
  });
  const [errorMsg, setErrorMsg] = useState("");

  const loadStaff = async () => {
    try {
      const res = await api<{ staff: SalonStaff[] }>("/salon/staff");
      setStaff(res.staff);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const openNew = () => {
    setEditingStaff(null);
    setForm({
      name: "",
      title: "Stylist",
      email: "",
      phone: "",
      colorHex: "#e11d48",
      specialtiesText: "Haarschnitt, Styling",
      workStart: "09:00",
      workEnd: "18:00",
      workingDays: [1, 2, 3, 4, 5, 6],
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const openEdit = (st: SalonStaff) => {
    setEditingStaff(st);
    setForm({
      name: st.name,
      title: st.title || "",
      email: st.email || "",
      phone: st.phone || "",
      colorHex: st.colorHex || "#e11d48",
      specialtiesText: st.specialties.join(", "),
      workStart: st.workStart || "09:00",
      workEnd: st.workEnd || "18:00",
      workingDays: st.workingDays || [1, 2, 3, 4, 5, 6],
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const specialties = form.specialtiesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await api("/salon/staff", {
        method: "POST",
        body: {
          ...(editingStaff ? { id: editingStaff.id } : {}),
          ...form,
          specialties,
        },
      });
      setModalOpen(false);
      await loadStaff();
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim Speichern");
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setStaffError(null);
    try {
      await api(`/salon/staff/${id}`, { method: "DELETE" });
      setDeleteConfirmId(null);
      await loadStaff();
    } catch (err: any) {
      setStaffError(err?.message || "Fehler beim Deaktivieren des Mitarbeiters");
    }
  };

  const DAY_LABELS: Record<number, string> = {
    1: "Mo",
    2: "Di",
    3: "Mi",
    4: "Do",
    5: "Fr",
    6: "Sa",
    7: "So",
  };

  return (
    <div className="stack">
      {/* Toolbar */}
      <div className="toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3>Salon-Team & Stylisten</h3>
          <p className="small muted">Arbeitszeiten, Kalenderfarben und Spezialisierungen verwalten.</p>
        </div>

        {isManager && (
          <button className="button primary push-end" onClick={openNew}>
            <Plus size={18} /> {s("actions.newStaff")}
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <p className="muted">Lade Stylisten...</p>
      ) : staff.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px" }}>
          <User size={36} style={{ color: "var(--muted)", margin: "0 auto 12px" }} />
          <h3>{s("staff.noStaff")}</h3>
        </div>
      ) : (
        <div className="salon-grid">
          {staff.map((st) => (
            <div key={st.id} className="salon-card">
              <div className="salon-card-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      backgroundColor: st.colorHex || "var(--accent)",
                      display: "inline-block",
                      flex: "none",
                      boxShadow: "0 0 0 2px var(--panel), 0 0 0 3px var(--line)",
                    }}
                  />
                  <div>
                    <h3 style={{ margin: "0 0 2px" }}>{st.name}</h3>
                    <small className="muted">{st.title}</small>
                  </div>
                </div>
              </div>

              {/* Spezialisierungen */}
              {st.specialties.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                  {st.specialties.map((sp, i) => (
                    <span key={i} className="pill" style={{ fontSize: "0.76rem" }}>
                      {sp}
                    </span>
                  ))}
                </div>
              )}

              {/* Arbeitszeiten & Tage */}
              <div className="stack-sm" style={{ fontSize: "0.85rem", color: "var(--muted)", borderTop: "1px solid var(--line)", paddingTop: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Clock size={14} />
                  <span>Arbeitszeit: <strong>{st.workStart} - {st.workEnd} Uhr</strong></span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Calendar size={14} />
                  <span>
                    Arbeitstage:{" "}
                    <strong>
                      {st.workingDays.map((d) => DAY_LABELS[d] || d).join(", ")}
                    </strong>
                  </span>
                </div>
              </div>

              {isManager && (
                <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "auto", borderTop: "1px solid var(--line)", paddingTop: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <button className="button small" onClick={() => openEdit(st)} title={s("actions.edit")}>
                    <Pencil size={14} /> {s("actions.edit")}
                  </button>
                  {deleteConfirmId === st.id ? (
                    <div className="row gap" style={{ alignItems: "center" }}>
                      <button
                        className="button danger small"
                        onClick={() => handleDelete(st.id)}
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
                    <button className="button small danger" onClick={() => setDeleteConfirmId(st.id)} title={s("actions.delete")}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: Stylist anlegen / bearbeiten */}
      {modalOpen && (
        <div className="salon-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="salon-modal" onClick={(e) => e.stopPropagation()}>
            <div className="salon-modal-head">
              <h3>{editingStaff ? "Stylist bearbeiten" : s("actions.newStaff")}</h3>
              <button className="icon-button" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && <div className="notice warning">{errorMsg}</div>}

            <form onSubmit={handleSave} className="stack">
              <Field label="Name des Mitarbeiters" required>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="z.B. Elena Schmidt"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>

              <div className="row-grid">
                <Field label="Titel / Rolle">
                  <input
                    type="text"
                    className="input"
                    placeholder="z.B. Master Stylist, Barbier, Colorist"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </Field>
                <Field label="Farbe im Kalender">
                  <div className="row gap">
                    <input
                      type="color"
                      style={{ width: "48px", height: "44px", padding: "2px", cursor: "pointer", borderRadius: "10px" }}
                      value={form.colorHex}
                      onChange={(e) => setForm({ ...form, colorHex: e.target.value })}
                    />
                    <input
                      type="text"
                      className="input"
                      value={form.colorHex}
                      onChange={(e) => setForm({ ...form, colorHex: e.target.value })}
                    />
                  </div>
                </Field>
              </div>

              <div className="row-grid">
                <Field label="Arbeitsbeginn">
                  <input
                    type="time"
                    className="input"
                    value={form.workStart}
                    onChange={(e) => setForm({ ...form, workStart: e.target.value })}
                  />
                </Field>
                <Field label="Arbeitsende">
                  <input
                    type="time"
                    className="input"
                    value={form.workEnd}
                    onChange={(e) => setForm({ ...form, workEnd: e.target.value })}
                  />
                </Field>
              </div>

              <Field label="Arbeitstage">
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {[
                    { d: 1, label: "Montag" },
                    { d: 2, label: "Dienstag" },
                    { d: 3, label: "Mittwoch" },
                    { d: 4, label: "Donnerstag" },
                    { d: 5, label: "Freitag" },
                    { d: 6, label: "Samstag" },
                  ].map(({ d, label }) => {
                    const active = form.workingDays.includes(d);
                    return (
                      <button
                        type="button"
                        key={d}
                        className={`chip ${active ? "active" : ""}`}
                        onClick={() => {
                          if (active) {
                            setForm({ ...form, workingDays: form.workingDays.filter((x) => x !== d) });
                          } else {
                            setForm({ ...form, workingDays: [...form.workingDays, d].sort() });
                          }
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Spezialisierungen (durch Komma getrennt)">
                <input
                  type="text"
                  className="input"
                  placeholder="z.B. Balayage, Fade Cut, Brautfrisur, Bartpflege"
                  value={form.specialtiesText}
                  onChange={(e) => setForm({ ...form, specialtiesText: e.target.value })}
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
