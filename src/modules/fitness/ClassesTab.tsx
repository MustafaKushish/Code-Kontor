import { useState, useEffect } from "react";
import { Clock, MapPin, User, Users, Plus, Edit, Trash2, UserMinus, Search, AlertCircle } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { Dialog } from "../../pos/ui";
import type {
  FitnessClass,
  FitnessMember,
  Weekday,
} from "../../../shared/fitness";

const WEEKDAYS: Weekday[] = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];

interface ClassesTabProps {
  onRefreshStats: () => void;
}

export function ClassesTab({ onRefreshStats }: ClassesTabProps) {
  const [classes, setClasses] = useState<FitnessClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string>("alle");

  // Teilnehmer-Modal
  const [activeClass, setActiveClass] = useState<FitnessClass | null>(null);
  const [allMembers, setAllMembers] = useState<FitnessMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);

  // Kurs Erstellen/Bearbeiten Modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    name: "",
    coachName: "",
    weekday: "Montag" as Weekday,
    startTime: "18:00",
    endTime: "19:00",
    room: "Kursraum 1",
    maxParticipants: 16,
    description: "",
  });
  const [savingClass, setSavingClass] = useState(false);

  const loadClasses = async () => {
    setLoading(true);
    try {
      const q = selectedDay !== "alle" ? `?weekday=${selectedDay}` : "";
      const list = await api<FitnessClass[]>(`/fitness/classes${q}`);
      setClasses(list);
    } catch {
      // Fehler
    } finally {
      setLoading(false);
    }
  };

  const loadMembersForBooking = async () => {
    try {
      const data = await api<FitnessMember[]>("/fitness/members?status=aktiv");
      setAllMembers(data);
    } catch {
      // Fehler
    }
  };

  useEffect(() => {
    loadClasses();
    loadMembersForBooking();
  }, [selectedDay]);

  const handleOpenParticipants = (c: FitnessClass) => {
    setActiveClass(c);
    setMemberSearch("");
  };

  const handleBookMember = async (memberId: string) => {
    if (!activeClass) return;
    setBookingLoading(true);
    try {
      const res = await api<{ success: boolean; course: FitnessClass }>(
        `/fitness/classes/${activeClass.id}/book`,
        {
          method: "POST",
          body: { memberId },
        }
      );
      setActiveClass(res.course);
      setClasses((prev) => prev.map((c) => (c.id === res.course.id ? res.course : c)));
      onRefreshStats();
    } catch {
      // Fehler
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCancelBooking = async (memberId: string) => {
    if (!activeClass) return;
    setBookingLoading(true);
    try {
      const res = await api<{ success: boolean; course: FitnessClass }>(
        `/fitness/classes/${activeClass.id}/cancel`,
        {
          method: "POST",
          body: { memberId },
        }
      );
      setActiveClass(res.course);
      setClasses((prev) => prev.map((c) => (c.id === res.course.id ? res.course : c)));
      onRefreshStats();
    } catch {
      // Fehler
    } finally {
      setBookingLoading(false);
    }
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim()) return;

    setSavingClass(true);
    try {
      if (editingClassId) {
        const updated = await api<FitnessClass>(`/fitness/classes/${editingClassId}`, {
          method: "PUT",
          body: formState,
        });
        setClasses((prev) => prev.map((c) => (c.id === editingClassId ? updated : c)));
      } else {
        const created = await api<FitnessClass>("/fitness/classes", {
          method: "POST",
          body: formState,
        });
        setClasses((prev) => [...prev, created]);
      }
      setIsFormOpen(false);
      setEditingClassId(null);
      onRefreshStats();
    } catch {
      // Fehler
    } finally {
      setSavingClass(false);
    }
  };

  const handleDeleteClass = async (id: string) => {
    if (!confirm("Diesen Kurs wirklich aus dem Kursplan entfernen?")) return;
    try {
      await api(`/fitness/classes/${id}`, { method: "DELETE" });
      setClasses((prev) => prev.filter((c) => c.id !== id));
      if (activeClass?.id === id) setActiveClass(null);
      onRefreshStats();
    } catch {
      // Fehler
    }
  };

  const handleOpenEdit = (c: FitnessClass) => {
    setEditingClassId(c.id);
    setFormState({
      name: c.name,
      coachName: c.coachName,
      weekday: c.weekday,
      startTime: c.startTime,
      endTime: c.endTime,
      room: c.room,
      maxParticipants: c.maxParticipants,
      description: c.description || "",
    });
    setIsFormOpen(true);
  };

  const handleOpenNew = () => {
    setEditingClassId(null);
    setFormState({
      name: "",
      coachName: "",
      weekday: (selectedDay !== "alle" ? selectedDay : "Montag") as Weekday,
      startTime: "18:00",
      endTime: "19:00",
      room: "Kursraum 1 (Zen Box)",
      maxParticipants: 16,
      description: "",
    });
    setIsFormOpen(true);
  };

  return (
    <div className="stack">
      {/* Wochentagsleiste & Aktion */}
      <div className="fitness-toolbar">
        <div className="chips" role="tablist">
          <button
            role="tab"
            aria-selected={selectedDay === "alle"}
            onClick={() => setSelectedDay("alle")}
            className={selectedDay === "alle" ? "chip active" : "chip"}
          >
            Alle Tage
          </button>
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              role="tab"
              aria-selected={selectedDay === day}
              onClick={() => setSelectedDay(day)}
              className={selectedDay === day ? "chip active" : "chip"}
            >
              {day}
            </button>
          ))}
        </div>

        <button onClick={handleOpenNew} className="button primary">
          <Plus size={18} />
          Kurs anlegen
        </button>
      </div>

      {/* Kursplan Kacheln */}
      {loading ? (
        <p className="muted">Kursplan wird geladen...</p>
      ) : classes.length === 0 ? (
        <section className="card list-card">
          <p className="empty muted">Für diesen Tag sind derzeit keine Kurse eingetragen.</p>
        </section>
      ) : (
        <div className="fitness-grid">
          {classes.map((course) => {
            const bookedCount = course.bookedMemberIds.length;
            const isFull = bookedCount >= course.maxParticipants;
            const percent = Math.min(100, Math.round((bookedCount / course.maxParticipants) * 100));

            return (
              <section key={course.id} className="card fitness-card">
                <div className="fitness-card-top">
                  <span className="pill accent-pill">{course.weekday}</span>
                  <button onClick={() => handleOpenEdit(course)} className="icon-button" title="Bearbeiten" aria-label="Bearbeiten">
                    <Edit size={16} />
                  </button>
                  <button onClick={() => handleDeleteClass(course.id)} className="icon-button danger" title="Löschen" aria-label="Löschen">
                    <Trash2 size={16} />
                  </button>
                </div>

                <h3>{course.name}</h3>

                {course.description && <p className="description small muted">{course.description}</p>}

                <ul className="fitness-meta">
                  <li>
                    <Clock size={15} />
                    <strong>
                      {course.startTime} – {course.endTime} Uhr
                    </strong>
                  </li>
                  <li>
                    <MapPin size={15} />
                    <span>{course.room}</span>
                  </li>
                  <li>
                    <User size={15} />
                    <span>
                      Trainer/in: <strong>{course.coachName}</strong>
                    </span>
                  </li>
                </ul>

                {/* Teilnehmer Auslastung & Buchung */}
                <div className="fitness-card-foot">
                  <div className="fitness-count">
                    <span className="muted">Teilnehmer:</span>
                    <span className={isFull ? "full" : ""}>
                      {bookedCount} / {course.maxParticipants} {isFull && "(Voll)"}
                    </span>
                  </div>
                  <div className="fitness-bar thin">
                    <span className={isFull ? "bad" : percent > 75 ? "warn" : ""} style={{ width: `${percent}%` }} />
                  </div>
                  <button onClick={() => handleOpenParticipants(course)} className="button block">
                    <Users size={17} />
                    Teilnehmerliste & Buchen
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* --- TEILNEHMERLISTE & BUCHUNGS DIALOG --- */}
      {activeClass && (
        <Dialog title={activeClass.name} onClose={() => setActiveClass(null)}>
          <div className="fitness-dialog">
            <div className="stack-sm">
              <span className="eyebrow">
                {activeClass.weekday} · {activeClass.startTime} - {activeClass.endTime} Uhr
              </span>
              <p className="small muted">
                Trainer: {activeClass.coachName} · Raum: {activeClass.room}
              </p>
            </div>

            {/* Eingebuchte Mitglieder */}
            <div className="stack-sm">
              <h3>
                Gebuchte Plätze ({activeClass.bookedMemberIds.length} / {activeClass.maxParticipants})
              </h3>

              {activeClass.bookedMemberIds.length === 0 ? (
                <p className="small muted">Für diesen Kurs liegen noch keine Buchungen vor.</p>
              ) : (
                <div className="fitness-scroll">
                  {activeClass.bookedMemberIds.map((mId) => {
                    const member = allMembers.find((m) => m.id === mId);
                    return (
                      <div key={mId} className="list-row">
                        <span className="fitness-avatar small" aria-hidden>
                          {member ? `${member.firstName[0]}${member.lastName[0]}` : "?"}
                        </span>
                        <span className="list-main">
                          <strong>{member ? `${member.firstName} ${member.lastName}` : `Mitglied ${mId}`}</strong>
                          <small className="muted">
                            {member?.memberNumber} · {member?.planName}
                          </small>
                        </span>
                        <button
                          onClick={() => handleCancelBooking(mId)}
                          disabled={bookingLoading}
                          className="button small-button danger"
                          title="Platz stornieren"
                        >
                          <UserMinus size={14} />
                          Austragen
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mitglied schnell einbuchen */}
            <div className="stack-sm">
              <h3>Mitglied in Kurs einbuchen</h3>

              <label className="search compact">
                <Search size={16} />
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Mitglied suchen (Name oder M-Nummer)..."
                  aria-label="Mitglied suchen (Name oder M-Nummer)..."
                />
              </label>

              {activeClass.bookedMemberIds.length >= activeClass.maxParticipants ? (
                <p className="notice">
                  <AlertCircle size={17} />
                  <span>Dieser Kurs ist bereits voll belegt. Bitte Teilnehmerzahl erhöhen oder Platz freigeben.</span>
                </p>
              ) : (
                <div className="fitness-scroll">
                  {allMembers
                    .filter(
                      (m) =>
                        !activeClass.bookedMemberIds.includes(m.id) &&
                        (m.firstName.toLowerCase().includes(memberSearch.toLowerCase()) ||
                          m.lastName.toLowerCase().includes(memberSearch.toLowerCase()) ||
                          m.memberNumber.toLowerCase().includes(memberSearch.toLowerCase()))
                    )
                    .slice(0, 5)
                    .map((m) => (
                      <div key={m.id} className="list-row">
                        <span className="list-main">
                          <strong>
                            {m.firstName} {m.lastName}
                          </strong>
                          <small className="muted mono">({m.memberNumber})</small>
                        </span>
                        <button onClick={() => handleBookMember(m.id)} disabled={bookingLoading} className="button small-button primary">
                          Einbuchen
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </Dialog>
      )}

      {/* --- KURS ERSTELLEN / BEARBEITEN DIALOG --- */}
      {isFormOpen && (
        <Dialog title={editingClassId ? "Kurs bearbeiten" : "Neuen Kurs anlegen"} onClose={() => setIsFormOpen(false)}>
          <form onSubmit={handleSaveClass} className="fitness-dialog">
            <div className="grid form-grid">
              <Field label="Kursname" required wide>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="z. B. Vinyasa Yoga, Spinning, HIIT..."
                />
              </Field>
              <Field label="Trainer/in">
                <input
                  type="text"
                  required
                  value={formState.coachName}
                  onChange={(e) => setFormState({ ...formState, coachName: e.target.value })}
                  placeholder="z. B. Elena Richter"
                />
              </Field>
              <Field label="Wochentag">
                <select
                  value={formState.weekday}
                  onChange={(e) => setFormState({ ...formState, weekday: e.target.value as Weekday })}
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Beginn">
                <input
                  type="time"
                  required
                  value={formState.startTime}
                  onChange={(e) => setFormState({ ...formState, startTime: e.target.value })}
                />
              </Field>
              <Field label="Ende">
                <input
                  type="time"
                  required
                  value={formState.endTime}
                  onChange={(e) => setFormState({ ...formState, endTime: e.target.value })}
                />
              </Field>
              <Field label="Raum / Bereich">
                <input
                  type="text"
                  value={formState.room}
                  onChange={(e) => setFormState({ ...formState, room: e.target.value })}
                  placeholder="Kursraum 1, Arena..."
                />
              </Field>
              <Field label="Max. Teilnehmer">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formState.maxParticipants}
                  onChange={(e) =>
                    setFormState({ ...formState, maxParticipants: parseInt(e.target.value, 10) || 16 })
                  }
                />
              </Field>
              <Field label="Beschreibung / Level" wide>
                <textarea
                  rows={2}
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                  placeholder="Voraussetzungen, Ausrüstung..."
                />
              </Field>
            </div>

            <div className="actions-end">
              <button type="button" onClick={() => setIsFormOpen(false)} className="button">
                Abbrechen
              </button>
              <button type="submit" disabled={savingClass} className="button primary">
                {savingClass ? "Wird gespeichert..." : "Speichern"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
