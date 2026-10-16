import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Clock, Scissors, CheckCircle, Play, X, User, Phone, Sparkles } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { AppointmentStatus, SalonAppointment, SalonClient, SalonService, SalonStaff } from "../../../shared/salon";
import { addMinutesToTime, timeToMinutes } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";

export function CalendarTab({
  isManager,
  onNavigateToCheckout,
}: {
  isManager: boolean;
  onNavigateToCheckout?: (app: SalonAppointment) => void;
}) {
  const { s, euro, day: formatDay, time } = useSalonI18n();
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().slice(0, 10));
  const [staff, setStaff] = useState<SalonStaff[]>([]);
  const [services, setServices] = useState<SalonService[]>([]);
  const [clients, setClients] = useState<SalonClient[]>([]);
  const [appointments, setAppointments] = useState<SalonAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal: Neuer Termin
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<SalonAppointment | null>(null);

  const [form, setForm] = useState({
    clientId: "",
    clientName: "",
    clientPhone: "",
    clientEmail: "",
    staffId: "",
    serviceIds: [] as string[],
    day: selectedDay,
    startTime: "10:00",
    notes: "",
  });
  const [errorMsg, setErrorMsg] = useState("");

  const loadData = async () => {
    try {
      const [stRes, seRes, clRes, apRes] = await Promise.all([
        api<{ staff: SalonStaff[] }>("/salon/staff"),
        api<{ services: SalonService[] }>("/salon/services"),
        api<{ clients: SalonClient[] }>("/salon/clients"),
        api<{ appointments: SalonAppointment[] }>(`/salon/appointments?day=${selectedDay}`),
      ]);
      setStaff(stRes.staff);
      setServices(seRes.services);
      setClients(clRes.clients);
      setAppointments(apRes.appointments);

      if (stRes.staff.length > 0 && !form.staffId) {
        setForm((f) => ({ ...f, staffId: stRes.staff[0].id }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDay]);

  const handleDayShift = (days: number) => {
    const d = new Date(selectedDay + "T12:00:00");
    d.setDate(d.getDate() + days);
    setSelectedDay(d.toISOString().slice(0, 10));
  };

  const handleOpenSlot = (staffId: string, startTime: string) => {
    setForm({
      clientId: "",
      clientName: "",
      clientPhone: "",
      clientEmail: "",
      staffId,
      serviceIds: services.length > 0 ? [services[0].id] : [],
      day: selectedDay,
      startTime,
      notes: "",
    });
    setErrorMsg("");
    setModalOpen(true);
  };

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const selectedStaff = staff.find((st) => st.id === form.staffId);
    const chosenServices = services.filter((srv) => form.serviceIds.includes(srv.id));

    if (!selectedStaff) {
      setErrorMsg("Bitte wählen Sie einen Stylisten.");
      return;
    }
    if (chosenServices.length === 0) {
      setErrorMsg("Bitte wählen Sie mindestens eine Dienstleistung.");
      return;
    }

    const duration = chosenServices.reduce((sum, s) => sum + s.durationMinutes, 0);
    const totalCents = chosenServices.reduce((sum, s) => sum + s.priceCents, 0);

    try {
      await api("/salon/appointments", {
        method: "POST",
        body: {
          clientId: form.clientId || undefined,
          clientName: form.clientName || "Kunde",
          clientPhone: form.clientPhone,
          clientEmail: form.clientEmail,
          staffId: form.staffId,
          staffName: selectedStaff.name,
          serviceIds: chosenServices.map((s) => s.id),
          serviceNames: chosenServices.map((s) => s.name),
          day: form.day,
          startTime: form.startTime,
          durationMinutes: duration,
          totalCents,
          notes: form.notes,
          status: "confirmed",
        },
      });
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim Buchen des Termins");
    }
  };

  const [updateError, setUpdateError] = useState("");
  const [deleteConfirmAppId, setDeleteConfirmAppId] = useState<string | null>(null);

  const handleUpdateStatus = async (appId: string, newStatus: AppointmentStatus) => {
    setUpdateError("");
    try {
      await api(`/salon/appointments/${appId}/status`, {
        method: "POST",
        body: { status: newStatus },
      });
      if (selectedApp?.id === appId) {
        setSelectedApp((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
      await loadData();
    } catch (err: any) {
      setUpdateError(err?.message || "Fehler beim Aktualisieren des Termins");
    }
  };

  // Kalender-Zeitleiste (z.B. 08:30 bis 18:30)
  const START_HOUR = 8.5; // 08:30
  const END_HOUR = 19; // 19:00
  const timeSlots: string[] = [];
  for (let m = START_HOUR * 60; m < END_HOUR * 60; m += 30) {
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    timeSlots.push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }

  // Wochentag von selectedDay ermitteln
  const dayOfWeek = new Date(selectedDay + "T12:00:00").getDay() || 7;
  const activeStaff = staff.filter((st) => st.workingDays.includes(dayOfWeek));

  return (
    <div className="stack">
      {/* Datumsauswahl & Schnellaktionen */}
      <div className="toolbar" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <div className="row gap" style={{ alignItems: "center" }}>
          <button className="icon-button" onClick={() => handleDayShift(-1)} title="Vorheriger Tag">
            <ChevronLeft size={20} />
          </button>
          <input
            type="date"
            className="input"
            style={{ width: "auto", minWidth: "160px", fontWeight: 700 }}
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
          />
          <button className="icon-button" onClick={() => handleDayShift(1)} title="Nächster Tag">
            <ChevronRight size={20} />
          </button>
          <button
            className="button"
            onClick={() => setSelectedDay(new Date().toISOString().slice(0, 10))}
          >
            {s("calendar.today")}
          </button>
        </div>

        <div className="row gap push-end">
          <button
            className="button primary"
            onClick={() => {
              setForm({
                clientId: "",
                clientName: "",
                clientPhone: "",
                clientEmail: "",
                staffId: staff[0]?.id || "",
                serviceIds: services.length > 0 ? [services[0].id] : [],
                day: selectedDay,
                startTime: "10:00",
                notes: "",
              });
              setErrorMsg("");
              setModalOpen(true);
            }}
          >
            <Plus size={18} /> {s("actions.newAppointment")}
          </button>
        </div>
      </div>

      {/* Kalenderraster */}
      <div className="salon-calendar-wrap">
        <div
          className="salon-calendar"
          style={{
            gridTemplateColumns: `64px repeat(${Math.max(1, activeStaff.length)}, 1fr)`,
          }}
        >
          {/* Kopfzeile: Stylisten */}
          <div className="salon-calendar-header" style={{ gridColumn: `1 / -1`, display: "grid", gridTemplateColumns: `64px repeat(${Math.max(1, activeStaff.length)}, 1fr)` }}>
            <div className="salon-calendar-col-header" style={{ justifyContent: "center" }}>
              <Clock size={16} style={{ color: "var(--muted)" }} />
            </div>
            {activeStaff.length === 0 ? (
              <div className="salon-calendar-col-header" style={{ color: "var(--muted)" }}>
                {s("calendar.noStaff")}
              </div>
            ) : (
              activeStaff.map((st) => (
                <div key={st.id} className="salon-calendar-col-header">
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: st.colorHex || "var(--accent)",
                      display: "inline-block",
                      flex: "none",
                    }}
                  />
                  <div>
                    <strong>{st.name}</strong>
                    <small className="muted" style={{ display: "block", fontSize: "0.75rem", fontWeight: 400 }}>
                      {st.title} ({st.workStart} - {st.workEnd})
                    </small>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Zeitleiste links */}
          <div className="salon-time-col">
            {timeSlots.map((ts) => (
              <div key={ts} className="salon-time-slot">
                {ts}
              </div>
            ))}
          </div>

          {/* Spalten je Stylist */}
          {activeStaff.map((st) => {
            const staffAppointments = appointments.filter(
              (a) => a.staffId === st.id && a.status !== "canceled"
            );

            return (
              <div key={st.id} className="salon-staff-col">
                {timeSlots.map((ts) => (
                  <div
                    key={ts}
                    className="salon-slot-cell"
                    onClick={() => handleOpenSlot(st.id, ts)}
                    title={`Freier Termin um ${ts} bei ${st.name} buchen`}
                  />
                ))}

                {/* Termine in dieser Spalte absolut positionieren */}
                {staffAppointments.map((app) => {
                  const startM = timeToMinutes(app.startTime);
                  const baseM = START_HOUR * 60;
                  const topPx = ((startM - baseM) / 30) * 52;
                  const heightPx = Math.max(34, (app.durationMinutes / 30) * 52);

                  let statusBg = "var(--panel)";
                  let borderLeft = `4px solid ${st.colorHex || "var(--accent)"}`;
                  if (app.status === "in_progress") statusBg = "color-mix(in srgb, var(--accent) 15%, var(--panel))";
                  if (app.status === "completed") statusBg = "color-mix(in srgb, var(--success) 12%, var(--panel))";

                  return (
                    <div
                      key={app.id}
                      className="salon-appointment-block"
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        backgroundColor: statusBg,
                        borderLeft,
                        border: "1px solid var(--line)",
                      }}
                      onClick={() => setSelectedApp(app)}
                      title={`${app.clientName} (${app.startTime} - ${app.endTime})`}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {app.clientName}
                        </strong>
                        <span style={{ fontSize: "0.74rem", fontWeight: 700 }}>
                          {app.startTime}
                        </span>
                      </div>
                      <span className="muted" style={{ fontSize: "0.74rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {app.serviceNames.join(", ")}
                      </span>
                      {heightPx > 50 && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", fontSize: "0.72rem" }}>
                          <span className={`pill ${app.status === "in_progress" ? "warning" : app.status === "completed" ? "success" : ""}`} style={{ padding: "1px 6px" }}>
                            {s(`status.${app.status}`)}
                          </span>
                          <strong>{euro(app.totalCents)}</strong>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal: Neuer Termin buchen */}
      {modalOpen && (
        <div className="salon-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="salon-modal" onClick={(e) => e.stopPropagation()}>
            <div className="salon-modal-head">
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <Scissors size={20} style={{ color: "var(--accent)" }} />
                {s("actions.newAppointment")}
              </h3>
              <button className="icon-button" onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && <div className="notice warning">{errorMsg}</div>}

            <form onSubmit={handleSaveAppointment} className="stack">
              <div className="row-grid">
                <Field label="Stylist" required>
                  <select
                    className="input"
                    required
                    value={form.staffId}
                    onChange={(e) => setForm({ ...form, staffId: e.target.value })}
                  >
                    {staff.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.title})
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Datum & Uhrzeit" required>
                  <div className="row gap">
                    <input
                      type="date"
                      className="input"
                      required
                      value={form.day}
                      onChange={(e) => setForm({ ...form, day: e.target.value })}
                    />
                    <input
                      type="time"
                      className="input"
                      required
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    />
                  </div>
                </Field>
              </div>

              {/* Kunde wählen oder neu eingeben */}
              <div className="row-grid">
                <Field label="Bestehender Kunde (optional)">
                  <select
                    className="input"
                    value={form.clientId}
                    onChange={(e) => {
                      const c = clients.find((cl) => cl.id === e.target.value);
                      if (c) {
                        setForm({
                          ...form,
                          clientId: c.id,
                          clientName: c.name,
                          clientPhone: c.phone,
                          clientEmail: c.email,
                        });
                      } else {
                        setForm({ ...form, clientId: "" });
                      }
                    }}
                  >
                    <option value="">-- Neuer Kunde / Freie Eingabe --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ""}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Kundenname" required>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Vor- und Nachname"
                    value={form.clientName}
                    onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  />
                </Field>
              </div>

              <div className="row-grid">
                <Field label="Telefonnummer">
                  <input
                    type="tel"
                    className="input"
                    placeholder="+49 171 1234567"
                    value={form.clientPhone}
                    onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                  />
                </Field>
                <Field label="E-Mail-Adresse">
                  <input
                    type="email"
                    className="input"
                    placeholder="kunde@example.de"
                    value={form.clientEmail}
                    onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                  />
                </Field>
              </div>

              {/* Dienstleistungen auswählen */}
              <Field label="Dienstleistungen auswählen (Mehrfachauswahl möglich)" required>
                <div style={{ display: "grid", gap: "6px", maxHeight: "180px", overflowY: "auto", border: "1px solid var(--line)", padding: "8px", borderRadius: "var(--radius)" }}>
                  {services.map((srv) => {
                    const checked = form.serviceIds.includes(srv.id);
                    return (
                      <label
                        key={srv.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 8px",
                          borderRadius: "8px",
                          background: checked ? "color-mix(in srgb, var(--accent) 10%, var(--panel))" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setForm({ ...form, serviceIds: [...form.serviceIds, srv.id] });
                              } else {
                                setForm({ ...form, serviceIds: form.serviceIds.filter((id) => id !== srv.id) });
                              }
                            }}
                          />
                          <strong>{srv.name}</strong>
                          <small className="muted">({srv.durationMinutes} Min)</small>
                        </span>
                        <strong>{euro(srv.priceCents)}</strong>
                      </label>
                    );
                  })}
                </div>
              </Field>

              <Field label="Notizen / Besonderheiten">
                <input
                  type="text"
                  className="input"
                  placeholder="z.B. Neukunde, Farbwunsch Blond, Getränkewunsch"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>

              <div className="row gap" style={{ justifyContent: "flex-end", marginTop: "10px" }}>
                <button type="button" className="button" onClick={() => setModalOpen(false)}>
                  {s("actions.cancel")}
                </button>
                <button type="submit" className="button primary">
                  <CheckCircle size={17} /> {s("actions.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Termin-Details & Status ändern */}
      {selectedApp && (
        <div className="salon-modal-overlay" onClick={() => setSelectedApp(null)}>
          <div className="salon-modal" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="salon-modal-head">
              <div>
                <h3 style={{ margin: 0 }}>{selectedApp.clientName}</h3>
                <small className="muted">
                  {formatDay(selectedApp.day)} · {selectedApp.startTime} - {selectedApp.endTime} ({selectedApp.durationMinutes} Min)
                </small>
              </div>
              <button className="icon-button" onClick={() => setSelectedApp(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="card" style={{ padding: "14px", display: "grid", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Stylist:</span>
                <strong>{selectedApp.staffName}</strong>
              </div>
              {selectedApp.clientPhone && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Telefon:</span>
                  <strong>{selectedApp.clientPhone}</strong>
                </div>
              )}
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: "8px" }}>
                <span className="muted" style={{ fontSize: "0.82rem" }}>Dienstleistungen:</span>
                <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                  {selectedApp.serviceNames.map((n, i) => (
                    <li key={i}><strong>{n}</strong></li>
                  ))}
                </ul>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: "8px", fontSize: "1.1rem" }}>
                <span>Gesamtbetrag:</span>
                <strong style={{ color: "var(--accent)" }}>{euro(selectedApp.totalCents)}</strong>
              </div>
            </div>

            {/* Status-Wechsler */}
            <div className="stack-sm">
              <span className="small muted">Terminstatus ändern:</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                <button
                  className={`button small ${selectedApp.status === "in_progress" ? "primary" : ""}`}
                  onClick={() => handleUpdateStatus(selectedApp.id, "in_progress")}
                >
                  <Play size={14} /> {s("status.in_progress")}
                </button>
                <button
                  className={`button small success`}
                  onClick={() => handleUpdateStatus(selectedApp.id, "completed")}
                >
                  <CheckCircle size={14} /> {s("status.completed")}
                </button>
                <button
                  className={`button small danger`}
                  onClick={() => handleUpdateStatus(selectedApp.id, "canceled")}
                >
                  <X size={14} /> {s("status.canceled")}
                </button>
              </div>
            </div>

            {updateError && <div className="notice warning">{updateError}</div>}

            {/* Kassen-Abrechnung */}
            <div className="row gap" style={{ justifyContent: "space-between", marginTop: "12px", borderTop: "1px solid var(--line)", paddingTop: "14px", flexWrap: "wrap" }}>
              {deleteConfirmAppId === selectedApp.id ? (
                <div className="row gap" style={{ alignItems: "center" }}>
                  <button
                    className="button danger small"
                    onClick={async () => {
                      try {
                        await api(`/salon/appointments/${selectedApp.id}`, { method: "DELETE" });
                        setSelectedApp(null);
                        setDeleteConfirmAppId(null);
                        await loadData();
                      } catch (err: any) {
                        setUpdateError(err?.message || "Fehler beim Löschen");
                      }
                    }}
                  >
                    Wirklich löschen
                  </button>
                  <button
                    className="button small"
                    onClick={() => setDeleteConfirmAppId(null)}
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  className="button danger"
                  onClick={() => setDeleteConfirmAppId(selectedApp.id)}
                >
                  Löschen
                </button>
              )}

              <button
                className="button primary"
                onClick={() => {
                  if (onNavigateToCheckout) {
                    onNavigateToCheckout(selectedApp);
                    setSelectedApp(null);
                  } else {
                    handleUpdateStatus(selectedApp.id, "completed");
                    setSelectedApp(null);
                  }
                }}
              >
                <Sparkles size={16} /> {s("actions.checkout")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
