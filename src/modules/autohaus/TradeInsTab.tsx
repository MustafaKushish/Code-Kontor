import { useState, type FormEvent } from "react";
import { Ban, Check, PackagePlus, Plus, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { navigate } from "../../router";
import { Dialog } from "../../pos/ui";
import type { TradeIn } from "../../../shared/autohaus";
import type { TabProps } from "./AutohausApp";
import { BASE, errorText, euro, km, monthLabel, TradeStatusPill, sym } from "./parts";

export function TradeInsTab({ tradeIns, contracts, reload }: TabProps) {
  const [editing, setEditing] = useState<TradeIn | "new" | null>(null);
  const [error, setError] = useState("");

  const act = async (path: string, method = "POST") => {
    setError("");
    try {
      await api(path, { method });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <p className="muted autohaus-hint">Bewerte das Fahrzeug des Kunden. Im Kaufvertrag wird der Betrag dann vom Kaufpreis abgezogen.</p>
        <button className="button primary push-end" onClick={() => setEditing("new")}><Plus size={18} /> Fahrzeug bewerten</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="card list-card">
        {tradeIns.length === 0 && <p className="empty muted">Noch keine Inzahlungnahmen.</p>}
        {tradeIns.map((t) => {
          const contract = contracts.find((c) => c.id === t.contractId);
          return (
            <div key={t.id} className="list-row autohaus-trade">
              <button className="list-main autohaus-plain" onClick={() => t.status === "bewertet" && setEditing(t)} disabled={t.status !== "bewertet"}>
                <strong>{t.make} {t.model}{t.licensePlate ? ` · ${t.licensePlate}` : ""}</strong>
                <small className="muted">{[t.firstRegistration ? `EZ ${monthLabel(t.firstRegistration)}` : "", km(t.mileage), t.ownerName].filter(Boolean).join(" · ")}</small>
                {t.damages && <small className="muted">Schäden: {t.damages}</small>}
                {contract && <small className="muted">Im Kaufvertrag {contract.contractNumber}</small>}
              </button>
              <span className="row gap autohaus-trade-actions">
                <strong className="autohaus-num">{euro(t.offeredPrice)}</strong>
                <TradeStatusPill status={t.status} />
                {t.status === "angenommen" && !t.vehicleId && (
                  <button className="button small-button" onClick={() => act(`/autohaus/tradeins/${t.id}/stock`)}><PackagePlus size={15} /> In den Bestand</button>
                )}
                {t.vehicleId && <button className="text-button" onClick={() => navigate(BASE)}>Im Bestand</button>}
                {t.status === "bewertet" && (
                  <>
                    <button className="icon-button" aria-label="Ablehnen" title="Kunde lehnt ab" onClick={() => act(`/autohaus/tradeins/${t.id}/reject`)}><Ban size={17} /></button>
                    <button className="icon-button danger" aria-label="Löschen" title="Löschen" onClick={() => act(`/autohaus/tradeins/${t.id}`, "DELETE")}><Trash2 size={17} /></button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </section>

      {editing && <TradeInForm tradeIn={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
    </div>
  );
}

function TradeInForm({ tradeIn, onClose, onSaved }: { tradeIn: TradeIn | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    make: tradeIn?.make ?? "",
    model: tradeIn?.model ?? "",
    firstRegistration: tradeIn?.firstRegistration ?? "",
    mileage: tradeIn ? String(tradeIn.mileage) : "",
    vin: tradeIn?.vin ?? "",
    licensePlate: tradeIn?.licensePlate ?? "",
    ownerName: tradeIn?.ownerName ?? "",
    ownerPhone: tradeIn?.ownerPhone ?? "",
    damages: tradeIn?.damages ?? "",
    offeredPrice: tradeIn ? String(tradeIn.offeredPrice) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/autohaus/tradeins", { method: "POST", body: { ...form, id: tradeIn?.id } });
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  };

  return (
    <Dialog title={tradeIn ? "Bewertung ändern" : "Fahrzeug bewerten"} onClose={onClose} wide>
      <form className="stack autohaus-dialog" onSubmit={submit}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="grid form-grid">
          <Field label="Marke" required>
            <input value={form.make} onChange={set("make")} required autoFocus={!tradeIn} />
          </Field>
          <Field label="Modell" required>
            <input value={form.model} onChange={set("model")} required />
          </Field>
          <Field label="Erstzulassung">
            <input type="month" value={form.firstRegistration} onChange={set("firstRegistration")} />
          </Field>
          <Field label="Kilometerstand">
            <input inputMode="numeric" value={form.mileage} onChange={set("mileage")} />
          </Field>
          <Field label="Fahrgestellnummer (FIN)">
            <input className="autohaus-mono" maxLength={17} value={form.vin} onChange={(e) => setForm((f) => ({ ...f, vin: e.target.value.toUpperCase() }))} />
          </Field>
          <Field label="Kennzeichen">
            <input value={form.licensePlate} onChange={(e) => setForm((f) => ({ ...f, licensePlate: e.target.value.toUpperCase() }))} />
          </Field>
          <Field label="Halter">
            <input value={form.ownerName} onChange={set("ownerName")} />
          </Field>
          <Field label="Telefon">
            <input type="tel" value={form.ownerPhone} onChange={set("ownerPhone")} />
          </Field>
          <Field label="Schäden und Mängel" wide>
            <textarea rows={3} value={form.damages} onChange={set("damages")} placeholder="z. B. Kratzer Stoßstange, Reifen 3 mm, Service überfällig" />
          </Field>
          <Field label={`Ankaufpreis (${sym()})`} required>
            <input inputMode="decimal" value={form.offeredPrice} onChange={set("offeredPrice")} required />
          </Field>
        </div>
        <div className="row gap autohaus-actions">
          <button type="button" className="button" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="button primary" disabled={saving}><Check size={18} /> {saving ? "Wird gespeichert …" : "Speichern"}</button>
        </div>
      </form>
    </Dialog>
  );
}
