import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Clock, CheckCircle, Play, X, Sparkles } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { AppointmentStatus, SalonAppointment, SalonClient, SalonService, SalonStaff } from "../../../shared/salon";
import { addMinutesToTime, localDay, timeToMinutes } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";
import { Dialog } from "../../pos/ui";

export function CalendarTab({
  isManager,
  onNavigateToCheckout,
}: {
  isManager: boolean;
  onNavigateToCheckout?: (app: SalonAppointment) => void;
}) {
  const { s, euro, day: formatDay, errorText } = useSalonI18n();
  const [selectedDay, setSelectedDay] = useState(localDay());
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
    setSelectedDay(localDay(d));
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
      setErrorMsg(s("calendar.pickStaff"));
      return;
    }
    if (chosenServices.length === 0) {
      setErrorMsg(s("calendar.pickService"));
      return;
    }

    const duration = chosenServices.reduce((sum, s) => sum + s.durationMinutes, 0);
    const totalCents = chosenServices.reduce((sum, s) => sum + s.priceCents, 0);

    try {
      await api("/salon/appointments", {
        method: "POST",
        body: {
          clientId: form.clientId || undefined,
          clientName: form.clientName || s("calendar.defaultClient"),
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
    } catch (err) {
      setErrorMsg(errorText(err));
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
    } catch (err) {
      setUpdateError(errorText(err));
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

  const openNewAppointment = () => {
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
  };

  return (
    <div className="stack">
      {/* Datumsauswahl & Schnellaktionen */}
      <div className="salon-toolbar">
        <div className="salon-day">
          <button className="icon-button" onClick={() => handleDayShift(-1)} title={s("calendar.prevDay")} aria-label={s("calendar.prevDay")}>
            <ChevronLeft size={20} className="flip-rtl" />
          </button>
          <input type="date" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} />
          <button className="icon-button" onClick={() => handleDayShift(1)} title={s("calendar.nextDay")} aria-label={s("calendar.nextDay")}>
            <ChevronRight size={20} className="flip-rtl" />
          </button>
          <button className="button" onClick={() => setSelectedDay(localDay())}>
            {s("calendar.today")}
          </button>
        </div>
        <button className="button primary push-end" onClick={openNewAppointment}>
          <Plus size={18} /> {s("actions.newAppointment")}
        </button>
      </div>

      {/* Kalenderraster */}
      <section className="card salon-cal-wrap">
        <div className="salon-cal" style={{ gridTemplateColumns: `64px repeat(${Math.max(1, activeStaff.length)}, minmax(0, 1fr))` }}>
          {/* Kopfzeile: Stylisten */}
          <div className="salon-cal-head">
            <div><Clock size={16} /></div>
            {activeStaff.length === 0 ? (
              <div className="muted">{s("calendar.noStaff")}</div>
            ) : (
              activeStaff.map((st) => (
                <div key={st.id}>
                  <span className="salon-dot" style={st.colorHex ? { background: st.colorHex } : undefined} />
                  <span className="list-main">
                    <strong>{st.name}</strong>
                    <small className="muted">{st.title} ({s("common.timeRange", { from: st.workStart, to: st.workEnd })})</small>
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Zeitleiste links */}
          <div className="salon-cal-times">
            {timeSlots.map((ts) => (
              <div key={ts}>{ts}</div>
            ))}
          </div>

          {/* Spalten je Stylist */}
          {activeStaff.map((st) => {
            const staffAppointments = appointments.filter(
              (a) => a.staffId === st.id && a.status !== "canceled"
            );

            return (
              <div key={st.id} className="salon-cal-col">
                {timeSlots.map((ts) => (
                  <button
                    key={ts}
                    type="button"
                    className="salon-cal-cell"
                    onClick={() => handleOpenSlot(st.id, ts)}
                    title={s("calendar.bookFreeSlot", { time: ts, name: st.name })}
                    aria-label={s("calendar.bookFreeSlot", { time: ts, name: st.name })}
                  />
                ))}

                {/* Termine in dieser Spalte absolut positionieren */}
                {staffAppointments.map((app) => {
                  const startM = timeToMinutes(app.startTime);
                  const baseM = START_HOUR * 60;
                  const topPx = ((startM - baseM) / 30) * 52;
                  const heightPx = Math.max(34, (app.durationMinutes / 30) * 52);

                  return (
                    <button
                      key={app.id}
                      type="button"
                      className={`salon-appt ${app.status}`}
                      style={{ top: `${topPx}px`, height: `${heightPx}px`, ...(st.colorHex ? { borderInlineStartColor: st.colorHex } : {}) }}
                      onClick={() => setSelectedApp(app)}
                      title={`${app.clientName} (${s("common.timeRange", { from: app.startTime, to: app.endTime })})`}
                    >
                      <span className="salon-appt-line">
                        <strong>{app.clientName}</strong>
                        <small>{app.startTime}</small>
                      </span>
                      <small className="muted">{app.serviceNames.join(", ")}</small>
                      {heightPx > 50 && (
                        <span className="salon-appt-line">
                          <span className={`pill ${app.status === "in_progress" ? "warn" : app.status === "completed" ? "pos" : ""}`}>
                            {s(`status.${app.status}`)}
                          </span>
                          <strong>{euro(app.totalCents)}</strong>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      {/* Dialog: Neuer Termin buchen */}
      {modalOpen && (
        <Dialog title={s("actions.newAppointment")} onClose={() => setModalOpen(false)} wide>
          <form onSubmit={handleSaveAppointment} className="salon-dialog stack">
            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

            <div className="grid form-grid">
              <Field label={s("common.stylist")} required>
                <select required value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
                  {staff.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.title})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={s("calendar.dateTime")} required>
                <div className="row gap">
                  <input type="date" required value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />
                  <input type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </div>
              </Field>

              {/* Kunde wählen oder neu eingeben */}
              <Field label={s("calendar.existingClient")}>
                <select
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
                  <option value="">{s("calendar.newClientOption")}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={s("calendar.clientName")} required>
                <input type="text" required placeholder={s("common.fullNamePlaceholder")} value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              </Field>

              <Field label={s("common.phone")}>
                <input type="tel" placeholder={s("common.phonePlaceholder")} value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
              </Field>
              <Field label={s("common.email")}>
                <input type="email" placeholder={s("common.emailPlaceholder")} value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
              </Field>

              {/* Dienstleistungen auswählen */}
              <Field label={s("calendar.chooseServices")} required wide>
                <div className="salon-picker">
                  {services.map((srv) => {
                    const checked = form.serviceIds.includes(srv.id);
                    return (
                      <label key={srv.id} className={checked ? "list-row active" : "list-row"}>
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
                        <span className="list-main">
                          <strong>{srv.name}</strong>
                          <small className="muted">({s("common.minutes", { n: srv.durationMinutes })})</small>
                        </span>
                        <strong>{euro(srv.priceCents)}</strong>
                      </label>
                    );
                  })}
                </div>
              </Field>

              <Field label={s("calendar.notes")} wide>
                <input type="text" placeholder={s("calendar.notesPlaceholder")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
            </div>

            <div className="actions">
              <button type="button" className="button" onClick={() => setModalOpen(false)}>
                {s("actions.cancel")}
              </button>
              <button type="submit" className="button primary">
                <CheckCircle size={17} /> {s("actions.save")}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Dialog: Termin-Details & Status ändern */}
      {selectedApp && (
        <Dialog title={selectedApp.clientName} onClose={() => setSelectedApp(null)}>
          <div className="salon-dialog stack">
            <p className="muted">
              {formatDay(selectedApp.day)} · {s("common.timeRange", { from: selectedApp.startTime, to: selectedApp.endTime })} ({s("common.minutes", { n: selectedApp.durationMinutes })})
            </p>

            <dl className="facts">
              <dt>{s("calendar.stylistLabel")}</dt>
              <dd>{selectedApp.staffName}</dd>
              {selectedApp.clientPhone && (
                <>
                  <dt>{s("calendar.phoneLabel")}</dt>
                  <dd>{selectedApp.clientPhone}</dd>
                </>
              )}
              <dt>{s("calendar.servicesLabel")}</dt>
              <dd>{selectedApp.serviceNames.join(", ")}</dd>
            </dl>

            <div className="salon-total">
              <span>{s("calendar.totalLabel")}</span>
              <strong>{euro(selectedApp.totalCents)}</strong>
            </div>

            {/* Status-Wechsler */}
            <div className="stack-sm">
              <small className="muted">{s("calendar.changeStatus")}</small>
              <div className="row wrap gap">
                <button
                  className={`button small-button ${selectedApp.status === "in_progress" ? "primary" : ""}`}
                  onClick={() => handleUpdateStatus(selectedApp.id, "in_progress")}
                >
                  <Play size={14} /> {s("status.in_progress")}
                </button>
                <button className="button small-button" onClick={() => handleUpdateStatus(selectedApp.id, "completed")}>
                  <CheckCircle size={14} /> {s("status.completed")}
                </button>
                <button className="button small-button danger" onClick={() => handleUpdateStatus(selectedApp.id, "canceled")}>
                  <X size={14} /> {s("status.canceled")}
                </button>
              </div>
            </div>

            {updateError && <p className="error" role="alert">{updateError}</p>}

            {/* Kassen-Abrechnung */}
            <div className="actions spread danger-zone">
              {deleteConfirmAppId === selectedApp.id ? (
                <div className="row gap">
                  <button
                    className="button danger small-button"
                    onClick={async () => {
                      try {
                        await api(`/salon/appointments/${selectedApp.id}`, { method: "DELETE" });
                        setSelectedApp(null);
                        setDeleteConfirmAppId(null);
                        await loadData();
                      } catch (err) {
                        setUpdateError(errorText(err));
                      }
                    }}
                  >
                    {s("actions.reallyDelete")}
                  </button>
                  <button className="button small-button" onClick={() => setDeleteConfirmAppId(null)}>
                    {s("actions.cancel")}
                  </button>
                </div>
              ) : (
                <button className="button danger" onClick={() => setDeleteConfirmAppId(selectedApp.id)}>
                  {s("actions.delete")}
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
                <Sparkles size={17} /> {s("actions.checkout")}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
