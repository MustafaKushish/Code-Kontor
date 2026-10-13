import { useEffect, useState, type FormEvent } from "react";
import { Eye, Plus, Printer, Search, Trash2 } from "lucide-react";
import { api, ApiError } from "../../api";
import { Field } from "../../components";
import {
  DEVICE_TYPES, GRADES, ID_TYPES, PAYMENT_METHODS,
  type UsedDevice, type UsedDeviceInput, type UsedErrors,
} from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { Dialog, MoneyInput, deviceLabel } from "./parts";
import { PurchaseReceiptPrint } from "./Print";

const EMPTY: UsedDeviceInput = {
  device: { type: "phone", brand: "", model: "", serial: "", color: "", storage: "" },
  grade: "good", note: "", purchaseCents: 0, priceCents: 0,
  seller: { name: "", address: "", phone: "", idType: "idCard" }, idNumber: "", payout: "cash", ownership: false,
};

/** Ankauf gebrauchter Geräte: Bestand, angekaufte und verkaufte Geräte. */
export function UsedTab({ isManager }: { isManager: boolean }) {
  const { r, euro, day, repairError } = useRepairI18n();
  const [status, setStatus] = useState<"inStock" | "sold">("inStock");
  const [query, setQuery] = useState("");
  const [devices, setDevices] = useState<UsedDevice[] | null>(null);
  const [editing, setEditing] = useState<UsedDevice | "new" | null>(null);
  const [printing, setPrinting] = useState<UsedDevice | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    api<{ devices: UsedDevice[] }>(`/repairs/used?status=${status}&q=${encodeURIComponent(query)}`)
      .then((d) => (setDevices(d.devices), setError("")))
      .catch((e) => setError(repairError(e)));
  useEffect(() => {
    const timer = setTimeout(load, query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [status, query]);

  const stockValue = status === "inStock" ? (devices ?? []).reduce((s, d) => s + d.purchaseCents, 0) : 0;

  return (
    <div className="stack">
      <div className="row wrap gap stock-toolbar">
        <label className="search">
          <Search size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={r("used.search")} aria-label={r("used.search")} />
        </label>
        <button className="button primary" onClick={() => setEditing("new")}><Plus size={18} /> {r("used.buy")}</button>
      </div>
      <div className="row wrap gap">
        <div className="chips" role="tablist">
          {(["inStock", "sold"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={status === s} className={status === s ? "chip active" : "chip"} onClick={() => setStatus(s)}>{r(`used.status.${s}`)}</button>
          ))}
        </div>
        {stockValue > 0 && <span className="muted">{r("used.stockValue")}: <strong>{euro(stockValue)}</strong></span>}
      </div>
      {error && <p className="error">{error}</p>}
      {devices && (
        <section className="card list-card">
          {devices.length === 0 && <p className="empty muted">{status === "inStock" ? r("used.empty") : r("used.emptySold")}</p>}
          {devices.map((d) => (
            <button key={d.id} className="list-row part-row" onClick={() => setEditing(d)}>
              <span className="repair-number">A-{d.number}</span>
              <span className="list-main">
                <strong>{deviceLabel(d.device)}{d.device.storage ? ` · ${d.device.storage}` : ""}</strong>
                <small className="muted">
                  {[r(`used.grades.${d.grade}`), d.device.serial, d.status === "sold" ? `${r("used.soldTo", { name: d.buyerName || "–" })} · ${d.saleInvoice}` : day(d.purchasedAt)].filter(Boolean).join(" · ")}
                </small>
              </span>
              <span className="part-row-meta">
                <strong>{euro(d.priceCents)}</strong>
                <small className="muted">{r("used.boughtFor", { price: euro(d.purchaseCents) })}</small>
              </span>
            </button>
          ))}
        </section>
      )}
      {editing && (
        <UsedDialog
          used={editing === "new" ? null : editing}
          isManager={isManager}
          onClose={() => setEditing(null)}
          onSaved={(d, isNew) => {
            setEditing(null);
            load();
            if (isNew && d) setPrinting(d);
          }}
          onPrint={(d) => (setEditing(null), setPrinting(d))}
        />
      )}
      {printing && <PurchaseReceiptPrint used={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function UsedDialog({ used, isManager, onClose, onSaved, onPrint }: {
  used: UsedDevice | null; isManager: boolean; onClose: () => void; onSaved: (d: UsedDevice | null, isNew: boolean) => void; onPrint: (d: UsedDevice) => void;
}) {
  const { r, euro, day, repairError } = useRepairI18n();
  const [form, setForm] = useState<UsedDeviceInput>(
    used ? { ...EMPTY, device: used.device, grade: used.grade, note: used.note, purchaseCents: used.purchaseCents, priceCents: used.priceCents, payout: used.payout } : EMPTY,
  );
  const [errors, setErrors] = useState<UsedErrors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [idNumber, setIdNumber] = useState<string | null>(null);
  const sold = used?.status === "sold";
  const set = (patch: Partial<UsedDeviceInput>) => setForm((f) => ({ ...f, ...patch }));
  const setDevice = (patch: Partial<UsedDeviceInput["device"]>) => setForm((f) => ({ ...f, device: { ...f.device, ...patch } }));
  const setSeller = (patch: Partial<UsedDeviceInput["seller"]>) => setForm((f) => ({ ...f, seller: { ...f.seller, ...patch } }));
  const err = (key: keyof UsedErrors) => (errors[key] ? r(`used.errors.${key}`) : undefined);

  const run = async (fn: () => Promise<UsedDevice | null>, isNew = false) => {
    setBusy(true);
    setError("");
    setErrors({});
    try {
      onSaved(await fn(), isNew);
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErrors(e.errors as UsedErrors);
      setError(repairError(e));
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    run(async () => (await api<{ device: UsedDevice }>(used ? `/repairs/used/${used.id}` : "/repairs/used", { method: used ? "PUT" : "POST", body: form })).device, !used);
  };

  const showId = async () => {
    if (!used) return;
    try {
      setIdNumber((await api<{ idNumber: string }>(`/repairs/used/${used.id}/id-number`)).idNumber || "–");
    } catch (e) {
      setError(repairError(e));
    }
  };

  return (
    <Dialog title={used ? `A-${used.number} · ${deviceLabel(used.device)}` : r("used.buyTitle")} onClose={onClose} wide>
      <form className="stack" onSubmit={save} noValidate>
        {error && <p className="error">{error}</p>}
        {sold && <p className="notice success">{r("used.soldInfo", { name: used!.buyerName || "–", invoice: used!.saleInvoice ?? "", day: day(used!.warrantyUntil) })}</p>}

        <fieldset className="stack" disabled={sold}>
          <div className="chips wrap device-types">
            {DEVICE_TYPES.map((type) => (
              <button type="button" key={type} className={form.device.type === type ? "chip active" : "chip"} onClick={() => setDevice({ type })}>{r(`devices.${type}`)}</button>
            ))}
          </div>
          <div className="grid form-grid">
            <Field label={r("intake.brand")} error={err("model")}><input value={form.device.brand} onChange={(e) => setDevice({ brand: e.target.value })}/></Field>
            <Field label={r("intake.model")}><input value={form.device.model} onChange={(e) => setDevice({ model: e.target.value })} placeholder="iPhone 13" /></Field>
            <Field label={r("used.storage")}><input value={form.device.storage} onChange={(e) => setDevice({ storage: e.target.value })} placeholder="128 GB" /></Field>
            <Field label={r("intake.color")}><input value={form.device.color} onChange={(e) => setDevice({ color: e.target.value })} /></Field>
            <Field label={r("intake.serial")} hint={r("used.serialHint")} error={err("serial")}>
              <input value={form.device.serial} onChange={(e) => setDevice({ serial: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
            <Field label={r("used.grade")}>
              <select value={form.grade} onChange={(e) => set({ grade: e.target.value as UsedDeviceInput["grade"] })}>
                {GRADES.map((g) => <option key={g} value={g}>{r(`used.grades.${g}`)}</option>)}
              </select>
            </Field>
            <Field label={r("used.purchasePrice")}><MoneyInput cents={form.purchaseCents} onChange={(c) => c !== null && set({ purchaseCents: c })} /></Field>
            <Field label={r("used.salePrice")} hint={form.priceCents > form.purchaseCents && form.purchaseCents > 0 ? r("used.profit", { price: euro(form.priceCents - form.purchaseCents) }) : undefined}>
              <MoneyInput cents={form.priceCents} onChange={(c) => c !== null && set({ priceCents: c })} />
            </Field>
          </div>
          <Field label={r("used.note")} wide>
            <textarea rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder={r("used.noteHint")} />
          </Field>
        </fieldset>

        {used ? (
          <section className="stack-sm used-seller">
            <span className="field-label">{r("print.seller")}</span>
            <p className="pre">{[used.seller.name, used.seller.address, used.seller.phone].filter(Boolean).join("\n")}</p>
            {used.seller.idType && (
              <p className="unlock-row">
                {r(`used.idTypes.${used.seller.idType}`)}
                {used.seller.hasIdNumber && (idNumber
                  ? <span className="mono">{idNumber}</span>
                  : <button type="button" className="text-button" onClick={showId}><Eye size={15} /> {r("used.showId")}</button>)}
              </p>
            )}
            <small className="muted">{r("used.boughtOn", { day: day(used.purchasedAt), name: used.purchasedBy ?? "–", method: r(`payment.${used.payout}`) })}</small>
          </section>
        ) : (
          <section className="stack">
            <h3>{r("print.seller")}</h3>
            <div className="grid form-grid">
              <Field label={r("intake.name")} error={err("sellerName")}><input value={form.seller.name} onChange={(e) => setSeller({ name: e.target.value })} autoComplete="off" /></Field>
              <Field label={r("intake.phone")}><input type="tel" value={form.seller.phone} onChange={(e) => setSeller({ phone: e.target.value })} autoComplete="off" /></Field>
              <Field label={r("used.address")} error={err("sellerAddress")} wide>
                <textarea rows={2} value={form.seller.address} onChange={(e) => setSeller({ address: e.target.value })} />
              </Field>
              <Field label={r("used.idType")}>
                <select value={form.seller.idType} onChange={(e) => setSeller({ idType: e.target.value as UsedDeviceInput["seller"]["idType"] })}>
                  {ID_TYPES.map((t) => <option key={t} value={t}>{r(`used.idTypes.${t}`)}</option>)}
                </select>
              </Field>
              <Field label={r("used.idNumber")} hint={r("used.idNumberHint")}>
                <input value={form.idNumber} onChange={(e) => set({ idNumber: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
            </div>
            <div className="field">
              <span className="field-label">{r("used.payout")}</span>
              <div className="segmented three">
                {PAYMENT_METHODS.map((m) => (
                  <button type="button" key={m} className={form.payout === m ? "active" : ""} onClick={() => set({ payout: m })}>{r(`payment.${m}`)}</button>
                ))}
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={form.ownership} onChange={(e) => set({ ownership: e.target.checked })} />
              <span className="stack-sm"><span>{r("used.ownership")}</span>{err("ownership") && <small className="error">{err("ownership")}</small>}</span>
            </label>
          </section>
        )}

        <div className="row wrap gap">
          {!sold && <button className="button primary" disabled={busy}>{used ? r("stock.save") : r("used.buySave", { price: euro(form.purchaseCents) })}</button>}
          {used && <button type="button" className="button" onClick={() => onPrint(used)}><Printer size={17} /> {r("used.printReceipt")}</button>}
          {used && !sold && isManager && (
            <button type="button" className="button danger" disabled={busy}
              onClick={() => confirm(r("used.removeConfirm", { number: used.number })) && run(async () => (await api(`/repairs/used/${used.id}`, { method: "DELETE" }), null))}>
              <Trash2 size={16} /> {r("used.remove")}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
