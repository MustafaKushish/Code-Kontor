import { formatRate, vatChoices } from "../../money";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { DEVICE_TYPES, type RepairPart, type RepairPrice } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { Dialog, MoneyInput } from "./parts";

type PriceForm = Omit<RepairPrice, "id">;
const EMPTY: PriceForm = { deviceType: "phone", brand: "", model: "", service: "", priceCents: 0, vatRate: 19, partId: null, minutes: 0 };

/** Reparatur-Preisliste: feste Preise je Gerät und Leistung, auf Wunsch mit verknüpftem Ersatzteil. */
export function PricesPanel({ isManager }: { isManager: boolean }) {
  const { r, euro, repairError } = useRepairI18n();
  const [query, setQuery] = useState("");
  const [prices, setPrices] = useState<RepairPrice[] | null>(null);
  const [editing, setEditing] = useState<RepairPrice | "new" | null>(null);
  const [error, setError] = useState("");

  const load = () => api<{ prices: RepairPrice[] }>(`/repairs/prices?q=${encodeURIComponent(query)}`).then((d) => setPrices(d.prices)).catch((e) => setError(repairError(e)));
  useEffect(() => {
    const timer = setTimeout(load, query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  // Nach Gerät gruppieren, damit die Liste wie eine Preistafel aussieht
  const groups = new Map<string, RepairPrice[]>();
  for (const p of prices ?? []) {
    const key = [p.brand, p.model].filter(Boolean).join(" ") || r(`devices.${p.deviceType}`);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  return (
    <div className="stack">
      <p className="muted">{r("prices.intro")}</p>
      <div className="row wrap gap stock-toolbar">
        <label className="search">
          <Search size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={r("prices.search")} aria-label={r("prices.search")} />
        </label>
        {isManager && <button className="button primary" onClick={() => setEditing("new")}><Plus size={18} /> {r("prices.add")}</button>}
      </div>
      {error && <p className="error">{error}</p>}
      {prices && prices.length === 0 && <section className="card"><p className="empty muted">{query ? r("prices.noMatch") : r("prices.empty")}</p></section>}
      {[...groups.entries()].map(([label, list]) => (
        <section key={label} className="card list-card price-group">
          <h3>{label}</h3>
          {list.map((p) => (
            <button key={p.id} className="list-row part-row" onClick={() => isManager && setEditing(p)} disabled={!isManager}>
              <span className="list-main">
                <strong>{p.service}</strong>
                {p.minutes > 0 && <small className="muted">{r("prices.minutesShort", { n: p.minutes })}</small>}
              </span>
              <strong>{euro(p.priceCents)}</strong>
            </button>
          ))}
        </section>
      ))}
      {editing && <PriceDialog price={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), load())} />}
    </div>
  );
}

function PriceDialog({ price, onClose, onSaved }: { price: RepairPrice | null; onClose: () => void; onSaved: () => void }) {
  const { r, euro, repairError, lang } = useRepairI18n();
  const [form, setForm] = useState<PriceForm>(price ? { ...price } : EMPTY);
  const [parts, setParts] = useState<RepairPart[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PriceForm>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    api<{ parts: RepairPart[] }>("/repairs/parts").then((d) => setParts(d.parts.filter((p) => p.category === "part"))).catch(() => {});
  }, []);

  const call = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError(repairError(e));
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!form.service.trim()) return setError(r("prices.serviceMissing"));
    call(() => api(price ? `/repairs/prices/${price.id}` : "/repairs/prices", { method: price ? "PUT" : "POST", body: form }));
  };

  const part = parts.find((p) => p.id === form.partId);

  return (
    <Dialog title={price ? price.service : r("prices.add")} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        {error && <p className="error">{error}</p>}
        <div className="chips wrap">
          {DEVICE_TYPES.map((type) => (
            <button type="button" key={type} className={form.deviceType === type ? "chip active" : "chip"} onClick={() => set({ deviceType: type })}>{r(`devices.${type}`)}</button>
          ))}
        </div>
        <div className="grid form-grid">
          <Field label={r("intake.brand")}><input value={form.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="Apple" /></Field>
          <Field label={r("intake.model")} hint={r("prices.modelHint")}><input value={form.model} onChange={(e) => set({ model: e.target.value })} placeholder="iPhone 13" /></Field>
          <Field label={r("prices.service")} wide>
            <input value={form.service} onChange={(e) => set({ service: e.target.value })} list="repair-services" autoFocus={!price} />
          </Field>
          <Field label={r("prices.price")}><MoneyInput cents={form.priceCents} onChange={(c) => c !== null && set({ priceCents: c })} /></Field>
          <Field label={r("order.vat")}>
            <select value={form.vatRate} onChange={(e) => set({ vatRate: Number(e.target.value) })}>
              {vatChoices().map((v) => <option key={v} value={v}>{formatRate(v, lang)}</option>)}
            </select>
          </Field>
          <Field label={r("prices.part")} hint={part ? r("prices.partHint", { price: euro(part.priceCents) }) : r("prices.partNone")}>
            <select value={form.partId ?? ""} onChange={(e) => set({ partId: e.target.value || null })}>
              <option value="">–</option>
              {parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label={r("prices.minutes")}>
            <input type="number" min={0} value={form.minutes || ""} onChange={(e) => set({ minutes: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
        </div>
        <datalist id="repair-services">{r("prices.common").split("|").map((s) => <option key={s} value={s} />)}</datalist>
        <div className="row wrap gap">
          <button className="button primary" disabled={busy}>{r("stock.save")}</button>
          {price && (
            <button type="button" className="button danger" disabled={busy} onClick={() => confirm(r("prices.removeConfirm", { name: price.service })) && call(() => api(`/repairs/prices/${price.id}`, { method: "DELETE" }))}>
              <Trash2 size={16} /> {r("prices.remove")}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
