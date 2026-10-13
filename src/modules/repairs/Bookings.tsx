import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarCheck, CalendarX, Check, ClipboardList, Copy, Link2, Plus, Settings2, Trash2, UserX, X } from "lucide-react";
import qrcode from "qrcode-generator";
import { api, ApiError } from "../../api";
import { Field, Link } from "../../components";
import { DEVICE_TYPES, type BookingInput, type BookingStatus, type RepairBooking, type RepairErrors, type RepairSettings } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { startIntake } from "./IntakeForm";
import { Dialog, deviceLabel } from "./parts";

const TONE: Record<BookingStatus, string> = { new: "warn", confirmed: "pos", declined: "neg", canceled: "neg", done: "", noShow: "neg" };
const localDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA");
};

/** Termine: Anfragen von der Buchungsseite bestätigen, selbst Termine eintragen, Gerät annehmen. */
export function BookingsTab({ tenantId, isManager }: { tenantId: string; isManager: boolean }) {
  const { r, day, repairError } = useRepairI18n();
  const [scope, setScope] = useState<"open" | "all">("open");
  const [list, setList] = useState<RepairBooking[] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<RepairBooking | "new" | null>(null);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = () => api<{ bookings: RepairBooking[] }>(`/repairs/bookings?scope=${scope}`).then((d) => setList(d.bookings)).catch((e) => setError(repairError(e)));
  useEffect(() => {
    load();
  }, [scope]);
  useEffect(() => {
    api<{ settings: RepairSettings }>("/repairs/settings").then((d) => setEnabled(d.settings.booking.enabled)).catch(() => setEnabled(null));
  }, []);

  const link = `${location.origin}/termin/${tenantId}`;
  const qr = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(link);
    q.make();
    return q.createDataURL(4, 1);
  }, [link]);

  const setStatus = async (b: RepairBooking, status: BookingStatus) => {
    if (status === "declined" && !confirm(r("bookings.declineConfirm", { name: b.name }))) return;
    setError("");
    setFlash("");
    try {
      const res = await api<{ booking: RepairBooking; mailed: boolean }>(`/repairs/bookings/${b.id}/status`, { method: "POST", body: { status } });
      if (res.mailed) setFlash(r("bookings.mailed", { name: b.name }));
      load();
    } catch (e) {
      setError(repairError(e));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt(r("bookings.link"), link);
    }
  };

  const today = localDay();
  const tomorrow = localDay(1);
  const label = (d: string) => (d === today ? r("bookings.today") : d === tomorrow ? r("bookings.tomorrow") : day(d, { weekday: "long", day: "2-digit", month: "2-digit" }));
  const groups = new Map<string, RepairBooking[]>();
  for (const b of list ?? []) groups.set(b.day, [...(groups.get(b.day) ?? []), b]);

  return (
    <div className="stack">
      {enabled === false && (
        <p className="notice planned-row"><Settings2 size={16} /> <span>{r("bookings.off")}</span>
          {isManager && <Link to="/app/handy-it/einstellungen" className="button small-button">{r("bookings.turnOn")}</Link>}
        </p>
      )}
      {enabled && (
        <section className="status-link">
          <img src={qr} alt="" width={96} height={96} />
          <div className="stack-sm">
            <strong><Link2 size={15} /> {r("bookings.link")}</strong>
            <a href={link} target="_blank" rel="noreferrer" className="muted small break">{link}</a>
            <small className="muted">{r("bookings.linkHint")}</small>
            <button className="button" onClick={copy}>{copied ? <><Check size={16} /> {r("order.copied")}</> : <><Copy size={16} /> {r("order.copyLink")}</>}</button>
          </div>
        </section>
      )}
      <div className="row wrap gap">
        <div className="chips" role="tablist">
          {(["open", "all"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={scope === s} className={scope === s ? "chip active" : "chip"} onClick={() => setScope(s)}>{r(`bookings.scope.${s}`)}</button>
          ))}
        </div>
        <button className="button primary push-end" onClick={() => setEditing("new")}><Plus size={18} /> {r("bookings.add")}</button>
      </div>
      {error && <p className="error">{error}</p>}
      {flash && <p className="notice success"><Check size={17} /> {flash}</p>}
      {list && list.length === 0 && <section className="card"><p className="empty muted">{r("bookings.empty")}</p></section>}
      {[...groups.entries()].map(([d, items]) => (
        <section key={d} className="card list-card">
          <h3 className={d < today ? "error" : ""}>{label(d)}</h3>
          {items.map((b) => (
            <div key={b.id} className="booking-row">
              <button className="list-row plain-button" onClick={() => setEditing(b)}>
                <span className="booking-time">{b.time}</span>
                <span className="list-main">
                  <strong>{b.name}{b.source === "online" && <small className="muted"> · {r("bookings.online")}</small>}</strong>
                  <small className="muted">{[deviceLabel(b.device) !== "–" ? deviceLabel(b.device) : r(`devices.${b.device.type}`), b.problem].filter(Boolean).join(" · ")}</small>
                </span>
                <span className={`pill ${TONE[b.status]}`}>{r(`booking.status.${b.status}`)}</span>
              </button>
              <div className="row wrap gap booking-actions">
                {b.status === "new" && <button className="button small-button primary" onClick={() => setStatus(b, "confirmed")}><CalendarCheck size={15} /> {r("bookings.confirm")}</button>}
                {b.status === "new" && <button className="button small-button" onClick={() => setStatus(b, "declined")}><CalendarX size={15} /> {r("bookings.decline")}</button>}
                {(b.status === "new" || b.status === "confirmed") && (
                  <button className="button small-button" onClick={() => startIntake({ bookingId: b.id, customer: { name: b.name, phone: b.phone, email: b.email }, device: b.device, problem: b.problem, lang: b.lang })}>
                    <ClipboardList size={15} /> {r("bookings.intake")}
                  </button>
                )}
                {b.status === "confirmed" && d <= today && <button className="button small-button" onClick={() => setStatus(b, "noShow")}><UserX size={15} /> {r("bookings.noShow")}</button>}
                {b.status === "done" && b.orderId && <Link to={`/app/handy-it/auftrag/${b.orderId}`} className="button small-button">#{b.orderNumber}</Link>}
              </div>
            </div>
          ))}
        </section>
      ))}
      {editing && (
        <BookingDialog
          booking={editing === "new" ? null : editing}
          isManager={isManager}
          onClose={() => setEditing(null)}
          onSaved={() => (setEditing(null), load())}
          onStatus={(b, s) => (setEditing(null), setStatus(b, s))}
        />
      )}
    </div>
  );
}

function BookingDialog({ booking, isManager, onClose, onSaved, onStatus }: {
  booking: RepairBooking | null; isManager: boolean; onClose: () => void; onSaved: () => void; onStatus: (b: RepairBooking, s: BookingStatus) => void;
}) {
  const { r, lang, repairError } = useRepairI18n();
  const [form, setForm] = useState<BookingInput>(booking ? { ...booking } : {
    day: localDay(), time: "", name: "", phone: "", email: "", device: { type: "phone", brand: "", model: "" }, problem: "", lang,
  });
  const [errors, setErrors] = useState<RepairErrors>({});
  const [error, setError] = useState("");
  const set = (patch: Partial<BookingInput>) => setForm((f) => ({ ...f, ...patch }));
  const setDevice = (patch: Partial<BookingInput["device"]>) => setForm((f) => ({ ...f, device: { ...f.device, ...patch } }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setErrors({});
    try {
      await api(booking ? `/repairs/bookings/${booking.id}` : "/repairs/bookings", { method: booking ? "PUT" : "POST", body: form });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors as RepairErrors);
      setError(repairError(err));
    }
  };
  const remove = async () => {
    if (!booking || !confirm(r("bookings.removeConfirm"))) return;
    try {
      await api(`/repairs/bookings/${booking.id}`, { method: "DELETE" });
      onSaved();
    } catch (err) {
      setError(repairError(err));
    }
  };
  const fieldError = (key: keyof RepairErrors) => (errors[key] ? r(`intake.errors.${key}`) : undefined);
  const active = booking && (booking.status === "new" || booking.status === "confirmed");

  return (
    <Dialog title={booking ? booking.name : r("bookings.add")} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        {error && <p className="error">{error}</p>}
        <div className="grid form-grid">
          <Field label={r("booking.day")} error={errors.slot ? r("booking.pickSlot") : undefined}><input type="date" value={form.day} onChange={(e) => set({ day: e.target.value })} /></Field>
          <Field label={r("booking.time")}><input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} /></Field>
          <Field label={r("intake.name")} error={fieldError("customerName")}><input value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label={r("intake.phone")} error={fieldError("contact")}><input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label={r("intake.email")} error={fieldError("email")}><input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label={r("intake.device")}>
            <select value={form.device.type} onChange={(e) => setDevice({ type: e.target.value as BookingInput["device"]["type"] })}>
              {DEVICE_TYPES.map((t) => <option key={t} value={t}>{r(`devices.${t}`)}</option>)}
            </select>
          </Field>
          <Field label={r("intake.brand")}><input value={form.device.brand} onChange={(e) => setDevice({ brand: e.target.value })} /></Field>
          <Field label={r("intake.model")}><input value={form.device.model} onChange={(e) => setDevice({ model: e.target.value })} /></Field>
          <Field label={r("booking.problem")} wide><textarea rows={2} value={form.problem} onChange={(e) => set({ problem: e.target.value })} /></Field>
        </div>
        <div className="row wrap gap">
          <button className="button primary"><Check size={17} /> {r("stock.save")}</button>
          {booking && active && <button type="button" className="button" onClick={() => onStatus(booking, "canceled")}><X size={16} /> {r("bookings.cancel")}</button>}
          {booking && isManager && <button type="button" className="button danger" onClick={remove}><Trash2 size={16} /> {r("bookings.remove")}</button>}
        </div>
      </form>
    </Dialog>
  );
}
