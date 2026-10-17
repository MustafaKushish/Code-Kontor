import { useState, type FormEvent } from "react";
import { CalendarClock, Check, Mail, Phone, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { navigate } from "../../router";
import { Dialog } from "../../pos/ui";
import { LEAD_STATUS_LABEL, vehicleLabel, type Lead, type LeadStatus, type StockVehicle } from "../../../shared/autohaus";
import type { TabProps } from "./AutohausApp";
import { BASE, dateLabel, errorText, euro, LeadStatusPill, sym } from "./parts";

const PIPELINE: LeadStatus[] = ["neu", "kontaktiert", "probefahrt", "angebot"];
const SOURCES = ["Laufkundschaft", "Telefon", "E-Mail", "mobile.de", "AutoScout24", "Website", "Empfehlung"];

export function LeadsTab({ leads, vehicles, reload }: TabProps) {
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [editing, setEditing] = useState<Lead | "new" | null>(null);
  const [error, setError] = useState("");

  const q = search.trim().toLowerCase();
  const shown = leads.filter((l) => (showClosed ? !PIPELINE.includes(l.status) : PIPELINE.includes(l.status)) && (!q || [l.name, l.phone, l.email, l.vehicleLabel, l.source].some((s) => s.toLowerCase().includes(q))));
  const today = new Date().toISOString().slice(0, 10);

  const setStatus = async (lead: Lead, status: LeadStatus) => {
    try {
      await api(`/autohaus/leads/${lead.id}/status`, { method: "POST", body: { status } });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <label className="search">
          <Search size={18} />
          <input type="search" placeholder="Name, Telefon, Fahrzeug" aria-label="Interessenten suchen" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="chips" role="tablist">
          <button role="tab" aria-selected={!showClosed} className={!showClosed ? "chip active" : "chip"} onClick={() => setShowClosed(false)}>Offen</button>
          <button role="tab" aria-selected={showClosed} className={showClosed ? "chip active" : "chip"} onClick={() => setShowClosed(true)}>Abgeschlossen</button>
        </div>
        <button className="button primary push-end" onClick={() => setEditing("new")}><Plus size={18} /> Interessent</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {!showClosed ? (
        <div className="autohaus-board">
          {PIPELINE.map((status) => {
            const column = shown.filter((l) => l.status === status);
            return (
              <section key={status} className="autohaus-column">
                <div className="autohaus-column-head">
                  <strong>{LEAD_STATUS_LABEL[status]}</strong>
                  <span className="pill">{column.length}</span>
                </div>
                {column.length === 0 && <p className="empty muted">Niemand</p>}
                {column.map((l) => (
                  <article key={l.id} className="autohaus-lead">
                    <button className="autohaus-lead-main" onClick={() => setEditing(l)}>
                      <strong>{l.name}</strong>
                      {l.vehicleLabel && <small>{l.vehicleLabel}</small>}
                      <small className="muted">{[l.source, l.budget ? `bis ${euro(l.budget)}` : ""].filter(Boolean).join(" · ")}</small>
                      {l.nextContact && <small className={l.nextContact <= today ? "pill warn" : "muted"}>Melden bis {dateLabel(l.nextContact)}</small>}
                    </button>
                    <div className="autohaus-lead-actions">
                      {l.phone && <a className="icon-button" href={`tel:${l.phone}`} aria-label={`${l.name} anrufen`}><Phone size={16} /></a>}
                      {l.email && <a className="icon-button" href={`mailto:${l.email}`} aria-label={`${l.name} schreiben`}><Mail size={16} /></a>}
                      <select aria-label="Status ändern" value={l.status} onChange={(e) => setStatus(l, e.target.value as LeadStatus)}>
                        {Object.entries(LEAD_STATUS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                      </select>
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <section className="card list-card">
          {shown.length === 0 && <p className="empty muted">Noch keine abgeschlossenen Interessenten.</p>}
          {shown.map((l) => (
            <button key={l.id} className="list-row" onClick={() => setEditing(l)}>
              <span className="list-main">
                <strong>{l.name}</strong>
                <small className="muted">{[l.vehicleLabel, dateLabel(l.updatedAt)].filter(Boolean).join(" · ")}</small>
              </span>
              <LeadStatusPill status={l.status} />
            </button>
          ))}
        </section>
      )}

      {editing && <LeadForm lead={editing === "new" ? null : editing} vehicles={vehicles} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
    </div>
  );
}

function LeadForm({ lead, vehicles, onClose, onSaved }: { lead: Lead | null; vehicles: StockVehicle[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: lead?.name ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    vehicleId: lead?.vehicleId ?? "",
    source: lead?.source ?? "Laufkundschaft",
    status: lead?.status ?? ("neu" as LeadStatus),
    budget: lead?.budget ? String(lead.budget) : "",
    nextContact: lead?.nextContact ?? "",
    notes: lead?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const choices = vehicles.filter((v) => v.status !== "verkauft" || v.id === form.vehicleId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/autohaus/leads", { method: "POST", body: { ...form, id: lead?.id } });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api(`/autohaus/leads/${lead!.id}`, { method: "DELETE" });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Dialog title={lead ? lead.name : "Neuer Interessent"} onClose={onClose} wide>
      <form className="stack autohaus-dialog" onSubmit={submit}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="grid form-grid">
          <Field label="Name" required wide>
            <input value={form.name} onChange={set("name")} required autoFocus={!lead} />
          </Field>
          <Field label="Telefon">
            <input type="tel" value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="E-Mail">
            <input type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Interessiert an" wide>
            <select value={form.vehicleId} onChange={set("vehicleId")}>
              <option value="">Noch kein bestimmtes Fahrzeug</option>
              {choices.map((v) => <option key={v.id} value={v.id}>{vehicleLabel(v)} · {v.stockNumber}{v.price ? ` · ${euro(v.price)}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Quelle">
            <select value={form.source} onChange={set("source")}>
              {[...new Set([...SOURCES, form.source])].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={set("status")}>
              {Object.entries(LEAD_STATUS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          <Field label={`Budget (${sym()})`}>
            <input inputMode="decimal" value={form.budget} onChange={set("budget")} />
          </Field>
          <Field label="Wieder melden am">
            <input type="date" value={form.nextContact} onChange={set("nextContact")} />
          </Field>
          <Field label="Notizen" wide>
            <textarea rows={3} value={form.notes} onChange={set("notes")} />
          </Field>
        </div>
        <div className="row wrap gap autohaus-actions">
          {lead && (confirmDelete ? (
            <>
              <button type="button" className="button danger" onClick={remove}>Endgültig löschen</button>
              <button type="button" className="text-button" onClick={() => setConfirmDelete(false)}>Abbrechen</button>
            </>
          ) : (
            <button type="button" className="icon-button danger" aria-label="Interessent löschen" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /></button>
          ))}
          {lead?.vehicleId && <button type="button" className="button" onClick={() => navigate(`${BASE}/probefahrten/neu/${lead.vehicleId}/${lead.id}`)}><CalendarClock size={18} /> Probefahrt</button>}
          <button type="button" className="button push-end" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="button primary" disabled={saving}><Check size={18} /> {saving ? "Wird gespeichert …" : "Speichern"}</button>
        </div>
      </form>
    </Dialog>
  );
}
