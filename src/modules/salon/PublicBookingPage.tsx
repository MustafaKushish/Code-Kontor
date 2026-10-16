import { useEffect, useState } from "react";
import { Scissors, Clock, Calendar, CheckCircle2, User, Phone, Mail, ArrowRight, ArrowLeft, Sparkles, MapPin } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import type { SalonService, SalonSettings, SalonStaff } from "../../../shared/salon";
import { useSalonI18n } from "./i18n";
import "./salon.css";

export default function PublicBookingPage({ tenantId }: { tenantId: string }) {
  const { s, euro, day: formatDay } = useSalonI18n();
  const [settings, setSettings] = useState<SalonSettings | null>(null);
  const [services, setServices] = useState<SalonService[]>([]);
  const [staff, setStaff] = useState<SalonStaff[]>([]);
  const [loading, setLoading] = useState(true);

  // Buchungsschritte: 1 = Services, 2 = Stylist, 3 = Datum & Slot, 4 = Kontaktdaten, 5 = Bestätigt
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  );
  const [freeSlots, setFreeSlots] = useState<{ time: string; staffId: string; staffName: string }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{ time: string; staffId: string; staffName: string } | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [bookingLoading, setBookingLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    api<{ settings: SalonSettings; services: SalonService[]; staff: SalonStaff[] }>(
      `/salon/public/${tenantId}/info`
    )
      .then((d) => {
        setSettings(d.settings);
        setServices(d.services);
        setStaff(d.staff);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  const chosenServices = services.filter((s) => selectedServiceIds.includes(s.id));
  const totalDuration = chosenServices.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalCents = chosenServices.reduce((sum, s) => sum + s.priceCents, 0);

  // Freie Slots laden, wenn Datum oder Stylist sich ändert
  useEffect(() => {
    if (step === 3 && selectedDate && totalDuration > 0) {
      const url = `/salon/public/${tenantId}/slots?day=${selectedDate}&duration=${totalDuration}${
        selectedStaffId ? `&staffId=${selectedStaffId}` : ""
      }`;
      api<{ slots: { time: string; staffId: string; staffName: string }[] }>(url)
        .then((res) => setFreeSlots(res.slots))
        .catch(() => setFreeSlots([]));
    }
  }, [step, selectedDate, selectedStaffId, totalDuration]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !clientName.trim() || !clientPhone.trim()) return;

    setBookingLoading(true);
    setErrorMsg("");

    try {
      await api(`/salon/public/${tenantId}/book`, {
        method: "POST",
        body: {
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          clientEmail: clientEmail.trim(),
          staffId: selectedSlot.staffId,
          staffName: selectedSlot.staffName,
          serviceIds: chosenServices.map((s) => s.id),
          serviceNames: chosenServices.map((s) => s.name),
          day: selectedDate,
          startTime: selectedSlot.time,
          durationMinutes: totalDuration,
          totalCents,
          notes,
        },
      });
      setStep(5);
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim Buchen des Termins");
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)" }}>
        <p className="muted">Lade Buchungsportal...</p>
      </div>
    );
  }

  return (
    <div className="salon" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)", padding: "20px 16px 40px" }}>
      <div style={{ maxWidth: "620px", margin: "0 auto", display: "grid", gap: "20px" }}>
        {/* Salon Kopfzeile */}
        <header style={{ textAlign: "center", display: "grid", gap: "6px", paddingBlock: "10px 14px" }}>
          <div style={{ display: "inline-grid", placeItems: "center", width: "52px", height: "52px", borderRadius: "18px", background: "color-mix(in srgb, var(--accent) 15%, var(--panel))", color: "var(--accent)", margin: "0 auto 4px" }}>
            <Scissors size={26} />
          </div>
          <h1 style={{ fontSize: "1.8rem", margin: 0 }}>{settings?.salonName || "Salon & Beauty Studio"}</h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.95rem" }}>
            Online-Terminreservierung · Schnell, unkompliziert & rund um die Uhr
          </p>
          {settings?.noticeText && (
            <p className="small muted" style={{ fontStyle: "italic", marginTop: "4px" }}>
              {settings.noticeText}
            </p>
          )}
        </header>

        {/* Schritt 1: Dienstleistung wählen */}
        {step === 1 && (
          <div className="card stack">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.2rem", margin: 0 }}>1. Dienstleistung auswählen</h2>
              <span className="small muted">Schritt 1 von 4</span>
            </div>

            <div style={{ display: "grid", gap: "8px" }}>
              {services.map((srv) => {
                const isSelected = selectedServiceIds.includes(srv.id);
                return (
                  <div
                    key={srv.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedServiceIds(selectedServiceIds.filter((id) => id !== srv.id));
                      } else {
                        setSelectedServiceIds([...selectedServiceIds, srv.id]);
                      }
                    }}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "16px",
                      border: isSelected ? "2px solid var(--accent)" : "1px solid var(--line)",
                      background: isSelected ? "color-mix(in srgb, var(--accent) 8%, var(--panel))" : "var(--panel)",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: "1rem", display: "block" }}>{srv.name}</strong>
                      <span className="small muted" style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                        <Clock size={13} /> {srv.durationMinutes} Minuten
                      </span>
                    </div>
                    <div style={{ textAlign: "end" }}>
                      <strong style={{ fontSize: "1.15rem", color: "var(--accent)" }}>{euro(srv.priceCents)}</strong>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedServiceIds.length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: "14px", marginTop: "8px" }}>
                <div>
                  <span className="muted small">Gesamt:</span>
                  <div>
                    <strong>{euro(totalCents)}</strong> ({totalDuration} Min)
                  </div>
                </div>
                <button className="button primary" onClick={() => setStep(2)}>
                  Weiter zur Stylistenauswahl <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Schritt 2: Stylist wählen */}
        {step === 2 && (
          <div className="card stack">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.2rem", margin: 0 }}>2. Wunsch-Stylist wählen</h2>
              <span className="small muted">Schritt 2 von 4</span>
            </div>

            <div style={{ display: "grid", gap: "8px" }}>
              <div
                onClick={() => setSelectedStaffId("")}
                style={{
                  padding: "14px 16px",
                  borderRadius: "16px",
                  border: selectedStaffId === "" ? "2px solid var(--accent)" : "1px solid var(--line)",
                  background: selectedStaffId === "" ? "color-mix(in srgb, var(--accent) 8%, var(--panel))" : "var(--panel)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--panel-2)", display: "grid", placeItems: "center" }}>
                  <Sparkles size={18} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <strong style={{ display: "block" }}>Keine Präferenz</strong>
                  <span className="small muted">Schnellster verfügbarer Termin bei einem Teammitglied</span>
                </div>
              </div>

              {staff.map((st) => {
                const isSelected = selectedStaffId === st.id;
                return (
                  <div
                    key={st.id}
                    onClick={() => setSelectedStaffId(st.id)}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "16px",
                      border: isSelected ? "2px solid var(--accent)" : "1px solid var(--line)",
                      background: isSelected ? "color-mix(in srgb, var(--accent) 8%, var(--panel))" : "var(--panel)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        backgroundColor: st.colorHex || "var(--accent)",
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 700,
                      }}
                    >
                      {st.name.slice(0, 1)}
                    </div>
                    <div>
                      <strong style={{ display: "block" }}>{st.name}</strong>
                      <span className="small muted">{st.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
              <button className="button" onClick={() => setStep(1)}>
                <ArrowLeft size={16} /> Zurück
              </button>
              <button className="button primary" onClick={() => setStep(3)}>
                Weiter zum Datum <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Schritt 3: Datum & freier Zeitslot */}
        {step === 3 && (
          <div className="card stack">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.2rem", margin: 0 }}>3. Datum & Uhrzeit wählen</h2>
              <span className="small muted">Schritt 3 von 4</span>
            </div>

            <Field label="Tag auswählen">
              <input
                type="date"
                className="input"
                min={new Date().toISOString().slice(0, 10)}
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSlot(null);
                }}
              />
            </Field>

            <span className="small muted">Freie Termine am {formatDay(selectedDate)}:</span>

            {freeSlots.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", background: "var(--panel-2)", borderRadius: "14px" }}>
                <p className="muted" style={{ margin: 0 }}>
                  Für diesen Tag sind leider keine freien Termine verfügbar. Bitte wählen Sie ein anderes Datum.
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: "8px", maxHeight: "240px", overflowY: "auto" }}>
                {freeSlots.map((slot, i) => {
                  const isChosen = selectedSlot?.time === slot.time && selectedSlot?.staffId === slot.staffId;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      style={{
                        padding: "10px 8px",
                        borderRadius: "12px",
                        border: isChosen ? "2px solid var(--accent)" : "1px solid var(--line)",
                        background: isChosen ? "var(--accent)" : "var(--panel)",
                        color: isChosen ? "#fff" : "var(--ink)",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "grid",
                        gap: "2px",
                        textAlign: "center",
                      }}
                    >
                      <span style={{ fontSize: "1.05rem" }}>{slot.time}</span>
                      <small style={{ fontSize: "0.68rem", opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {slot.staffName}
                      </small>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
              <button className="button" onClick={() => setStep(2)}>
                <ArrowLeft size={16} /> Zurück
              </button>
              <button className="button primary" disabled={!selectedSlot} onClick={() => setStep(4)}>
                Weiter zu Ihren Daten <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Schritt 4: Kontaktdaten & Bestätigen */}
        {step === 4 && (
          <div className="card stack">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "1.2rem", margin: 0 }}>4. Ihre Kontaktdaten</h2>
              <span className="small muted">Schritt 4 von 4</span>
            </div>

            {/* Zusammenfassung */}
            <div style={{ background: "var(--panel-2)", padding: "14px", borderRadius: "14px", display: "grid", gap: "6px", fontSize: "0.9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Termin:</span>
                <strong>{formatDay(selectedDate)} um {selectedSlot?.time} Uhr</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Stylist:</span>
                <strong>{selectedSlot?.staffName}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Dienstleistungen:</span>
                <strong>{chosenServices.map((s) => s.name).join(", ")}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: "6px", fontSize: "1.05rem" }}>
                <span>Geschätzter Preis:</span>
                <strong style={{ color: "var(--accent)" }}>{euro(totalCents)}</strong>
              </div>
            </div>

            {errorMsg && <div className="notice warning">{errorMsg}</div>}

            <form onSubmit={handleBook} className="stack">
              <Field label="Ihr vollständiger Name" required>
                <input
                  type="text"
                  required
                  className="input"
                  placeholder="Vor- und Nachname"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </Field>

              <Field label="Ihre Telefonnummer (für Rückfragen/Terminerinnerung)" required>
                <input
                  type="tel"
                  required
                  className="input"
                  placeholder="+49 171 1234567"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                />
              </Field>

              <Field label="Ihre E-Mail-Adresse">
                <input
                  type="email"
                  className="input"
                  placeholder="name@beispiel.de"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                />
              </Field>

              <Field label="Anmerkungen an den Salon (optional)">
                <input
                  type="text"
                  className="input"
                  placeholder="z.B. Wünsche, Haarlänge, Allergien..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--line)", paddingTop: "14px" }}>
                <button type="button" className="button" onClick={() => setStep(3)}>
                  <ArrowLeft size={16} /> Zurück
                </button>
                <button type="submit" className="button primary" disabled={bookingLoading}>
                  <CheckCircle2 size={17} /> {bookingLoading ? "Wird gebucht..." : "Verbindlich reservieren"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Schritt 5: Erfolgreich gebucht! */}
        {step === 5 && (
          <div className="card stack" style={{ textAlign: "center", padding: "36px 20px" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "var(--success-soft)", color: "var(--success)", display: "grid", placeItems: "center", margin: "0 auto" }}>
              <CheckCircle2 size={36} />
            </div>
            <h2 style={{ fontSize: "1.6rem", margin: "8px 0 0" }}>Termin erfolgreich reserviert!</h2>
            <p className="muted" style={{ maxWidth: "40ch", margin: "0 auto" }}>
              Vielen Dank, <strong>{clientName}</strong>! Ihr Termin wurde verbindlich im Salon hinterlegt.
            </p>

            <div style={{ background: "var(--panel-2)", padding: "18px", borderRadius: "16px", maxWidth: "400px", margin: "16px auto", textAlign: "start", display: "grid", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Datum:</span>
                <strong>{formatDay(selectedDate)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Uhrzeit:</span>
                <strong>{selectedSlot?.time} Uhr</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Stylist:</span>
                <strong>{selectedSlot?.staffName}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Dauer:</span>
                <strong>ca. {totalDuration} Minuten</strong>
              </div>
            </div>

            <p className="small muted">
              Wir freuen uns auf Ihren Besuch im {settings?.salonName || "Salon"}!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
