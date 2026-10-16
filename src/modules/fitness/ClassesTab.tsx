import { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Users,
  Plus,
  Edit,
  Trash2,
  X,
  UserCheck,
  UserMinus,
  Search,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { api } from "../../api";
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
          body: JSON.stringify({ memberId }),
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
          body: JSON.stringify({ memberId }),
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
          body: JSON.stringify(formState),
        });
        setClasses((prev) => prev.map((c) => (c.id === editingClassId ? updated : c)));
      } else {
        const created = await api<FitnessClass>("/fitness/classes", {
          method: "POST",
          body: JSON.stringify(formState),
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
    <div className="space-y-6">
      {/* Wochentagsleiste & Aktion */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <button
            onClick={() => setSelectedDay("alle")}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
              selectedDay === "alle"
                ? "bg-zinc-900 text-white shadow-2xs"
                : "bg-zinc-100 text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Alle Tage
          </button>
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                selectedDay === day
                  ? "bg-emerald-600 text-white shadow-2xs"
                  : "bg-zinc-100 text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {day}
            </button>
          ))}
        </div>

        <button
          onClick={handleOpenNew}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Kurs anlegen</span>
        </button>
      </div>

      {/* Kursplan Kacheln */}
      {loading ? (
        <div className="p-12 text-center text-zinc-400 text-sm">Kursplan wird geladen...</div>
      ) : classes.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-zinc-200 text-center text-zinc-400 text-sm">
          Für diesen Tag sind derzeit keine Kurse eingetragen.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((course) => {
            const bookedCount = course.bookedMemberIds.length;
            const isFull = bookedCount >= course.maxParticipants;
            const percent = Math.min(100, Math.round((bookedCount / course.maxParticipants) * 100));

            return (
              <div
                key={course.id}
                className="bg-white rounded-2xl border border-zinc-200 shadow-xs p-5 flex flex-col justify-between hover:border-emerald-300 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md">
                      {course.weekday}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(course)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg transition-colors cursor-pointer"
                        title="Bearbeiten"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteClass(course.id)}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                        title="Löschen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-zinc-900 leading-snug mb-1">
                    {course.name}
                  </h3>

                  {course.description && (
                    <p className="text-xs text-zinc-500 mb-3 line-clamp-2">
                      {course.description}
                    </p>
                  )}

                  <div className="space-y-1.5 text-xs text-zinc-600 mb-4 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="font-semibold text-zinc-800">
                        {course.startTime} – {course.endTime} Uhr
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{course.room}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Trainer/in: <span className="font-medium text-zinc-800">{course.coachName}</span></span>
                    </div>
                  </div>
                </div>

                {/* Teilnehmer Auslastung & Buchung */}
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                    <span className="text-zinc-600">Teilnehmer:</span>
                    <span className={isFull ? "text-rose-600 font-bold" : "text-zinc-800"}>
                      {bookedCount} / {course.maxParticipants} {isFull && "(Voll)"}
                    </span>
                  </div>

                  <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden mb-4">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isFull ? "bg-rose-500" : percent > 75 ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <button
                    onClick={() => handleOpenParticipants(course)}
                    className="w-full py-2 px-3 bg-zinc-100 hover:bg-emerald-50 text-zinc-800 hover:text-emerald-800 rounded-xl text-xs font-bold transition-colors border border-zinc-200 hover:border-emerald-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Teilnehmerliste & Buchen</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- TEILNEHMERLISTE & BUCHUNGS MODAL --- */}
      {activeClass && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-4 border-b border-zinc-200">
              <div>
                <span className="text-xs font-bold uppercase text-emerald-700">
                  {activeClass.weekday} · {activeClass.startTime} - {activeClass.endTime} Uhr
                </span>
                <h3 className="text-lg font-bold text-zinc-900 mt-0.5">{activeClass.name}</h3>
                <p className="text-xs text-zinc-500">
                  Trainer: {activeClass.coachName} · Raum: {activeClass.room}
                </p>
              </div>
              <button
                onClick={() => setActiveClass(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Eingebuchte Mitglieder */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Gebuchte Plätze ({activeClass.bookedMemberIds.length} / {activeClass.maxParticipants})
                </h4>
              </div>

              {activeClass.bookedMemberIds.length === 0 ? (
                <p className="text-xs text-zinc-400 italic py-3 bg-zinc-50 rounded-xl text-center">
                  Für diesen Kurs liegen noch keine Buchungen vor.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {activeClass.bookedMemberIds.map((mId) => {
                    const member = allMembers.find((m) => m.id === mId);
                    return (
                      <div
                        key={mId}
                        className="flex items-center justify-between p-2.5 bg-zinc-50 rounded-xl border border-zinc-200 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center">
                            {member ? `${member.firstName[0]}${member.lastName[0]}` : "?"}
                          </div>
                          <div>
                            <p className="font-bold text-zinc-900">
                              {member ? `${member.firstName} ${member.lastName}` : `Mitglied ${mId}`}
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              {member?.memberNumber} · {member?.planName}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleCancelBooking(mId)}
                          disabled={bookingLoading}
                          className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          title="Platz stornieren"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                          <span>Austragen</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mitglied schnell einbuchen */}
            <div className="mt-6 pt-4 border-t border-zinc-200">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-700 mb-2">
                Mitglied in Kurs einbuchen
              </h4>

              <div className="relative mb-3">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Mitglied suchen (Name oder M-Nummer)..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-zinc-900 focus:outline-hidden"
                />
              </div>

              {activeClass.bookedMemberIds.length >= activeClass.maxParticipants ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>Dieser Kurs ist bereits voll belegt. Bitte Teilnehmerzahl erhöhen oder Platz freigeben.</span>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
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
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-2 hover:bg-zinc-50 rounded-lg text-xs"
                      >
                        <div>
                          <span className="font-semibold text-zinc-800">
                            {m.firstName} {m.lastName}
                          </span>{" "}
                          <span className="text-zinc-400 font-mono">({m.memberNumber})</span>
                        </div>
                        <button
                          onClick={() => handleBookMember(m.id)}
                          disabled={bookingLoading}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-lg font-bold transition-colors cursor-pointer"
                        >
                          Einbuchen
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- KURS ERSTELLEN / BEARBEITEN MODAL --- */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-zinc-200">
              <h3 className="text-base font-bold text-zinc-900">
                {editingClassId ? "Kurs bearbeiten" : "Neuen Kurs anlegen"}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 mb-1">Kursname *</label>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="z. B. Vinyasa Yoga, Spinning, HIIT..."
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Trainer/in</label>
                  <input
                    type="text"
                    required
                    value={formState.coachName}
                    onChange={(e) => setFormState({ ...formState, coachName: e.target.value })}
                    placeholder="z. B. Elena Richter"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Wochentag</label>
                  <select
                    value={formState.weekday}
                    onChange={(e) => setFormState({ ...formState, weekday: e.target.value as Weekday })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-xs font-semibold"
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Beginn</label>
                  <input
                    type="time"
                    required
                    value={formState.startTime}
                    onChange={(e) => setFormState({ ...formState, startTime: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Ende</label>
                  <input
                    type="time"
                    required
                    value={formState.endTime}
                    onChange={(e) => setFormState({ ...formState, endTime: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Raum / Bereich</label>
                  <input
                    type="text"
                    value={formState.room}
                    onChange={(e) => setFormState({ ...formState, room: e.target.value })}
                    placeholder="Kursraum 1, Arena..."
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Max. Teilnehmer</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formState.maxParticipants}
                    onChange={(e) =>
                      setFormState({ ...formState, maxParticipants: parseInt(e.target.value, 10) || 16 })
                    }
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Beschreibung / Level</label>
                <textarea
                  rows={2}
                  value={formState.description}
                  onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                  placeholder="Voraussetzungen, Ausrüstung..."
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:border-emerald-600 rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 rounded-lg cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={savingClass}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  {savingClass ? "Wird gespeichert..." : "Speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
