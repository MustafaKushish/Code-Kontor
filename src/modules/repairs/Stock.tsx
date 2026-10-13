import { formatRate, standardVat, vatChoices } from "../../money";
import { useEffect, useState, type FormEvent } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../../api";
import { Field } from "../../components";
import { type RepairPart } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { Dialog, MoneyInput } from "./parts";

type PartForm = Omit<RepairPart, "id">;
const EMPTY: PartForm = { sku: "", name: "", category: "part", fits: "", stock: 0, minStock: 0, purchaseCents: 0, priceCents: 0, vatRate: 19 };

export function StockTab({ isManager }: { isManager: boolean }) {
  const { r, euro, repairError } = useRepairI18n();
  const [query, setQuery] = useState("");
  const [parts, setParts] = useState<RepairPart[] | null>(null);
  const [editing, setEditing] = useState<RepairPart | "new" | null>(null);
  const [error, setError] = useState("");

  const load = () => api<{ parts: RepairPart[] }>(`/repairs/parts?q=${encodeURIComponent(query)}`).then((d) => setParts(d.parts)).catch((e) => setError(repairError(e)));
  useEffect(() => {
    const timer = setTimeout(load, query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="stack">
      <div className="row wrap gap stock-toolbar">
        <label className="search">
          <Search size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={r("stock.search")} aria-label={r("stock.search")} />
        </label>
        <button className="button primary" onClick={() => setEditing("new")}><Plus size={18} /> {r("stock.add")}</button>
      </div>
      {error && <p className="error">{error}</p>}
      {parts && (
        <section className="card list-card">
          {parts.length === 0 && <p className="empty muted">{r("stock.empty")}</p>}
          {parts.map((p) => {
            const low = p.minStock > 0 && p.stock <= p.minStock;
            return (
              <button key={p.id} className="list-row part-row" onClick={() => setEditing(p)}>
                <span className="list-main">
                  <strong>{p.name}</strong>
                  <small className="muted">{[r(`stock.categories.${p.category}`), p.sku, p.fits].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="part-row-meta">
                  <span className={`pill ${p.stock <= 0 ? "neg" : low ? "warn" : ""}`}>{p.stock}{low ? ` · ${r("stock.low")}` : ""}</span>
                  <small className="muted">{euro(p.priceCents)}</small>
                </span>
              </button>
            );
          })}
        </section>
      )}
      {editing && (
        <PartDialog
          part={editing === "new" ? null : editing}
          isManager={isManager}
          onClose={() => setEditing(null)}
          onSaved={() => (setEditing(null), load())}
        />
      )}
    </div>
  );
}

function PartDialog({ part, isManager, onClose, onSaved }: { part: RepairPart | null; isManager: boolean; onClose: () => void; onSaved: () => void }) {
  const { r, repairError, dateTime, lang } = useRepairI18n();
  const [form, setForm] = useState<PartForm>(part ? { ...part } : { ...EMPTY, vatRate: standardVat() });
  const [delta, setDelta] = useState("");
  const [moves, setMoves] = useState<{ at: string; delta: number; reason: string; orderNumber: number | null; userName: string | null }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PartForm>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (part) api<{ moves: typeof moves }>(`/repairs/parts/${part.id}/moves`).then((d) => setMoves(d.moves)).catch(() => {});
  }, [part]);

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
    if (!form.name.trim()) return setError(r("intake.errors.name"));
    call(() => api(part ? `/repairs/parts/${part.id}` : "/repairs/parts", { method: part ? "PUT" : "POST", body: form }));
  };

  const adjust = (sign: 1 | -1) => {
    const n = Math.abs(parseInt(delta, 10));
    if (!part || !n) return;
    call(() => api(`/repairs/parts/${part.id}/stock`, { method: "POST", body: { delta: sign * n, reason: sign > 0 ? "received" : "damaged" } }));
  };

  const net = form.priceCents / (1 + form.vatRate / 100);
  const margin = form.priceCents && form.purchaseCents ? Math.round(((net - form.purchaseCents) / net) * 100) : null;

  return (
    <Dialog title={part ? part.name : r("stock.add")} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        {error && <p className="error">{error}</p>}
        <div className="segmented">
          {(["part", "accessory"] as const).map((c) => (
            <button type="button" key={c} className={form.category === c ? "active" : ""} onClick={() => set({ category: c })}>{r(`stock.categories.${c}`)}</button>
          ))}
        </div>
        <div className="grid form-grid">
          <Field label={r("stock.name")} wide><input value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!part} /></Field>
          <Field label={r("stock.sku")}><input value={form.sku} onChange={(e) => set({ sku: e.target.value })} /></Field>
          <Field label={r("stock.fits")} hint={r("stock.fitsHint")}><input value={form.fits} onChange={(e) => set({ fits: e.target.value })} /></Field>
          <Field label={r("stock.purchase")}><MoneyInput cents={form.purchaseCents} onChange={(c) => c !== null && set({ purchaseCents: c })} /></Field>
          <Field label={r("stock.price")} hint={margin !== null ? r("stock.margin", { percent: margin }) : undefined}>
            <MoneyInput cents={form.priceCents} onChange={(c) => c !== null && set({ priceCents: c })} />
          </Field>
          <Field label={r("order.vat")}>
            <select value={form.vatRate} onChange={(e) => set({ vatRate: Number(e.target.value) })}>
              {vatChoices(form.vatRate).map((v) => <option key={v} value={v}>{formatRate(v, lang)}</option>)}
            </select>
          </Field>
          <Field label={r("stock.minStock")}><input type="number" min={0} value={form.minStock} onChange={(e) => set({ minStock: Math.max(0, Number(e.target.value) || 0) })} /></Field>
          {!part && <Field label={r("stock.stock")}><input type="number" min={0} value={form.stock} onChange={(e) => set({ stock: Math.max(0, Number(e.target.value) || 0) })} /></Field>}
        </div>
        <button className="button primary" disabled={busy}>{r("stock.save")}</button>
      </form>

      {part && (
        <div className="stack">
          <div className="field">
            <span className="field-label">{r("stock.adjust")} · {r("stock.stock")}: {part.stock}</span>
            <div className="row gap">
              <button type="button" className="button" onClick={() => adjust(-1)} disabled={busy} aria-label="−"><Minus size={18} /></button>
              <input type="number" min={1} value={delta} onChange={(e) => setDelta(e.target.value)} className="stock-delta" aria-label={r("stock.adjust")} />
              <button type="button" className="button" onClick={() => adjust(1)} disabled={busy} aria-label="+"><Plus size={18} /></button>
            </div>
            <small className="muted">{r("stock.adjustHint")}</small>
          </div>
          {moves.length > 0 && (
            <div className="stack-sm">
              <span className="field-label">{r("stock.moves")}</span>
              <ul className="stock-moves">
                {moves.map((m, i) => (
                  <li key={i}>
                    <span className={m.delta > 0 ? "pos" : "neg"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                    <span>{r(`stock.reasons.${m.reason}`)}{m.orderNumber ? ` #${m.orderNumber}` : ""}</span>
                    <small className="muted">{dateTime(m.at)}{m.userName ? ` · ${m.userName}` : ""}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isManager && (
            <button
              type="button"
              className="button danger"
              onClick={() => confirm(r("stock.removeConfirm", { name: part.name })) && call(() => api(`/repairs/parts/${part.id}`, { method: "DELETE" }))}
            >
              <Trash2 size={16} /> {r("stock.remove")}
            </button>
          )}
        </div>
      )}
    </Dialog>
  );
}
