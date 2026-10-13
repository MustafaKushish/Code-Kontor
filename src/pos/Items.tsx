import { useEffect, useMemo, useState } from "react";
import { Barcode, LayoutGrid, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../api";
import { Field } from "../components";
import { formatRate, standardVat, vatChoices } from "../money";
import { eanValid, type PosItem } from "../../shared/pos";
import { usePosI18n } from "./i18n";
import { useScanner } from "./scanner";
import { Dialog, MoneyInput } from "./ui";

/** Artikelstamm der Kasse: Waren mit Barcode, Warengruppe, Preis, Bestand. */
export function ItemsTab({ isManager }: { isManager: boolean }) {
  const { p, lang, money, posError } = usePosI18n();
  const [items, setItems] = useState<PosItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ item: PosItem | null; barcode?: string } | null>(null);
  const [error, setError] = useState("");

  const load = () => api<{ items: PosItem[] }>("/pos/items").then((d) => setItems(d.items)).catch((e) => setError(posError(e)));
  useEffect(() => {
    load();
  }, []);

  // Scannen in der Liste: vorhandenen Artikel öffnen, sonst neuen mit diesem Barcode anlegen
  useScanner((code) => {
    if (!isManager || editing) return;
    const found = items?.find((i) => i.barcode === code);
    setEditing(found ? { item: found } : { item: null, barcode: code });
  }, !!items);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!items || !q) return items ?? [];
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.barcode.toLowerCase() === q || i.barcode.includes(q) || i.code.toLowerCase() === q || i.group.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div className="stack">
      <div className="row gap pos-toolbar">
        <label className="search">
          <Search size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={p("items.search")} aria-label={p("items.search")} />
        </label>
        {isManager && <button className="button primary" onClick={() => setEditing({ item: null })}><Plus size={18} /> {p("items.add")}</button>}
      </div>
      {!isManager && <p className="muted small">{p("items.readOnly")}</p>}
      {error && <p className="error">{error}</p>}
      {items && (
        <section className="card list-card">
          {items.length > 0 && <h3 className="pos-group-title pad">{p("items.count", { n: shown.length })}</h3>}
          {shown.length === 0 && <p className="empty muted">{items.length ? p("items.noMatch") : p("items.empty")}</p>}
          {shown.map((i) => (
            <button key={i.id} className="list-row pos-article" disabled={!isManager} onClick={() => setEditing({ item: i })}>
              <span className="pos-icon">{i.tile ? <LayoutGrid size={16} /> : <Barcode size={16} />}</span>
              <span className="list-main">
                <strong>{i.name}</strong>
                <small className="muted">{[i.code ? `${p("sell.nr")} ${i.code}` : "", i.barcode, i.group, formatRate(i.vatRate, lang)].filter(Boolean).join(" · ")}</small>
              </span>
              <span className="pos-row-meta">
                <strong className="pos-price">{money(i.priceCents)}</strong>
                <small className={i.stock !== null && i.stock <= 0 ? "error" : "muted"}>{i.stock === null ? p("items.noStock") : p("sell.stock", { n: i.stock })}</small>
              </span>
            </button>
          ))}
        </section>
      )}
      {editing && (
        <ItemDialog
          item={editing.item}
          barcode={editing.barcode}
          groups={[...new Set((items ?? []).map((i) => i.group).filter(Boolean))]}
          onClose={() => setEditing(null)}
          onSaved={() => (setEditing(null), load())}
        />
      )}
    </div>
  );
}

/** Artikel anlegen oder ändern; auch direkt aus der Kasse, wenn ein Barcode unbekannt ist. */
export function ItemDialog({ item, barcode, groups = [], onClose, onSaved }: { item: PosItem | null; barcode?: string; groups?: string[]; onClose: () => void; onSaved: (item: PosItem) => void }) {
  const { p, lang, posError } = usePosI18n();
  const [form, setForm] = useState({
    name: item?.name ?? "",
    barcode: item?.barcode ?? barcode ?? "",
    code: item?.code ?? "",
    group: item?.group ?? "",
    priceCents: item?.priceCents ?? 0 as number | null,
    vatRate: item?.vatRate ?? standardVat(),
    tile: item?.tile ?? false,
    stock: item?.stock === null || item?.stock === undefined ? "" : String(item.stock),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const badCheck = !!form.barcode && !eanValid(form.barcode.trim());

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const body = { ...form, stock: form.stock.trim() === "" ? null : Number(form.stock) };
      const { item: saved } = item
        ? await api<{ item: PosItem }>(`/pos/items/${item.id}`, { method: "PUT", body })
        : await api<{ item: PosItem }>("/pos/items", { method: "POST", body });
      onSaved(saved);
    } catch (e) {
      setError(posError(e));
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!item || !confirm(p("items.removeConfirm", { name: item.name }))) return;
    try {
      await api(`/pos/items/${item.id}`, { method: "DELETE" });
      onSaved(item);
    } catch (e) {
      setError(posError(e));
    }
  };

  return (
    <Dialog title={item ? p("items.titleEdit") : p("items.titleNew")} onClose={onClose}>
      <form className="stack" onSubmit={(e) => (e.preventDefault(), form.name.trim() && form.priceCents !== null && save())}>
        <Field label={p("items.name")}><input value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!!barcode || !!item} required /></Field>
        <Field label={p("items.barcode")} hint={badCheck ? undefined : p("items.barcodeHint")} error={badCheck ? p("items.barcodeCheck") : undefined}>
          <input value={form.barcode} inputMode="numeric" autoFocus={!barcode && !item} onChange={(e) => set({ barcode: e.target.value.trim() })}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
        </Field>
        <Field label={p("items.code")} hint={p("items.codeHint")}>
          <input value={form.code} maxLength={12} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^0-9A-Z-]/g, "") })} />
        </Field>
        <Field label={p("items.group")}>
          <input value={form.group} list="pos-item-groups" placeholder={p("items.groupPlaceholder")} onChange={(e) => set({ group: e.target.value })} />
        </Field>
        <datalist id="pos-item-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        <div className="grid two">
          <Field label={p("items.price")}><MoneyInput cents={form.priceCents ?? 0} onChange={(c) => set({ priceCents: c })} /></Field>
          <Field label={p("items.vat")}>
            <select value={form.vatRate} onChange={(e) => set({ vatRate: Number(e.target.value) })}>
              {vatChoices(form.vatRate).map((v) => <option key={v} value={v}>{formatRate(v, lang)}</option>)}
            </select>
          </Field>
        </div>
        <Field label={p("items.stock")} hint={p("items.stockHint")}>
          <input type="number" inputMode="numeric" step={1} value={form.stock} onChange={(e) => set({ stock: e.target.value })} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={form.tile} onChange={(e) => set({ tile: e.target.checked })} />
          <span>{p("items.tile")}</span>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row gap">
          <button className="button primary" disabled={busy || !form.name.trim() || form.priceCents === null}>{p("items.save")}</button>
          {item && <button type="button" className="button push-end" onClick={remove}><Trash2 size={16} /> {p("items.remove")}</button>}
        </div>
      </form>
    </Dialog>
  );
}
