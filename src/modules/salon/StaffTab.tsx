import { useEffect, useState } from "react";
import { Plus, Clock, Calendar, Pencil, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { SalonStaff } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";
import { Dialog } from "../../pos/ui";

export function StaffTab({ isManager }: { isManager: boolean }) {
  const { s, errorText } = useSalonI18n();
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
      title: s("staff.defaultTitle"),
      email: "",
      phone: "",
      colorHex: "#e11d48",
      specialtiesText: s("staff.defaultSpecialties"),
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
    } catch (err) {
      setErrorMsg(errorText(err));
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
    } catch (err) {
      setStaffError(errorText(err));
    }
  };

  return (
    <div className="stack">
      <div className="section-head">
        <div className="stack-sm">
          <h2>{s("staff.title")}</h2>
          <p className="small muted">{s("staff.subtitle")}</p>
        </div>

        {isManager && (
          <button className="button primary" onClick={openNew}>
            <Plus size={18} /> {s("actions.newStaff")}
          </button>
        )}
      </div>

      {staffError && <p className="error" role="alert">{staffError}</p>}

      {loading ? (
        <p className="muted">{s("staff.loading")}</p>
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
                <span className="salon-dot" style={st.colorHex ? { background: st.colorHex } : undefined} title={s("staff.calendarColor")} />
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
                <span><Clock size={14} /> {s("staff.workingHoursLabel")} <strong>{s("staff.workingHoursValue", { from: st.workStart, to: st.workEnd })}</strong></span>
                <span>
                  <Calendar size={14} /> {s("staff.workingDaysLabel")} <strong>{st.workingDays.map((d) => (d >= 1 && d <= 7 ? s(`weekdaysShort.${d}`) : d)).join(", ")}</strong>
                </span>
              </div>

              {isManager && (
                <div className="salon-card-foot">
                  <button className="button small-button" onClick={() => openEdit(st)} title={s("actions.edit")}>
                    <Pencil size={14} /> {s("actions.edit")}
                  </button>
                  {deleteConfirmId === st.id ? (
                    <span className="row gap">
                      <button className="button danger small-button" onClick={() => handleDelete(st.id)} title={s("actions.deactivateForever")}>
                        {s("actions.deactivate")}
                      </button>
                      <button className="button small-button" onClick={() => setDeleteConfirmId(null)}>
                        {s("actions.cancelShort")}
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
        <Dialog title={editingStaff ? s("staff.edit") : s("actions.newStaff")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSave} className="salon-dialog stack">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

            <div className="grid form-grid">
              <Field label={s("staff.name")} required wide>
                <input type="text" required placeholder={s("staff.namePlaceholder")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>

              <Field label={s("staff.role")}>
                <input type="text" placeholder={s("staff.rolePlaceholder")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field label={s("staff.calendarColor")}>
                <div className="salon-color">
                  <input type="color" value={form.colorHex} onChange={(e) => setForm({ ...form, colorHex: e.target.value })} aria-label={s("staff.calendarColor")} />
                  <input type="text" value={form.colorHex} onChange={(e) => setForm({ ...form, colorHex: e.target.value })} />
                </div>
              </Field>

              <Field label={s("staff.workStart")}>
                <input type="time" value={form.workStart} onChange={(e) => setForm({ ...form, workStart: e.target.value })} />
              </Field>
              <Field label={s("staff.workEnd")}>
                <input type="time" value={form.workEnd} onChange={(e) => setForm({ ...form, workEnd: e.target.value })} />
              </Field>

              <Field label={s("staff.workingDays")} wide>
                <div className="chips wrap">
                  {[1, 2, 3, 4, 5, 6].map((d) => {
                    const label = s(`weekdays.${d}`);
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

              <Field label={s("staff.specialtiesLabel")} wide>
                <input
                  type="text"
                  placeholder={s("staff.specialtiesPlaceholder")}
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
