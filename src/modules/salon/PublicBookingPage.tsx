import { useEffect, useState } from "react";
import { Scissors, Clock, CheckCircle2, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
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
      <div className="splash">
        <p className="muted">Lade Buchungsportal...</p>
      </div>
    );
  }

  return (
    <div className="salon-public">
      {/* Salon Kopfzeile */}
      <header className="salon-public-brand">
        <Scissors size={22} />
        <strong>{settings?.salonName || "Salon & Beauty Studio"}</strong>
      </header>

      <main className="stack">
        <section className="card stack-sm">
          <h1 className="display">Online-Terminreservierung</h1>
          <p className="muted">Schnell, unkompliziert & rund um die Uhr</p>
          {settings?.noticeText && <p className="notice">{settings.noticeText}</p>}
        </section>

        {/* Schritt 1: Dienstleistung wählen */}
        {step === 1 && (
          <section className="card stack">
            <div className="salon-steps">
              <h2>1. Dienstleistung auswählen</h2>
              <small className="muted">Schritt 1 von 4</small>
            </div>

            <div className="salon-choices">
              {services.map((srv) => {
                const isSelected = selectedServiceIds.includes(srv.id);
                return (
                  <button
                    key={srv.id}
                    type="button"
                    aria-pressed={isSelected}
                    className={isSelected ? "salon-choice active" : "salon-choice"}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedServiceIds(selectedServiceIds.filter((id) => id !== srv.id));
                      } else {
                        setSelectedServiceIds([...selectedServiceIds, srv.id]);
                      }
                    }}
                  >
                    <span className="list-main">
                      <strong>{srv.name}</strong>
                      <small className="muted"><Clock size={13} /> {srv.durationMinutes} Minuten</small>
                    </span>
                    <strong className="salon-price">{euro(srv.priceCents)}</strong>
                  </button>
                );
              })}
            </div>

            {selectedServiceIds.length > 0 && (
              <div className="salon-nav">
                <span className="stack-sm">
                  <small className="muted">Gesamt:</small>
                  <span><strong>{euro(totalCents)}</strong> ({totalDuration} Min)</span>
                </span>
                <button className="button primary" onClick={() => setStep(2)}>
                  Weiter zur Stylistenauswahl <ArrowRight size={17} className="flip-rtl" />
                </button>
              </div>
            )}
          </section>
        )}

        {/* Schritt 2: Stylist wählen */}
        {step === 2 && (
          <section className="card stack">
            <div className="salon-steps">
              <h2>2. Wunsch-Stylist wählen</h2>
              <small className="muted">Schritt 2 von 4</small>
            </div>

            <div className="salon-choices">
              <button
                type="button"
                aria-pressed={selectedStaffId === ""}
                className={selectedStaffId === "" ? "salon-choice active" : "salon-choice"}
                onClick={() => setSelectedStaffId("")}
              >
                <span className="salon-avatar" aria-hidden><Sparkles size={18} /></span>
                <span className="list-main">
                  <strong>Keine Präferenz</strong>
                  <small className="muted">Schnellster verfügbarer Termin bei einem Teammitglied</small>
                </span>
              </button>

              {staff.map((st) => {
                const isSelected = selectedStaffId === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    aria-pressed={isSelected}
                    className={isSelected ? "salon-choice active" : "salon-choice"}
                    onClick={() => setSelectedStaffId(st.id)}
                  >
                    <span className="salon-avatar" aria-hidden>{st.name.slice(0, 1)}</span>
                    <span className="list-main">
                      <strong>{st.name}</strong>
                      <small className="muted">{st.title}</small>
                    </span>
                    <span className="salon-dot" style={st.colorHex ? { background: st.colorHex } : undefined} />
                  </button>
                );
              })}
            </div>

            <div className="salon-nav">
              <button className="button" onClick={() => setStep(1)}>
                <ArrowLeft size={17} className="flip-rtl" /> Zurück
              </button>
              <button className="button primary" onClick={() => setStep(3)}>
                Weiter zum Datum <ArrowRight size={17} className="flip-rtl" />
              </button>
            </div>
          </section>
        )}

        {/* Schritt 3: Datum & freier Zeitslot */}
        {step === 3 && (
          <section className="card stack">
            <div className="salon-steps">
              <h2>3. Datum & Uhrzeit wählen</h2>
              <small className="muted">Schritt 3 von 4</small>
            </div>

            <Field label="Tag auswählen">
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSlot(null);
                }}
              />
            </Field>

            <small className="muted">Freie Termine am {formatDay(selectedDate)}:</small>

            {freeSlots.length === 0 ? (
              <p className="notice">
                Für diesen Tag sind leider keine freien Termine verfügbar. Bitte wählen Sie ein anderes Datum.
              </p>
            ) : (
              <div className="salon-slots">
                {freeSlots.map((slot, i) => {
                  const isChosen = selectedSlot?.time === slot.time && selectedSlot?.staffId === slot.staffId;
                  return (
                    <button key={i} type="button" className={isChosen ? "chip active" : "chip"} onClick={() => setSelectedSlot(slot)}>
                      <span>{slot.time}</span>
                      <small>{slot.staffName}</small>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="salon-nav">
              <button className="button" onClick={() => setStep(2)}>
                <ArrowLeft size={17} className="flip-rtl" /> Zurück
              </button>
              <button className="button primary" disabled={!selectedSlot} onClick={() => setStep(4)}>
                Weiter zu Ihren Daten <ArrowRight size={17} className="flip-rtl" />
              </button>
            </div>
          </section>
        )}

        {/* Schritt 4: Kontaktdaten & Bestätigen */}
        {step === 4 && (
          <section className="card stack">
            <div className="salon-steps">
              <h2>4. Ihre Kontaktdaten</h2>
              <small className="muted">Schritt 4 von 4</small>
            </div>

            {/* Zusammenfassung */}
            <div className="salon-summary stack-sm">
              <dl className="facts">
                <dt>Termin:</dt>
                <dd>{formatDay(selectedDate)} um {selectedSlot?.time} Uhr</dd>
                <dt>Stylist:</dt>
                <dd>{selectedSlot?.staffName}</dd>
                <dt>Dienstleistungen:</dt>
                <dd>{chosenServices.map((s) => s.name).join(", ")}</dd>
              </dl>
              <div className="salon-total">
                <span>Geschätzter Preis:</span>
                <strong>{euro(totalCents)}</strong>
              </div>
            </div>

            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

            <form onSubmit={handleBook} className="stack">
              <div className="grid form-grid">
                <Field label="Ihr vollständiger Name" required wide>
                  <input type="text" required placeholder="Vor- und Nachname" value={clientName} onChange={(e) => setClientName(e.target.value)} autoComplete="name" />
                </Field>

                <Field label="Ihre Telefonnummer (für Rückfragen/Terminerinnerung)" required wide>
                  <input type="tel" required placeholder="+49 171 1234567" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} autoComplete="tel" />
                </Field>

                <Field label="Ihre E-Mail-Adresse" wide>
                  <input type="email" placeholder="name@beispiel.de" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} autoComplete="email" />
                </Field>

                <Field label="Anmerkungen an den Salon (optional)" wide>
                  <input type="text" placeholder="z.B. Wünsche, Haarlänge, Allergien..." value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>

              <div className="salon-nav">
                <button type="button" className="button" onClick={() => setStep(3)}>
                  <ArrowLeft size={17} className="flip-rtl" /> Zurück
                </button>
                <button type="submit" className="button primary" disabled={bookingLoading}>
                  <CheckCircle2 size={18} /> {bookingLoading ? "Wird gebucht..." : "Verbindlich reservieren"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Schritt 5: Erfolgreich gebucht! */}
        {step === 5 && (
          <section className="card stack salon-done">
            <span className="salon-done-icon"><CheckCircle2 size={32} /></span>
            <h2 className="display">Termin erfolgreich reserviert!</h2>
            <p className="muted">
              Vielen Dank, <strong>{clientName}</strong>! Ihr Termin wurde verbindlich im Salon hinterlegt.
            </p>

            <div className="salon-summary">
              <dl className="facts">
                <dt>Datum:</dt>
                <dd>{formatDay(selectedDate)}</dd>
                <dt>Uhrzeit:</dt>
                <dd>{selectedSlot?.time} Uhr</dd>
                <dt>Stylist:</dt>
                <dd>{selectedSlot?.staffName}</dd>
                <dt>Dauer:</dt>
                <dd>ca. {totalDuration} Minuten</dd>
              </dl>
            </div>

            <p className="small muted">Wir freuen uns auf Ihren Besuch im {settings?.salonName || "Salon"}!</p>
          </section>
        )}
      </main>
    </div>
  );
}
