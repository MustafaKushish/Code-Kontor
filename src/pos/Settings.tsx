import { useEffect, useState } from "react";
import { Plus, ShieldAlert, Store, Trash2 } from "lucide-react";
import { api } from "../api";
import { Field } from "../components";
import { MAIN_REGISTER, PAY_METHODS, type PosRegister, type PosSettings } from "../../shared/pos";
import { usePosI18n } from "./i18n";
import { usePosSettings } from "./PayPanel";
import { setDeviceRegister, useRegisters } from "./registers";

/** Einrichtung der Kasse: Zahlarten, Kleinunternehmer, Bon-Text, Druck, Kassenplätze, TSE. */
export function PosSettingsTab({ country }: { country: string }) {
  const { p, lang, posError } = usePosI18n();
  const [loaded, setLoaded] = usePosSettings();
  const [form, setForm] = useState<PosSettings | null>(loaded);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (loaded && !form) setForm(loaded);
  }, [loaded]);
  if (!form) return null;

  const set = (patch: Partial<PosSettings>) => (setForm({ ...form, ...patch }), setMessage(""));
  const toggle = (m: (typeof PAY_METHODS)[number]) => set({ methods: form.methods.includes(m) ? form.methods.filter((x) => x !== m) : [...form.methods, m] });

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const { settings } = await api<{ settings: PosSettings }>("/pos/settings", { method: "PUT", body: { settings: form } });
      setLoaded(settings);
      setForm(settings);
      setMessage(p("settings.saved"));
    } catch (e) {
      setError(posError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack pos-settings">
      <section className="card stack">
        <h2>{p("settings.methods")}</h2>
        <div className="row wrap gap">
          {PAY_METHODS.map((m) => (
            <label key={m} className="check">
              <input type="checkbox" checked={m === "cash" || form.methods.includes(m)} disabled={m === "cash"} onChange={() => toggle(m)} />
              <span>{p(`methods.${m}`)}</span>
            </label>
          ))}
        </div>
        <small className="muted">{p("settings.methodsHint")}</small>
      </section>

      <section className="card stack">
        <label className="check">
          <input type="checkbox" checked={form.directKiosk} onChange={(e) => set({ directKiosk: e.target.checked })} />
          <span>{p("settings.directKiosk")}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={form.smallBusiness} onChange={(e) => set({ smallBusiness: e.target.checked })} />
          <span>{p("settings.smallBusiness")}</span>
        </label>
        <Field label={p("settings.footer")}>
          <textarea rows={2} value={form.footer} placeholder={p("settings.footerPlaceholder")} onChange={(e) => set({ footer: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field-label">{p("settings.print")}</span>
          <div className="segmented three">
            {(["ask", "bon", "a4"] as const).map((v) => (
              <button type="button" key={v} className={form.print === v ? "active" : ""} onClick={() => set({ print: v })}>{p(`settings.printOptions.${v}`)}</button>
            ))}
          </div>
        </div>
      </section>

      <div className="row gap">
        <button className="button primary" disabled={busy} onClick={save}>{p("settings.save")}</button>
        {message && <span className="success-text">{message}</span>}
        {error && <span className="error">{error}</span>}
      </div>

      <RegistersSection />

      {country === "DE" && (
        <section className="card stack-sm">
          <h2><ShieldAlert size={18} aria-hidden /> {p("tse.title")}</h2>
          <p><strong>{p("tse.status")}</strong></p>
          <p className="muted">{p("tse.text")}</p>
        </section>
      )}
    </div>
  );
}

/** Kassenplätze anlegen, umbenennen, löschen; und festlegen, an welchem dieses Gerät steht. */
function RegistersSection() {
  const { p, posError } = usePosI18n();
  const { registers, current, reload } = useRegisters();
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const run = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
      await reload();
    } catch (e) {
      setError(posError(e));
    }
  };
  const rename = (r: PosRegister) => {
    const name = names[r.id]?.trim();
    if (!name || name === r.name) return;
    run(() => api(`/pos/registers/${r.id}`, { method: "PUT", body: { name } }));
  };
  const remove = (r: PosRegister) => {
    if (!confirm(p("registers.removeConfirm", { name: r.name }))) return;
    run(async () => {
      await api(`/pos/registers/${r.id}`, { method: "DELETE" });
      if (current.id === r.id) setDeviceRegister(MAIN_REGISTER.id);
    });
  };
  const add = () => run(() => api("/pos/registers", { method: "POST", body: { name: p("registers.newName", { n: registers.length + 1 }) } }));

  return (
    <section className="card stack">
      <h2><Store size={18} aria-hidden /> {p("registers.title")}</h2>
      <small className="muted">{p("registers.hint")}</small>
      {registers.map((r) => (
        <div key={r.id} className="pos-register-row">
          <input value={names[r.id] ?? r.name} aria-label={p("registers.name")} maxLength={40}
            onChange={(e) => setNames({ ...names, [r.id]: e.target.value })} onBlur={() => rename(r)}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
          {r.id === MAIN_REGISTER.id
            ? <small className="muted">{p("registers.main")}</small>
            : <button className="icon-button" aria-label={p("registers.remove")} onClick={() => remove(r)}><Trash2 size={16} /></button>}
        </div>
      ))}
      <button className="text-button" onClick={add}><Plus size={16} /> {p("registers.add")}</button>
      {registers.length > 1 && (
        <Field label={p("registers.device")} hint={p("registers.deviceHint")}>
          <select value={current.id} onChange={(e) => setDeviceRegister(e.target.value)}>
            {registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
