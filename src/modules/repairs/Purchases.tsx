import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Ban, Check, Mail, PackageCheck, Pencil, Plus, Printer, Send, Trash2, TriangleAlert, Truck } from "lucide-react";
import { api } from "../../api";
import { Field, Link } from "../../components";
import { navigate } from "../../router";
import type { PurchaseLineInput, PurchaseOrder, PurchaseStatus, RepairPart, Supplier } from "../../../shared/repairs";
import { useRepairI18n } from "./i18n";
import { Dialog, MoneyInput } from "./parts";
import { PrintFrame } from "./Print";

const BASE = "/app/handy-it/lager/bestellungen";
const PREFILL_KEY = "ck-repairs-purchase-prefill";

type SupplierRow = Supplier & { open: number };
type LineDraft = PurchaseLineInput & { key: string };

/** Neue Bestellung öffnen, z. B. aus einem Auftrag, der auf ein Teil wartet. */
export function startPurchase(prefill: { orderNumber?: number; name?: string; lowStock?: boolean }) {
  try {
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill));
  } catch {
    // dann eben leer
  }
  navigate(`${BASE}/neu`);
}

function takePrefill(): { orderNumber?: number; name?: string; lowStock?: boolean } | null {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    sessionStorage.removeItem(PREFILL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const isLow = (p: RepairPart) => p.minStock > 0 && p.stock <= p.minStock;
/** Vorschlag: bis zum doppelten Mindestbestand auffüllen. */
const refill = (p: RepairPart) => Math.max(1, p.minStock * 2 - p.stock);
const STATUS_TONE: Record<PurchaseStatus, string> = { draft: "", ordered: "warn", received: "pos", canceled: "neg" };

/** Bestellungen beim Lieferanten: Liste, neue Bestellung, Ansicht mit Wareneingang. */
export function PurchasesPanel({ isManager, sub }: { isManager: boolean; sub?: string }) {
  if (sub === "neu") return <PurchaseEditor />;
  if (sub) return <PurchaseDetail id={sub} isManager={isManager} />;
  return <PurchaseList />;
}

function PurchaseList() {
  const { r, euro, day, repairError } = useRepairI18n();
  const [scope, setScope] = useState<"open" | "done" | "all">("open");
  const [list, setList] = useState<PurchaseOrder[] | null>(null);
  const [low, setLow] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    setList(null);
    api<{ purchases: PurchaseOrder[] }>(`/repairs/purchases?scope=${scope}`).then((d) => setList(d.purchases)).catch((e) => setError(repairError(e)));
  }, [scope]);
  useEffect(() => {
    api<{ parts: RepairPart[] }>("/repairs/parts").then((d) => setLow(d.parts.filter(isLow).length)).catch(() => {});
  }, []);

  return (
    <div className="stack">
      <p className="muted">{r("purchases.intro")}</p>
      <div className="row wrap gap">
        <div className="chips" role="tablist">
          {(["open", "done", "all"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={scope === s} className={scope === s ? "chip active" : "chip"} onClick={() => setScope(s)}>{r(`purchases.scope.${s}`)}</button>
          ))}
        </div>
        <button className="button primary push-end" onClick={() => startPurchase({})}><Plus size={18} /> {r("purchases.new")}</button>
      </div>
      {low > 0 && (
        <p className="notice planned-row"><TriangleAlert size={16} /> <span>{r("purchases.lowHint", { n: low })}</span>
          <button className="button small-button" onClick={() => startPurchase({ lowStock: true })}>{r("purchases.orderLow")}</button>
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {list && (
        <section className="card list-card">
          {list.length === 0 && <p className="empty muted">{r("purchases.empty")}</p>}
          {list.map((p) => (
            <Link key={p.id} to={`${BASE}/${p.id}`} className="list-row">
              <span className="repair-number">{r("purchases.numberShort", { n: p.number })}</span>
              <span className="list-main">
                <strong>{p.supplierName}</strong>
                <small className="muted">{r("purchases.lines", { n: p.lines.length })} · {day(p.orderedAt ?? p.createdAt)}</small>
              </span>
              <span className="part-row-meta">
                <span className={`pill ${STATUS_TONE[p.status]}`}>{partly(p) ? r("purchases.partly") : r(`purchases.status.${p.status}`)}</span>
                {p.totalCents > 0 && <small className="muted">{euro(p.totalCents)}</small>}
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

const partly = (p: PurchaseOrder) => p.status === "ordered" && p.lines.some((l) => l.received > 0);

function PurchaseEditor({ existing, onDone }: { existing?: PurchaseOrder; onDone?: (p: PurchaseOrder) => void }) {
  const { r, euro, repairError } = useRepairI18n();
  const [suppliers, setSuppliers] = useState<SupplierRow[] | null>(null);
  const [supplierId, setSupplierId] = useState(existing?.supplierId ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    existing?.lines.map((l) => ({ key: l.id, partId: l.partId, name: l.name, qty: l.qty, unitCents: l.unitCents, orderNumber: l.orderNumber })) ?? [],
  );
  const [parts, setParts] = useState<RepairPart[]>([]);
  const [picking, setPicking] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ suppliers: SupplierRow[] }>("/repairs/suppliers").then((d) => {
      setSuppliers(d.suppliers);
      if (!existing && d.suppliers.length === 1) setSupplierId(d.suppliers[0]!.id);
    }).catch(() => setSuppliers([]));
    api<{ parts: RepairPart[] }>("/repairs/parts").then((d) => {
      setParts(d.parts);
      if (existing) return;
      const prefill = takePrefill();
      if (prefill?.lowStock) setLines(d.parts.filter(isLow).map(lineFromPart));
      else if (prefill?.orderNumber) setLines([{ key: crypto.randomUUID(), partId: null, name: prefill.name ?? "", qty: 1, unitCents: 0, orderNumber: prefill.orderNumber }]);
    }).catch(() => {});
  }, []);

  const lineFromPart = (p: RepairPart): LineDraft => ({ key: crypto.randomUUID(), partId: p.id, name: p.name, qty: refill(p), unitCents: p.purchaseCents, orderNumber: null });
  const setLine = (key: string, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const low = parts.filter((p) => isLow(p) && !lines.some((l) => l.partId === p.id));
  const total = lines.reduce((s, l) => s + l.qty * l.unitCents, 0);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!supplierId) return setError(r("purchases.supplierMissing"));
    const clean = lines.filter((l) => l.name.trim());
    if (!clean.length) return setError(r("purchases.linesMissing"));
    setBusy(true);
    setError("");
    try {
      const body = { supplierId, note, lines: clean.map(({ key, ...l }) => l) };
      const { purchase } = await api<{ purchase: PurchaseOrder }>(existing ? `/repairs/purchases/${existing.id}` : "/repairs/purchases", { method: existing ? "PUT" : "POST", body });
      if (onDone) onDone(purchase);
      else navigate(`${BASE}/${purchase.id}`);
    } catch (err) {
      setError(repairError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={save}>
      {!existing && <Link to={BASE} className="text-link back"><ArrowLeft size={16} className="flip-rtl" /> {r("purchases.back")}</Link>}
      <h2>{existing ? r("purchases.editTitle", { n: existing.number }) : r("purchases.new")}</h2>
      {error && <p className="error">{error}</p>}
      <section className="card stack">
        {suppliers && suppliers.length === 0 ? (
          <p className="notice planned-row"><Truck size={16} /> <span>{r("purchases.noSupplier")}</span>
            <button type="button" className="button small-button" onClick={() => setAddingSupplier(true)}><Plus size={15} /> {r("suppliers.add")}</button>
          </p>
        ) : (
          <div className="grid form-grid">
            <Field label={r("purchases.supplier")}>
              <select value={supplierId} onChange={(e) => (e.target.value === "+" ? setAddingSupplier(true) : setSupplierId(e.target.value))}>
                <option value="">–</option>
                {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="+">+ {r("suppliers.add")}</option>
              </select>
            </Field>
            <Field label={r("purchases.note")}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={r("purchases.noteHint")} /></Field>
          </div>
        )}
      </section>

      <section className="card stack">
        <h3>{r("purchases.items")}</h3>
        {lines.length === 0 && <p className="muted small">{r("purchases.linesEmpty")}</p>}
        {lines.map((l) => (
          <div key={l.key} className="purchase-line">
            <Field label={r("purchases.item")}><input value={l.name} onChange={(e) => setLine(l.key, { name: e.target.value })} /></Field>
            <Field label={r("order.qty")}><input type="number" min={1} value={l.qty} onChange={(e) => setLine(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} /></Field>
            <Field label={r("purchases.unitPrice")}><MoneyInput cents={l.unitCents} onChange={(c) => c !== null && setLine(l.key, { unitCents: c })} /></Field>
            <Field label={r("purchases.forOrderNo")}><input inputMode="numeric" value={l.orderNumber ?? ""} placeholder="#" onChange={(e) => setLine(l.key, { orderNumber: Number(e.target.value.replace(/\D/g, "")) || null })} /></Field>
            <button type="button" className="icon-button danger" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={r("purchases.removeLine")}><Trash2 size={16} /></button>
          </div>
        ))}
        <div className="row wrap gap">
          <button type="button" className="button" onClick={() => setPicking(true)}><Plus size={16} /> {r("purchases.fromStock")}</button>
          <button type="button" className="button" onClick={() => setLines((ls) => [...ls, { key: crypto.randomUUID(), partId: null, name: "", qty: 1, unitCents: 0, orderNumber: null }])}><Plus size={16} /> {r("purchases.freeLine")}</button>
          {low.length > 0 && <button type="button" className="button" onClick={() => setLines((ls) => [...ls, ...low.map(lineFromPart)])}><TriangleAlert size={16} /> {r("purchases.addLow", { n: low.length })}</button>}
        </div>
        {total > 0 && <p className="pickup-total"><span>{r("purchases.total")}</span><strong>{euro(total)}</strong></p>}
      </section>

      <div className="row gap">
        <button className="button primary" disabled={busy}><Check size={18} /> {r("purchases.save")}</button>
        {existing && onDone && <button type="button" className="button" onClick={() => onDone(existing)}>{r("purchases.cancelEdit")}</button>}
      </div>

      {picking && (
        <Dialog title={r("purchases.fromStock")} onClose={() => setPicking(false)} wide>
          <PartPicker parts={parts} onPick={(p) => (setLines((ls) => [...ls, lineFromPart(p)]), setPicking(false))} />
        </Dialog>
      )}
      {addingSupplier && (
        <SupplierDialog supplier={null} isManager onClose={() => setAddingSupplier(false)} onSaved={(list) => {
          setSuppliers(list);
          const newest = list.find((s) => !(suppliers ?? []).some((o) => o.id === s.id));
          if (newest) setSupplierId(newest.id);
          setAddingSupplier(false);
        }} />
      )}
    </form>
  );
}

function PartPicker({ parts, onPick }: { parts: RepairPart[]; onPick: (p: RepairPart) => void }) {
  const { r, euro } = useRepairI18n();
  const [query, setQuery] = useState("");
  const shown = parts.filter((p) => !query || `${p.name} ${p.sku} ${p.fits}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="stack">
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={r("stock.search")} aria-label={r("stock.search")} />
      <div className="part-picker">
        {shown.length === 0 && <p className="muted small">{r("stock.empty")}</p>}
        {shown.map((p) => (
          <button type="button" key={p.id} className="list-row" onClick={() => onPick(p)}>
            <span className="list-main">
              <strong>{p.name}</strong>
              <small className={isLow(p) ? "error" : "muted"}>{r("order.inStock", { n: p.stock })}{p.minStock ? ` · ${r("purchases.min", { n: p.minStock })}` : ""}</small>
            </span>
            {p.purchaseCents > 0 && <span className="muted">{euro(p.purchaseCents)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function PurchaseDetail({ id, isManager }: { id: string; isManager: boolean }) {
  const { r, euro, day, repairError } = useRepairI18n();
  const [p, setP] = useState<PurchaseOrder | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [editing, setEditing] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ purchase: PurchaseOrder }>(`/repairs/purchases/${id}`).then((d) => setP(d.purchase)).catch((e) => setError(repairError(e)));
  }, [id]);
  useEffect(() => {
    if (!p) return;
    api<{ suppliers: SupplierRow[] }>("/repairs/suppliers").then((d) => setSupplier(d.suppliers.find((s) => s.id === p.supplierId) ?? null)).catch(() => {});
  }, [p?.supplierId]);

  const call = async (fn: () => Promise<{ purchase: PurchaseOrder }>) => {
    setBusy(true);
    setError("");
    try {
      setP((await fn()).purchase);
      return true;
    } catch (e) {
      setError(repairError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (status: "ordered" | "canceled" | "draft") => call(() => api(`/repairs/purchases/${id}/status`, { method: "POST", body: { status } }));
  const remove = async () => {
    if (!confirm(r("purchases.removeConfirm"))) return;
    try {
      await api(`/repairs/purchases/${id}`, { method: "DELETE" });
      navigate(BASE);
    } catch (e) {
      setError(repairError(e));
    }
  };

  if (!p) return error ? <p className="error">{error}</p> : <p className="muted">…</p>;
  if (editing) return <PurchaseEditor existing={p} onDone={(np) => (setP(np), setEditing(false))} />;

  const received = p.lines.some((l) => l.received > 0);
  const mailBody = [
    r("purchases.mailHello"),
    "",
    r("purchases.mailText"),
    "",
    ...p.lines.map((l) => `${l.qty} × ${l.name}`),
    ...(p.note ? ["", p.note] : []),
    ...(supplier?.customerNo ? ["", `${r("suppliers.customerNo")}: ${supplier.customerNo}`] : []),
  ].join("\n");

  return (
    <div className="stack">
      <Link to={BASE} className="text-link back"><ArrowLeft size={16} className="flip-rtl" /> {r("purchases.back")}</Link>
      <div className="row wrap gap">
        <h2>{r("purchases.title", { n: p.number })}</h2>
        <span className={`pill ${STATUS_TONE[p.status]}`}>{partly(p) ? r("purchases.partly") : r(`purchases.status.${p.status}`)}</span>
      </div>
      {error && <p className="error">{error}</p>}
      <section className="card stack-sm">
        <strong>{p.supplierName}</strong>
        {supplier && <small className="muted">{[supplier.contact, supplier.phone, supplier.email, supplier.customerNo && `${r("suppliers.customerNo")}: ${supplier.customerNo}`].filter(Boolean).join(" · ")}</small>}
        <small className="muted">
          {r("purchases.createdAt", { day: day(p.createdAt) })}{p.createdBy ? ` · ${p.createdBy}` : ""}
          {p.orderedAt ? ` · ${r("purchases.orderedAt", { day: day(p.orderedAt) })}` : ""}
          {p.receivedAt ? ` · ${r("purchases.receivedAt", { day: day(p.receivedAt) })}` : ""}
        </small>
        {p.note && <p className="pre">{p.note}</p>}
      </section>
      <section className="card list-card">
        {p.lines.map((l) => (
          <div key={l.id} className="list-row">
            <span className="list-main">
              <strong>{l.qty} × {l.name}</strong>
              <small className="muted">
                {l.unitCents ? `${euro(l.unitCents)} · ` : ""}
                {l.orderId ? <Link to={`/app/handy-it/auftrag/${l.orderId}`} className="text-link">{r("purchases.forOrderLink", { n: l.orderNumber ?? "" })}</Link> : l.partId ? r("purchases.toStock") : r("purchases.noStock")}
              </small>
            </span>
            {p.status !== "draft" && p.status !== "canceled" && <span className={`pill ${l.received >= l.qty ? "pos" : l.received ? "warn" : ""}`}>{l.received}/{l.qty}</span>}
          </div>
        ))}
        {p.totalCents > 0 && <p className="list-row"><span className="list-main"><strong>{r("purchases.total")}</strong></span><strong>{euro(p.totalCents)}</strong></p>}
      </section>
      <div className="row wrap gap">
        {p.status === "draft" && <button className="button primary" disabled={busy} onClick={() => setStatus("ordered")}><Send size={17} /> {r("purchases.markOrdered")}</button>}
        {p.status === "ordered" && <button className="button primary" disabled={busy} onClick={() => setReceiving(true)}><PackageCheck size={17} /> {r("purchases.receive")}</button>}
        {(p.status === "draft" || p.status === "ordered") && !received && <button className="button" onClick={() => setEditing(true)}><Pencil size={16} /> {r("purchases.edit")}</button>}
        {supplier?.email && (p.status === "draft" || p.status === "ordered") && (
          <a className="button" href={`mailto:${supplier.email}?subject=${encodeURIComponent(r("purchases.title", { n: p.number }))}&body=${encodeURIComponent(mailBody)}`}><Mail size={16} /> {r("purchases.mail")}</a>
        )}
        <button className="button" onClick={() => setPrinting(true)}><Printer size={16} /> {r("purchases.print")}</button>
        {p.status === "ordered" && !received && <button className="button danger" disabled={busy} onClick={() => confirm(r("purchases.cancelConfirm")) && setStatus("canceled")}><Ban size={16} /> {r("purchases.cancel")}</button>}
        {isManager && !received && p.status !== "received" && <button className="button danger" onClick={remove}><Trash2 size={16} /> {r("purchases.remove")}</button>}
      </div>
      {receiving && (
        <ReceiveDialog purchase={p} onClose={() => setReceiving(false)} onSave={async (quantities) => {
          if (await call(() => api(`/repairs/purchases/${id}/receive`, { method: "POST", body: { quantities } }))) setReceiving(false);
        }} />
      )}
      {printing && (
        <PrintFrame title={r("purchases.title", { n: p.number })} onClose={() => setPrinting(false)} meta={<p>{day(p.orderedAt ?? p.createdAt)}</p>}>
          <section className="print-customer">
            <strong>{p.supplierName}</strong>
            {supplier && <p>{[supplier.contact, supplier.phone, supplier.email].filter(Boolean).join(" · ")}</p>}
            {supplier?.customerNo && <p>{r("suppliers.customerNo")}: {supplier.customerNo}</p>}
          </section>
          <table className="print-table">
            <thead><tr><th>{r("order.qty")}</th><th>{r("purchases.item")}</th><th className="num">{r("purchases.unitPrice")}</th></tr></thead>
            <tbody>
              {p.lines.map((l) => <tr key={l.id}><td>{l.qty}</td><td>{l.name}</td><td className="num">{l.unitCents ? euro(l.unitCents) : ""}</td></tr>)}
            </tbody>
          </table>
          {p.note && <p className="print-terms">{p.note}</p>}
        </PrintFrame>
      )}
    </div>
  );
}

function ReceiveDialog({ purchase, onClose, onSave }: { purchase: PurchaseOrder; onClose: () => void; onSave: (q: Record<string, number>) => void }) {
  const { r } = useRepairI18n();
  const open = purchase.lines.filter((l) => l.received < l.qty);
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(open.map((l) => [l.id, l.qty - l.received])));
  return (
    <Dialog title={r("purchases.receive")} onClose={onClose}>
      <div className="stack">
        <p className="muted small">{r("purchases.receiveText")}</p>
        {open.map((l) => (
          <div key={l.id} className="receive-row">
            <span className="list-main"><strong>{l.name}</strong><small className="muted">{r("purchases.openQty", { n: l.qty - l.received })}</small></span>
            <input type="number" min={0} max={l.qty - l.received} value={qty[l.id] ?? 0} onChange={(e) => setQty({ ...qty, [l.id]: Math.min(l.qty - l.received, Math.max(0, Number(e.target.value) || 0)) })} aria-label={l.name} />
          </div>
        ))}
        <button className="button primary" onClick={() => onSave(qty)}><PackageCheck size={18} /> {r("purchases.book")}</button>
      </div>
    </Dialog>
  );
}

// ---------- Lieferanten ----------

export function SuppliersPanel({ isManager }: { isManager: boolean }) {
  const { r, repairError } = useRepairI18n();
  const [list, setList] = useState<SupplierRow[] | null>(null);
  const [editing, setEditing] = useState<SupplierRow | "new" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ suppliers: SupplierRow[] }>("/repairs/suppliers").then((d) => setList(d.suppliers)).catch((e) => setError(repairError(e)));
  }, []);

  return (
    <div className="stack">
      <p className="muted">{r("suppliers.intro")}</p>
      {isManager && <div className="row"><button className="button primary push-end" onClick={() => setEditing("new")}><Plus size={18} /> {r("suppliers.add")}</button></div>}
      {error && <p className="error">{error}</p>}
      {list && (
        <section className="card list-card">
          {list.length === 0 && <p className="empty muted">{r("suppliers.empty")}</p>}
          {list.map((s) => (
            <button key={s.id} className="list-row part-row" onClick={() => isManager && setEditing(s)} disabled={!isManager}>
              <span className="list-main">
                <strong>{s.name}</strong>
                <small className="muted">{[s.contact, s.phone, s.email].filter(Boolean).join(" · ")}</small>
              </span>
              {s.open > 0 && <span className="pill warn">{r("suppliers.open", { n: s.open })}</span>}
            </button>
          ))}
        </section>
      )}
      {editing && <SupplierDialog supplier={editing === "new" ? null : editing} isManager={isManager} onClose={() => setEditing(null)} onSaved={(l) => (setList(l), setEditing(null))} />}
    </div>
  );
}

function SupplierDialog({ supplier, isManager, onClose, onSaved }: { supplier: Supplier | null; isManager: boolean; onClose: () => void; onSaved: (l: SupplierRow[]) => void }) {
  const { r, repairError } = useRepairI18n();
  const [form, setForm] = useState<Omit<Supplier, "id">>(supplier ? { ...supplier } : { name: "", contact: "", phone: "", email: "", website: "", customerNo: "", note: "" });
  const [error, setError] = useState("");
  const set = (patch: Partial<Omit<Supplier, "id">>) => setForm((f) => ({ ...f, ...patch }));

  const call = async (fn: () => Promise<{ suppliers: SupplierRow[] }>) => {
    setError("");
    try {
      onSaved((await fn()).suppliers);
    } catch (e) {
      setError(repairError(e));
    }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!form.name.trim()) return setError(r("suppliers.nameMissing"));
    call(() => api(supplier ? `/repairs/suppliers/${supplier.id}` : "/repairs/suppliers", { method: supplier ? "PUT" : "POST", body: form }));
  };

  return (
    <Dialog title={supplier ? supplier.name : r("suppliers.add")} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        {error && <p className="error">{error}</p>}
        <div className="grid form-grid">
          <Field label={r("suppliers.name")}><input value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus placeholder={r("suppliers.nameHint")} /></Field>
          <Field label={r("suppliers.contact")}><input value={form.contact} onChange={(e) => set({ contact: e.target.value })} /></Field>
          <Field label={r("intake.phone")}><input type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label={r("intake.email")}><input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label={r("suppliers.website")}><input value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" /></Field>
          <Field label={r("suppliers.customerNo")}><input value={form.customerNo} onChange={(e) => set({ customerNo: e.target.value })} /></Field>
          <Field label={r("suppliers.note")} wide><textarea rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} /></Field>
        </div>
        <div className="row wrap gap">
          <button className="button primary">{r("stock.save")}</button>
          {supplier && isManager && (
            <button type="button" className="button danger" onClick={() => confirm(r("suppliers.removeConfirm", { name: supplier.name })) && call(() => api(`/repairs/suppliers/${supplier.id}`, { method: "DELETE" }))}>
              <Trash2 size={16} /> {r("suppliers.remove")}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
