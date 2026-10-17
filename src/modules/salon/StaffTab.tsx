import { useEffect, useState } from "react";
import { Plus, Clock, Calendar, Pencil, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { SalonStaff } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";
import { Dialog } from "../../pos/ui";

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
      <div className="section-head">
        <div className="stack-sm">
          <h2>Salon-Team & Stylisten</h2>
          <p className="small muted">Arbeitszeiten, Kalenderfarben und Spezialisierungen verwalten.</p>
        </div>

        {isManager && (
          <button className="button primary" onClick={openNew}>
            <Plus size={18} /> {s("actions.newStaff")}
          </button>
        )}
      </div>

      {staffError && <p className="error" role="alert">{staffError}</p>}

      {loading ? (
        <p className="muted">Lade Stylisten...</p>
      ) : staff.length === 0 ? (
        <section className="card list-card">
          <p className="empty muted">{s("staff.noStaff")}</p>
        </section>
      ) : (
        <div className="salon-grid">
          {staff.map((st) => (
            <section key={st.id} className="card">
              <div className="row gap">
                <span className="salon-avatar" aria-hidden>{st.name.slice(0, 1)}</span>
                <span className="list-main">
                  <strong>{st.name}</strong>
                  <small className="muted">{st.title}</small>
                </span>
                <span className="salon-dot" style={st.colorHex ? { background: st.colorHex } : undefined} title="Farbe im Kalender" />
              </div>

              {/* Spezialisierungen */}
              {st.specialties.length > 0 && (
                <div className="row wrap gap">
                  {st.specialties.map((sp, i) => (
                    <span key={i} className="pill">{sp}</span>
                  ))}
                </div>
              )}

              {/* Arbeitszeiten & Tage */}
              <div className="salon-meta">
                <span><Clock size={14} /> Arbeitszeit: <strong>{st.workStart} - {st.workEnd} Uhr</strong></span>
                <span>
                  <Calendar size={14} /> Arbeitstage: <strong>{st.workingDays.map((d) => DAY_LABELS[d] || d).join(", ")}</strong>
                </span>
              </div>

              {isManager && (
                <div className="salon-card-foot">
                  <button className="button small-button" onClick={() => openEdit(st)} title={s("actions.edit")}>
                    <Pencil size={14} /> {s("actions.edit")}
                  </button>
                  {deleteConfirmId === st.id ? (
                    <span className="row gap">
                      <button className="button danger small-button" onClick={() => handleDelete(st.id)} title="Unwiderruflich deaktivieren">
                        Deaktivieren
                      </button>
                      <button className="button small-button" onClick={() => setDeleteConfirmId(null)}>
                        Abbr.
                      </button>
                    </span>
                  ) : (
                    <button className="icon-button danger" onClick={() => setDeleteConfirmId(st.id)} title={s("actions.delete")} aria-label={s("actions.delete")}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Dialog: Stylist anlegen / bearbeiten */}
      {modalOpen && (
        <Dialog title={editingStaff ? "Stylist bearbeiten" : s("actions.newStaff")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="salon-dialog stack">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

            <div className="grid form-grid">
              <Field label="Name des Mitarbeiters" required wide>
                <input type="text" required placeholder="z.B. Elena Schmidt" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>

              <Field label="Titel / Rolle">
                <input type="text" placeholder="z.B. Master Stylist, Barbier, Colorist" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field label="Farbe im Kalender">
                <div className="salon-color">
                  <input type="color" value={form.colorHex} onChange={(e) => setForm({ ...form, colorHex: e.target.value })} aria-label="Farbe im Kalender" />
                  <input type="text" value={form.colorHex} onChange={(e) => setForm({ ...form, colorHex: e.target.value })} />
                </div>
              </Field>

              <Field label="Arbeitsbeginn">
                <input type="time" value={form.workStart} onChange={(e) => setForm({ ...form, workStart: e.target.value })} />
              </Field>
              <Field label="Arbeitsende">
                <input type="time" value={form.workEnd} onChange={(e) => setForm({ ...form, workEnd: e.target.value })} />
              </Field>

              <Field label="Arbeitstage" wide>
                <div className="chips wrap">
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

              <Field label="Spezialisierungen (durch Komma getrennt)" wide>
                <input
                  type="text"
                  placeholder="z.B. Balayage, Fade Cut, Brautfrisur, Bartpflege"
                  value={form.specialtiesText}
                  onChange={(e) => setForm({ ...form, specialtiesText: e.target.value })}
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
