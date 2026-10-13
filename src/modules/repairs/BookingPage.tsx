import { useEffect, useState, type FormEvent } from "react";
import { CalendarCheck, CalendarClock, CalendarX, Check, MapPin, Phone, Wrench } from "lucide-react";
import { api, ApiError } from "../../api";
import { Field } from "../../components";
import { navigate } from "../../router";
import { LanguageSwitch } from "../../layout/LanguageSwitch";
import { DEVICE_TYPES, type BookingStatus, type DeviceType, type RepairErrors } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { deviceLabel } from "./parts";
import "./repairs.css";

interface Company { name: string; phone: string; email: string; street: string; postalCode: string; city: string; logoDataUrl: string }
interface Setup { company: Company; note: string; slots: { day: string; times: string[] }[] }
interface Booked { company: Company; booking: { status: BookingStatus; day: string; time: string; name: string; device: { type: DeviceType; brand: string; model: string }; problem: string } }

/** Öffentliche Terminbuchung des Ladens, ohne Anmeldung. Mit Token: Ansicht des gebuchten Termins. */
export default function BookingPage({ tenantId, token }: { tenantId: string; token?: string }) {
  const { ready } = useRepairI18n();
  if (!ready) return null;
  return token ? <BookedView tenantId={tenantId} token={token} /> : <BookingForm tenantId={tenantId} />;
}

function Top({ company }: { company: Company | null }) {
  return (
    <header className="status-top">
      <div className="status-brand">
        {company?.logoDataUrl ? <img src={company.logoDataUrl} alt="" /> : <Wrench size={22} />}
        <strong>{company?.name}</strong>
      </div>
      <LanguageSwitch compact />
    </header>
  );
}

function Contact({ company }: { company: Company }) {
  const { r } = useRepairI18n();
  if (!company.phone && !company.street) return null;
  return (
    <section className="card stack-sm">
      {company.street && <p><MapPin size={16} /> {company.street}, {company.postalCode} {company.city}</p>}
      {company.phone && <a className="button" href={`tel:${company.phone.replace(/[^\d+]/g, "")}`}><Phone size={16} /> {r("public.contact")}: {company.phone}</a>}
    </section>
  );
}

function BookingForm({ tenantId }: { tenantId: string }) {
  const { r, lang, day: fmtDay } = useRepairI18n();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [type, setType] = useState<DeviceType>("phone");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [problem, setProblem] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<RepairErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api<Setup>(`/repair-status/booking/${tenantId}`).then((s) => {
    setSetup(s);
    setDay((d) => (s.slots.some((x) => x.day === d) ? d : s.slots[0]?.day ?? ""));
  }).catch(() => setInvalid(true));
  useEffect(() => {
    load();
  }, [tenantId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});
    try {
      const res = await api<{ token: string }>(`/repair-status/booking/${tenantId}`, {
        method: "POST", body: { day, time, name, phone, email, website, problem, lang, device: { type, brand, model } },
      });
      if (res.token) navigate(`/termin/${tenantId}/${res.token}`);
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors as RepairErrors);
      if (err instanceof ApiError && err.code === "repairs.slotTaken") {
        setError(r("errors.slotTaken"));
        setTime("");
        load();
      } else setError(err instanceof ApiError && err.errors ? r("booking.checkFields") : r("booking.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (invalid) return <div className="status-page"><p className="notice">{r("booking.off")}</p></div>;
  if (!setup) return <div className="splash"><img src="/icon.svg" alt="" width={56} height={56} /></div>;

  const times = setup.slots.find((s) => s.day === day)?.times ?? [];
  const fieldError = (key: keyof RepairErrors) => (errors[key] ? r(`intake.errors.${key}`) : undefined);

  return (
    <div className="status-page">
      <Top company={setup.company} />
      <main>
        <form className="stack" onSubmit={submit} noValidate>
          <section className="card stack status-hero">
            <h1 className="display">{r("booking.title")}</h1>
            <p className="muted">{r("booking.intro")}</p>
            {setup.note && <p className="notice pre-line">{setup.note}</p>}
          </section>

          <section className="card stack">
            <h2>{r("booking.device")}</h2>
            <div className="chips wrap">
              {DEVICE_TYPES.map((t) => <button type="button" key={t} className={type === t ? "chip active" : "chip"} onClick={() => setType(t)}>{r(`devices.${t}`)}</button>)}
            </div>
            <div className="grid form-grid">
              <Field label={r("intake.brand")}><input value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
              <Field label={r("intake.model")}><input value={model} onChange={(e) => setModel(e.target.value)} placeholder="iPhone 13" /></Field>
              <Field label={r("booking.problem")} wide><textarea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)}/></Field>
            </div>
          </section>

          <section className="card stack">
            <h2>{r("booking.when")}</h2>
            {setup.slots.length === 0 ? <p className="notice">{r("booking.noSlots")}</p> : (
              <>
                <div className="booking-days" role="listbox" aria-label={r("booking.day")}>
                  {setup.slots.map((s) => (
                    <button type="button" key={s.day} role="option" aria-selected={day === s.day} className={day === s.day ? "booking-day active" : "booking-day"} onClick={() => (setDay(s.day), setTime(""))}>
                      <small>{fmtDay(s.day, { weekday: "short" })}</small>
                      <strong>{fmtDay(s.day, { day: "numeric" })}</strong>
                      <small>{fmtDay(s.day, { month: "short" })}</small>
                    </button>
                  ))}
                </div>
                <div className="booking-times">
                  {times.map((t) => <button type="button" key={t} className={time === t ? "chip active" : "chip"} onClick={() => setTime(t)}>{t}</button>)}
                </div>
                {errors.slot && <p className="error">{r("booking.pickSlot")}</p>}
              </>
            )}
          </section>

          <section className="card stack">
            <h2>{r("booking.contact")}</h2>
            <div className="grid form-grid">
              <Field label={r("intake.name")} error={fieldError("customerName")}><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
              <Field label={r("intake.phone")} error={fieldError("contact")}><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></Field>
              <Field label={r("intake.email")} error={fieldError("email")} hint={r("booking.emailHint")}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
            </div>
            <input className="honeypot" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" name="website" />
            <p className="muted small">{r("booking.privacy", { company: setup.company.name })}</p>
          </section>

          {error && <p className="error" role="alert">{error}</p>}
          {day && time && <p className="notice"><CalendarClock size={17} /> {fmtDay(day, { weekday: "long", day: "numeric", month: "long" })}, {time}</p>}
          <button className="button primary block" disabled={busy || !day || !time}><CalendarCheck size={18} /> {r("booking.send")}</button>
        </form>
      </main>
      <Contact company={setup.company} />
    </div>
  );
}

function BookedView({ tenantId, token }: { tenantId: string; token: string }) {
  const { r, day } = useRepairI18n();
  const [data, setData] = useState<Booked | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = `/repair-status/booking/${tenantId}/${token}`;

  useEffect(() => {
    api<Booked>(url).then(setData).catch(() => setInvalid(true));
  }, [url]);

  if (invalid) return <div className="status-page"><p className="notice">{r("public.notFound")}</p></div>;
  if (!data) return <div className="splash"><img src="/icon.svg" alt="" width={56} height={56} /></div>;
  const b = data.booking;
  const active = b.status === "new" || b.status === "confirmed";

  const cancel = async () => {
    if (!confirm(r("booking.cancelConfirm"))) return;
    setBusy(true);
    try {
      setData(await api<Booked>(`${url}/cancel`, { method: "POST" }));
    } catch {
      // Status hat sich geändert: neu laden
      api<Booked>(url).then(setData).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="status-page">
      <Top company={data.company} />
      <main className="stack">
        <section className="card stack status-hero">
          <p className="muted">{r("booking.yourBooking")}</p>
          <h1 className="display">{day(b.day, { weekday: "long", day: "numeric", month: "long" })}, {b.time}</h1>
          <p className={`pill booking-status ${b.status === "confirmed" ? "pos" : b.status === "new" ? "warn" : "neg"}`}>
            {b.status === "confirmed" ? <Check size={14} /> : b.status === "new" ? <CalendarClock size={14} /> : <CalendarX size={14} />} {r(`booking.status.${b.status}`)}
          </p>
          <p className="status-text">{r(`booking.text.${b.status}`)}</p>
          {(b.device.brand || b.device.model) && <p className="muted">{deviceLabel(b.device)}{b.problem ? ` · ${b.problem}` : ""}</p>}
        </section>
        <div className="row wrap gap">
          {active && <button className="button" disabled={busy} onClick={cancel}><CalendarX size={17} /> {r("booking.cancel")}</button>}
          {!active && <button className="button primary" onClick={() => navigate(`/termin/${tenantId}`)}><CalendarCheck size={17} /> {r("booking.again")}</button>}
        </div>
        <Contact company={data.company} />
      </main>
    </div>
  );
}
