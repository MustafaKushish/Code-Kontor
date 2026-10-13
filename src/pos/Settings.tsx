import { useEffect, useState } from "react";
import { Plus, ShieldAlert, Trash2 } from "lucide-react";
import { api } from "../api";
import { Field } from "../components";
import { formatRate, standardVat, vatChoices } from "../money";
import { PAY_METHODS, type PosSettings } from "../../shared/pos";
import { usePosI18n } from "./i18n";
import { usePosSettings } from "./PayPanel";
import { MoneyInput } from "./ui";

/** Einrichtung der Kasse: Zahlarten, Schnellartikel, Kleinunternehmer, Bon-Text, Druck, TSE. */
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
        <h2>{p("settings.quick")}</h2>
        <small className="muted">{p("settings.quickHint")}</small>
        {form.quickItems.map((q, i) => (
          <div key={q.id} className="pos-quick-row">
            <input value={q.name} placeholder={p("settings.quickName")} aria-label={p("settings.quickName")}
              onChange={(e) => set({ quickItems: form.quickItems.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <MoneyInput cents={q.priceCents} onChange={(c) => c !== null && set({ quickItems: form.quickItems.map((x, j) => (j === i ? { ...x, priceCents: c } : x)) })} />
            <select value={q.vatRate} aria-label={p("sell.lineVat")} onChange={(e) => set({ quickItems: form.quickItems.map((x, j) => (j === i ? { ...x, vatRate: Number(e.target.value) } : x)) })}>
              {vatChoices(q.vatRate).map((v) => <option key={v} value={v}>{formatRate(v, lang)}</option>)}
            </select>
            <button className="icon-button" aria-label={p("sell.remove")} onClick={() => set({ quickItems: form.quickItems.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
          </div>
        ))}
        <button className="text-button" onClick={() => set({ quickItems: [...form.quickItems, { id: crypto.randomUUID(), name: "", priceCents: 0, vatRate: standardVat() }] })}>
          <Plus size={16} /> {p("settings.quickAdd")}
        </button>
      </section>

      <section className="card stack">
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
