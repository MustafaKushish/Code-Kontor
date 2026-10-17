import { useEffect, useState } from "react";
import { Scissors, Clock, CheckCircle2, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { api, ApiError } from "../../api";
import { Field } from "../../components";
import type { SalonService, SalonSettings, SalonStaff } from "../../../shared/salon";

type PublicService = Pick<SalonService, "id" | "name" | "category" | "description" | "durationMinutes" | "priceCents">;
type PublicStaff = Pick<SalonStaff, "id" | "name" | "title" | "colorHex">;
interface Info {
  company: { name: string; phone: string };
  currency: string;
  today: string;
  lastDay: string;
  settings: Pick<SalonSettings, "salonName" | "openDays" | "openTime" | "closeTime" | "bookingAdvanceDays" | "cancellationHours" | "noticeText">;
  services: PublicService[];
  staff: PublicStaff[];
}
import { useSalonI18n } from "./i18n";
import "./salon.css";

export default function PublicBookingPage({ tenantId }: { tenantId: string }) {
  const { s, euro: money, day: formatDay, errorText } = useSalonI18n();
  const [info, setInfo] = useState<Info | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [loading, setLoading] = useState(true);
  const settings = info?.settings;
  const services = info?.services ?? [];
  const staff = info?.staff ?? [];
  const euro = (cents: number) => money(cents, info?.currency);

  // Buchungsschritte: 1 = Services, 2 = Stylist, 3 = Datum & Slot, 4 = Kontaktdaten, 5 = Bestätigt
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [freeSlots, setFreeSlots] = useState<{ time: string; staffId: string; staffName: string }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{ time: string; staffId: string; staffName: string } | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [bookingLoading, setBookingLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [website, setWebsite] = useState("");

  useEffect(() => {
    api<Info>(`/salon/public/${tenantId}/info`)
      .then((d) => {
        setInfo(d);
        setSelectedDate(d.today);
      })
      .catch(() => setInvalid(true))
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
  }, [step, selectedDate, selectedStaffId, totalDuration, tenantId]);

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
          serviceIds: chosenServices.map((s) => s.id),
          day: selectedDate,
          startTime: selectedSlot.time,
          notes,
          website,
        },
      });
      setStep(5);
    } catch (err) {
      // Zeit inzwischen vergeben: zurück zur Auswahl mit frischen Zeiten
      if (err instanceof ApiError && err.code === "salon.slotTaken") {
        setSelectedSlot(null);
        setStep(3);
      }
      setErrorMsg(errorText(err));
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="splash">
        <p className="muted">{s("booking.loading")}</p>
      </div>
    );
  }

  if (invalid || !info) {
    return (
      <div className="splash">
        <p className="muted">{s("booking.unavailable")}</p>
      </div>
    );
  }

  return (
    <div className="salon-public">
      {/* Salon Kopfzeile */}
      <header className="salon-public-brand">
        <Scissors size={22} />
        <strong>{info.company.name || settings?.salonName}</strong>
      </header>

      <main className="stack">
        <section className="card stack-sm">
          <h1 className="display">{s("booking.title")}</h1>
          <p className="muted">{s("booking.subtitle")}</p>
          {settings?.noticeText && <p className="notice">{settings.noticeText}</p>}
        </section>

        {/* Schritt 1: Dienstleistung wählen */}
        {step === 1 && (
          <section className="card stack">
            <div className="salon-steps">
              <h2>{s("booking.step1")}</h2>
              <small className="muted">{s("booking.stepOf", { n: 1 })}</small>
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
                      <small className="muted"><Clock size={13} /> {s("common.minutesLong", { n: srv.durationMinutes })}</small>
                    </span>
                    <strong className="salon-price">{euro(srv.priceCents)}</strong>
                  </button>
                );
              })}
            </div>

            {selectedServiceIds.length > 0 && (
              <div className="salon-nav">
                <span className="stack-sm">
                  <small className="muted">{s("booking.total")}</small>
                  <span><strong>{euro(totalCents)}</strong> ({s("common.minutes", { n: totalDuration })})</span>
                </span>
                <button className="button primary" onClick={() => setStep(2)}>
                  {s("booking.toStaff")} <ArrowRight size={17} className="flip-rtl" />
                </button>
              </div>
            )}
          </section>
        )}

        {/* Schritt 2: Stylist wählen */}
        {step === 2 && (
          <section className="card stack">
            <div className="salon-steps">
              <h2>{s("booking.step2")}</h2>
              <small className="muted">{s("booking.stepOf", { n: 2 })}</small>
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
                  <strong>{s("booking.noPreference")}</strong>
                  <small className="muted">{s("booking.noPreferenceHint")}</small>
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
                <ArrowLeft size={17} className="flip-rtl" /> {s("actions.back")}
              </button>
              <button className="button primary" onClick={() => setStep(3)}>
                {s("booking.toDate")} <ArrowRight size={17} className="flip-rtl" />
              </button>
            </div>
          </section>
        )}

        {/* Schritt 3: Datum & freier Zeitslot */}
        {step === 3 && (
          <section className="card stack">
            <div className="salon-steps">
              <h2>{s("booking.step3")}</h2>
              <small className="muted">{s("booking.stepOf", { n: 3 })}</small>
            </div>

            <Field label={s("booking.pickDay")}>
              <input
                type="date"
                min={info.today}
                max={info.lastDay}
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSlot(null);
                }}
              />
            </Field>

            <small className="muted">{s("booking.freeSlotsOn", { date: formatDay(selectedDate) })}</small>

            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

            {freeSlots.length === 0 ? (
              <p className="notice">
                {s("booking.noSlots")}
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
                <ArrowLeft size={17} className="flip-rtl" /> {s("actions.back")}
              </button>
              <button className="button primary" disabled={!selectedSlot} onClick={() => setStep(4)}>
                {s("booking.toContact")} <ArrowRight size={17} className="flip-rtl" />
              </button>
            </div>
          </section>
        )}

        {/* Schritt 4: Kontaktdaten & Bestätigen */}
        {step === 4 && (
          <section className="card stack">
            <div className="salon-steps">
              <h2>{s("booking.step4")}</h2>
              <small className="muted">{s("booking.stepOf", { n: 4 })}</small>
            </div>

            {/* Zusammenfassung */}
            <div className="salon-summary stack-sm">
              <dl className="facts">
                <dt>{s("booking.appointmentLabel")}</dt>
                <dd>{s("booking.appointmentValue", { date: formatDay(selectedDate), time: selectedSlot?.time ?? "" })}</dd>
                <dt>{s("booking.stylistLabel")}</dt>
                <dd>{selectedSlot?.staffName}</dd>
                <dt>{s("booking.servicesLabel")}</dt>
                <dd>{chosenServices.map((s) => s.name).join(", ")}</dd>
              </dl>
              <div className="salon-total">
                <span>{s("booking.estimatedPrice")}</span>
                <strong>{euro(totalCents)}</strong>
              </div>
            </div>

            {errorMsg && <p className="error" role="alert">{errorMsg}</p>}

            <form onSubmit={handleBook} className="stack">
              {/* Unsichtbar für Menschen, nur Bots füllen es aus */}
              <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden style={{ position: "absolute", left: "-9999px" }} />
              <div className="grid form-grid">
                <Field label={s("booking.fullName")} required wide>
                  <input type="text" required placeholder={s("common.fullNamePlaceholder")} value={clientName} onChange={(e) => setClientName(e.target.value)} autoComplete="name" />
                </Field>

                <Field label={s("booking.phone")} required wide>
                  <input type="tel" required placeholder={s("common.phonePlaceholder")} value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} autoComplete="tel" />
                </Field>

                <Field label={s("booking.email")} wide>
                  <input type="email" placeholder={s("booking.emailPlaceholder")} value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} autoComplete="email" />
                </Field>

                <Field label={s("booking.notes")} wide>
                  <input type="text" placeholder={s("booking.notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>

              <div className="salon-nav">
                <button type="button" className="button" onClick={() => setStep(3)}>
                  <ArrowLeft size={17} className="flip-rtl" /> {s("actions.back")}
                </button>
                <button type="submit" className="button primary" disabled={bookingLoading}>
                  <CheckCircle2 size={18} /> {bookingLoading ? s("booking.booking") : s("booking.book")}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Schritt 5: Erfolgreich gebucht! */}
        {step === 5 && (
          <section className="card stack salon-done">
            <span className="salon-done-icon"><CheckCircle2 size={32} /></span>
            <h2 className="display">{s("booking.doneTitle")}</h2>
            <p className="muted">{s("booking.doneThanks", { name: clientName })}</p>

            <div className="salon-summary">
              <dl className="facts">
                <dt>{s("booking.dateLabel")}</dt>
                <dd>{formatDay(selectedDate)}</dd>
                <dt>{s("booking.timeLabel")}</dt>
                <dd>{s("common.clock", { time: selectedSlot?.time ?? "" })}</dd>
                <dt>{s("booking.stylistLabel")}</dt>
                <dd>{selectedSlot?.staffName}</dd>
                <dt>{s("booking.durationLabel")}</dt>
                <dd>{s("booking.durationValue", { n: totalDuration })}</dd>
              </dl>
            </div>

            <p className="small muted">{s("booking.seeYou", { name: info.company.name || settings?.salonName || "" })}</p>
          </section>
        )}
      </main>
    </div>
  );
}
