import { useEffect, useState, type FormEvent } from "react";
import { CalendarPlus, Check, CircleStop, KeyRound, Play, X } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { navigate } from "../../router";
import { Dialog } from "../../pos/ui";
import { vehicleLabel, type Lead, type StockVehicle, type TestDrive } from "../../../shared/autohaus";
import type { TabProps } from "./AutohausApp";
import { BASE, DriveStatusPill, errorText, km, timeLabel } from "./parts";

export function TestDrivesTab({ drives, vehicles, leads, reload, preset }: TabProps) {
  const [planning, setPlanning] = useState<{ vehicleId: string; leadId: string } | null>(null);
  const [starting, setStarting] = useState<TestDrive | null>(null);
  const [finishing, setFinishing] = useState<TestDrive | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (preset !== null) setPlanning({ vehicleId: preset, leadId: location.pathname.split("/")[6] ?? "" });
  }, [preset]);

  const closePlanning = () => {
    setPlanning(null);
    if (preset !== null) navigate(`${BASE}/probefahrten`);
  };

  const open = drives.filter((d) => d.status === "geplant" || d.status === "unterwegs");
  const done = drives.filter((d) => d.status === "abgeschlossen" || d.status === "abgesagt").reverse();
  const list = showDone ? done : open;

  const cancel = async (d: TestDrive) => {
    try {
      await api(`/autohaus/testdrives/${d.id}/cancel`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="chips" role="tablist">
          <button role="tab" aria-selected={!showDone} className={!showDone ? "chip active" : "chip"} onClick={() => setShowDone(false)}>Anstehend <span className="autohaus-count">{open.length}</span></button>
          <button role="tab" aria-selected={showDone} className={showDone ? "chip active" : "chip"} onClick={() => setShowDone(true)}>Erledigt <span className="autohaus-count">{done.length}</span></button>
        </div>
        <button className="button primary push-end" onClick={() => setPlanning({ vehicleId: "", leadId: "" })}><CalendarPlus size={18} /> Probefahrt planen</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="card list-card">
        {list.length === 0 && <p className="empty muted">{showDone ? "Noch keine erledigten Probefahrten." : "Keine Probefahrten geplant."}</p>}
        {list.map((d) => (
          <div key={d.id} className="list-row autohaus-drive">
            <span className="autohaus-drive-time">
              <strong>{timeLabel(d.scheduledAt)}</strong>
              <small className="muted">{d.durationMin} Min.</small>
            </span>
            <span className="list-main">
              <strong>{d.customerName}</strong>
              <small className="muted">
                {d.vehicleLabel}
                {d.mileageEnd !== null && d.mileageStart !== null ? ` · ${km(d.mileageEnd - d.mileageStart)} gefahren` : ""}
              </small>
              {d.licenseNumber && <small className="muted">Führerschein {d.licenseNumber}</small>}
            </span>
            <span className="row gap autohaus-drive-actions">
              <DriveStatusPill status={d.status} />
              {d.status === "geplant" && (
                <>
                  <button className="button small-button" onClick={() => setStarting(d)}><Play size={15} /> Losfahren</button>
                  <button className="icon-button" aria-label="Probefahrt absagen" title="Absagen" onClick={() => cancel(d)}><X size={17} /></button>
                </>
              )}
              {d.status === "unterwegs" && <button className="button primary small-button" onClick={() => setFinishing(d)}><CircleStop size={15} /> Zurück</button>}
            </span>
          </div>
        ))}
      </section>

      {planning && <PlanForm vehicles={vehicles} leads={leads} initial={planning} onClose={closePlanning} onSaved={async () => { closePlanning(); await reload(); }} />}
      {starting && <StartForm drive={starting} onClose={() => setStarting(null)} onDone={async () => { setStarting(null); await reload(); }} />}
      {finishing && <FinishForm drive={finishing} onClose={() => setFinishing(null)} onDone={async () => { setFinishing(null); await reload(); }} />}
    </div>
  );
}

function nextSlot(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PlanForm({ vehicles, leads, initial, onClose, onSaved }: { vehicles: StockVehicle[]; leads: Lead[]; initial: { vehicleId: string; leadId: string }; onClose: () => void; onSaved: () => void }) {
  const lead = leads.find((l) => l.id === initial.leadId);
  const [form, setForm] = useState({
    vehicleId: initial.vehicleId,
    leadId: lead?.id ?? "",
    customerName: lead?.name ?? "",
    customerPhone: lead?.phone ?? "",
    licenseNumber: "",
    scheduledAt: nextSlot(),
    durationMin: "30",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const available = vehicles.filter((v) => v.status !== "verkauft");
  const openLeads = leads.filter((l) => l.status !== "gewonnen" && l.status !== "verloren");

  const pickLead = (id: string) => {
    const l = leads.find((x) => x.id === id);
    setForm((f) => ({ ...f, leadId: id, customerName: l?.name ?? f.customerName, customerPhone: l?.phone ?? f.customerPhone, vehicleId: f.vehicleId || l?.vehicleId || "" }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/autohaus/testdrives", { method: "POST", body: form });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  return (
    <Dialog title="Probefahrt planen" onClose={onClose} wide>
      <form className="stack autohaus-dialog" onSubmit={submit}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="grid form-grid">
          <Field label="Fahrzeug" required wide>
            <select value={form.vehicleId} onChange={set("vehicleId")} required>
              <option value="">Fahrzeug wählen</option>
              {available.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)} · {v.stockNumber}{v.licensePlate ? ` · ${v.licensePlate}` : ""}</option>)}
            </select>
          </Field>
          {openLeads.length > 0 && (
            <Field label="Aus Interessenten übernehmen" wide>
              <select value={form.leadId} onChange={(e) => pickLead(e.target.value)}>
                <option value="">Neuer Kunde</option>
                {openLeads.map((l) => <option key={l.id} value={l.id}>{l.name}{l.vehicleLabel ? ` · ${l.vehicleLabel}` : ""}</option>)}
              </select>
            </Field>
          )}
          <Field label="Name" required>
            <input value={form.customerName} onChange={set("customerName")} required />
          </Field>
          <Field label="Telefon">
            <input type="tel" value={form.customerPhone} onChange={set("customerPhone")} />
          </Field>
          <Field label="Termin" required>
            <input type="datetime-local" value={form.scheduledAt} onChange={set("scheduledAt")} required />
          </Field>
          <Field label="Dauer">
            <select value={form.durationMin} onChange={set("durationMin")}>
              {[15, 30, 45, 60, 90, 120, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} Minuten` : `${m / 60} Std.`}</option>)}
            </select>
          </Field>
          <Field label="Führerscheinnummer" hint="Kannst du auch erst bei Abfahrt eintragen">
            <input value={form.licenseNumber} onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value.toUpperCase() }))} />
          </Field>
          <Field label="Notiz">
            <input value={form.notes} onChange={set("notes")} />
          </Field>
        </div>
        <div className="row gap autohaus-actions">
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="button primary" disabled={saving}><Check size={18} /> {saving ? "Wird gespeichert …" : "Einplanen"}</button>
        </div>
      </form>
    </Dialog>
  );
}

function StartForm({ drive, onClose, onDone }: { drive: TestDrive; onClose: () => void; onDone: () => void }) {
  const [license, setLicense] = useState(drive.licenseNumber);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(`/autohaus/testdrives/${drive.id}/start`, { method: "POST", body: { licenseNumber: license } });
      onDone();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Dialog title={`Probefahrt: ${drive.customerName}`} onClose={onClose}>
      <form className="stack autohaus-dialog" onSubmit={submit}>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="muted">{drive.vehicleLabel}</p>
        <Field label="Führerscheinnummer" required>
          <input value={license} onChange={(e) => setLicense(e.target.value.toUpperCase())} required autoFocus />
        </Field>
        <label className="check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>Führerschein im Original gesehen und gültig</span>
        </label>
        <p className="muted small">Der Kilometerstand bei Abfahrt wird aus dem Bestand übernommen.</p>
        <button type="submit" className="button primary block" disabled={!checked || !license.trim()}><KeyRound size={18} /> Schlüssel übergeben</button>
      </form>
    </Dialog>
  );
}

function FinishForm({ drive, onClose, onDone }: { drive: TestDrive; onClose: () => void; onDone: () => void }) {
  const [mileage, setMileage] = useState(String((drive.mileageStart ?? 0) + 10));
  const [notes, setNotes] = useState(drive.notes);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(`/autohaus/testdrives/${drive.id}/finish`, { method: "POST", body: { mileageEnd: Number(mileage), notes } });
      onDone();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Dialog title={`Rückgabe: ${drive.customerName}`} onClose={onClose}>
      <form className="stack autohaus-dialog" onSubmit={submit}>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="muted">{drive.vehicleLabel} · Abfahrt bei {km(drive.mileageStart ?? 0)}</p>
        <Field label="Kilometerstand bei Rückgabe" required>
          <input inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value)} required autoFocus />
        </Field>
        <Field label="Eindruck des Kunden / Schäden">
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" className="button primary block"><Check size={18} /> Probefahrt abschließen</button>
      </form>
    </Dialog>
  );
}
